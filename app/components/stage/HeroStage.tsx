"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import type { Vec3 } from "./cloud-gl";
import { TIMINGS_EVENT, useStage, type TimingsDetail } from "./StageContext";
import { markFrameReady, parseFrame, scrollInstant, waitFor, watchRefresh } from "./frame";
import { catmull } from "./path";
import { DIVE_FOV, HERO_EYE, HERO_FOV, HERO_TARGET, LANDING, diveBend, diveEnd } from "./stations";
import styles from "./HeroStage.module.css";

/** Same event name Agent.tsx dispatches when a live question is ranked. */
const RETRIEVAL_EVENT = "corpus:retrieval";

/** How many corpus words can be on screen at once during the dive. */
const WORD_SLOTS = 28;
/** Only the terms nearest the camera's path are ever considered. */
const WORD_CANDIDATES = 160;
/** A word shows between these distances from the lens, in world units. */
const WORD_NEAR = 0.3;
const WORD_FAR = 3.4;

type Row = {
  title: string;
  selected: boolean;
  lexicalScore?: number;
  lexicalRank?: number | null;
  denseRank?: number | null;
  fused?: number;
};
type Demo = {
  question: string;
  answer: string;
  sources: string[];
  total: number;
  provider: string | null;
  /** Milliseconds per graph node, in the order the graph ran them. */
  timings?: Record<string, number>;
  usage?: { in: number; out: number } | null;
  /** What the same tokens cost at the serving model's list price, in US dollars. */
  listPrice?: number | null;
  trace: {
    rows: Row[];
    k?: number;
    denseUsed?: boolean;
    passages?: number;
    corrections?: [string, string][];
  } | null;
};

/** How many fusion rows the analyzer lists: the ones that competed for a place. */
const FUSION_ROWS = 6;

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixV = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Where in the dive the landing cluster answers the label that names it. */
const LANDING_FLASH_AT = 0.9;

/** Sub-cent list prices keep their significant digits; anything larger reads in cents. */
const dollars = (v: number) => `$${v < 0.01 ? v.toPrecision(2) : v.toFixed(2)}`;

/**
 * When no model answers, the graph returns the top-ranked section body, which
 * carries the index's own field prefixes and markdown. Shown as prose, not as data.
 */
function readable(answer: string, degraded: boolean) {
  const lines = answer.replace(/\*\*/g, "").split("\n");
  const kept = degraded ? lines.filter((line) => !/^(Role|Stack|Measured|Links):/.test(line.trim())) : lines;
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

export default function HeroStage({
  headline,
  qualifier,
  current,
  available,
  followups = [],
}: {
  headline: string;
  qualifier: string;
  current: string;
  available: string;
  /** Questions the eval suite asks and passes, offered as the next thing to ask. */
  followups?: string[];
}) {
  const { cloud, field, cloudReady, dive, glow, openAsk } = useStage();
  const [why, setWhy] = useState(false);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [demoState, setDemoState] = useState<"pending" | "done" | "down">("pending");
  const demoStateRef = useRef(demoState);
  const [question, setQuestion] = useState("");

  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const supportRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLElement>(null);
  const wiresRef = useRef<SVGSVGElement>(null);
  const wordsRef = useRef<HTMLDivElement>(null);
  const landingRef = useRef<HTMLParagraphElement>(null);
  const eyeNow = useRef<Vec3>(HERO_EYE);
  /** Set by the words effect; run on every camera move rather than on paint. */
  const placeWords = useRef<(() => void) | null>(null);
  /** Whether the landing cluster has flashed on this pass through the dive. */
  const flashed = useRef(false);

  useEffect(() => {
    demoStateRef.current = demoState;
  }, [demoState]);

  // Reads only refs, so a copy captured once by the motion setup stays correct.
  const applyCamera = useCallback(
    (p: number) => {
      // The one writer of the dive value, so the camera and everything placed
      // from it can never disagree. A refresh during a seek used to reset the
      // value to 0 after the camera had already moved, and the words hid.
      dive.current = p;
      const c = cloud.current;
      const info = field.current;
      if (!c || !info) return;

      // Chrome steps back while the camera is travelling, and returns at either end.
      const diving = p > 0.02 && p < 0.98 ? "yes" : "no";
      if (document.documentElement.dataset.diving !== diving) document.documentElement.dataset.diving = diving;

      const land = info.sections.find((s) => s.title === LANDING)?.point ?? ([0, 0, 0] as Vec3);
      const end = diveEnd(land);
      const t = easeInOut(p);
      // A curve through a bend point, not a straight rail: the camera banks into
      // the field and straightens as it reaches the landing cluster.
      const eye = catmull([HERO_EYE, diveBend(land), end.eye], t);
      eyeNow.current = eye;
      c.setCamera(eye, mixV(HERO_TARGET, end.target, t), mix(HERO_FOV, DIVE_FOV, t));

      // The label naming the landing cluster arrives, and the cluster answers it
      // with one short flash of voltage, then settles back to what the answer lit.
      const index = info.sections.findIndex((s) => s.title === LANDING);
      if (p >= LANDING_FLASH_AT && !flashed.current && index >= 0) {
        flashed.current = true;
        const lit = info.sections.map((_, i) => (i === index ? 1 : (glow.current?.[i] ?? 0)));
        c.highlight(lit, 60);
        window.setTimeout(() => c.highlight(glow.current ?? info.sections.map(() => 0), 520), 140);
      } else if (p < LANDING_FLASH_AT - 0.1 && flashed.current) {
        flashed.current = false;
      }

      const label = landingRef.current;
      if (label) {
        const at = c.project(land);
        const shown = Math.min(Math.max((p - 0.72) / 0.18, 0), 1);
        label.style.opacity = at.visible ? String(shown) : "0";
        label.style.transform = `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0)`;
      }

      // Placed here, not on the next painted frame: a camera set to the value it
      // already holds does not repaint, and a visitor who lands mid-dive (or a
      // seeked frame) would otherwise see the field with no words in it.
      placeWords.current?.();
    },
    [cloud, field, dive, glow],
  );

  useEffect(() => {
    if (cloudReady) applyCamera(dive.current);
  }, [cloudReady, applyCamera, dive]);

  // The hero's one real request.
  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 25_000);
    fetch("/api/agent/demo", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Demo) => {
        setDemo(d);
        setDemoState("done");
        // The compiled graph in the measured chapter lights the nodes this run
        // went through, with the time each one took.
        if (d.timings && Object.keys(d.timings).length > 0) {
          window.dispatchEvent(
            new CustomEvent<TimingsDetail>(TIMINGS_EVENT, { detail: { timings: d.timings, question: d.question } }),
          );
        }
      })
      .catch(() => {
        if (controller.signal.aborted && !timedOut) return;
        setDemoState("down");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  // What the answer was grounded in glows in the field.
  useEffect(() => {
    const c = cloud.current;
    const info = field.current;
    if (!cloudReady || !demo || !c || !info) return;
    const lit = info.sections.map((s) => (demo.sources.includes(s.title) ? 1 : 0));
    glow.current = lit;
    // Past the hero, the page-long camera owns what is lit; it restores this on return.
    if (dive.current < 1) c.highlight(lit, 900);
  }, [cloudReady, demo, cloud, field, glow, dive]);

  // A question asked in the drawer lights what that answer retrieved.
  useEffect(() => {
    const onRetrieval = (e: Event) => {
      const rows = (e as CustomEvent<{ rows?: Row[] }>).detail?.rows;
      const c = cloud.current;
      const info = field.current;
      if (!rows || !c || !info) return;
      const selected = new Set(rows.filter((r) => r.selected).map((r) => r.title));
      const lit = info.sections.map((s) => (selected.has(s.title) ? 1 : 0));
      glow.current = lit;
      c.highlight(lit, 900);
    };
    window.addEventListener(RETRIEVAL_EVENT, onRetrieval);
    return () => window.removeEventListener(RETRIEVAL_EVENT, onRetrieval);
  }, [cloud, field, glow]);

  // Wires from each source chip to the cluster it names, redrawn with the field.
  useEffect(() => {
    const c = cloud.current;
    const info = field.current;
    const svg = wiresRef.current;
    if (!cloudReady || !demo || !c || !info || !svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const wires = demo.sources
      .map((title) => {
        const target = info.sections.find((s) => s.title === title);
        const chip = consoleRef.current?.querySelector<HTMLElement>(`[data-source="${CSS.escape(title)}"]`);
        if (!target || !chip) return null;
        const line = document.createElementNS(NS, "line");
        const ring = document.createElementNS(NS, "circle");
        ring.setAttribute("r", "7");
        svg.append(line, ring);
        return { target, chip, line, ring };
      })
      .filter((w): w is NonNullable<typeof w> => w !== null);

    const update = () => {
      for (const w of wires) {
        const r = w.chip.getBoundingClientRect();
        const end = c.project(w.target.point);
        w.line.setAttribute("x1", String(r.left + r.width / 2));
        w.line.setAttribute("y1", String(r.bottom));
        w.line.setAttribute("x2", String(end.x));
        w.line.setAttribute("y2", String(end.y));
        w.ring.setAttribute("cx", String(end.x));
        w.ring.setAttribute("cy", String(end.y));
        const opacity = end.visible ? "1" : "0";
        w.line.style.opacity = opacity;
        w.ring.style.opacity = opacity;
      }
    };
    update();
    const off = c.onFrame(update);
    return () => {
      off();
      wires.forEach((w) => {
        w.line.remove();
        w.ring.remove();
      });
    };
  }, [cloudReady, demo, cloud, field]);

  // The dive passes through real words from the corpus. Only the terms nearest
  // the camera's path are candidates, and only the closest few are drawn, so the
  // per-frame cost is a fixed handful of projections and transforms.
  useEffect(() => {
    const c = cloud.current;
    const info = field.current;
    const layer = wordsRef.current;
    if (!cloudReady || !c || !info || !layer) return;

    const land = info.sections.find((s) => s.title === LANDING)?.point ?? ([0, 0, 0] as Vec3);
    // The camera's curve as a polyline, fine enough that the nearest-segment
    // distance matches the curve to well under a word's width.
    const route = [HERO_EYE, diveBend(land), diveEnd(land).eye];
    const samples = Array.from({ length: 17 }, (_, i) => catmull(route, i / 16));
    const toSegment = (p: Vec3, a: Vec3, b: Vec3) => {
      const seg: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len2 = seg[0] ** 2 + seg[1] ** 2 + seg[2] ** 2 || 1;
      const t = Math.min(Math.max(((p[0] - a[0]) * seg[0] + (p[1] - a[1]) * seg[1] + (p[2] - a[2]) * seg[2]) / len2, 0), 1);
      return Math.hypot(p[0] - (a[0] + seg[0] * t), p[1] - (a[1] + seg[1] * t), p[2] - (a[2] + seg[2] * t));
    };
    const distToPath = (p: Vec3) => {
      let best = Infinity;
      for (let i = 1; i < samples.length; i++) best = Math.min(best, toSegment(p, samples[i - 1], samples[i]));
      return best;
    };
    // Link fragments are tokens in the index but not words anyone would read.
    const candidates = info.words
      .filter((w) => !/^(https?|www|com|org)$/.test(w.text))
      .map((w) => ({ w, d: distToPath(w.point) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, WORD_CANDIDATES)
      .map((x) => x.w);
    const slots = Array.from(layer.children) as HTMLElement[];

    const update = () => {
      const p = dive.current;
      if (p <= 0.02) {
        for (const s of slots) s.style.opacity = "0";
        return;
      }
      const eye = eyeNow.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const shown: { text: string; landing: boolean; d: number; x: number; y: number }[] = [];
      for (const word of candidates) {
        const d = Math.hypot(word.point[0] - eye[0], word.point[1] - eye[1], word.point[2] - eye[2]);
        if (d < WORD_NEAR || d > WORD_FAR) continue;
        const at = c.project(word.point);
        if (!at.visible || at.x < -160 || at.x > w + 160 || at.y < -80 || at.y > h + 80) continue;
        shown.push({ text: word.text, landing: word.section === LANDING, d, x: at.x, y: at.y });
      }
      shown.sort((a, b) => a.d - b.d);
      const enter = Math.min(1, (p - 0.02) * 8);
      // Nearest first, one copy of each term, and never on top of a word already
      // placed: a term that appears in several passages is several particles.
      const placed: [number, number, number, number][] = [];
      const seen = new Set<string>();
      let used = 0;
      let accents = 0;
      for (const item of shown) {
        if (used === slots.length) break;
        if (seen.has(item.text)) continue;
        const scale = Math.min(Math.max(1.4 / item.d, 0.6), 3.2);
        const halfW = item.text.length * 4.9 * scale + 6;
        const halfH = 11 * scale;
        const box: [number, number, number, number] = [item.x - halfW, item.y - halfH, item.x + halfW, item.y + halfH];
        if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        placed.push(box);
        seen.add(item.text);
        const slot = slots[used++];
        if (slot.textContent !== item.text) slot.textContent = item.text;
        // The accent stays scarce: the four nearest terms from the section the dive lands in.
        const accent = item.landing && accents < 4;
        if (accent) accents++;
        slot.dataset.landing = accent ? "true" : "false";
        const opacity = smooth(WORD_NEAR, 0.9, item.d) * (1 - smooth(2.3, WORD_FAR, item.d)) * enter;
        slot.style.opacity = opacity.toFixed(3);
        slot.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      }
      for (let i = used; i < slots.length; i++) slots[i].style.opacity = "0";
    };

    placeWords.current = update;
    // Same inspection hook as __cloud and __field. `update` stays void for
    // onFrame; the hook places the words and reports what it placed.
    Object.assign(window, {
      __placeWords: () => {
        update();
        return {
          p: dive.current,
          eye: eyeNow.current,
          candidates: candidates.length,
          shown: slots.filter((s) => s.style.opacity !== "0" && s.textContent).length,
        };
      },
    });
    update();
    const off = c.onFrame(update);
    return () => {
      off();
      placeWords.current = null;
    };
  }, [cloudReady, cloud, field, dive]);

  const motionRef = useMotion<HTMLDivElement>(({ gsap, ScrollTrigger }) => {
    const hero = sectionRef.current;
    const head = headlineRef.current;
    const support = supportRef.current;
    const panel = consoleRef.current;
    const wires = wiresRef.current;
    if (!hero || !head || !support || !panel || !wires) return;
    const frame = parseFrame();
    const framed = frame?.chapter === "hero" || frame?.chapter === "dive";

    // The hero pins, the headline flies through the glass, the camera enters the field.
    gsap.set(head, { transformPerspective: 800, transformOrigin: "20% 60%" });
    const refresh = watchRefresh(ScrollTrigger);
    const proxy = { p: 0 };
    const timeline = gsap
      .timeline({ defaults: { ease: "none" } })
      .to(
        proxy,
        {
          p: 1,
          duration: 1,
          onUpdate: () => {
            if (!refresh.refreshing()) applyCamera(proxy.p);
          },
        },
        0,
      )
      .to(head, { z: 620, opacity: 0, duration: 0.7, ease: "power2.in" }, 0)
      .to(support, { y: -60, opacity: 0, duration: 0.3, ease: "power2.in" }, 0)
      .to(panel, { x: "40vw", opacity: 0, duration: 0.6, ease: "power2.in" }, 0)
      .to(wires, { opacity: 0, duration: 0.08 }, 0);

    const trigger = ScrollTrigger.create({
      trigger: hero,
      start: "top top",
      end: "+=100%",
      pin: true,
      scrub: frame ? true : 0.8,
      animation: timeline,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      // The words and the landing label belong to the dive. Once the pin has
      // passed they would float over any later chapter that lets the field show.
      onLeave: () => {
        if (!refresh.refreshing()) setDiveLayers("hidden");
      },
      onEnterBack: () => {
        if (!refresh.refreshing()) setDiveLayers("");
      },
    });

    function setDiveLayers(visibility: string) {
      if (wordsRef.current) wordsRef.current.style.visibility = visibility;
      if (landingRef.current) landingRef.current.style.visibility = visibility;
      if (wiresRef.current) wiresRef.current.style.visibility = visibility;
    }

    // A re-measure replays the timeline from zero; the camera waits it out and
    // then re-reads where the page actually is. Past the hold, the camera
    // belongs to whichever later chapter shows the field.
    refresh.onSettled(() => {
      if (trigger.progress < 1) applyCamera(trigger.progress);
      setDiveLayers(trigger.progress >= 1 ? "hidden" : "");
    });

    if (framed && frame) {
      requestAnimationFrame(async () => {
        ScrollTrigger.refresh();
        const p = frame.chapter === "dive" ? frame.p : 0;
        scrollInstant(trigger.start + (trigger.end - trigger.start) * p);
        ScrollTrigger.update();
        // Seeking suppresses callbacks, so the camera is set here directly.
        timeline.progress(p);
        dive.current = p;
        await waitFor(() => Boolean(cloud.current) && demoStateRef.current !== "pending", 12_000);
        applyCamera(p);
        markFrameReady();
      });
    }
    return () => refresh.stop();
  });

  const degraded = demo !== null && demo.provider === null;
  const trace = demo?.trace ?? null;
  // Already excludes the hero's own demo question, at the source in page.tsx.
  const asks = followups.slice(0, 3);
  // The trace also repairs words inside the ranked passages; only a repair to a
  // word the question itself contains says anything about the question.
  const repairs = (trace?.corrections ?? []).filter(([typed]) =>
    (demo?.question ?? "").toLowerCase().split(/[^a-z0-9]+/).includes(typed.toLowerCase()),
  );

  return (
    <div ref={motionRef} className={styles.root}>
      <svg ref={wiresRef} className={styles.wires} aria-hidden="true" />
      <div ref={wordsRef} className={styles.words} aria-hidden="true">
        {Array.from({ length: WORD_SLOTS }, (_, i) => (
          <span key={i} className={styles.word} />
        ))}
      </div>
      <p ref={landingRef} className={styles.landing} aria-hidden="true">
        <span>{LANDING}</span>
      </p>

      <section ref={sectionRef} id="top" className={styles.hero} data-chapter="The agent" data-ground="void">
        <div className={styles.heroInner}>
          <div className={styles.identity}>
            <h1 ref={headlineRef} className={styles.headline}>
              {headline}
              {qualifier && <span className={styles.qualifier}>{qualifier}</span>}
            </h1>
            <div ref={supportRef}>
              <p className={styles.role}>
                {current}
                <span className={styles.readout}>
                  {demo
                    ? `Answered in ${demo.total.toLocaleString("en-US")} ms, grounded in ${demo.sources.length} sections.`
                    : " "}
                </span>
              </p>
              <div className={styles.actions}>
                <a className={styles.cta} href="#contact">
                  Get in touch
                </a>
                <span className={styles.available}>{available}</span>
              </div>
            </div>
          </div>

          <aside ref={consoleRef} className={styles.console} aria-label="What the agent answered on load">
            <div className={styles.consoleCore} data-state={demoState}>
              <p className={styles.q}>{demo?.question ?? "Asking the agent a question about him"}</p>
              {degraded && (
                <p className={styles.note}>No model is reachable right now, so this is the passage retrieval ranked first.</p>
              )}
              {/* The answer is fetched by the page. With no script it never
                  arrives, so the pending line is replaced rather than left
                  claiming to be retrieving for as long as the tab is open. */}
              <noscript>
                <style dangerouslySetInnerHTML={{ __html: `.${styles.pending}{display:none}` }} />
                <p className={styles.note}>
                  This panel asks the agent when the page loads, which needs JavaScript. Everything else on the page is
                  plain HTML and complete.
                </p>
              </noscript>
              {/* The console turns between the answer and the ranking behind it,
                  so the evidence takes the answer's place instead of pushing the
                  panel past the screen. */}
              {why && trace ? (
                <div id="hero-fusion" className={styles.fusion}>
                  <table>
                    <caption>
                      Reciprocal rank fusion{trace.k ? `, k = ${trace.k}` : ""}, dense pass{" "}
                      {trace.denseUsed ? "used" : "skipped because the lexical match was decisive"}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">section</th>
                        <th scope="col">BM25</th>
                        <th scope="col">lexical</th>
                        <th scope="col">dense</th>
                        <th scope="col">fused</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.rows.slice(0, FUSION_ROWS).map((r) => (
                        <tr key={r.title} data-selected={r.selected || undefined}>
                          <th scope="row">{r.title}</th>
                          <td>{r.lexicalScore !== undefined ? r.lexicalScore.toFixed(2) : "n/a"}</td>
                          <td>{r.lexicalRank ?? "none"}</td>
                          <td>{r.denseRank ?? "none"}</td>
                          <td>{r.fused !== undefined ? r.fused.toFixed(4) : "n/a"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={demo ? styles.a : `${styles.a} ${styles.pending}`} aria-live="polite">
                  {demo
                    ? readable(demo.answer, degraded)
                    : demoState === "down"
                      ? "The agent is unreachable right now."
                      : "Retrieving from the corpus"}
                </p>
              )}
              <div className={styles.dock}>
                {/* Present before the answer arrives, holding the height the chips take. */}
                <div className={styles.sources}>
                  {demo && demo.sources.length > 0 && (
                    <>
                      <span className={styles.sourcesLabel}>grounded in</span>
                      {demo.sources.map((s) => (
                        <span key={s} className={styles.chip} data-source={s}>
                          {s}
                        </span>
                      ))}
                    </>
                  )}
                </div>
                <form
                  className={styles.ask}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = question.trim();
                    if (!q) return;
                    openAsk(q);
                    setQuestion("");
                  }}
                >
                  <label htmlFor="hero-ask" className={styles.visuallyHidden}>
                    Ask the agent a question about him
                  </label>
                  <input
                    id="hero-ask"
                    className={styles.askInput}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask it something else"
                    autoComplete="off"
                    maxLength={300}
                  />
                  <button type="submit" className={styles.askSubmit}>
                    Ask
                  </button>
                </form>
              </div>
            </div>

            {/* The same answer, read as an instrument: what went into its context,
                how long each node took, and why these sources and not others. */}
            <div className={styles.analyzer}>
              {/* Rendered from the first paint, empty or not: a gauge that
                  appears only once the answer resolves is the exact shift the
                  dock's own min-height already exists to avoid. */}
              <dl className={styles.gauge} aria-label="What went into this answer">
                {demo && trace?.passages !== undefined && (
                  <div>
                    <dt>passages ranked</dt>
                    <dd>{trace.passages}</dd>
                  </div>
                )}
                {demo?.usage && (
                  <>
                    <div>
                      <dt>tokens in</dt>
                      <dd>{demo.usage.in.toLocaleString("en-US")}</dd>
                    </div>
                    <div>
                      <dt>tokens out</dt>
                      <dd>{demo.usage.out.toLocaleString("en-US")}</dd>
                    </div>
                  </>
                )}
                {demo?.listPrice != null && (
                  <div>
                    <dt>at list price</dt>
                    <dd>{dollars(demo.listPrice)}</dd>
                  </div>
                )}
                {demo && (
                  <div>
                    <dt>provider</dt>
                    <dd>{demo.provider ?? "none reachable"}</dd>
                  </div>
                )}
              </dl>

              {demo?.timings && Object.keys(demo.timings).length > 0 && (
                <ol className={styles.path} aria-label="Milliseconds per node">
                  {Object.entries(demo.timings).map(([node, ms]) => (
                    <li key={node}>
                      <span>{node}</span>
                      {Math.round(ms).toLocaleString("en-US")} ms
                    </li>
                  ))}
                </ol>
              )}

              {repairs.length > 0 && (
                <p className={styles.corrections}>
                  {repairs.map(([typed, read]) => `read "${typed}" as "${read}"`).join(", ")}
                </p>
              )}

              <div className={styles.tools}>
                {/* Present from the first paint and only ever disabled, never
                    unmounted, so the ranking behind the answer arriving does
                    not add a row under content already on screen. */}
                <button
                  type="button"
                  className={styles.why}
                  disabled={!trace || trace.rows.length === 0}
                  aria-expanded={why}
                  aria-controls="hero-fusion"
                  onClick={() => setWhy((open) => !open)}
                >
                  {why ? "Back to the answer" : "Why these sources"}
                </button>
                {asks.length > 0 && (
                  <div className={styles.asks}>
                    <span>also ask</span>
                    {asks.map((q) => (
                      <button key={q} type="button" onClick={() => openAsk(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
