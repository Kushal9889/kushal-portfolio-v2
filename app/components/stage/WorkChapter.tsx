"use client";

import { useRef } from "react";
import { useMotion } from "@/lib/motion";
import { impact } from "./impact";
import { markFrameReady, parseFrame, scrollInstant, watchRefresh } from "./frame";
import Provenance from "./Provenance";
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
};

/** Where in the hold each later slab starts to arrive. */
const ARRIVE_AT = [0.08, 0.5];
const ARRIVAL = 0.3;
/** Where a link to each role lands: its sheet settled, before the next one moves. */
const SETTLE_AT = [0.04, ARRIVE_AT[0] + ARRIVAL + 0.04, 0.86];

const two = (n: number) => String(n).padStart(2, "0");

/**
 * The roles as a rack of drawing sheets. Each sheet carries the role's nameplate,
 * its figures, the one candid note its section holds, a parts list, and a title
 * block in the corner, the way an engineering drawing does. The title holds on
 * the left while each sheet arrives from below and shoves the one before it back
 * into depth; its figures land and its title block flips up on arrival.
 *
 * Without the motion bundle the rack is never assembled: three sheets in normal
 * flow, readable top to bottom.
 */
export default function WorkChapter({ roles, verifiedOn }: { roles: Role[]; verifiedOn: string }) {
  const rackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLOListElement>(null);

  const sectionRef = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const rack = rackRef.current;
    const index = indexRef.current;
    if (!rack || !index) return;
    const slabs = Array.from(rack.children) as HTMLElement[];
    const rows = Array.from(index.children) as HTMLElement[];
    const frame = parseFrame();
    const framed = frame?.chapter === "work";
    const refresh = watchRefresh(ScrollTrigger);

    section.dataset.rack = "on";
    gsap.set(slabs, { transformOrigin: "50% 0%" });

    const sequence = gsap.timeline({ defaults: { ease: "none" } });
    slabs.slice(1).forEach((slab, n) => {
      const at = ARRIVE_AT[n] ?? 0.5 + n * 0.1;
      const i = n + 1;
      sequence.fromTo(slab, { yPercent: 108, rotateX: -10 }, { yPercent: 0, rotateX: 0, duration: ARRIVAL, ease: "power2.out" }, at);
      // The title block turns up into place once its sheet has settled.
      const block = slab.querySelector<HTMLElement>("[data-title-block]");
      if (block) {
        sequence.fromTo(
          block,
          { rotateX: -90, opacity: 0, transformPerspective: 600, transformOrigin: "50% 100%" },
          { rotateX: 0, opacity: 1, duration: 0.1, ease: "power2.out" },
          at + ARRIVAL * 0.75,
        );
      }
      slabs.slice(0, i).forEach((under, k) => {
        const depth = i - k;
        sequence.to(
          under,
          // Raised as it recedes, so the edge of each earlier role stays in view
          // above the new one. The lift is what makes the rack read as a rack in
          // a still frame rather than as one slab with a line above it.
          { z: -260 * depth, y: -30 * depth, rotateX: 7, scale: 1 - 0.1 * depth, opacity: depth === 1 ? 0.5 : 0.16, duration: ARRIVAL, ease: "power2.out" },
          at,
        );
      });
    });
    sequence.to({}, { duration: 0.12 }, 0.88);

    // Figures land when their slab does.
    const hits = slabs.map((slab) => {
      const figures = slab.querySelector<HTMLElement>("[data-figures]");
      return figures ? impact(gsap, figures, { strength: 0.45, shake: slab }) : null;
    });
    const landed = slabs.map(() => false);
    const landAt = [0, ...ARRIVE_AT.map((a) => a + ARRIVAL * 0.8)];

    const sync = (p: number) => {
      let active = 0;
      landAt.forEach((at, i) => {
        if (p >= at) active = i;
        if (i === 0) return;
        if (p >= at && !landed[i]) {
          landed[i] = true;
          if (!framed) hits[i]?.restart();
        } else if (p < at - 0.04 && landed[i]) {
          landed[i] = false;
          hits[i]?.pause(0);
        }
      });
      rows.forEach((row, i) => (row.dataset.active = String(i === active)));
    };

    const entry = ScrollTrigger.create({
      trigger: section,
      start: "top 55%",
      onEnter: () => {
        if (!refresh.refreshing()) hits[0]?.restart();
      },
      onLeaveBack: () => {
        if (!refresh.refreshing()) hits[0]?.pause(0);
      },
    });

    // Driven by the timeline, not by the scroll: a jump straight to this chapter
    // reports the trigger's progress before the scrub tween has moved, which left
    // the arriving slabs' figures parked until the next scroll.
    sequence.eventCallback("onUpdate", () => {
      if (!framed && !refresh.refreshing()) sync(sequence.progress());
    });

    const hold = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=180%",
      pin: true,
      scrub: framed ? true : 0.8,
      animation: sequence,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      // A link to this chapter lands on the assembled rack, not on the first slab.
      onRefresh: (self) => {
        section.dataset.settle = String(Math.round(self.start + (self.end - self.start) * 0.86));
        // And a link to one role lands on that role's sheet, assembled.
        slabs.forEach((slab, i) => {
          const at = SETTLE_AT[i] ?? 0.86;
          slab.dataset.settle = String(Math.round(self.start + (self.end - self.start) * at));
        });
      },
    });
    refresh.onSettled(() => {
      if (framed) return;
      sync(hold.progress);
      if (entry.progress > 0 && hits[0] && hits[0].progress() === 0) hits[0].progress(1);
    });

    if (framed && frame) {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollInstant(hold.start + (hold.end - hold.start) * frame.p);
        ScrollTrigger.update();
        sequence.progress(frame.p);
        sync(frame.p);
        hits.forEach((hit, i) => hit?.progress(i === 0 || frame.p >= landAt[i] ? 1 : 0));
        markFrameReady();
      });
    }
    return () => refresh.stop();
  });

  return (
    <section ref={sectionRef} id="work" className={styles.work} data-chapter="Work" data-ground="void">
      <div className={styles.inner}>
        <div className={styles.side}>
          <h2 className={styles.title}>Work</h2>
          <ol ref={indexRef} className={styles.index}>
            {roles.map((r, i) => (
              <li key={r.company} data-active={i === 0}>
                <a href={`#work-${r.slug}`}>
                  <span>{r.company}</span>
                  <span className={styles.dates}>{r.span}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div ref={rackRef} className={styles.rack}>
          {roles.map((r, i) => (
            <article key={r.company} id={`work-${r.slug}`} className={styles.slab}>
              <header className={styles.slabHead}>
                <h3 className={styles.company}>{r.company}</h3>
                <div className={styles.headMeta}>
                  <p className={styles.sheet}>
                    sheet {i + 1} of {roles.length}
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

              <dl
                data-figures
                className={styles.metrics}
                style={{ "--cols": r.metrics.length % 3 === 0 ? 3 : 2 } as React.CSSProperties}
              >
                {r.metrics.map((m) => (
                  <div key={`${m.value}${m.label}`} className={styles.metric}>
                    <dt className={styles.metricLabel}>{m.label}</dt>
                    <dd className={styles.metricValue} data-long={m.value.length > 6 || undefined}>
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* The note a drawing carries about itself: what was traded away,
                  what went wrong, or what the role was not. */}
              {r.note && (
                <aside className={styles.note} data-kind={r.note.kind}>
                  <p className={styles.noteKind}>{r.note.kind}</p>
                  <p className={styles.noteText}>{r.note.text}</p>
                </aside>
              )}

              <footer className={styles.foot}>
                {r.stack.length > 0 ? (
                  <div className={styles.parts}>
                    <p className={styles.partsHead}>parts</p>
                    <ol>
                      {r.stack.map((t, n) => (
                        <li key={t}>
                          <span>{two(n + 1)}</span>
                          {t}
                        </li>
                      ))}
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
          ))}
        </div>
      </div>
    </section>
  );
}
