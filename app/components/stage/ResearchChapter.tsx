"use client";

import { useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import { useStage } from "./StageContext";
import { impact } from "./impact";
import { markFrameReady, parseFrame, scrollInstant, watchRefresh } from "./frame";
import Provenance from "./Provenance";
import styles from "./ResearchChapter.module.css";

type Paper = { venue: string; title: string; url: string };

export type ResearchProps = {
  lead: string;
  paper: Paper & { byline: string };
  code: string | null;
  figure: { value: string; label: string };
  /** Accuracy of each configuration, in percent. */
  bars: { value: number; label: string }[];
  time: { fast: number; fastLabel: string; slow: number; slowLabel: string };
  also: Paper | null;
  /** The method as the corpus states it. */
  method: string | null;
  /** The sentence tying the paper to the defect in the bug chapter. */
  bridge: string | null;
  /** When every external link on the page last resolved. */
  verifiedOn: string;
};

/** The figure lands while the paper is still turning to face the reader. */
const HIT_AT = 0.3;
/**
 * Where the accuracy axis starts. On a true zero the three configurations are
 * 91.4, 88.2 and 85.7 percent of the same length and the comparison the paper is
 * about cannot be seen. The axis is truncated and the page says so.
 */
const AXIS = 80;

/**
 * The paper arrives edge-on and turns to face the reader; its result lands
 * beside it, then the comparisons the result is measured against.
 */
export default function ResearchChapter({
  lead,
  paper,
  code,
  figure,
  bars,
  time,
  also,
  method,
  bridge,
  verifiedOn,
}: ResearchProps) {
  const { flash } = useStage();
  const bridgeRef = useRef<HTMLParagraphElement>(null);
  const [copied, setCopied] = useState(false);
  const doi = paper.url.replace("https://doi.org/", "");
  const innerRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const figureRef = useRef<HTMLParagraphElement>(null);
  const alsoRef = useRef<HTMLDivElement>(null);

  const sectionRef = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const inner = innerRef.current;
    const sheet = paperRef.current;
    const fig = figureRef.current;
    if (!inner || !sheet || !fig) return;
    const frame = parseFrame();
    const framed = frame?.chapter === "research";
    const refresh = watchRefresh(ScrollTrigger);
    const fills = Array.from(section.querySelectorAll<HTMLElement>("[data-accuracy]"));
    const times = Array.from(section.querySelectorAll<HTMLElement>("[data-time]"));
    const width = (_: number, el: HTMLElement) => Number(el.dataset.w);

    gsap.set(sheet, { transformPerspective: 1400, transformOrigin: "50% 50%" });
    const sequence = gsap
      .timeline({ defaults: { ease: "none" } })
      .fromTo(sheet, { rotateY: 88, opacity: 0 }, { rotateY: 0, opacity: 1, duration: 0.34, ease: "power2.out" }, 0)
      .fromTo(fills, { scaleX: 0 }, { scaleX: width, duration: 0.12, stagger: 0.06, ease: "power2.out" }, 0.42)
      .fromTo(times, { scaleX: 0 }, { scaleX: width, duration: 0.14, stagger: 0.1, ease: "power1.out" }, 0.66)
      .to({}, { duration: 0.08 }, 0.92);
    if (alsoRef.current) sequence.fromTo(alsoRef.current, { opacity: 0 }, { opacity: 1, duration: 0.06 }, 0.8);
    // Each plate rules its caption line before its bars fill, the way a figure is
    // set before it is read.
    const rules = Array.from(section.querySelectorAll<HTMLElement>("[data-rule]"));
    sequence.fromTo(rules, { scaleX: 0 }, { scaleX: 1, duration: 0.08, stagger: 0.24, ease: "power2.out" }, 0.36);
    if (bridgeRef.current) {
      sequence.fromTo(bridgeRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.08, ease: "power2.out" }, 0.84);
    }

    const hit = impact(gsap, fig, { shake: inner, flash: flash.current });
    let landed = false;
    const sync = (p: number) => {
      if (p >= HIT_AT && !landed) {
        landed = true;
        if (!framed) hit.restart();
      } else if (p < HIT_AT - 0.05 && landed) {
        landed = false;
        hit.pause(0);
      }
    };

    // Driven by the timeline, not by the scroll. Read from the trigger, an
    // instant jump to this chapter reported progress before the scrub tween had
    // moved, so the figure stayed parked at its arrival state until the next
    // scroll nudged it.
    sequence.eventCallback("onUpdate", () => {
      if (!framed && !refresh.refreshing()) sync(sequence.progress());
    });

    const hold = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=150%",
      pin: true,
      scrub: framed ? true : 0.8,
      animation: sequence,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      // A link to this chapter lands on the paper facing the reader, not edge-on.
      onRefresh: (self) => {
        section.dataset.settle = String(Math.round(self.start + (self.end - self.start) * 0.88));
      },
    });
    refresh.onSettled(() => {
      if (!framed) sync(hold.progress);
    });

    if (framed && frame) {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollInstant(hold.start + (hold.end - hold.start) * frame.p);
        ScrollTrigger.update();
        sequence.progress(frame.p);
        sync(frame.p);
        hit.progress(frame.p >= HIT_AT ? 1 : 0);
        markFrameReady();
      });
    }
    return () => refresh.stop();
  });

  const copyDoi = async () => {
    try {
      await navigator.clipboard.writeText(doi);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section ref={sectionRef} id="research" className={styles.research} data-chapter="Research" data-ground="void">
      <div ref={innerRef} className={styles.inner}>
        <div className={styles.stand}>
          <article ref={paperRef} className={styles.paper} data-surface="sheet">
            <p className={styles.venue}>{paper.venue}</p>
            <h3 className={styles.paperTitle}>
              <a href={paper.url}>{paper.title}</a>
            </h3>
            <p className={styles.byline}>{paper.byline}</p>
            {method && (
              <p className={styles.method}>
                <span>method</span>
                {method.charAt(0).toUpperCase() + method.slice(1)}.
              </p>
            )}

            {/* The record, the code and the other publication, set as the cover's
                own reference list rather than as buttons. */}
            <dl className={styles.refs}>
              <div>
                <dt>doi</dt>
                <dd>
                  <a href={paper.url}>{doi}</a>
                </dd>
              </div>
              {code && (
                <div>
                  <dt>code</dt>
                  <dd>
                    <a href={code}>repository, with a CITATION.cff</a>
                  </dd>
                </div>
              )}
              {also && (
                <div ref={alsoRef}>
                  <dt>also</dt>
                  <dd>
                    {also.venue}: <a href={also.url}>{also.title}</a>
                  </dd>
                </div>
              )}
            </dl>
            <button type="button" className={styles.copy} onClick={copyDoi} aria-live="polite">
              {copied ? "DOI copied" : "Copy the DOI"}
            </button>
            {/* The cover's footnote: when the record links above last resolved. */}
            <p className={styles.footnote}>links checked {verifiedOn}</p>
          </article>
        </div>

        <div className={styles.result}>
          <h2 className={styles.lead}>{lead}</h2>
          <p ref={figureRef} className={styles.figure}>
            {figure.value}
          </p>
          <p className={styles.figureLabel}>
            {figure.label}{" "}
            <Provenance
              id="research-accuracy"
              label={`${figure.value} ${figure.label}`}
              rows={[
                { term: "from", value: "content/facts.md", code: true },
                { term: "published", value: `${paper.venue}, ${paper.byline}` },
                { term: "check", value: doi, href: paper.url },
              ]}
            />
          </p>

          {/* Captioned as coming from the paper, not numbered as the paper's own
              figures: the paper's figure numbers are not in the corpus. */}
          <figure className={styles.plate}>
            <figcaption className={styles.caption}>
              <span data-rule className={styles.rule} aria-hidden="true" />
              <span className={styles.source}>from the paper</span>
              Accuracy by configuration
            </figcaption>
            <ul className={styles.rows}>
              {bars.map((b, i) => {
                const width = (b.value - AXIS) / (100 - AXIS);
                return (
                  <li key={b.label} data-lead={i === 0 || undefined}>
                    <span>{b.label}</span>
                    <span className={styles.track}>
                      <span data-accuracy data-w={width} style={{ transform: `scaleX(${width})` }} />
                    </span>
                    <span className={styles.value}>{b.value}%</span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.axis}>Accuracy bars start at {AXIS}%, where the three configurations separate.</p>
          </figure>

          <figure className={styles.plate}>
            <figcaption className={styles.caption}>
              <span data-rule className={styles.rule} aria-hidden="true" />
              <span className={styles.source}>from the paper</span>
              Seconds to detect and fix
            </figcaption>
            <ul className={styles.rows}>
              <li data-lead>
                <span>{time.fastLabel}</span>
                <span className={styles.track}>
                  <span data-time data-w={time.fast / time.slow} style={{ transform: `scaleX(${time.fast / time.slow})` }} />
                </span>
                <span className={styles.value}>{time.fast}s</span>
              </li>
              <li>
                <span>{time.slowLabel}</span>
                <span className={styles.track}>
                  <span data-time data-w={1} style={{ transform: "scaleX(1)" }} />
                </span>
                <span className={styles.value}>{time.slow}s</span>
              </li>
            </ul>
          </figure>

          {/* The spine of the page: the paper describes the class of failure the
              bug chapter shows him finding by hand. */}
          {bridge && (
            <p ref={bridgeRef} className={styles.bridge}>
              {bridge} <a href="#bug">The LangChain defect, earlier on this page</a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
