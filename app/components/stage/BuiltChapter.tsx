"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import { median, reach, readJson } from "@/lib/probe";
import { relativeTime } from "@/lib/numbers";
import { condense, print, pulse, settle } from "@/lib/verbs";
import { GitHubMark } from "../Mark";
import { useStage } from "./StageContext";
import styles from "./BuiltChapter.module.css";

type Reading<T> = (T & { checkedOn: string }) | null;

type Props = {
  host: string;
  liveUrl: string;
  sourceUrl: string;
  repo: string;
  cache: { reach: Reading<{ ms: number }>; commit: Reading<{ at: string; stars: number }> };
  life: {
    title: string;
    lead: string;
    full: string;
    agents: string[];
    metrics: { value: string; label: string }[];
    stack: string[];
    hue: string;
  };
  site: {
    title: string;
    evals: { passes: number; runs: number; measured: string };
    audit: { passed: number; total: number; blocking: number; ranOn: string; commit: string } | null;
    linksCheckedOn: string;
    links: number;
    defects: number;
    auditUrl: string;
    repo: string;
  };
};

type Probe = { ms: number | null; at: Date };
type Status = "checking" | "live" | "build";

const PROBES = 3;
const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Built ("Running now"): systems he built that run right now, measured from the
 * reader's own browser. Four terminal panes. Pane 1 reaches the live system three
 * times in sequence and shows the median; pane 2 draws its architecture from the
 * corpus; pane 3 reads the repository's last commit from GitHub; pane 4 lists this
 * page's own recorded checks. Every live read goes through `lib/probe.ts` (1.2s)
 * and falls back to the build cache with its date, never to "down" or 0.
 */
export default function BuiltChapter({ host, liveUrl, sourceUrl, repo, cache, life, site }: Props) {
  const { retrieveInto } = useStage();
  const [probes, setProbes] = useState<Probe[]>([]);
  const [probing, setProbing] = useState(false);
  const [commit, setCommit] = useState<{ at: Date; stars: number } | null>(null);
  const [commitStatus, setCommitStatus] = useState<Status>("checking");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const machineRef = useRef<HTMLParagraphElement>(null);
  const medianRef = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  const runProbes = useCallback(async () => {
    if (!liveUrl) return;
    setProbing(true);
    setProbes([]);
    // Sequential, so the three share nothing but the page they are measured from.
    for (let i = 0; i < PROBES; i++) {
      const r = await reach(liveUrl);
      setProbes((p) => [...p, { ms: r?.ms ?? null, at: r?.at ?? new Date() }]);
    }
    setProbing(false);
  }, [liveUrl]);

  const ref = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const title = titleRef.current;
    const machine = machineRef.current;
    const panes = Array.from(section.querySelectorAll<HTMLElement>("[data-pane]"));
    const figures = Array.from(section.querySelectorAll<HTMLElement>("[data-settle]"));
    let played = false;
    ScrollTrigger.create({
      trigger: section,
      start: "top 70%",
      onEnter: () => {
        if (played) return;
        played = true;
        if (title) {
          retrieveInto(title, "built");
          condense(gsap, title).restart();
        }
        if (machine) print(gsap, machine, { unit: "char" }).restart();
        panes.forEach((pane, i) => {
          gsap.fromTo(pane, { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.24, delay: 0.1 + i * 0.08, ease: "power2.out" });
          const lines = pane.querySelector<HTMLElement>("[data-print]");
          if (lines) gsap.delayedCall(0.34 + i * 0.08, () => print(gsap, lines, { unit: "line" }).restart());
        });
        figures.forEach((f, i) => gsap.delayedCall(0.5 + i * 0.09, () => settle(gsap, f, f.dataset.settle ?? "").restart()));
      },
    });
  });

  // Probes start when the chapter enters the viewport, not at a beat, so a fast
  // reader still sees real values arrive.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        runProbes();
        readJson<{ commit: { committer: { date: string } } }[]>(`https://api.github.com/repos/${repo}/commits?per_page=1`, {
          accept: "application/vnd.github+json",
        }).then(async (list) => {
          const meta = list ? await readJson<{ stargazers_count: number }>(`https://api.github.com/repos/${repo}`) : null;
          if (list?.[0] && meta) {
            setCommit({ at: new Date(list[0].commit.committer.date), stars: meta.stargazers_count });
            setCommitStatus("live");
          } else {
            setCommitStatus("build");
          }
        });
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, repo, runProbes]);

  const reached = probes.filter((p) => p.ms !== null).map((p) => p.ms as number);
  const mid = probes.length === PROBES ? median(reached) : null;
  const probeStatus: Status = probing || probes.length < PROBES ? "checking" : mid !== null ? "live" : "build";
  const last = probes[probes.length - 1];

  // The median arrives as a pulse: a measured value with its time.
  useEffect(() => {
    const el = medianRef.current;
    if (mid === null || !el) return;
    import("gsap").then(({ gsap }) => pulse(gsap, el, `median ${mid} ms`).restart());
  }, [mid]);

  const commitAt = commit?.at ?? (cache.commit ? new Date(cache.commit.at) : null);
  const stars = commit?.stars ?? cache.commit?.stars ?? 0;

  return (
    <section ref={ref} id="built" className={styles.built} data-chapter="Built" data-node="retrieve" data-ground="void">
      <div className={styles.inner}>
        <header className={styles.head}>
          <h2 ref={titleRef} className={styles.title}>
            Running now
          </h2>
          <p ref={machineRef} className={styles.machine} aria-hidden="true">
            observe: <span>{host}</span>
          </p>
          <button type="button" className={styles.prompt} onClick={runProbes} disabled={probing || !liveUrl}>
            <span aria-hidden="true">$</span> probe again
          </button>
        </header>

        <div className={styles.panes}>
          {/* Pane 1: reachability, measured now */}
          <article className={styles.pane} data-pane style={{ "--identity": life.hue } as React.CSSProperties} aria-labelledby="pane-reach">
            <header className={styles.bar} data-identity>
              <span className={styles.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span id="pane-reach" className={styles.paneTitle}>
                {host}
              </span>
              <StatusWord status={probeStatus} />
            </header>
            <div className={styles.body}>
              <ol className={styles.events} aria-label="Probes from this browser">
                {probes.map((p, i) => (
                  <li key={i} data-warn={p.ms === null || undefined}>
                    {p.ms === null ? (
                      <>could not be confirmed from this browser just now</>
                    ) : (
                      <>
                        reached {host} in <b>{p.ms} ms</b>
                      </>
                    )}
                  </li>
                ))}
                {Array.from({ length: PROBES - probes.length }, (_, i) => (
                  <li key={`wait${i}`} className={styles.waiting} aria-hidden="true">
                    {probing && i === 0 ? "reaching" : " "}
                  </li>
                ))}
              </ol>
              <p className={styles.median} aria-live="polite">
                {mid !== null && last ? (
                  <>
                    <span ref={medianRef} className={styles.medianValue}>
                      median {mid} ms
                    </span>
                    <time dateTime={last.at.toISOString()}>at {clock(last.at)}</time>
                  </>
                ) : probeStatus === "build" && cache.reach ? (
                  <span className={styles.cached}>
                    reached from the build in {cache.reach.ms} ms on {cache.reach.checkedOn}
                  </span>
                ) : (
                  <span className={styles.cached}> </span>
                )}
              </p>
            </div>
            <footer className={styles.status}>
              <span>from this browser, sequential, 1.2 s limit each</span>
              <a href={liveUrl}>open {host}</a>
            </footer>
          </article>

          {/* Pane 2: architecture, from the corpus */}
          <article className={styles.pane} data-pane style={{ "--identity": life.hue } as React.CSSProperties} aria-labelledby="pane-arch">
            <header className={styles.bar} data-identity>
              <span className={styles.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span id="pane-arch" className={styles.paneTitle}>
                {life.title}, supervisor and {life.agents.length} agents
              </span>
              <StatusWord status="build" />
            </header>
            <div className={styles.body}>
              <div className={styles.arch}>
                <svg viewBox="0 0 240 120" className={styles.graph} role="img" aria-label={`A supervisor routing to ${life.agents.length} agents: ${life.agents.join(", ")}`}>
                  <rect x="96" y="8" width="48" height="20" className={styles.node} />
                  <text x="120" y="22" className={styles.nodeLabel}>
                    supervisor
                  </text>
                  {life.agents.map((a, i) => {
                    const x = 40 + i * 80;
                    return (
                      <g key={a}>
                        <path d={`M120 28 C120 60 ${x} 56 ${x} 84`} className={styles.edge} />
                        <rect x={x - 30} y="84" width="60" height="20" className={styles.node} />
                        <text x={x} y="98" className={styles.nodeLabel}>
                          {a}
                        </text>
                        <line x1={x} y1="104" x2={x} y2="118" className={styles.thread} />
                      </g>
                    );
                  })}
                </svg>
                <dl className={styles.figures}>
                  {life.metrics.map((m) => {
                    const numeric = /^[-+]?\d[\d,]*%?$/.test(m.value);
                    return (
                      <div key={m.label}>
                        <dd data-settle={numeric ? m.value : undefined}>{m.value}</dd>
                        <dt>{m.label}</dt>
                      </div>
                    );
                  })}
                </dl>
              </div>
              <details className={styles.lead}>
                <summary>{life.lead}</summary>
                <p>{life.full}</p>
              </details>
              <ul className={styles.chips} aria-label="Stack">
                {life.stack.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <footer className={styles.status}>
              <span>from content/facts.md</span>
              <a href={sourceUrl}>source</a>
            </footer>
          </article>

          {/* Pane 3: the repository */}
          <article className={styles.pane} data-pane aria-labelledby="pane-repo">
            <header className={styles.bar}>
              <span className={styles.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span id="pane-repo" className={styles.paneTitle}>
                <GitHubMark size={12} /> {repo}
              </span>
              <StatusWord status={commitStatus} />
            </header>
            <div className={styles.body}>
              <p className={styles.commit}>
                {commitAt ? (
                  <>
                    last commit{" "}
                    <time dateTime={commitAt.toISOString()} className={styles.commitWhen}>
                      {relativeTime(commitAt)}
                    </time>
                  </>
                ) : (
                  <span className={styles.cached}>last commit not read yet</span>
                )}
              </p>
              <p className={styles.commitDate}>
                {commitAt ? commitAt.toISOString().slice(0, 10) : ""}
                {stars > 0 ? `, ${stars} ${stars === 1 ? "star" : "stars"}` : ""}
              </p>
            </div>
            <footer className={styles.status}>
              <span>
                {commitStatus === "live"
                  ? "read from GitHub just now"
                  : cache.commit
                    ? `read at build, ${cache.commit.checkedOn}`
                    : "GitHub did not answer"}
              </span>
              <a href={sourceUrl}>open repository</a>
            </footer>
          </article>

          {/* Pane 4: this page */}
          <article className={styles.pane} data-pane aria-labelledby="pane-site">
            <header className={styles.bar}>
              <span className={styles.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span id="pane-site" className={styles.paneTitle}>
                this page
              </span>
              <StatusWord status="build" />
            </header>
            <div className={styles.body}>
              <dl className={styles.rows} data-print>
                <div>
                  <dt>evals</dt>
                  <dd>
                    {site.evals.passes} of {site.evals.runs} runs, measured {site.evals.measured}
                  </dd>
                </div>
                {site.audit && (
                  <div>
                    <dt>audit</dt>
                    <dd>
                      {site.audit.passed} of {site.audit.total}, {site.audit.blocking} blocking, {site.audit.ranOn}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>links</dt>
                  <dd>
                    {site.links} checked {site.linksCheckedOn}
                  </dd>
                </div>
                <div>
                  <dt>defects</dt>
                  <dd>{site.defects} shipped and guarded</dd>
                </div>
              </dl>
            </div>
            <footer className={styles.status}>
              <span>from committed build records</span>
              <a href={site.auditUrl}>
                <span aria-hidden="true">$ </span>npm run audit
              </a>
            </footer>
          </article>
        </div>
      </div>
    </section>
  );
}

function StatusWord({ status }: { status: Status }) {
  return (
    <span className={styles.word} data-status={status}>
      <i aria-hidden="true" />
      {status}
    </span>
  );
}
