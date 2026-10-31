"use client";

import { useRef } from "react";
import { useMotion } from "@/lib/motion";
import { corners, print, reducedMotion, settle } from "@/lib/verbs";
import { brandIcon } from "@/lib/brand-icons";
import { markFrameReady, parseFrame, scrollInstant, watchRefresh } from "./frame";
import { useStage } from "./StageContext";
import Provenance from "./Provenance";
import Glyph from "./Glyph";
import styles from "./WorkChapter.module.css";

export type Role = {
  /** The anchor a link to this role lands on, as `#work-<slug>`. */
  slug: string;
  company: string;
  role: string;
  dates: string;
  /** The years the role covers, for the index. */
  span: string;
  location: string;
  lead: string;
  metrics: { value: string; label: string }[];
  stack: string[];
  /** The candid paragraph the role's own section carries, if it has one. */
  note?: { kind: "trade-off" | "the mistake" | "scope"; text: string };
  /** The question the role's section seeds for the agent, verbatim, if it has one. */
  ask?: string;
};

/** Beat positions in the hold (plan E.5.7): each slab's entry window, then where it lands. */
const ENTER = [
  [0.04, 0.2],
  [0.36, 0.52],
  [0.66, 0.82],
] as const;
/** Where the slab in front lifts back to make room for the next. */
const LIFT = [0.34, 0.64];
const SETTLED = 0.9;

const two = (n: number) => String(n).padStart(2, "0");

const NOTE_GLYPH = { "trade-off": "Scales:regular", "the mistake": "WarningDiamond:regular", scope: "Ruler:regular" } as const;

/** "95%" with a label "up from 75-78%": the range the figure rolled up from. */
const beforeRange = (label: string) => label.match(/up from (\d+\s*-\s*\d+%)/)?.[1] ?? null;

/**
 * The roles as a stack of slabs in depth. The role in front lifts up and back as
 * the next one slides in from the side, alternating right, left, right, and the
 * earlier roles stay visible behind it. Each slab reads as an agent message: its
 * lead, the figures as an observation, the candid note from the corpus as a
 * thread message, the stack and a title block.
 *
 * Without the motion bundle, with reduced motion or on a phone the rack is never
 * assembled: three slabs in normal flow, readable top to bottom.
 */
export default function WorkChapter({ roles, verifiedOn }: { roles: Role[]; verifiedOn: string }) {
  const rackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLOListElement>(null);
  const { openAsk } = useStage();

  const sectionRef = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const rack = rackRef.current;
    const index = indexRef.current;
    if (!rack || !index) return;
    if (reducedMotion() || window.innerWidth < 768) return;
    const slabs = Array.from(rack.children) as HTMLElement[];
    const rows = Array.from(index.children) as HTMLElement[];
    const frame = parseFrame();
    const framed = frame?.chapter === "work";
    const refresh = watchRefresh(ScrollTrigger);

    section.dataset.rack = "on";
    gsap.set(slabs, { transformOrigin: "50% 0%" });

    const machine = section.querySelector<HTMLElement>(`.${styles.machine} span`);
    const machinePrint = machine ? print(gsap, machine, { unit: "char" }) : null;

    const seq = gsap.timeline({ defaults: { ease: "none" } });
    slabs.forEach((slab, i) => {
      const [from, to] = ENTER[i] ?? [0.9, 0.95];
      const side = i % 2 === 0 ? 1 : -1;
      if (i > 0) {
        seq.fromTo(
          slab,
          { x: `${40 * side}vw`, rotateY: -14 * side, opacity: 0 },
          { x: 0, rotateY: 0, opacity: 1, duration: to - from, ease: "power2.out", immediateRender: true },
          from,
        );
      } else {
        seq.fromTo(slab, { x: "40vw", rotateY: -14, opacity: 0 }, { x: 0, rotateY: 0, opacity: 1, duration: to - from, ease: "power2.out" }, from);
      }
      const block = slab.querySelector<HTMLElement>("[data-title-block]");
      if (block) {
        seq.fromTo(
          block,
          { rotateX: -90, opacity: 0, transformPerspective: 600, transformOrigin: "50% 100%" },
          { rotateX: 0, opacity: 1, duration: 0.04, ease: "power2.out" },
          to + 0.04,
        );
      }
    });
    // Each lift pushes every slab already in front one step deeper, raised so its top edge stays in view.
    LIFT.forEach((at, n) => {
      slabs.slice(0, n + 1).forEach((under, k) => {
        const depth = n + 1 - k;
        seq.to(
          under,
          { z: -260 * depth, y: -30 * depth, rotateX: 7, scale: 1 - 0.1 * depth, opacity: depth === 1 ? 0.5 : 0.16, duration: 0.06, ease: "power2.out" },
          at,
        );
      });
    });
    seq.to({}, { duration: 0.1 }, SETTLED);

    // What plays once a slab lands, the first time it does in this session:
    // figures settle, the note prints, the stack condenses and the cache bar shortens.
    const arrivals = slabs.map((slab) => {
      const tl = gsap.timeline({ paused: true });
      const lead = slab.querySelector<HTMLElement>(`.${styles.lead}`);
      if (lead) tl.add(print(gsap, lead, { unit: "word" }).paused(false), 0);
      slab.querySelectorAll<HTMLElement>("[data-settle-value]").forEach((dd, k) => {
        const ghost = slab.querySelector<HTMLElement>(`.${styles.ghost}`);
        const range = dd.dataset.from;
        tl.add(settle(gsap, dd, dd.dataset.settleValue ?? "", range && ghost ? { ghost, ghostText: range } : {}).paused(false), 0.1 + k * 0.09);
      });
      const bar = slab.querySelector<HTMLElement>(`.${styles.cacheBar} i`);
      if (bar) tl.fromTo(bar, { scaleX: 1 }, { scaleX: 0.7, duration: 0.42, ease: "expo.out" }, 0.1);
      const typing = slab.querySelector<HTMLElement>(`.${styles.typing}`);
      const note = slab.querySelector<HTMLElement>(`.${styles.noteText}`);
      if (typing) tl.fromTo(typing, { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0.6).to(typing, { opacity: 0, duration: 0.1 }, 1.1);
      if (note) tl.add(print(gsap, note, { unit: "word" }).paused(false), 1.1);
      const chips = slab.querySelectorAll<HTMLElement>(`.${styles.chips} li`);
      if (chips.length) tl.fromTo(chips, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.03, ease: "expo.out" }, 1.3);
      return tl;
    });
    const played = slabs.map(() => false);
    const landAt = ENTER.map(([, to]) => to);

    let lastActive = -1;
    const sync = (p: number) => {
      let active = 0;
      // How far the reader is through each role's own window, written straight
      // to the row as a custom property so the rail fills without a re-render.
      rows.forEach((row, i) => {
        const [from, to] = ENTER[i] ?? [SETTLED, SETTLED + 0.05];
        const span = (LIFT[i] ?? 1) - from;
        row.style.setProperty("--read", String(Math.min(Math.max((p - from) / Math.max(span, 0.001), 0), 1)));
        void to;
      });
      landAt.forEach((at, i) => {
        if (p >= ENTER[i][0] + (at - ENTER[i][0]) * 0.5) active = i;
        if (p >= at - 0.03 && !played[i]) {
          played[i] = true;
          if (framed) arrivals[i].progress(1);
          else arrivals[i].restart();
        }
      });
      if (active === lastActive) return;
      lastActive = active;
      rows.forEach((row, i) => {
        row.dataset.active = String(i === active);
        const a = row.querySelector("a");
        if (i === active) a?.setAttribute("aria-current", "true");
        else a?.removeAttribute("aria-current");
      });
      slabs.forEach((slab, i) => {
        corners(slab, i === active);
        slab.inert = i !== active;
      });
    };

    const hold = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=250%",
      pin: true,
      scrub: framed ? true : 0.8,
      animation: seq,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onEnter: () => {
        if (!refresh.refreshing() && machinePrint && machinePrint.progress() === 0) machinePrint.play();
      },
      // A link to this chapter lands on the assembled stack; a link to a role on that role landed.
      onRefresh: (self) => {
        const at = (p: number) => String(Math.round(self.start + (self.end - self.start) * p));
        section.dataset.settle = at(SETTLED);
        slabs.forEach((slab, i) => (slab.dataset.settle = at((ENTER[i]?.[1] ?? SETTLED) + 0.02)));
      },
    });

    seq.eventCallback("onUpdate", () => {
      if (!refresh.refreshing()) sync(seq.progress());
    });
    refresh.onSettled(() => sync(hold.progress));

    if (framed && frame) {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollInstant(hold.start + (hold.end - hold.start) * frame.p);
        ScrollTrigger.update();
        seq.progress(frame.p);
        machinePrint?.progress(1);
        sync(frame.p);
        markFrameReady();
      });
    }
    return () => {
      refresh.stop();
      slabs.forEach((slab) => {
        slab.inert = false;
        corners(slab, false);
      });
      delete section.dataset.rack;
    };
  });

  return (
    <section ref={sectionRef} id="work" className={styles.work} data-chapter="Work" data-node="retrieve" data-ground="void">
      <div className={styles.inner}>
        <div className={styles.side}>
          <h2 className={styles.title}>Work</h2>
          <p className={styles.machine} aria-hidden="true">
            retrieve: <span>{roles.length} roles</span>
          </p>
          <ol ref={indexRef} className={styles.index} aria-label="Roles, newest first">
            {roles.map((r, i) => (
              <li key={r.company} data-active={i === 0}>
                <a href={`#work-${r.slug}`}>
                  <span className={styles.numeral}>{two(i + 1)}</span>
                  <i className={styles.activeMark} aria-hidden="true" />
                  <span className={styles.companyName}>{r.company}</span>
                  <Glyph name="ArrowDownRight:regular" size={10} className={styles.arrow} />
                  <span className={styles.dates}>{r.span}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div ref={rackRef} className={styles.rack}>
          {roles.map((r, i) => {
            return (
              <article
                key={r.company}
                id={`work-${r.slug}`}
                className={styles.slab}
                data-role={r.slug}
                aria-labelledby={`work-${r.slug}-name`}
              >
                <header className={styles.slabHead}>
                  <div>
                    <p className={styles.nodeLine}>
                      <Glyph name="MagnifyingGlass:regular" size={14} />
                      retrieve <span>role {i + 1} of {roles.length}</span>
                    </p>
                    <h3 id={`work-${r.slug}-name`} className={styles.company}>
                      {r.company}
                    </h3>
                  </div>
                  <div className={styles.headMeta}>
                    <p className={styles.sheet} aria-hidden="true">
                      role {i + 1} of {roles.length}
                    </p>
                    <Provenance
                      id={`work-${r.slug}`}
                      label={`the figures for ${r.company}`}
                      rows={[
                        { term: "from", value: "content/facts.md", code: true },
                        { term: "figures", value: "as printed on the résumé" },
                        { term: "checked", value: verifiedOn },
                      ]}
                    />
                  </div>
                </header>

                <p className={styles.lead}>{r.lead}</p>

                <div className={styles.observation}>
                  <p className={styles.obsHead}>
                    <i aria-hidden="true" />
                    result <span>{r.metrics.length} values</span>
                  </p>
                  <dl data-figures className={styles.metrics} style={{ "--cols": r.metrics.length % 3 === 0 ? 3 : 2 } as React.CSSProperties}>
                    {r.metrics.map((m) => {
                      const range = beforeRange(m.label);
                      return (
                        <div key={`${m.value}${m.label}`} className={styles.metric}>
                          <dt className={styles.metricLabel}>{m.label}</dt>
                          <dd className={styles.metricValue} data-long={m.value.length > 6 || undefined}>
                            <span data-settle-value={m.value} data-from={range ?? undefined}>
                              {m.value}
                            </span>
                            {range && (
                              <span className={styles.ghost} aria-hidden="true">
                                {range}
                              </span>
                            )}
                            {/^-30%$/.test(m.value) && r.slug === "growaza" && (
                              <span className={styles.cacheBar} aria-hidden="true">
                                <i />
                              </span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>

                {r.note && (
                  <aside className={styles.note} data-kind={r.note.kind} aria-label={`${r.note.kind}, from the corpus`}>
                    <p className={styles.threadHead}>
                      <span className={styles.monogram} aria-hidden="true">
                        fx
                      </span>
                      <code>content/facts.md</code>
                      <span className={styles.noteKind}>
                        <Glyph name={NOTE_GLYPH[r.note.kind]} size={14} />
                        {r.note.kind}
                      </span>
                      <span className={styles.typing} aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </p>
                    <blockquote className={styles.quote}>
                      <p className={styles.noteText}>{r.note.text}</p>
                    </blockquote>
                    {r.ask && (
                      <button type="button" className={styles.askRole} aria-label={`Ask the agent: ${r.ask}`} onClick={() => openAsk(r.ask)}>
                        Ask the agent about this role
                        <kbd>/</kbd>
                      </button>
                    )}
                  </aside>
                )}

                <footer className={styles.foot}>
                  {r.stack.length > 0 ? (
                    <div className={styles.parts}>
                      <p className={styles.partsHead}>stack</p>
                      <ol className={styles.chips} aria-label="Stack">
                        {r.stack.map((t, n) => {
                          const mark = brandIcon(t);
                          return (
                            <li key={t}>
                              <span>{two(n + 1)}</span>
                              {mark && (
                                <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden="true">
                                  <path d={mark.path} />
                                </svg>
                              )}
                              {t}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : (
                    <span />
                  )}
                  <dl data-title-block className={styles.titleBlock}>
                    <div>
                      <dt>role</dt>
                      <dd>{r.role}</dd>
                    </div>
                    <div>
                      <dt>dates</dt>
                      <dd>{r.dates}</dd>
                    </div>
                    {r.location && (
                      <div>
                        <dt>location</dt>
                        <dd>{r.location}</dd>
                      </div>
                    )}
                  </dl>
                </footer>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
