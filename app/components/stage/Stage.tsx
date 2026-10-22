"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import type { Cloud } from "./cloud-gl";
import type { FieldInfo } from "./CorpusCloud";
import { StageContext, type StageApi } from "./StageContext";
import Commands, { type CommandLinks, type CommandsHandle } from "./Commands";
import { directField, type Director } from "./director";
import { enableTilt, startSensors, subscribe, tiltAvailable, wake } from "@/lib/sensorBus";
import Glyph from "./Glyph";
import { setSound, soundOn } from "@/lib/audio";
import { markFrameReady, parseFrame, waitFor, watchRefresh } from "./frame";
import "../../stage.css";
import styles from "./Stage.module.css";

const CorpusCloud = dynamic(() => import("./CorpusCloud"), { ssr: false });
const Agent = dynamic(() => import("../Agent"), { ssr: false });

/** Same event name Agent.tsx listens for. Importing the constant would pull the agent into this chunk. */
const ASK_EVENT = "corpus:ask";
/** Tokens per English word, the usual rule of thumb for BPE tokenisers. */
const TOKENS_PER_WORD = 1.33;

type Openable = { key: string; label: string; url: string; about: string };
type Chapter = { id: string; label: string; ground: string; node: string; words: number };

/**
 * The graph node each chapter is read under, in the order the compiled graph
 * runs. `deflect` carries no chapter, because the page never takes that path;
 * it stays on the rail as a hairline so the graph is the real one.
 */
const RAIL_NODES = ["start", "route", "retrieve", "answer", "act", "end"] as const;

function onIdle(fn: () => void, timeout: number) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, Math.min(timeout, 300));
  return () => window.clearTimeout(id);
}

/** Moves the page to a chapter or a role, landing where it has settled if it publishes that. */
function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return false;
  const settle = Number(el.dataset.settle);
  if (Number.isFinite(settle) && settle > 0) window.scrollTo({ top: settle, behavior: "instant" });
  else el.scrollIntoView({ behavior: "instant", block: "start" });
  history.replaceState(null, "", `#${id}`);
  return true;
}

/** Whether a key press belongs to something the reader is typing into. */
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
}

/**
 * The shell every chapter renders inside: the corpus field, the bar, the chapter
 * ticks, the command palette and the agent drawer. Chapters mark themselves with `data-chapter` (the
 * tick label) and `data-ground` (void, sheet or voltage) and the chrome follows,
 * including when a chapter changes its own ground mid-hold.
 */
export default function Stage({
  name,
  agent,
  links,
  footer,
  children,
}: {
  name: string;
  agent: { email: string; linkedin: string; site: string; openable: Openable[] };
  /** Where the palette's reach and read commands go. A page without them offers chapters and the agent only. */
  links?: CommandLinks;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const cloud = useRef<Cloud | null>(null);
  const fieldInfo = useRef<FieldInfo | null>(null);
  const flash = useRef<HTMLDivElement>(null);
  const dive = useRef(0);
  const glow = useRef<number[] | null>(null);
  const commands = useRef<CommandsHandle>(null);
  const director = useRef<Director | null>(null);
  const seamRef = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const meterRef = useRef<HTMLParagraphElement>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [mountCloud, setMountCloud] = useState(false);
  const [mountAgent, setMountAgent] = useState(false);
  const [fieldOff, setFieldOff] = useState(false);
  // Sound is off on every first visit; a previous visit's choice is read once,
  // after mount, so the server and the client render the same bar.
  const [sound, setSoundState] = useState(false);
  // On a touch device the field and the foil can be driven by tilt, which iOS
  // only grants from inside a press. Offered once, never asked again.
  const [tiltOffer, setTiltOffer] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [active, setActive] = useState(0);
  const railStatusRef = useRef<HTMLParagraphElement>(null);
  // Which graph nodes the reader has passed through, and the one they are in.
  const currentNode = chapters[active]?.node ?? "start";
  const reachedNodes = useMemo(() => {
    const seen = new Set<string>(["start", "route"]);
    chapters.slice(0, active + 1).forEach((c) => seen.add(c.node));
    if (active >= chapters.length - 1) seen.add("end");
    return seen;
  }, [chapters, active]);
  const totalTokens = useMemo(
    () => Math.round((chapters.reduce((sum, c) => sum + c.words, 0) * TOKENS_PER_WORD) / 10) * 10,
    [chapters],
  );
  // -1 until an observer has reported. Rendered as 0 on the server, the bar
  // shipped its clear-over-the-hero state into the HTML, so a page with no
  // script kept a transparent bar and let chapters scroll through the wordmark.
  const [underBar, setUnderBar] = useState(-1);

  useEffect(() => {
    if (soundOn()) setSoundState(true);
    if (tiltAvailable()) setTiltOffer(true);
  }, []);

  // The renderer arrives after first paint, never in front of the headline.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return onIdle(() => setMountCloud(true), 1500);
  }, []);

  // The agent is the heaviest thing on the page and nothing on first paint needs
  // it. It mounts when the page is idle, or at once for a shared question link.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("q")) {
      setMountAgent(true);
      dialog.current?.showModal();
      return;
    }
    return onIdle(() => setMountAgent(true), 4000);
  }, []);

  // An answer started from anywhere (select-to-ask, an opener) opens the drawer,
  // so it is never streaming into a closed panel.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (root.dataset.streaming === "yes" && dialog.current && !dialog.current.open) dialog.current.showModal();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-streaming"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    const read = () =>
      setChapters(
        nodes.map((n) => ({
          id: n.id,
          label: n.dataset.chapter ?? n.id,
          ground: n.dataset.ground ?? "void",
          node: n.dataset.node ?? "retrieve",
          // The segment's height is the chapter's share of the page's words, so
          // the rail is a reading of the corpus rather than a row of equal pips.
          words: n.innerText.split(/\s+/).filter(Boolean).length,
        })),
      );
    read();

    // Two readings, taken at the two heights the chrome actually sits at. A
    // chapter reaches the middle of the screen a third of a screen before it
    // reaches the bar, so one shared reading painted the bar in the incoming
    // chapter's ink while it still hung over the outgoing chapter's ground:
    // white bar on the black field, and black bar on the white one.
    const watch = (rootMargin: string, set: (index: number) => void) => {
      const seen = new Set<Element>();
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) seen.add(entry.target);
            else seen.delete(entry.target);
          }
          // While a boundary crosses the band both chapters are in it; the one
          // that starts lower is the one arriving.
          let best = -1;
          let lowest = -Infinity;
          for (const el of seen) {
            const top = el.getBoundingClientRect().top;
            if (top > lowest) {
              lowest = top;
              best = nodes.indexOf(el as HTMLElement);
            }
          }
          if (best >= 0) set(best);
        },
        { rootMargin },
      );
      nodes.forEach((n) => io.observe(n));
      return io;
    };
    const observers = [watch("0px 0px -92% 0px", setUnderBar), watch("-50% 0px -49% 0px", setActive)];

    // The finale starts as glass over the field and turns orange partway through its hold.
    const grounds = new MutationObserver(read);
    nodes.forEach((n) => grounds.observe(n, { attributes: true, attributeFilter: ["data-ground"] }));
    return () => {
      observers.forEach((io) => io.disconnect());
      grounds.disconnect();
    };
  }, []);

  const openAsk = useCallback((question?: string) => {
    setMountAgent(true);
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    if (!question) {
      waitFor(() => Boolean(document.getElementById("ask")), 5000).then(() => document.getElementById("ask")?.focus());
      return;
    }
    waitFor(() => Boolean(document.getElementById("agent")), 8000).then(() =>
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: question }))),
    );
  }, []);

  const openCommands = useCallback(() => {
    if (dialog.current?.open) dialog.current.close();
    commands.current?.open();
  }, []);

  // ⌘K is the palette; `/` goes straight to the agent. Neither fires while the
  // reader is typing, so a slash in a question stays a slash.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommands();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
        if (document.querySelector("dialog[open]")) return;
        e.preventDefault();
        openAsk();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAsk, openCommands]);

  // A link to a chapter or a role that has published where it settles lands
  // there, not at the top of its hold.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
      const id = link?.getAttribute("href")?.slice(1);
      const settle = id ? Number(document.getElementById(id)?.dataset.settle) : Number.NaN;
      if (!id || !Number.isFinite(settle) || settle <= 0) return;
      e.preventDefault();
      jump(id);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // `?frame=ask` opens the drawer for a reproducible screenshot of it.
  useEffect(() => {
    if (parseFrame()?.chapter !== "ask") return;
    openAsk();
    waitFor(() => Boolean(document.getElementById("agent")), 10_000).then(markFrameReady);
  }, [openAsk]);

  // The reading meter: words in each chapter, weighted by how much of that
  // chapter has passed the reading line. An estimate, and labelled as one. It
  // stays hidden when motion is off, rather than reading zero.
  const stageRef = useMotion<HTMLDivElement>(({ ScrollTrigger }, root) => {
    const frame = parseFrame();

    // One camera for the whole page between the dive and the finale. Created
    // after every chapter's pin, so it measures the page with its spacers in.
    const field = directField({
      getCloud: () => cloud.current,
      getField: () => fieldInfo.current,
      glow,
      framed: frame !== null,
    });
    director.current = field;
    Object.assign(window, { __director: field });
    const refresh = watchRefresh(ScrollTrigger);
    const remeasure = () => {
      field.measure();
      field.drive();
    };
    ScrollTrigger.addEventListener("refresh", remeasure);
    ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: "bottom bottom",
      onUpdate: () => {
        wake();
        if (!refresh.refreshing()) field.drive();
      },
    });
    refresh.onSettled(remeasure);
    // The field may already be up by the time the motion bundle arrives.
    remeasure();

    // A shared link to a chapter or a role lands on it once the page has been
    // measured, rather than on wherever its unpinned position used to be.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && !frame) {
      const land = () => {
        ScrollTrigger.removeEventListener("refresh", land);
        requestAnimationFrame(() => jump(hash));
      };
      ScrollTrigger.addEventListener("refresh", land);
      ScrollTrigger.refresh();
    }

    const cleanup = () => {
      ScrollTrigger.removeEventListener("refresh", remeasure);
      refresh.stop();
      director.current = null;
    };

    const meter = meterRef.current;
    const count = meter?.querySelector("span");
    if (!meter || !count) return cleanup;

    let spans: { top: number; height: number; words: number }[] = [];
    const measure = () => {
      spans = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter]")).map((el) => {
        const box = el.parentElement?.classList.contains("pin-spacer") ? el.parentElement : el;
        return {
          top: box.getBoundingClientRect().top + window.scrollY,
          height: box.offsetHeight || 1,
          words: el.innerText.split(/\s+/).filter(Boolean).length,
        };
      });
    };
    let shown = -1;
    const update = () => {
      const line = window.scrollY + window.innerHeight * 0.6;
      const words = spans.reduce((sum, s) => sum + s.words * Math.min(Math.max((line - s.top) / s.height, 0), 1), 0);
      const tokens = Math.round((words * TOKENS_PER_WORD) / 10) * 10;
      if (tokens === shown) return;
      shown = tokens;
      count.textContent = tokens.toLocaleString("en-US");
      const status = railStatusRef.current;
      const read = status?.querySelector("span");
      if (!status || !read) return;
      const all = spans.reduce((sum, s2) => sum + s2.words, 0) * TOKENS_PER_WORD;
      // "Context full" replaces the count once every chapter has been read, and
      // is stamped once rather than on every frame that stays at the top.
      // The last chapter's foot is past the reading line before the page can
      // scroll further, so the count stops a little short of the total; 98% is
      // the whole corpus for the purpose of this readout.
      if (all > 0 && tokens >= Math.round(all / 10) * 10 * 0.98) {
        if (status.dataset.full !== "yes") {
          status.dataset.full = "yes";
          status.textContent = "Context full";
        }
        return;
      }
      if (status.dataset.full === "yes") {
        status.dataset.full = "no";
        status.innerHTML = `<span>${tokens.toLocaleString("en-US")}</span> of ${(Math.round(all / 10) * 10).toLocaleString("en-US")} tokens`;
        return;
      }
      read.textContent = tokens.toLocaleString("en-US");
    };

    measure();
    update();
    meter.dataset.live = "";
    ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: "bottom bottom",
      onUpdate: update,
      onRefresh: () => {
        measure();
        update();
      },
    });
    return cleanup;
  });

  // Ghost garments fill from the side the pointer entered.
  useEffect(() => {
    const onOver = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-garment="ghost"]');
      if (!el || el.contains(e.relatedTarget as Node | null)) return;
      const box = el.getBoundingClientRect();
      el.dataset.from = e.clientX > box.left + box.width / 2 ? "right" : "left";
    };
    document.addEventListener("pointerover", onOver);
    return () => document.removeEventListener("pointerover", onOver);
  }, []);

  // Every continuous input reaches the field through the sensor bus, on its own
  // frame, never through React state: scroll speed stretches the particles,
  // idleness lets the field wander, and the pointer (or device tilt) moves the
  // camera a little while the hero is at rest.
  useEffect(() => {
    startSensors();
    return subscribe((s) => {
      const c = cloud.current;
      if (!c) return;
      const still = s.reduced;
      c.setStreak(still ? 0 : Math.min(Math.abs(s.velocity) / 3000, 1));
      // The field always breathes while it is on screen. At rest it wanders at
      // full amplitude; while the reader scrolls it keeps a quarter of it, so
      // the ground under the type is alive without competing with reading.
      c.setDrift(!s.visible || still ? 0 : s.idle ? 1 : 0.25);
      if (dive.current <= 0.01 && !still) {
        const p = s.tilt.active ? s.tilt : s.pointer;
        c.setPointer(p.x, p.y);
      }
    });
  }, []);

  // Seam labels: the clusters the next chapter is written from, named beside
  // their particles. Placed on the renderer's own frame so they never trail the
  // camera, and written straight to the DOM. A name is withdrawn wherever a
  // chapter's text or surface sits under it, so it never prints over reading.
  useEffect(() => {
    const c = cloud.current;
    const layer = seamRef.current;
    if (!cloudReady || !c || !layer) return;
    const slots = Array.from(layer.children) as HTMLElement[];

    // A layout box (a grid, a section, a pin spacer) is not ink: only text of its
    // own, a replaced element or a painted surface covers the field.
    const bare = (el: Element | null) => {
      if (!el || el === document.documentElement || el === document.body || el instanceof HTMLCanvasElement) return true;
      const own = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (own || el.matches("img, svg, video, input, textarea, button, pre, code")) return false;
      const bg = getComputedStyle(el).backgroundColor;
      // Computed colours serialise with alpha last; a zero alpha paints nothing.
      return bg === "transparent" || /,\s*0\)$/.test(bg);
    };
    // Where a name prints: its marker, middle and end, on both of its lines.
    const clear = (x: number, y: number) =>
      [0, 120, 240].every((dx) => bare(document.elementFromPoint(x + dx, y + 4)) && bare(document.elementFromPoint(x + dx, y + 20)));

    const place = () => {
      const state = director.current?.seam;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Read everything first, then write, so the hit tests never force a layout.
      let lastY = -Infinity;
      const shown = (state?.visible ? state.labels : [])
        .map((l) => ({ l, p: c.project(l.point) }))
        .filter(({ p }) => p.visible && p.x > 0 && p.x < w - 320 && p.y > 72 && p.y < h - 48)
        .sort((a, b) => a.p.y - b.p.y)
        .map(({ l, p }) => {
          // Clusters close on screen stack their names instead of overprinting them.
          const y = Math.max(p.y, lastY + 34);
          lastY = y;
          return { l, x: p.x, y };
        })
        .filter(({ x, y }) => y < h - 48 && clear(x, y))
        .slice(0, slots.length);

      slots.forEach((slot, i) => {
        const item = shown[i];
        if (!item) {
          slot.dataset.on = "false";
          return;
        }
        if (slot.dataset.title !== item.l.title) {
          slot.dataset.title = item.l.title;
          const [title, passages] = Array.from(slot.children);
          title.textContent = item.l.title;
          passages.textContent = `${item.l.passages} ${item.l.passages === 1 ? "passage" : "passages"}`;
        }
        slot.style.transform = `translate3d(${item.x.toFixed(1)}px, ${item.y.toFixed(1)}px, 0)`;
        slot.dataset.on = "true";
      });
    };
    place();
    return c.onFrame(place);
  }, [cloudReady]);

  // The renderer mounts after first paint, so its first pose is set when it arrives.
  useEffect(() => {
    if (!cloudReady) return;
    director.current?.measure();
    director.current?.drive();
  }, [cloudReady]);

  const onCloudReady = useCallback((c: Cloud, info: FieldInfo) => {
    cloud.current = c;
    fieldInfo.current = info;
    // And the motion bundle may already be up by the time the field arrives.
    director.current?.measure();
    director.current?.drive();
    Object.assign(window, { __cloud: c, __field: info });
    setCloudReady(true);
  }, []);

  const api = useMemo<StageApi>(
    () => ({
      cloud,
      field: fieldInfo,
      cloudReady,
      flash,
      dive,
      glow,
      openAsk,
      retrieveInto: (el: Element, chapter?: string) => director.current?.condense(el, chapter),
    }),
    [cloudReady, openAsk],
  );

  // The bar takes the ground it hangs over; the ticks take the ground beside them.
  const barGround = chapters[underBar]?.ground ?? "void";
  const tickGround = chapters[active]?.ground ?? "void";
  const atContact = chapters[underBar]?.id === "contact";

  return (
    <StageContext.Provider value={api}>
      <div ref={stageRef} data-stage="" className={styles.stage}>
        {mountCloud && <CorpusCloud onReady={onCloudReady} onUnavailable={() => setFieldOff(true)} />}
        <div ref={seamRef} className={styles.seam} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <p key={i} className={styles.seamLabel} data-on="false">
              <span />
              <span />
            </p>
          ))}
        </div>
        <div ref={flash} className={styles.flash} aria-hidden="true" />
        <div className={styles.grain} aria-hidden="true" />

        <header className={styles.bar} data-bar={barGround} data-clear={underBar === 0 || undefined}>
          <a className={styles.wordmark} href="#top">
            {name}
          </a>
          <nav className={styles.barNav} aria-label="Primary">
            {fieldOff && <p className={styles.fieldOff}>3D field off on this browser</p>}
            <p ref={meterRef} className={styles.meter}>
              ≈ <span>0</span> tokens read
            </p>
            {tiltOffer && (
              <button
                type="button"
                className={styles.soundToggle}
                data-garment="keycap"
                aria-label="Let tilt move the field"
                onClick={async () => {
                  const granted = await enableTilt();
                  setTiltOffer(!granted);
                }}
              >
                <Glyph name="DeviceMobile:regular" size={16} />
                <span aria-hidden="true">tilt</span>
              </button>
            )}
            {/* The first press creates and resumes the audio context inside the
                press itself, and plays nothing; from then on each verb sounds. */}
            <button
              type="button"
              className={styles.soundToggle}
              data-garment="keycap"
              aria-pressed={sound}
              aria-label={sound ? "Sound, on" : "Sound, off"}
              onClick={() => {
                setSound(!sound);
                setSoundState(!sound);
              }}
            >
              <Glyph name={sound ? "SpeakerHigh:regular" : "SpeakerSlash:regular"} size={16} />
              <span aria-hidden="true">{sound ? "on" : "off"}</span>
            </button>
            <button
              type="button"
              className={styles.barButton}
              data-bar-key="commands"
              onClick={openCommands}
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Glyph name="Command:regular" size={16} />
              Commands
              <kbd className={styles.kbd} aria-hidden="true">
                ⌘K
              </kbd>
            </button>
            <button type="button" className={styles.barButton} data-bar-key="ask" onClick={() => openAsk()} aria-keyshortcuts="/">
              <Glyph name="MagnifyingGlass:regular" size={16} />
              Ask the agent
              <kbd className={styles.kbd} aria-hidden="true">
                /
              </kbd>
            </button>
            {/* Offering the way to the contact chapter while standing on it is
                furniture. It is hidden rather than removed, because taking it
                out of the bar re-flows the controls beside it. */}
            <a
              className={styles.barButton}
              href="#contact"
              data-away={atContact || undefined}
              tabIndex={atContact ? -1 : undefined}
              aria-hidden={atContact || undefined}
            >
              Get in touch
            </a>
          </nav>
        </header>

        {chapters.length > 1 && (
          <nav className={styles.ticks} data-bar={tickGround} aria-label="Chapters, as the agent graph">
            {/* The graph the answer actually runs through, drawn from the
                compiled topology: each chapter hangs under the node that reads
                it. `deflect` has no chapter and stays hairline. */}
            <svg className={styles.railGraph} viewBox="0 0 16 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="8" y1="2" x2="8" y2="98" />
              <line className={styles.railBranch} x1="8" y1="34" x2="15" y2="46" />
              {RAIL_NODES.map((n, i) => (
                <rect
                  key={n}
                  x="5"
                  y={2 + (i * 96) / (RAIL_NODES.length - 1) - (i === RAIL_NODES.length - 1 ? 6 : 3)}
                  width="6"
                  height="6"
                  data-on={reachedNodes.has(n) || undefined}
                  data-current={currentNode === n || undefined}
                />
              ))}
            </svg>
            <div className={styles.railBars}>
              {chapters.map((c, i) => (
                <a
                  key={c.id}
                  href={`#${c.id}`}
                  className={styles.tick}
                  style={{ "--weight": Math.max(c.words, 60) } as React.CSSProperties}
                  data-read={i < active ? "true" : undefined}
                  aria-current={i === active ? "true" : undefined}
                >
                  <span className={styles.tickLabel}>
                    {c.label}
                    <i>≈ {Math.round((c.words * TOKENS_PER_WORD) / 10) * 10} tokens</i>
                  </span>
                </a>
              ))}
            </div>
            <p ref={railStatusRef} className={styles.railStatus}>
              <span>0</span> of {totalTokens.toLocaleString("en-US")} tokens
            </p>
          </nav>
        )}

        <main id="main" className={styles.main}>
          {children}
        </main>
        {footer}

        <Commands
          ref={commands}
          chapters={chapters}
          links={links}
          onJump={jump}
          onAsk={() => openAsk()}
        />

        <dialog
          ref={dialog}
          className={styles.drawer}
          aria-label="Ask the agent"
          onClick={(e) => {
            if (e.target === e.currentTarget) e.currentTarget.close();
          }}
        >
          <div className={styles.drawerHead}>
            <p className={styles.drawerTitle}>Ask the agent about him</p>
            <form method="dialog">
              <button className={styles.drawerClose}>Close</button>
            </form>
          </div>
          <div className={styles.drawerBody}>{mountAgent && <Agent {...agent} />}</div>
        </dialog>
      </div>
    </StageContext.Provider>
  );
}
