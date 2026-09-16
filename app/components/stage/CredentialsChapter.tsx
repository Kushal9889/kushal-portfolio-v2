"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import { condense, corners, print, reducedMotion, stamp } from "@/lib/verbs";
import { segmentsFor } from "@/lib/numbers";
import { IssuerDot, NvidiaMark } from "../Mark";
import Glyph from "./Glyph";
import { useStage } from "./StageContext";
import styles from "./CredentialsChapter.module.css";

type Receipt = { host: string; status: number | null; checkedOn: string };

export type Plate = {
  id: string;
  kind: "exam" | "program" | "course";
  name: string;
  short: string | null;
  issuer: string;
  year: number;
  why: string | null;
  verify: { label: string; url: string; code: string | null; receipt: Receipt } | null;
  segments: { earned: number; total: number } | null;
  earned: { name: string; url: string; code: string | null; receipt: Receipt }[];
  pending: string[];
  identity: { hue: string; garment: string; border: string; nameplate: string | null; quarters?: string[] } | null;
};

type Filter = "all" | Plate["kind"];

const SEAL: Record<Plate["kind"], string> = { exam: "proctored exam", program: "program", course: "course" };
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "exam", label: "Exam" },
  { key: "program", label: "Program" },
  { key: "course", label: "Course" },
];

/** Seven-segment geometry in a 12 by 20 box: segment, x, y, width, height. */
const SEG_RECTS: [string, number, number, number, number][] = [
  ["a", 2, 0, 8, 2],
  ["b", 10, 2, 2, 7],
  ["c", 10, 11, 2, 7],
  ["d", 2, 18, 8, 2],
  ["e", 0, 11, 2, 7],
  ["f", 0, 2, 2, 7],
  ["g", 2, 9, 8, 2],
];

function Segmented({ text }: { text: string }) {
  return (
    <span className={styles.seven} aria-hidden="true">
      {text.split("").map((ch, i) =>
        ch === "/" ? (
          <svg key={i} viewBox="0 0 8 20" className={styles.slash}>
            <line x1="7" y1="1" x2="1" y2="19" />
          </svg>
        ) : (
          <svg key={i} viewBox="0 0 12 20">
            {SEG_RECTS.map(([s, x, y, w, h]) => (
              <rect key={s} x={x} y={y} width={w} height={h} data-on={segmentsFor(ch).includes(s) || undefined} />
            ))}
          </svg>
        ),
      )}
    </span>
  );
}

/** The proctored seal: a ring of 36 ticks around the kind label. */
function SealRing() {
  return (
    <svg viewBox="0 0 40 40" className={styles.ring} aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2;
        const at = (r: number, f: typeof Math.cos) => Math.round((20 + f(a) * r) * 100) / 100;
        return <line key={i} x1={at(16, Math.cos)} y1={at(16, Math.sin)} x2={at(19, Math.cos)} y2={at(19, Math.sin)} />;
      })}
    </svg>
  );
}

function ReceiptRow({ receipt, checker }: { receipt: Receipt; checker: string }) {
  return (
    <p className={styles.receipt}>
      <span className={styles.receiptHead}>link check</span>
      <span>{receipt.host}</span>
      {receipt.status !== null && <span data-ok={receipt.status < 400 || undefined}>{receipt.status}</span>}
      <span>checked {receipt.checkedOn}</span>
      <span className={styles.checker}>{checker}</span>
    </p>
  );
}

/** The verify control's garment (plan D.8): the issuer's own, except a program opens as a split list and a single IBM course verifies as an underline. */
function garmentOf(p: Plate) {
  if (!p.identity) return "ghost";
  if (p.identity.garment === "split") return p.kind === "program" ? "split" : "underline";
  return p.identity.garment;
}

function checkerOf(url: string) {
  const name = new URL(url).hostname.split(".").slice(-2)[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Credentials: every certification as a chamfered plate, each checkable in one
 * press. Filters really filter (non-matching plates dim, stay readable and stay
 * in the accessibility tree). Verify opens the issuer's record in a new tab and
 * marks the plate; Copy ID copies the code the record is keyed by. Receipts read
 * the date each link was last checked from `content/links.json`.
 */
export default function CredentialsChapter({ plates, linksCheckedOn }: { plates: Plate[]; linksCheckedOn: string }) {
  const { retrieveInto, flash } = useStage();
  const [filter, setFilter] = useState<Filter>("all");
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const machineRef = useRef<HTMLParagraphElement>(null);

  const innerRef = useRef<HTMLDivElement>(null);
  const platesRef = useRef<HTMLDivElement>(null);
  /** The Flip plugin once motion has loaded, and the plate layout captured before a filter change. */
  const flipRef = useRef<{ gsap: typeof import("gsap").gsap; pinned: boolean; Flip: typeof import("gsap/Flip").Flip; state: ReturnType<typeof import("gsap/Flip").Flip.getState> | null } | null>(null);

  const ref = useMotion<HTMLElement>(({ gsap, ScrollTrigger, Flip }, section) => {
    flipRef.current = { gsap, Flip, pinned: false, state: null };
    const title = titleRef.current;
    const machine = machineRef.current;
    const inner = platesRef.current;
    const plates = Array.from(section.querySelectorAll<HTMLElement>("[data-plate]"));
    if (!inner || !title) return;

    let played = false;
    ScrollTrigger.create({
      trigger: section,
      start: "top 70%",
      onEnter: () => {
        if (played) return;
        played = true;
        retrieveInto(title, "credentials");
        condense(gsap, title).restart();
        if (machine) print(gsap, machine, { unit: "char" }).restart();
      },
    });

    // Phones and reduced motion read the grid in flow: each plate stamps once as it arrives.
    if (reducedMotion() || window.innerWidth < 768) {
      for (const plate of plates) {
        let done = false;
        ScrollTrigger.create({
          trigger: plate,
          start: "top 82%",
          onEnter: () => {
            if (done) return;
            done = true;
            stamp(gsap, plate, { corners: false }).restart();
          },
        });
      }
      return;
    }

    // The pinned hold (plan E.6.2): the exam stamps at double size, the program
    // arrives from the left, the courses alternate right, left, right, and the view
    // pans down the registry as later plates land.
    section.dataset.pinned = "on";
    flipRef.current.pinned = true;
    const seq = gsap.timeline({ defaults: { ease: "none" } });
    const drive = (tl: ReturnType<typeof stamp>, at: number, span: number) => {
      const proxy = { p: 0 };
      tl.progress(0);
      seq.fromTo(proxy, { p: 0 }, { p: 1, duration: span, onUpdate: () => tl.progress(proxy.p) }, at);
    };

    const keys = section.querySelectorAll<HTMLElement>(`.${styles.filters} button`);
    if (keys.length) seq.fromTo(keys, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", stagger: 0.008, duration: 0.02 }, 0.04);

    const exam = plates.find((p) => p.dataset.kind === "exam");
    const program = plates.find((p) => p.dataset.kind === "program");
    const courses = plates.filter((p) => p.dataset.kind === "course");
    gsap.set(plates, { opacity: 0 });

    const focusAt: [number, HTMLElement][] = [];
    if (exam) {
      seq.set(exam, { opacity: 1 }, 0.08);
      drive(stamp(gsap, exam, { scale: 2, corners: false }), 0.08, 0.08);
      const ticks = exam.querySelectorAll(`.${styles.ring} line`);
      if (ticks.length) seq.fromTo(ticks, { opacity: 0 }, { opacity: 1, stagger: 0.12 / ticks.length, duration: 0.004 }, 0.14);
      focusAt.push([0.08, exam]);
    }
    const pan = (el: HTMLElement, at: number) =>
      seq.to(
        inner,
        {
          y: () => {
            const frame = inner.parentElement?.clientHeight ?? window.innerHeight;
            return Math.min(0, frame - 24 - (el.offsetTop - inner.offsetTop + el.offsetHeight));
          },
          duration: 0.08,
          ease: "power2.inOut",
        },
        at,
      );
    if (program) {
      seq.fromTo(program, { x: "-40vw", opacity: 0 }, { x: 0, opacity: 1, duration: 0.1, ease: "power2.out" }, 0.3);
      drive(stamp(gsap, program, { corners: false }), 0.38, 0.04);
      const segs = program.querySelectorAll<HTMLElement>("[data-earned]");
      if (segs.length) seq.fromTo(segs, { scaleY: 0 }, { scaleY: 1, stagger: 0.012, duration: 0.01, ease: "back.out(2)" }, 0.42);
      const list = program.querySelector<HTMLElement>(`.${styles.courses}`);
      if (list) seq.fromTo(list, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.06 }, 0.44);
      focusAt.push([0.3, program]);
    }
    courses.forEach((c, i) => {
      const at = 0.5 + i * 0.09;
      const side = i % 2 === 0 ? 1 : -1;
      seq.fromTo(c, { x: `${40 * side}vw`, opacity: 0 }, { x: 0, opacity: 1, duration: 0.07, ease: "power2.out" }, at);
      drive(stamp(gsap, c, { corners: false }), at + 0.06, 0.03);
      focusAt.push([at, c]);
    });
    // Pan to whichever plate sits lowest among those landed so far.
    [exam, program, ...courses].forEach((el, i) => {
      if (!el) return;
      const at = focusAt.find(([, p]) => p === el)?.[0] ?? 0;
      const lowest = [exam, program, ...courses].slice(0, i + 1).filter(Boolean).reduce((a, b) => (b!.offsetTop + b!.offsetHeight > a!.offsetTop + a!.offsetHeight ? b : a));
      if (lowest) pan(lowest, at);
    });
    seq.to({}, { duration: 0.22 }, 0.78);

    // Registration corners follow the plate that most recently landed; the exam alone flashes.
    let focus: HTMLElement | null = null;
    let flashed = false;
    seq.eventCallback("onUpdate", () => {
      const p = seq.progress();
      let next: HTMLElement | null = null;
      for (const [at, el] of focusAt) if (p >= at + 0.04) next = el;
      if (next !== focus) {
        plates.forEach((pl) => corners(pl, pl === next));
        focus = next;
      }
      if (!flashed && p >= 0.14) {
        flashed = true;
        if (flash.current) gsap.fromTo(flash.current, { opacity: 1 }, { opacity: 0, duration: 0.16, ease: "power1.out" });
      } else if (flashed && p < 0.06) flashed = false;
    });

    ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=200%",
      pin: true,
      scrub: 0.8,
      animation: seq,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onRefresh: (self) => {
        section.dataset.settle = String(Math.round(self.start + (self.end - self.start) * 0.78));
      },
    });
    return () => {
      plates.forEach((pl) => corners(pl, false));
      delete section.dataset.pinned;
    };
  });

  // Matching plates move to the front of the registry; Flip carries each plate from where it was.
  const choose = (next: Filter) => {
    const kit = flipRef.current;
    if (kit && !reducedMotion()) kit.state = kit.Flip.getState(innerRef.current?.querySelectorAll("[data-plate]") ?? []);
    setFilter(next);
  };
  useLayoutEffect(() => {
    const kit = flipRef.current;
    if (!kit?.state) return;
    kit.Flip.from(kit.state, { duration: 0.45, ease: "power3.inOut", scale: false });
    // The chosen kind moves to the front, so the window returns to the top of the registry.
    if (kit.pinned) kit.gsap.to(platesRef.current, { y: 0, duration: 0.45, ease: "power3.inOut" });
    kit.state = null;
  }, [filter]);

  const counts: Record<Filter, number> = {
    all: plates.length,
    exam: plates.filter((p) => p.kind === "exam").length,
    program: plates.filter((p) => p.kind === "program").length,
    course: plates.filter((p) => p.kind === "course").length,
  };

  const verify = (plate: Plate, el: HTMLElement | null) => {
    setOpening(plate.id);
    window.setTimeout(() => {
      setOpening(null);
      setOpened((o) => ({ ...o, [plate.id]: true }));
    }, 1200);
    const card = el?.closest<HTMLElement>("[data-plate]");
    if (card) corners(card, true);
  };

  const copy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    } catch {
      // A refused clipboard changes nothing, rather than claiming a copy.
    }
  };

  return (
    <section ref={ref} id="credentials" className={styles.credentials} data-chapter="Credentials" data-node="retrieve" data-ground="void">
      {/* Links written before the split land here. */}
      <span id="proof" className={styles.alias} aria-hidden="true" />
      <div ref={innerRef} className={styles.inner}>
        <header className={styles.head}>
          <h2 ref={titleRef} className={styles.title}>
            Credentials
          </h2>
          <p ref={machineRef} className={styles.machine} aria-hidden="true">
            verify: <span>{plates.length}</span> credentials, links checked <span>{linksCheckedOn}</span>
          </p>
          <div className={styles.filters} role="group" aria-label="Show one kind of credential">
            {FILTERS.filter((f) => counts[f.key] > 0).map((f) => (
              <button key={f.key} type="button" data-garment="keycap" aria-pressed={filter === f.key} onClick={() => choose(f.key)}>
                {f.label}
                <span>{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </header>

        <div className={styles.window}>
        <div ref={platesRef} className={styles.plates}>
          {plates.map((p) => {
            const dim = filter !== "all" && p.kind !== filter;
            const match = filter !== "all" && p.kind === filter;
            const hue = p.identity?.hue;
            return (
              <article
                key={p.id}
                data-plate
                data-kind={p.kind}
                data-issuer={p.issuer}
                data-dim={dim || undefined}
                data-match={match || undefined}
                data-border={p.identity?.border}
                className={styles.plate}
                style={{ "--identity": hue ?? "var(--ink)" } as React.CSSProperties}
                aria-label={`${p.name}, ${p.issuer}, ${p.year}`}
              >
                <span className={styles.foil} aria-hidden="true" />
                {p.identity?.border === "stripe" && <span className={styles.stripe} aria-hidden="true" />}
                {p.identity?.quarters && (
                  <span className={styles.quarters} aria-hidden="true">
                    {p.identity.quarters.map((q) => (
                      <i key={q} style={{ background: q }} />
                    ))}
                  </span>
                )}
                <header className={styles.top}>
                  <span className={styles.issuer}>
                    {p.issuer === "NVIDIA" ? (
                      <span className={styles.mark}>
                        <NvidiaMark size={16} />
                      </span>
                    ) : p.identity?.nameplate ? (
                      <span className={styles.nameplate}>{p.identity.nameplate}</span>
                    ) : (
                      <IssuerDot issuer={p.issuer} size={16} />
                    )}
                    <span>
                      {p.issuer}, {p.year}
                    </span>
                  </span>
                  <span className={styles.seal} data-kind={p.kind}>
                    {p.kind === "exam" ? <SealRing /> : <Glyph name={p.kind === "program" ? "Certificate:fill" : "SealCheck:fill"} size={12} />}
                    {SEAL[p.kind]}
                  </span>
                </header>

                <div className={styles.face}>
                  {p.segments ? (
                    <p className={styles.figure} aria-label={`${p.segments.earned} of ${p.segments.total} courses earned`}>
                      <Segmented text={`${p.segments.earned}/${p.segments.total}`} />
                    </p>
                  ) : p.short ? (
                    <p className={styles.figure}>{p.short}</p>
                  ) : null}
                  <h3 className={styles.name}>{p.name}</h3>
                  {p.why && <p className={styles.detail}>{p.why}</p>}
                  {p.segments && (
                    <p className={styles.segments} aria-hidden="true">
                      {Array.from({ length: p.segments.total }, (_, i) => (
                        <span key={i} data-earned={i < p.segments!.earned || undefined} />
                      ))}
                    </p>
                  )}
                </div>

                {p.kind === "program" && (
                  <div className={styles.courses}>
                    <details className={styles.split}>
                      <summary>
                        Verify {p.earned.length} of {p.segments?.total ?? p.earned.length}
                      </summary>
                      <ul className={styles.earned}>
                        {p.earned.map((c) => (
                          <li key={c.url}>
                            <a href={c.url} target="_blank" rel="noopener">
                              {c.name}
                            </a>
                            <span>checked {c.receipt.checkedOn}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    {p.pending.length > 0 && (
                      <>
                        <p className={styles.coursesHead}>not started</p>
                        <ul className={styles.pending}>
                          {p.pending.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                <footer className={styles.strip}>
                  {p.verify && (
                    <>
                      <div className={styles.actions}>
                        <a
                          href={p.verify.url}
                          target="_blank"
                          rel="noopener"
                          className={styles.verify}
                          data-garment={garmentOf(p)}
                          data-pressed={opened[p.id] || undefined}
                          onClick={(e) => verify(p, e.currentTarget)}
                        >
                          {opening === p.id ? `Opening ${checkerOf(p.verify.url)}` : p.verify.label}
                          {garmentOf(p) === "underline" && <Glyph name="ArrowUpRight:regular" size={14} />}
                        </a>
                        {p.verify.code && (
                          <button type="button" className={styles.copy} data-garment="keycap" onClick={() => copy(p.id, p.verify!.code!)} aria-live="polite">
                            <Glyph name="Copy:fill" size={14} />
                            {copied === p.id ? "copied" : "Copy ID"}
                          </button>
                        )}
                        {opened[p.id] && (
                          <span className={styles.opened}>
                            <i aria-hidden="true" />
                            opened this session, link checked {p.verify.receipt.checkedOn}
                          </span>
                        )}
                      </div>
                      <ReceiptRow receipt={p.verify.receipt} checker={checkerOf(p.verify.url)} />
                    </>
                  )}
                  {!p.verify && p.earned[0] && <ReceiptRow receipt={p.earned[0].receipt} checker={checkerOf(p.earned[0].url)} />}
                </footer>
              </article>
            );
          })}
        </div>
        </div>
      </div>
    </section>
  );
}
