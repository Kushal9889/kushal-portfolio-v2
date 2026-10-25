"use client";

import { useEffect, useRef, useState } from "react";
import { SENT_EVENT, TELEMETRY_EVENT, type SentDetail, type TelemetryPing } from "./Agent";
import { VISITOR_JOURNEYS } from "@/lib/journeys";
import Paced from "./Paced";
import { useReferralTag } from "./Reach";
import { mailtoLink } from "@/lib/reach";
import WorkLoop from "./WorkLoop";
import styles from "./Hero.module.css";
import { reducedMotion } from "@/lib/verbs";
import { track } from "@/lib/analytics";

const NODES = ["route", "retrieve", "answer"] as const;

/** Milliseconds under a second, seconds above it: "2822ms" reads as a big number. */
const dur = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)} s`);
type NodeName = (typeof NODES)[number];

/** Timings arrive per node as the graph executes. Absent until measured. */
type Trace = Partial<Record<NodeName, number>>;

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
  /** The agent itself, rendered under the graph it just traced. */
  children?: React.ReactNode;
};

/**
 * The hero runs one real query against the agent on mount and renders the graph
 * traversing its nodes with the actual per-node timings.
 *
 * It is deliberately silent and requires no interaction: the first thing a
 * visitor sees has to work with the sound off, on a phone, before any permission
 * prompt. Voice is offered further down for anyone who wants it.
 *
 * If the agent is unreachable the graph still renders its structure and simply
 * shows no numbers. Nothing here ever displays a placeholder value, because a
 * fabricated latency is the easiest claim on a page like this to disprove.
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
  children,
}: Props) {
  const tag = useReferralTag();
  const [trace, setTrace] = useState<Trace>({});
  const [active, setActive] = useState<NodeName | null>(null);
  const [done, setDone] = useState(false);
  /** Set when the demo endpoint could not be reached, so the caption says so. */
  const [unreachable, setUnreachable] = useState(false);
  /**
   * What the request on load actually returned.
   *
   * The hero printed three timings for a request whose answer it discarded, so
   * the single most persuasive thing this page does -- answer a real question
   * about him, correctly, in under two seconds -- was invisible to anyone who
   * did not type something first. Most visitors do not type.
   */
  const [said, setSaid] = useState<{ question: string; answer: string; sources: string[] } | null>(
    null,
  );
  const started = useRef(false);
  // The answer pane has a fixed height (see .saidA). When more text sits below
  // the fold of the pane, say so with a fade; at the end of the text, drop it.
  const saidRef = useRef<HTMLParagraphElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = saidRef.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 2);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [said]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Respect a visitor who has asked for less motion: still fetch, but skip the
    // staged node highlight and settle straight to the final numbers.
    const calm = reducedMotion();
    const controller = new AbortController();

    (async () => {
      try {
        window.dispatchEvent(
          new CustomEvent<SentDetail>(SENT_EVENT, { detail: { question: null, t0: performance.now(), recorded: true } }),
        );
        const res = await fetch("/api/agent/demo", { signal: controller.signal });
        if (!res.ok) {
          setUnreachable(true);
          return;
        }
        const demo: {
          question: string;
          answer: string;
          sources: string[];
          timings: Trace;
          total: number;
          usage: { in: number; out: number } | null;
          provider: string | null;
          ranAt?: number;
        } = await res.json();
        const measured = demo.timings;
        // A recorded model answer can carry markdown bold; this pane prints text,
        // so the markers came through as raw asterisks while it typed.
        setSaid({ question: demo.question, answer: demo.answer.replace(/\*\*/g, ""), sources: demo.sources });
        // A recorded run, not the visitor's: the film labels it with its age.
        const ping = () =>
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

        if (calm) {
          setTrace(measured);
          setDone(true);
          ping();
          return;
        }

        // Paced to what was actually measured, not to a fixed beat. A flat
        // 380ms per node put a floor of 1.14s under every reveal, so a fast
        // answer was displayed as though it had been slow. Floored at 90ms so
        // the sequence still reads as three discrete steps rather than a flash.
        const total = NODES.reduce((sum, n) => sum + (measured[n] ?? 0), 0);
        const step = Math.max(90, Math.min(380, total / NODES.length));

        for (const node of NODES) {
          if (measured[node] === undefined) continue;
          setActive(node);
          await new Promise((r) => setTimeout(r, step));
          setTrace((prev) => ({ ...prev, [node]: measured[node] }));
        }
        setActive(null);
        setDone(true);
        // The request the page made on load is a real request and belongs on
        // the strip. Without it a visitor who asks nothing sees an empty chart
        // under a panel claiming to be live.
        ping();
      } catch (err) {
        // Offline, blocked, or the route is not deployed. The structure above
        // still tells the story; it just does so without numbers. Stated rather
        // than left hanging: the caption used to sit on "ask anything below" for
        // ever, which reads as a page still loading rather than one whose demo
        // endpoint is down.
        if ((err as Error)?.name !== "AbortError") setUnreachable(true);
      }
    })();

    return () => controller.abort();
  }, []);

  const total = Object.values(trace).reduce((a, b) => a + b, 0);

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

        {/* One filled action and one plain one. The draft is already written,
            so pressing it costs the reader a send, not a message. */}
        <div className={styles.actions}>
          <a className={styles.cta} href={mailtoLink(email, site, "general", tag, who)} onClick={() => track("contact", "hero-email")} data-pull>
            <span className={styles.ctaText}>
              Email him
              <span className={styles.ctaHint}>draft written</span>
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
            again read as unrelated furniture. They are the same object: this
            panel shows the request the page made on load, and the input under
            it makes another. The console ground says the whole block is live. */}
        <div className={styles.console} data-surface="console">
          {/* The racks the answer is served from, running behind the glass. */}
          <WorkLoop on className={styles.loop} />
          {/* Framing ticks: the console is an instrument, and an instrument has corners. */}
          <i className={styles.tick} data-c="tl" aria-hidden="true" />
          <i className={styles.tick} data-c="tr" aria-hidden="true" />
          <i className={styles.tick} data-c="bl" aria-hidden="true" />
          <i className={styles.tick} data-c="br" aria-hidden="true" />
          <div className={styles.consoleHead}>
            <span className={styles.consoleLabel}>agent</span>
            <span className={styles.consoleState} data-state={done ? "done" : unreachable ? "degraded" : "running"}>
              <span className="live-dot" data-state={done || unreachable ? undefined : "running"} />
              {done ? dur(total) : unreachable ? "unreachable" : "answering\u2026"}
            </span>
          </div>

          {/* The graph, drawn rather than written.
              Each node is a cell with a rail running through it; the rail fills as
              that node completes, so the row reads as a system executing instead of
              a line of log output. Timings sit under the node they belong to. */}
          <div className={styles.graph} aria-hidden="true">
            {NODES.map((node, i) => {
              const ms = trace[node];
              const state = active === node ? "running" : ms !== undefined ? "done" : "idle";
              return (
                <div key={node} className={styles.cell} data-state={state}>
                  <div className={styles.rail}>
                    {i > 0 && <span className={styles.railLine} />}
                    <span className={styles.dot} />
                    {i < NODES.length - 1 && <span className={styles.railLine} />}
                  </div>
                  <span className={styles.label}>{node}</span>
                  <span className={`${styles.ms} tabular`}>
                    {ms !== undefined ? dur(ms) : state === "running" ? "\u00b7\u00b7\u00b7" : ""}
                  </span>
                </div>
              );
            })}
          </div>

          {/* What it said.
           *
           * A panel that reports three latencies for an answer it does not show
           * is asking to be taken on trust, on a page whose entire argument is
           * that nothing here needs to be. This is the actual reply to the
           * actual question, with the sections it was grounded in, produced by
           * the request whose timings are drawn directly above it. */}
          <div
            className={styles.said}
            data-state={said ? "done" : unreachable ? "degraded" : "running"}
            aria-live="polite"
          >
            {said ? (
              <>
                <p className={`${styles.saidQ} rise`} style={{ "--rise-n": 0 } as React.CSSProperties}>
                  {said.question}
                </p>
                <p
                  ref={saidRef}
                  data-more={more || undefined}
                  className={`${styles.saidA} ${styles.typed} rise`}
                  style={{ "--rise-n": 1 } as React.CSSProperties}
                >
                  {/* The full text holds the box at its final height from the
                      first frame (and is what assistive technology reads);
                      the typed copy sits on top of it. */}
                  <span className={styles.ghost}>{said.answer}</span>
                  <span className={styles.type} aria-hidden="true">
                    <Paced text={said.answer} live={false} once />
                  </span>
                </p>
                {said.sources.length > 0 && (
                  <p className={`${styles.saidSrc} rise`} style={{ "--rise-n": 2 } as React.CSSProperties}>
                    <span className={styles.saidSrcLabel}>grounded in</span>
                    {said.sources.map((src) => (
                      <span key={src} className={styles.saidChip}>
                        {src}
                      </span>
                    ))}
                  </p>
                )}
              </>
            ) : unreachable ? (
              <p className={styles.saidA}>
                No provider is reachable right now. The box below still answers from the
                retrieved sections, unsummarised.
              </p>
            ) : (
              /* The shape of the answer, before the answer.
                 A visitor who types nothing watched an empty panel for the
                 second or two the graph takes, under a head already claiming to
                 be running. These are the lines the reply will occupy and the
                 chips it will be grounded in, so the panel states what it is
                 about to do and nothing moves when the words arrive. */
              <>
                <p className={styles.saidPending}>{"answering\u2026"}</p>
                <div className={styles.skel} aria-hidden="true">
                  <span className={styles.skelBar} />
                  <span className={styles.skelBar} style={{ "--skel-n": 1 } as React.CSSProperties} />
                  <span className={styles.skelBar} style={{ "--skel-n": 2 } as React.CSSProperties} />
                  <span
                    className={styles.skelBar}
                    data-short
                    style={{ "--skel-n": 3 } as React.CSSProperties}
                  />
                </div>
                <span className={styles.skelChips} aria-hidden="true">
                  <span className={styles.skelChip} />
                  <span className={styles.skelChip} data-wide />
                </span>
              </>
            )}
          </div>


          <div className={styles.agentSlot}>{children}</div>
        </div>

        </div>
      </div>
    </header>
  );
}
