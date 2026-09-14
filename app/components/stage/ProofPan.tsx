"use client";

import { useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import LiveStatus from "../LiveStatus";
import { IssuerDot, NvidiaMark } from "../Mark";
import { markFrameReady, parseFrame, scrollInstant } from "./frame";
import styles from "./ProofPan.module.css";

export type ProofKind = "exam" | "live" | "program" | "course" | "education" | "achievement";

export type ProofCard = {
  id: string;
  kind: ProofKind;
  issuer?: string;
  top: string;
  figure?: string;
  title: string;
  detail?: string;
  lines?: string[];
  segments?: { earned: number; total: number };
  /** Components of a program that are not earned yet, named so they are visibly not claimed. */
  pending?: string[];
  live?: { url: string; label: string };
  links: { label: string; url: string }[];
};

/** What each kind of record is called on its stub. */
const STAMP: Record<ProofKind, string> = {
  exam: "proctored exam",
  live: "running system",
  program: "program",
  course: "course",
  education: "degree",
  achievement: "record",
};

const FILTER: Record<ProofKind, string> = {
  exam: "Exams",
  live: "Live",
  program: "Programs",
  course: "Courses",
  education: "Education",
  achievement: "Records",
};

/** How the record on a stub can be checked, and when that was last done. */
function provenance(card: ProofCard, verifiedOn: string) {
  switch (card.kind) {
    case "live":
      return "probed from this browser, on load";
    case "program":
      return `${card.segments?.earned ?? 0} of ${card.segments?.total ?? 0} verified, links checked ${verifiedOn}`;
    case "education":
    case "achievement":
      return `on the résumé, checked ${verifiedOn}`;
    default:
      return card.links.length > 0 ? `link checked ${verifiedOn}` : `no public record, not claimed as verified`;
  }
}

/**
 * Everything else that checks out, as a wall of credential stubs passing across
 * the frame while the chapter holds. Each kind of record has its own geometry:
 * the proctored exam carries a security frame and a laminate that catches the
 * light as it turns, the program is wide enough to name the courses it has not
 * earned, a course is a narrow stub, a record is its figure. Every stub ends on
 * a perforated strip that says how it can be checked.
 *
 * Without the motion bundle the track is never assembled: the stubs wrap into
 * rows, and every verification link is reachable in reading order.
 */
export default function ProofPan({
  title,
  cards,
  verifiedOn,
}: {
  title: string;
  cards: ProofCard[];
  verifiedOn: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const reveal = useRef<((card: HTMLElement) => void) | null>(null);
  const [kind, setKind] = useState<ProofKind | null>(null);

  const sectionRef = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const track = trackRef.current;
    if (!track) return;
    const frame = parseFrame();
    const framed = frame?.chapter === "proof";

    section.dataset.pan = "on";
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const pan = gsap.to(track, { x: () => -distance(), ease: "none" });
    const hold = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      // The track moves faster than the scroll, so ten stubs cost under three screens.
      end: () => `+=${Math.round(distance() * 0.7)}`,
      pin: true,
      scrub: framed ? true : 0.8,
      animation: pan,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    });

    // Moves the page to the point in the hold where a stub is on screen. Used by
    // keyboard focus, so focus is never on something the reader cannot see, and
    // by the kind filter, so choosing a kind brings its first stub into view.
    reveal.current = (card) => {
      const span = distance();
      if (span === 0) return;
      const at = Math.min(Math.max((card.offsetLeft - window.innerWidth * 0.34) / span, 0), 1);
      const to = hold.start + (hold.end - hold.start) * at;
      if (Math.abs(window.scrollY - to) > 40) scrollInstant(to);
    };
    const onFocus = (event: FocusEvent) => {
      const card = (event.target as Element | null)?.closest<HTMLElement>("[data-card]");
      if (card) reveal.current?.(card);
    };
    track.addEventListener("focusin", onFocus);

    for (const card of Array.from(track.querySelectorAll<HTMLElement>("[data-card]"))) {
      // The laminate sweeps as the exam stub turns to face the reader, the way a
      // security film changes with the angle it is held at.
      const laminate = card.dataset.kind === "exam";
      gsap.fromTo(
        card,
        {
          rotateY: -24,
          z: -160,
          opacity: 0.3,
          ...(laminate ? { "--sheen": 0 } : {}),
        },
        {
          rotateY: 0,
          z: 0,
          opacity: 1,
          ...(laminate ? { "--sheen": 1 } : {}),
          ease: "power2.out",
          scrollTrigger: {
            trigger: card,
            containerAnimation: pan,
            start: "left 100%",
            end: "left 62%",
            scrub: true,
          },
        },
      );
    }

    if (framed && frame) {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollInstant(hold.start + (hold.end - hold.start) * frame.p);
        ScrollTrigger.update();
        markFrameReady();
      });
    }
    return () => {
      track.removeEventListener("focusin", onFocus);
      reveal.current = null;
    };
  });

  const kinds = (Object.keys(STAMP) as ProofKind[]).filter((k) => cards.some((c) => c.kind === k));

  const choose = (next: ProofKind) => {
    const chosen = kind === next ? null : next;
    setKind(chosen);
    const first = chosen ? trackRef.current?.querySelector<HTMLElement>(`[data-kind="${chosen}"]`) : null;
    if (first) reveal.current?.(first);
  };

  // The light follows the pointer across the exam stub's laminate.
  const tilt = (event: React.PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--sheen", ((event.clientX - box.left) / box.width).toFixed(3));
  };

  return (
    <section ref={sectionRef} id="proof" className={styles.proof} data-chapter="Proof" data-ground="void">
      {/* Held, not panned: a heading that slides off its own first screen is a
          heading nobody reads. The kind filter sits under it for the same reason. */}
      <div className={styles.held}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.filters} role="group" aria-label="Show one kind of record">
          {kinds.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => choose(k)}>
              {FILTER[k]}
              <span>{cards.filter((c) => c.kind === k).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.window}>
        <div ref={trackRef} className={styles.track}>
          {cards.map((c) => (
            <article
              key={c.id}
              data-card
              data-kind={c.kind}
              data-dim={kind && c.kind !== kind ? "" : undefined}
              className={styles.card}
              onPointerMove={c.kind === "exam" ? tilt : undefined}
            >
              {c.kind === "exam" && <span className={styles.laminate} aria-hidden="true" />}

              <header className={styles.top}>
                <span className={styles.issuer}>
                  {c.issuer === "NVIDIA" ? (
                    <NvidiaMark size={16} />
                  ) : c.issuer ? (
                    <IssuerDot issuer={c.issuer} size={16} />
                  ) : null}
                  <span>{c.top}</span>
                </span>
                <span className={styles.stamp}>{STAMP[c.kind]}</span>
              </header>

              <div className={styles.body}>
                <div className={styles.face}>
                  {c.figure && (
                    <p className={styles.figure} data-long={c.figure.length > 5 || undefined}>
                      {c.figure}
                    </p>
                  )}
                  <h3 className={styles.name}>{c.title}</h3>
                  {c.detail && <p className={styles.detail}>{c.detail}</p>}
                  {c.lines && (
                    <ul className={styles.lines}>
                      {c.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                  {c.segments && (
                    <p
                      className={styles.segments}
                      style={{ "--total": c.segments.total } as React.CSSProperties}
                      aria-label={`${c.segments.earned} of ${c.segments.total} courses earned`}
                    >
                      {Array.from({ length: c.segments.total }, (_, i) => (
                        <span key={i} data-earned={i < c.segments!.earned || undefined} />
                      ))}
                    </p>
                  )}
                </div>

                {/* The program names all ten courses: the earned ones as links to
                  their records, the rest listed and plainly not claimed. */}
                {c.kind === "program" && (
                  <div className={styles.courses}>
                    <p className={styles.coursesHead}>earned</p>
                    <ul className={styles.earned}>
                      {c.links.map((l) => (
                        <li key={l.url}>
                          <a href={l.url}>{l.label}</a>
                        </li>
                      ))}
                    </ul>
                    {c.pending && c.pending.length > 0 && (
                      <>
                        <p className={styles.coursesHead}>not started</p>
                        <ul className={styles.pending}>
                          {c.pending.map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>

              <footer className={styles.strip}>
                {c.live && <LiveStatus url={c.live.url} label={c.live.label} timed />}
                {c.kind !== "program" && c.links.length > 0 && (
                  <ul className={styles.links}>
                    {c.links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url}>{l.label}</a>
                      </li>
                    ))}
                  </ul>
                )}
                <p className={styles.checked}>{provenance(c, verifiedOn)}</p>
              </footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
