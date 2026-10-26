"use client";

import { useEffect, useRef } from "react";
import { SENT_EVENT, TELEMETRY_EVENT, ASK_EVENT, type SentDetail, type TelemetryPing } from "./Agent";
import { VISITOR_JOURNEYS } from "@/lib/journeys";
import { useReferralTag } from "./Reach";
import { mailtoLink } from "@/lib/reach";
import styles from "./Hero.module.css";
import { track } from "@/lib/analytics";

type Props = {
  name: string;
  tagline: string;
  location: string;
  /** Title, employer and start date in one line: what a recruiter checks first. */
  current: string;
  /** The least fakeable thing he owns, stated before the first scroll. The
   *  figure is matched inside the sentence and links the merged pull request. */
  evidence: { figure: string; sentence: string; href: string; label: string };
  /** The written draft the primary action opens. */
  email: string;
  site: string;
  /** Name and role for the draft's subject line. */
  who: string;
  /** The two pinned certifications, named on a phone where a referrer reads first. */
  certified?: string[];
  resumeHref: string;
  /** The agent counted across four domains (tools, trace, evaluation, retrieval), each read from code. */
  counts?: { tools: number; steps: number; tested: { pass: number; cases: number; at: string }; passages: number };
  /** The agent itself, rendered under the graph it just traced. */
  children?: React.ReactNode;
};

/**
 * The hero reads the page's recorded load-time run on mount and hands its
 * numbers to the film. The agent card opens on the brief, not on that answer.
 *
 * It is deliberately silent and requires no interaction: the first thing a
 * visitor sees has to work with the sound off, on a phone, before any permission
 * prompt. Voice is offered further down for anyone who wants it.
 *
 * Nothing here ever displays a placeholder value, because a fabricated latency
 * is the easiest claim on a page like this to disprove.
 */
export default function Hero({
  name,
  tagline,
  location,
  current,
  evidence,
  email,
  site,
  who,
  certified = [],
  resumeHref,
  counts,
  children,
}: Props) {
  const tag = useReferralTag();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const controller = new AbortController();

    (async () => {
      try {
        window.dispatchEvent(
          new CustomEvent<SentDetail>(SENT_EVENT, { detail: { question: null, t0: performance.now(), recorded: true } }),
        );
        const res = await fetch("/api/agent/demo", { signal: controller.signal });
        if (!res.ok) return;
        const demo: {
          question: string;
          answer: string;
          sources: string[];
          timings: Record<string, number>;
          total: number;
          usage: { in: number; out: number } | null;
          provider: string | null;
          ranAt?: number;
        } = await res.json();
        const measured = demo.timings;
        // A recorded run, not the visitor's: the film labels it with its age.
        window.dispatchEvent(
          new CustomEvent<TelemetryPing>(TELEMETRY_EVENT, {
            detail: {
              ms: demo.total,
              tokens: (demo.usage?.in ?? 0) + (demo.usage?.out ?? 0),
              cost: 0,
              provider: demo.provider,
              tokensIn: demo.usage?.in,
              tokensOut: demo.usage?.out,
              timings: measured,
              sources: demo.sources,
              recorded: true,
              ranAt: demo.ranAt,
              answerChars: demo.answer.length,
            },
          }),
        );
      } catch {
        // Offline, blocked, or the route is not deployed. The film shows no
        // numbers rather than a made-up one.
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <header className={styles.hero} id="top" tabIndex={-1}>
      <div className="wrap">
        <div className={styles.top} data-film-scrim>
          {/* The name at the top left goes back to the top, as it does on most sites. */}
          <a className={styles.name} href="#top">{name}</a>
          <span className={styles.place}>{location}</span>
        </div>

        {/* Split on the sentence boundary: the claim leads, the qualifier
            recedes. Falls back to the whole string if the shape ever changes. */}
        <h1 className={styles.line} data-film-scrim>
          {(() => {
            const cut = tagline.indexOf(". ");
            if (cut === -1) return tagline;
            return (
              <>
                {tagline.slice(0, cut + 1)}{" "}
                <span className="quiet">{tagline.slice(cut + 2)}</span>
              </>
            );
          })()}
        </h1>

        {/* Two columns above 62rem, stacked below.
         *
         * Measured before this changed: the hero ran 1767px against a 900px
         * viewport, so half of it was below the fold -- including the telemetry
         * strip, the suggested questions, and the call to action, which sat at
         * 1660px. Meanwhile the right third of a 1440px screen was empty from
         * top to bottom. Identity reads down the left, the instrument runs on
         * the right, and both finish inside the first screen. */}
        <div className={styles.body}>
          <div className={styles.identity} data-film-scrim>

        {/* Title, employer and start date: the line a recruiter scans for
            before anything else, set directly under the claim. */}
        <p className={`${styles.current} rise`} style={{ "--rise-n": 0 } as React.CSSProperties}>
          {current}
        </p>
        {certified.length > 0 && (
          <p className={styles.certified} data-only="phone">
            {certified.join(" \u00b7 ")}
          </p>
        )}

        {/* Each route names who it is for and what it leads to, so a reader
            picks by recognising themselves rather than by guessing a section. */}
        <nav className={styles.journeys} aria-label="Find what you need">
          {VISITOR_JOURNEYS.map((journey) => (
            <a key={journey.label} href={journey.href} data-only={"phone" in journey ? "phone" : undefined}>
              <b>{journey.label}</b>
              <span>{journey.promise}</span>
            </a>
          ))}
        </nav>

        {/* The agent below, counted. Four numbers from four parts of the system,
            each one a question the agent answers about itself. */}
        {counts && (
          <div className={styles.tally} role="group" aria-label="The agent, counted">
            {[
              { n: `${counts.tools}`, what: "tools it can call", ask: "Which tools can the agent call, and when does it use each one?" },
              { n: `${counts.steps}`, what: "traced steps per answer", ask: "What happens in each traced step of a run, from routing to the grounding check?" },
              { n: `${counts.tested.pass}/${counts.tested.cases}`, what: `held-out evals, ${counts.tested.at}`, ask: "How is the agent tested, and what does the held-out split check?" },
              { n: `${counts.passages}`, what: "passages it searches", ask: "What is in the record the agent searches, and how is it split into passages?" },
            ].map((c) => (
              <button key={c.what} type="button" onClick={() => window.dispatchEvent(new CustomEvent<string>(ASK_EVENT, { detail: c.ask }))}>
                <b className="tabular">{c.n}</b>
                <span>{c.what}</span>
              </button>
            ))}
          </div>
        )}

        {/* One filled action and one plain one. The draft is already written,
            so pressing it costs the reader a send, not a message. */}
        <div className={styles.actions}>
          <a className={styles.cta} href={mailtoLink(email, site, "general", tag, who)} onClick={() => track("contact", "hero-email")} data-pull>
            <span className={styles.ctaText}>
              Email him
              <span className={styles.ctaHint}>draft written · compose_intro</span>
            </span>
          </a>
          <a className={styles.secondary} href={resumeHref} target="_blank" rel="noreferrer" onClick={() => track("contact", "hero-resume")}>
            Résumé
          </a>
        </div>

        {/* The one claim an outsider acted on, beside the action it argues for. */}
        <p className={`${styles.proof} rise`} style={{ "--rise-n": 2 } as React.CSSProperties}>
          {(() => {
            const at = evidence.sentence.lastIndexOf(evidence.figure);
            if (at === -1) return evidence.sentence;
            const end = at + evidence.figure.length;
            return (
              <>
                {evidence.sentence.slice(0, at)}
                <a href={evidence.href} aria-label={evidence.label || "the merged fix"} data-pull>
                  <b className={`${styles.proofFigure} tabular`}>{evidence.figure}</b>
                </a>
                {evidence.sentence.slice(end)}
              </>
            );
          })()}
        </p>
          </div>

        {/* One instrument, not two.
            The graph and the agent were separated by the availability line and
            two buttons, so the thing that had just run and the box that runs it
            again read as unrelated furniture. They are the same object: the
            brief opens it and the input under it runs the agent. The console
            ground says the whole block is live. */}
        <div className={styles.console} data-surface="console">
          {/* Framing ticks: the console is an instrument, and an instrument has corners. */}
          <i className={styles.tick} data-c="tl" aria-hidden="true" />
          <i className={styles.tick} data-c="tr" aria-hidden="true" />
          <i className={styles.tick} data-c="bl" aria-hidden="true" />
          <i className={styles.tick} data-c="br" aria-hidden="true" />
          <div className={styles.agentSlot}>{children}</div>
        </div>

        </div>
      </div>
    </header>
  );
}
