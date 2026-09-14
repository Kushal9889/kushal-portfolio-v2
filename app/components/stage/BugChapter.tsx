"use client";

import { useRef } from "react";
import { useMotion } from "@/lib/motion";
import { AFTER, BEFORE } from "../diff-excerpt";
import { GitHubMark } from "../Mark";
import { useStage } from "./StageContext";
import { impact } from "./impact";
import { markFrameReady, parseFrame, scrollInstant, watchRefresh } from "./frame";
import Provenance from "./Provenance";
import type { Patch } from "@/lib/patch";
import styles from "./BugChapter.module.css";

type Link = { label: string; url: string };

export type BugTimeline = { filed: string; merged: string; maintainer: string; added: number; files: number };

const stamp = (iso: string) =>
  new Date(iso)
    .toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
    .replace(",", "");

/** UTC midnights inside the span, placed as a share of it, so the log is drawn to scale. */
function midnights({ filed, merged }: BugTimeline) {
  const start = Date.parse(filed);
  const end = Date.parse(merged);
  const out: { label: string; at: number }[] = [];
  const day = new Date(start);
  day.setUTCHours(24, 0, 0, 0);
  for (; day.getTime() < end; day.setUTCDate(day.getUTCDate() + 1)) {
    out.push({
      label: day.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
      at: (day.getTime() - start) / (end - start),
    });
  }
  return out;
}

/**
 * The open-source chapter. The figure arrives as the chapter does; the hold then
 * walks the defect in reading order: the line that looked fine, the line struck,
 * what it actually did, the guard written in, and the merge landing last.
 *
 * Every element is in its resolved state in the markup, so a visitor without the
 * motion bundle, or with reduced motion, reads the finished page.
 */
export default function BugChapter({
  figure,
  unit,
  lead,
  places,
  pr,
  issue,
  credit,
  timeline,
  precedent,
  invariant,
  patch,
  verifiedOn,
}: {
  figure: string;
  unit: string;
  lead: string;
  places: { value: string; label: string; href: string } | null;
  pr: (Link & { state: string }) | null;
  issue: Link | null;
  credit: string;
  timeline: BugTimeline | null;
  /** The bug class from its first report to this fix, oldest first. */
  precedent: (Link & { note: string })[];
  /** The rule the code already documented, which this path broke. */
  invariant: { source: string; text: string } | null;
  /** The merged diff, parsed from the file GitHub serves for the pull request. */
  patch: Patch | null;
  /** When every external link on the page last resolved. */
  verifiedOn: string;
}) {
  const barRef = useRef<HTMLSpanElement>(null);
  const chainRef = useRef<HTMLOListElement>(null);
  const invariantRef = useRef<HTMLQuoteElement>(null);
  const { flash } = useStage();
  const innerRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLAnchorElement>(null);
  const slabRef = useRef<HTMLDivElement>(null);
  const strikeRef = useRef<HTMLSpanElement>(null);
  const verdictRef = useRef<HTMLParagraphElement>(null);
  const fixRef = useRef<HTMLPreElement>(null);
  const prRef = useRef<HTMLElement>(null);

  const sectionRef = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const inner = innerRef.current;
    const fig = figureRef.current;
    const slab = slabRef.current;
    const strike = strikeRef.current;
    const verdict = verdictRef.current;
    const fix = fixRef.current;
    const sheet = prRef.current;
    if (!inner || !fig || !slab || !strike || !verdict || !fix || !sheet) return;
    const frame = parseFrame();
    const framed = frame?.chapter === "bug";
    /** Whether the merge has hit on this pass. */
    let landed = false;
    const refresh = watchRefresh(ScrollTrigger);

    // The figure lands while the chapter is still arriving, before the hold.
    const hit = impact(gsap, fig, { shake: inner, flash: flash.current });
    const entry = ScrollTrigger.create({
      trigger: section,
      start: "top 55%",
      onEnter: () => {
        if (!refresh.refreshing()) hit.restart();
      },
      onLeaveBack: () => {
        if (!refresh.refreshing()) hit.pause(0);
      },
    });

    gsap.set(slab, { transformPerspective: 1400, transformOrigin: "50% 100%" });
    const sequence = gsap
      .timeline({ defaults: { ease: "none" } })
      .fromTo(slab, { rotateX: 58, y: 140, opacity: 0.2 }, { rotateX: 0, y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, 0)
      .fromTo(strike, { scaleX: 0 }, { scaleX: 1, duration: 0.16 }, 0.3)
      .fromTo(verdict, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.12, ease: "power2.out" }, 0.4)
      .fromTo(
        Array.from(fix.children),
        { opacity: 0, x: -16 },
        { opacity: 1, x: 0, duration: 0.08, stagger: 0.05, ease: "power2.out" },
        0.52,
      )
      .fromTo(sheet, { x: "46vw", rotate: 5, opacity: 0 }, { x: 0, rotate: 0, opacity: 1, duration: 0.16, ease: "expo.out" }, 0.74)
      .to({}, { duration: 0.1 }, 0.9);

    // The span is measured out while the plate lands; the rule it broke arrives
    // with the verdict; the lineage reads in last, oldest first.
    if (barRef.current) {
      sequence.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: 0.24, ease: "power2.inOut" }, 0.04);
    }
    if (invariantRef.current) {
      sequence.fromTo(invariantRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.1, ease: "power2.out" }, 0.46);
    }
    if (chainRef.current) {
      sequence.fromTo(
        Array.from(chainRef.current.children),
        { opacity: 0, x: -10 },
        { opacity: 1, x: 0, duration: 0.06, stagger: 0.04, ease: "power2.out" },
        0.62,
      );
    }

    // The merge hits once per pass, on the way forward.
    sequence.eventCallback("onUpdate", () => {
      if (refresh.refreshing()) return;
      const p = sequence.progress();
      if (!landed && p >= 0.88) {
        landed = true;
        if (framed) return;
        gsap.fromTo(inner, { x: 0 }, { x: 3, duration: 0.03, repeat: 3, yoyo: true, ease: "none" });
        if (flash.current) gsap.fromTo(flash.current, { opacity: 1 }, { opacity: 0, duration: 0.16, ease: "power1.out" });
      } else if (landed && p < 0.8) {
        landed = false;
      }
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
      // A link to this chapter lands where the defect has finished being walked
      // through, not on the first frame of it.
      onRefresh: (self) => {
        section.dataset.settle = String(Math.round(self.start + (self.end - self.start) * 0.92));
      },
    });

    // After a re-measure the figure is shown if the chapter has arrived, and the
    // merge counts as landed if the hold is past it, without replaying either.
    refresh.onSettled(() => {
      if (entry.progress > 0 && hit.progress() === 0) hit.progress(1);
      landed = sequence.progress() >= 0.88;
    });

    if (framed && frame) {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollInstant(hold.start + (hold.end - hold.start) * frame.p);
        ScrollTrigger.update();
        sequence.progress(frame.p);
        hit.progress(1);
        markFrameReady();
      });
    }
    return () => refresh.stop();
  });

  const repo = pr?.url.replace(/\/pull\/\d+\/?$/, "") ?? "";

  return (
    <section ref={sectionRef} id="bug" className={styles.bug} data-chapter="The bug" data-ground="void">
      <div ref={innerRef} className={styles.inner}>
        <div className={styles.claim}>
          <a ref={figureRef} className={styles.figure} href={pr?.url} aria-label={`${figure} ${unit}`}>
            {figure}
          </a>
          {timeline && (
            <p className={styles.figureSource}>
              <Provenance
                id="bug-hours"
                label={`${figure} ${unit}`}
                rows={[
                  { term: "from", value: "content/facts.md", code: true },
                  { term: "filed", value: `${stamp(timeline.filed)} UTC` },
                  { term: "merged", value: `${stamp(timeline.merged)} UTC` },
                  ...(issue ? [{ term: "check", value: issue.label, href: issue.url }] : []),
                ]}
              />
            </p>
          )}
          {/* The chapter's heading is its claim; there is no second label above it. */}
          <h2 className={styles.unit}>{unit}</h2>
          <p className={styles.lead}>{lead}</p>

          {/* The headline figure as a measurement: the report and the merge on
              one axis in UTC, with each midnight between them marked. */}
          {timeline && (
            <figure className={styles.log}>
              <p className={styles.stamps}>
                <span>
                  <em>filed</em>
                  <time dateTime={timeline.filed}>{stamp(timeline.filed)} UTC</time>
                </span>
                <span>
                  <em>merged</em>
                  <time dateTime={timeline.merged}>{stamp(timeline.merged)} UTC</time>
                </span>
              </p>
              <div className={styles.span} aria-hidden="true">
                {midnights(timeline).map((d) => (
                  <i key={d.label} data-end={d.at > 0.85 || undefined} style={{ left: `${(d.at * 100).toFixed(2)}%` }}>
                    <span>{d.label}</span>
                  </i>
                ))}
                <span ref={barRef} className={styles.bar} />
              </div>
              <figcaption className={styles.logFoot}>
                <span>merged by {timeline.maintainer}</span>
                <span>+{timeline.added} lines</span>
                <span>{timeline.files} files</span>
                <span>0 deleted</span>
              </figcaption>
            </figure>
          )}

          {precedent.length > 0 && (
            <ol ref={chainRef} className={styles.chain} aria-label="The bug class, from its first report to this fix">
              {precedent.map((p) => (
                <li key={p.label}>
                  <a href={p.url}>{p.label}</a>
                  <span>{p.note}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className={styles.work}>
          <div ref={slabRef} className={styles.slab} data-surface="sheet">
            <div className={styles.caption}>
              {repo && (
                <a className={styles.repo} href={repo}>
                  <GitHubMark size={14} />
                  <span>{repo.replace("https://github.com/", "")}</span>
                </a>
              )}
              <span className={styles.path} title="CompositeBackend.ls(), simplified">
                ls(), simplified
              </span>
              {/* The walk-through below is a shortened reading of the method. The
                  patch as merged is one press away, with the line numbers it has
                  in each file, so nothing here has to be taken on trust. */}
              {patch && (
                <details className={styles.patch}>
                  <summary>
                    full patch, +{patch.added} in {patch.files.length} files
                  </summary>
                  <div className={styles.patchBody} tabIndex={0} aria-label="The merged patch">
                    {patch.files.map((f) => (
                      <div key={f.path} className={styles.patchFile}>
                        <p className={styles.patchPath}>
                          {f.path}
                          <span>
                            +{f.added} &minus;{f.removed}
                          </span>
                        </p>
                        <pre className={styles.patchCode}>
                          {f.lines.map((l, i) => (
                            <code key={i} data-mark={l.mark === " " ? undefined : l.mark}>
                              <span className={styles.gutter} aria-hidden="true">
                                {l.old ?? ""}
                              </span>
                              <span className={styles.gutter} aria-hidden="true">
                                {l.new ?? ""}
                              </span>
                              <span className={styles.patchText}>
                                {l.mark === "@" ? `@@ ${l.text}` : `${l.mark}${l.text}`}
                              </span>
                            </code>
                          ))}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <pre className={styles.code}>
              {BEFORE.map((line, i) => (
                <code
                  key={i}
                  className={line.tone === "bad" ? `${styles.line} ${styles.bad}` : styles.line}
                  data-mark={line.tone === "bad" ? "-" : " "}
                >
                  {line.tone === "bad" ? (
                    <span className={styles.struck}>
                      {line.text}
                      <span ref={strikeRef} className={styles.strike} aria-hidden="true" />
                    </span>
                  ) : (
                    line.text || " "
                  )}
                </code>
              ))}
            </pre>

            <p ref={verdictRef} className={styles.verdict}>
              The default backend failed. The caller was told the filesystem was healthy and nearly empty.
              {places && (
                <>
                  {" "}
                  The issue named{" "}
                  <a href={places.href}>
                    {places.value} {places.label}
                  </a>
                  .
                </>
              )}
            </p>

            {/* What made the report land: not a crash, but the file's own rule. */}
            {invariant && (
              <blockquote ref={invariantRef} className={styles.invariant}>
                <p className={styles.invariantSource}>the rule it broke, from {invariant.source}</p>
                <p className={styles.invariantText}>{invariant.text}</p>
              </blockquote>
            )}

            <pre ref={fixRef} className={`${styles.code} ${styles.fix}`}>
              {AFTER.map((line, i) => (
                <code
                  key={i}
                  className={line.tone === "good" ? `${styles.line} ${styles.good}` : styles.line}
                  data-mark={line.tone === "good" ? "+" : " "}
                >
                  {line.text}
                </code>
              ))}
            </pre>
          </div>

          {pr && (
            <aside ref={prRef} className={styles.pr} aria-label="The merged pull request">
              <p className={styles.prState}>{pr.state.charAt(0).toUpperCase() + pr.state.slice(1)}</p>
              <a className={styles.prLink} href={pr.url}>
                {pr.label}
              </a>
              {credit && <p className={styles.credit}>{credit}</p>}
              {issue && (
                <a className={styles.issue} href={issue.url}>
                  Reported in {issue.label}
                </a>
              )}
              <p className={styles.checked}>links checked {verifiedOn}</p>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}
