"use client";

import { useState } from "react";
import { useMotion } from "@/lib/motion";
import { AFTER, BEFORE } from "./diff-excerpt";
import { GitHubMark } from "./Mark";
import styles from "./DiffReveal.module.css";

/** Same four states the desktop scrub passes through, named for a tap. */
const STEPS = ["The line that looked fine", "What it actually did", "The fix", "Merged"] as const;

/**
 * The signature moment on the page.
 *
 * As the section scrolls, the swallowed error surfaces and the fix lands. It is
 * the one thing here that is genuinely his and cannot be copied: a real defect he
 * found in a production SDK, rendered as the code that changed.
 *
 * Driven entirely by CSS scroll timelines, so it runs on the compositor with no
 * scroll listener and no animation library. Safari does not support
 * animation-timeline yet, so the @supports block in the stylesheet is the real
 * behaviour for a meaningful share of visitors: everything is simply visible,
 * already resolved. Nothing is gated behind the animation.
 */

export { AFTER, BEFORE };

/**
 * The merge credit, passed in rather than typed here.
 *
 * The duration, the pull request number and its URL were hardcoded in this file
 * while the same three values sat in `content/facts.md` as an `@metric` and an
 * `@artifact`, rendered by the section directly above this one. Two copies of a
 * fact is a fact that can drift, which is the failure hard rule 1 exists to
 * stop; this component is `"use client"` so it cannot read the corpus itself,
 * and the page hands it down.
 */
export default function DiffReveal({
  hours,
  prUrl,
  prLabel,
}: {
  hours: string;
  prUrl: string;
  prLabel: string;
}) {
  const [step, setStep] = useState(0);

  /**
   * The one moment on the page that holds the scroll, on a screen wide enough
   * that holding the scroll is not scroll-jacking.
   *
   * Under 62rem this never arms. Pinning small-viewport content is flagged for
   * a reason: on a phone the pinned section is close to the whole screen, so a
   * hold that reads as a pause on a desktop reads as the page refusing to move.
   * The tap sequence below is the same four states for that width instead.
   *
   * Above the threshold, the reader drives the sequence with the scrollbar: the
   * swallowed error is struck out, the consequence lands, the guard writes
   * itself in line by line, and the merge credit resolves last. Scrubbed rather
   * than played, so it moves at whatever speed the reader moves and can run
   * backwards, which is the difference between watching something and
   * examining it.
   *
   * Everything is readable before this runs and stays readable if it never
   * does. The stylesheet already resolves the whole diff for Safari and for
   * scripting off; this only takes the same elements and ties their progress to
   * scroll position.
   */
  const ref = useMotion<HTMLDivElement>(({ gsap, ScrollTrigger }, root) => {
    // gsap.matchMedia rather than a bare matchMedia check.
    //
    // A plain `if (matches) return` is evaluated once, at the moment motion
    // arms, and never again. Measured: the guard fired on a viewport that was
    // narrow at load, and the pin was then never created even after the window
    // was 1280px wide, because nothing re-ran the check. The signature moment
    // was silently dead at desktop width with no error anywhere.
    //
    // matchMedia() re-evaluates on resize and reverts everything it created
    // when the query stops matching, which is also what makes the phone case
    // correct: rotating a tablet into a wide layout arms the pin, rotating back
    // removes it rather than leaving a pinned section on a small screen.
    const mm = gsap.matchMedia();

    mm.add("(min-width: 62.0625rem)", () => {
      const bad = root.querySelector(`.${styles.bad}`);
      const verdict = root.querySelector(`.${styles.verdict}`);
      const fixLines = root.querySelectorAll(`.${styles.fix} .${styles.line}`);
      const credit = root.querySelector(`.${styles.credit}`);

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: root,
          // Pins the trigger itself. Pinning the inner panel against an outer
          // trigger measured the two separately, so the panel went to fixed and
          // then kept travelling up the viewport to top: -433 while still
          // pinned, which reads as a bug rather than as a hold.
          pin: true,
          start: "top 12%",
          /* 110% of the viewport was 990px of scroll for four states -- 41% of
             this section's height, spent on a runway rather than on the
             argument the section exists to make, in the one section a reader
             most needs to scan fast. 60% is 540px, 135px per state, which is
             still slower than a reader can flick past. */
          end: "+=60%",
          // A number rather than true: the sequence lags the scrollbar slightly,
          // which is what stops a fast flick from snapping through four states
          // in one frame.
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // The offending line is struck through rather than removed. The argument
      // is that this line looked correct, so it has to stay visible to be
      // disbelieved.
      if (bad) {
        timeline.fromTo(
          bad,
          { "--strike": 0 },
          { "--strike": 1, duration: 1, ease: "none" },
          0,
        );
      }

      if (verdict) timeline.from(verdict, { opacity: 0, y: 10, duration: 0.6 }, 0.5);

      // Written in from the left, one line after another, in the order a person
      // would type them.
      if (fixLines.length) {
        timeline.from(
          fixLines,
          { opacity: 0, x: -12, duration: 0.5, stagger: 0.25 },
          1.1,
        );
      }

      if (credit) timeline.from(credit, { opacity: 0, duration: 0.5 }, 2.1);

      // Pinning measures in pixels, and the panel is above the fold on a short
      // window where fonts settle after the trigger is built.
      ScrollTrigger.refresh();
    });
  });

  return (
    <div className={styles.stage} ref={ref}>
      {/* Thumb-driven, under 62rem. data-step selects the CSS state directly,
          so this needs no JS to render correctly on first paint: step 3, fully
          resolved, is also what a visitor with scripting off always sees. */}
      <div className={styles.mobileSteps}>
        <button
          type="button"
          className={styles.mobileStepBtn}
          onClick={() => setStep((s) => (s + 1) % STEPS.length)}
        >
          {STEPS[step]} <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className={styles.sticky} data-step={step}>
        <p className={styles.caption}>
          <a
            className={styles.repo}
            href="https://github.com/langchain-ai/deepagents"
            target="_blank"
            rel="noreferrer"
          >
            <GitHubMark size={13} />
            <span className="ident">langchain-ai/deepagents</span>
          </a>
          <span className={styles.path}>CompositeBackend.ls()</span>
        </p>

        <pre className={styles.code}>
          {BEFORE.map((line, i) => (
            <code
              key={i}
              className={line.tone === "bad" ? `${styles.line} ${styles.bad}` : styles.line}
            >
              {line.text || " "}
            </code>
          ))}
        </pre>

        <p className={styles.verdict}>
          The default backend failed. The caller was told the filesystem was healthy and nearly
          empty.
        </p>

        <pre className={`${styles.code} ${styles.fix}`}>
          {AFTER.map((line, i) => (
            <code
              key={i}
              className={line.tone === "good" ? `${styles.line} ${styles.good}` : styles.line}
            >
              {line.text}
            </code>
          ))}
        </pre>

        <p className={styles.credit}>
          Written and merged by a LangChain maintainer {hours} after the report.{" "}
          <a href={prUrl} target="_blank" rel="noreferrer">
            {prLabel}
          </a>
        </p>
      </div>
    </div>
  );
}
