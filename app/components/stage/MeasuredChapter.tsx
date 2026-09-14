"use client";

import { useEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion";
import { TIMINGS_EVENT, useStage, type TimingsDetail } from "./StageContext";
import { collide, impact, IMPACT_HIT } from "./impact";
import { markFrameReady, parseFrame, scrollInstant, watchRefresh } from "./frame";
import Provenance from "./Provenance";
import styles from "./MeasuredChapter.module.css";

type Edge = { from: string; to: string; conditional: boolean };

export type EvalCase = {
  name: string;
  group: string;
  /** What the case checks, as the suite writes it. */
  asserts: string;
  /** Runs this case passed, out of `runs`. */
  passes: number;
  runs: number;
  pass: boolean;
  modes: string[];
};

export type MeasuredProps = {
  measured: string;
  evals: {
    cases: number;
    passed: number;
    runs: number;
    totalRuns: number;
    totalPasses: number;
    p50: number;
    p95: number;
    scored: number;
    precision1: number;
    mrr: number;
    recallK: number;
    /** Retrievals in the run, and how many of them took the embedding pass. */
    denseUsed: number;
    retrievals: number;
    groups: { name: string; cases: number; passed: number }[];
    detail: EvalCase[];
    provider: string;
    model: string;
  };
  model: {
    chosen: string;
    chosenOn: string;
    observations: number;
    p95: number;
    p50: number;
    /** The fastest other model whose correctness could not be told apart. */
    next: { model: string; p95: number; p50: number } | null;
  };
  graph: { nodes: string[]; edges: Edge[]; conditional: number };
  defects: { symptom: string; guard: string }[];
};

/** Progress through the hold at which each card docks, in grid order. */
const DOCK_AT = [0.04, 0.16, 0.28, 0.4, 0.52];

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (model: string) => model.split("/").pop() ?? model;
/** The suite joins its assertions with a middle dot; on the page they read as a list. */
const clauses = (asserts: string) => asserts.split(" · ").join("; ");

const GRAPH_W = 300;
const GRAPH_H = 150;

/**
 * Layered from the compiled graph rather than placed by hand: a node's rank is its
 * longest distance from start, so a new node or edge redraws on the next build.
 *
 * Laid out left to right, because the cell is wide and short and a top-down stack
 * crushed the one rank that branches. A rank with several nodes stacks them
 * vertically and labels each to its right, so the gap after that rank is sized
 * from its longest label; a rank with one node labels it underneath. Every label
 * is knocked out of the lines behind it (see CSS).
 */
function layout(nodes: string[], edges: Edge[]) {
  const rank = new Map(nodes.map((n) => [n, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    for (const e of edges) rank.set(e.to, Math.max(rank.get(e.to) ?? 0, (rank.get(e.from) ?? 0) + 1));
  }
  const deepest = Math.max(1, ...rank.values());
  const ranks = Array.from({ length: deepest + 1 }, (_, r) => nodes.filter((n) => rank.get(n) === r));
  // Monospace at 11px sets close to 6.6 units a character.
  const labelWidth = (n: string) => n.length * 6.6;

  const xs: number[] = [];
  ranks.forEach((group, r) => {
    if (r === 0) return void xs.push(14);
    const prev = ranks[r - 1];
    const gap = prev.length > 1 ? Math.max(...prev.map(labelWidth)) + 26 : 46;
    xs.push(xs[r - 1] + gap);
  });
  const tail = ranks[deepest].length > 1 ? Math.max(...ranks[deepest].map(labelWidth)) + 12 : 14;
  const scale = Math.min(1, (GRAPH_W - 2) / (xs[deepest] + tail));

  const at = new Map<string, { x: number; y: number; stacked: boolean }>();
  ranks.forEach((group, r) => {
    group.forEach((n, i) => {
      const parents = edges.filter((e) => e.to === n);
      // A lone node with one parent stays on its parent's line, so a pipeline
      // step reads as a straight run instead of a detour.
      const y =
        group.length === 1
          ? parents.length === 1
            ? (at.get(parents[0].from)?.y ?? GRAPH_H / 2)
            : GRAPH_H / 2
          : 18 + ((i + 1) / (group.length + 1)) * (GRAPH_H - 36);
      at.set(n, { x: xs[r] * scale, y, stacked: group.length > 1 });
    });
  });
  return at;
}

export default function MeasuredChapter({ measured, evals, model, graph, defects }: MeasuredProps) {
  const { flash } = useStage();
  const gridRef = useRef<HTMLDivElement>(null);
  const casesRef = useRef<HTMLDetailsElement>(null);
  const [group, setGroup] = useState<string | null>(null);
  // The graph is read from the build; how long each node took is read from the
  // one real answer this page has, once it arrives. Never guessed before then.
  const [run, setRun] = useState<TimingsDetail | null>(null);
  useEffect(() => {
    const onTimings = (e: Event) => setRun((e as CustomEvent<TimingsDetail>).detail);
    window.addEventListener(TIMINGS_EVENT, onTimings);
    return () => window.removeEventListener(TIMINGS_EVENT, onTimings);
  }, []);

  const sectionRef = useMotion<HTMLElement>(({ gsap, ScrollTrigger }, section) => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-card]"));
    const frame = parseFrame();
    const framed = frame?.chapter === "measured";
    const refresh = watchRefresh(ScrollTrigger);

    // Each card flies in from depth into its socket, and the dock shoves the
    // cards already seated. The first one carries the flash.
    const docks = cards.map((card, i) => {
      const tl = impact(gsap, card, {
        strength: 0.6,
        shake: i === 0 ? grid : null,
        flash: i === 0 ? flash.current : null,
      });
      tl.call(() => void (framed || collide(gsap, card, cards, 0.7)), [], IMPACT_HIT);
      return tl;
    });
    const docked = cards.map(() => false);
    const sync = (p: number) => {
      docks.forEach((tl, i) => {
        if (p >= DOCK_AT[i] && !docked[i]) {
          docked[i] = true;
          tl.restart();
        } else if (p < DOCK_AT[i] - 0.02 && docked[i]) {
          docked[i] = false;
          tl.pause(0);
        }
      });
    };

    const hold = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=100%",
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (!framed && !refresh.refreshing()) sync(self.progress);
      },
      // A link to this chapter lands on the docked bento, not on empty sockets.
      onRefresh: (self) => {
        section.dataset.settle = String(Math.round(self.start + (self.end - self.start) * 0.7));
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
        docks.forEach((tl, i) => {
          docked[i] = frame.p >= DOCK_AT[i];
          tl.pause().progress(Math.min(Math.max((frame.p - DOCK_AT[i]) / 0.1, 0), 1));
        });
        markFrameReady();
      });
    }
    return () => refresh.stop();
  });

  const at = layout(graph.nodes, graph.edges);
  const slowest = Math.max(model.p95, model.next?.p95 ?? 0) || 1;
  const failing = evals.detail.filter((c) => !c.pass);
  const shown = group ? evals.detail.filter((c) => c.group === group) : evals.detail;

  // Selecting a group filters the case list and opens it, so the bar a reader
  // clicked always leads to the cases behind it.
  const choose = (name: string) => {
    setGroup((current) => (current === name ? null : name));
    if (casesRef.current) casesRef.current.open = true;
  };

  return (
    <section
      ref={sectionRef}
      id="measured"
      className={styles.measured}
      data-chapter="Measured"
      data-ground="void"
    >
      <div className={styles.inner}>
        <header className={styles.head}>
          <h2 className={styles.title}>How this is measured</h2>
          {/* The run every figure below was read from, printed as the run
              identity rather than paraphrased, with the command that repeats it. */}
          <dl className={styles.receipt} aria-label="The evaluation run these figures come from">
            <div>
              <dt>run</dt>
              <dd>
                <time dateTime={measured}>{measured}</time>
              </dd>
            </div>
            <div>
              <dt>suite</dt>
              <dd>
                {evals.cases} cases × {evals.runs} runs
              </dd>
            </div>
            <div>
              <dt>provider</dt>
              <dd>{evals.provider}</dd>
            </div>
            <div>
              <dt>model</dt>
              <dd>{short(evals.model)}</dd>
            </div>
            <div>
              <dt>repeat it</dt>
              <dd>
                <code>npm run test:evals</code>{" "}
                <Provenance
                  id="measured-run"
                  label="every figure in this chapter"
                  rows={[
                    { term: "evals", value: "content/evals.json", code: true },
                    { term: "models", value: "content/models.json", code: true },
                    { term: "measured", value: measured },
                    { term: "graph", value: "lib/agent/topology.json, from the build", code: false },
                  ]}
                />
              </dd>
            </div>
          </dl>
        </header>

        <div ref={gridRef} className={styles.grid}>
          <div className={`${styles.cell} ${styles.cellA}`}>
            <article data-card className={styles.card}>
              <header className={styles.readout}>
                <span>Eval suite</span>
                <span>runs passing</span>
              </header>
              <p className={styles.big}>
                <span>{`${evals.totalPasses}/${evals.totalRuns}`}</span>
              </p>
              {/* The figure drawn as what it counts: one mark per run, grouped by
                  case, so the seven missed runs are visible before the digits
                  are read. */}
              <ol className={styles.counter} aria-label={`${evals.totalPasses} of ${evals.totalRuns} runs pass`}>
                {evals.detail.map((c) => (
                  <li key={c.name} data-dim={group && c.group !== group ? "" : undefined} title={c.name}>
                    {Array.from({ length: c.runs }, (_, run) => (
                      <i key={run} data-miss={run >= c.passes || undefined} />
                    ))}
                  </li>
                ))}
              </ol>
              <p className={styles.note}>
                {evals.cases} cases, {evals.runs} runs each, {evals.passed} green on every run
              </p>

              <ul className={styles.groups} aria-label="Cases by group. Select a group to list its cases.">
                {evals.groups.map((g) => (
                  <li key={g.name}>
                    <button
                      type="button"
                      className={styles.groupButton}
                      aria-pressed={group === g.name}
                      onClick={() => choose(g.name)}
                    >
                      <span>{g.name}</span>
                      <span className={styles.bar} data-full={g.passed === g.cases}>
                        <span style={{ transform: `scaleX(${g.passed / g.cases})` }} />
                      </span>
                      <span className={styles.count}>{`${g.passed}/${g.cases}`}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* The cases that are not green on every run, by name. A suite that
                  only ever reports its pass rate is hiding the interesting part. */}
              {failing.length > 0 && (
                <div className={styles.failing}>
                  <p className={styles.failingHead}>Not green on every run</p>
                  <ul>
                    {failing.map((c) => (
                      <li key={c.name}>
                        <span>{c.name}</span>
                        <span>
                          {c.passes} of {c.runs}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          </div>

          <div className={`${styles.cell} ${styles.cellB}`}>
            <article data-card className={styles.card}>
              <header className={styles.readout}>
                <span>Retrieval</span>
                <span>precision at 1</span>
              </header>
              <p className={styles.mid}>{Math.round(evals.precision1 * 100)}%</p>
              <p className={styles.note}>{evals.scored} scored questions</p>
              <dl className={styles.pairs}>
                <div>
                  <dt>mean reciprocal rank</dt>
                  <dd>{evals.mrr}</dd>
                </div>
                <div>
                  <dt>recall at k</dt>
                  <dd>{evals.recallK}</dd>
                </div>
                <div>
                  <dt>embedding pass used</dt>
                  <dd>
                    {evals.denseUsed} of {evals.retrievals}
                  </dd>
                </div>
              </dl>
            </article>
          </div>

          <div className={`${styles.cell} ${styles.cellC}`}>
            <article data-card className={styles.card}>
              <header className={styles.readout}>
                <span>Latency</span>
                <span>ms, p95</span>
              </header>
              <p className={styles.mid}>{fmt(evals.p95)}</p>
              {/* The median against the tail, on one scale: most answers land in
                  a small fraction of what the slowest twentieth costs. */}
              <ul className={styles.race}>
                <li>
                  <span className={styles.raceName}>p50</span>
                  <span className={styles.bar} data-full="true">
                    <span style={{ transform: `scaleX(${evals.p50 / evals.p95})` }} />
                  </span>
                  <span className={styles.count}>{fmt(evals.p50)} ms</span>
                </li>
                <li data-other>
                  <span className={styles.raceName}>p95</span>
                  <span className={styles.bar} data-full="true">
                    <span style={{ transform: "scaleX(1)" }} />
                  </span>
                  <span className={styles.count}>{fmt(evals.p95)} ms</span>
                </li>
              </ul>
            </article>
          </div>

          <div className={`${styles.cell} ${styles.cellD}`}>
            <article data-card className={styles.card}>
              <header className={styles.readout}>
                <span>Model</span>
                <span>p95 per answer</span>
              </header>
              {/* Two bars with no names beside them is a race with unnamed runners. */}
              <ul className={styles.race}>
                <li>
                  <span className={styles.raceName}>{short(model.chosen)}</span>
                  <span className={styles.bar} data-full="true">
                    <span style={{ transform: `scaleX(${model.p95 / slowest})` }} />
                  </span>
                  <span className={styles.count}>{fmt(model.p95)} ms</span>
                  <span className={styles.raceSub}>p50 {fmt(model.p50)} ms</span>
                </li>
                {model.next && (
                  <li data-other>
                    <span className={styles.raceName}>{short(model.next.model)}</span>
                    <span className={styles.bar} data-full="true">
                      <span style={{ transform: `scaleX(${model.next.p95 / slowest})` }} />
                    </span>
                    <span className={styles.count}>{fmt(model.next.p95)} ms</span>
                    <span className={styles.raceSub}>p50 {fmt(model.next.p50)} ms</span>
                  </li>
                )}
              </ul>
              <p className={styles.note}>
                chosen on {model.chosenOn}, {model.observations} observations
              </p>
            </article>
          </div>

          <div className={`${styles.cell} ${styles.cellE}`}>
            <article data-card className={styles.card}>
              <header className={styles.readout}>
                <span>Compiled graph</span>
                <span>read from the build</span>
              </header>
              <svg
                className={styles.graph}
                viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
                role="img"
                aria-label={`The compiled agent graph: ${graph.nodes.join(", ")}, with ${graph.conditional} conditional edges.`}
              >
                {graph.edges.map((e) => {
                  const a = at.get(e.from);
                  const b = at.get(e.to);
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`${e.from}-${e.to}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      data-conditional={e.conditional || undefined}
                    />
                  );
                })}
                {graph.nodes.map((n) => {
                  const p = at.get(n);
                  if (!p) return null;
                  const ms = run?.timings[n];
                  return (
                    <g
                      key={n}
                      data-ran={ms !== undefined || undefined}
                      tabIndex={ms !== undefined ? 0 : undefined}
                      aria-label={ms !== undefined ? `${n}, ${fmt(Math.round(ms))} milliseconds` : undefined}
                    >
                      {ms !== undefined && <title>{`${n}: ${fmt(Math.round(ms))} ms`}</title>}
                      <rect x={p.x - 4} y={p.y - 4} width={8} height={8} />
                      {ms !== undefined && (
                        <text className={styles.ms} x={p.x} y={p.y - 10} textAnchor="middle">
                          {fmt(Math.round(ms))} ms
                        </text>
                      )}
                      {p.stacked ? (
                        <text x={p.x + 9} y={p.y + 4} textAnchor="start">
                          {n}
                        </text>
                      ) : (
                        <text x={p.x} y={p.y + 18} textAnchor="middle">
                          {n}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              <p className={styles.note}>
                {graph.nodes.length} nodes, {graph.edges.length} edges, {graph.conditional} conditional
                {run ? ", lit where the opening answer ran; point at one for its time" : ""}
              </p>
            </article>
          </div>

          <div className={`${styles.cell} ${styles.cellF}`}>
            <details ref={casesRef} className={styles.panel} name="measured-panel">
              <summary>
                <span>
                  All {evals.cases} cases, {failing.length} not green on every run
                </span>
                <span className={styles.toggle} aria-hidden="true" />
              </summary>
              <div className={styles.panelBody}>
                <div className={styles.filter}>
                  <span>
                    {group ? `${group}, ${shown.length} cases` : `every group, ${shown.length} cases`}
                  </span>
                  {group && (
                    <button type="button" onClick={() => setGroup(null)}>
                      Show every group
                    </button>
                  )}
                </div>
                <ul className={styles.caseList}>
                  {shown.map((c) => (
                    <li key={c.name} data-pass={c.pass}>
                      <span className={styles.caseName}>{c.name}</span>
                      <span className={styles.caseGroup}>{c.group}</span>
                      <span className={styles.caseAsserts}>{clauses(c.asserts)}</span>
                      <span className={styles.casePasses}>
                        {c.passes}/{c.runs}
                        {c.modes.length > 0 && <em>{c.modes.join(", ")}</em>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>

            <details className={styles.panel} name="measured-panel">
              <summary>
                <span>{defects.length} defects this page shipped, and what now stops each one</span>
                <span className={styles.toggle} aria-hidden="true" />
              </summary>
              <dl className={`${styles.panelBody} ${styles.defectList}`}>
                {defects.map((d) => (
                  <div key={d.symptom}>
                    <dt>{d.symptom}</dt>
                    <dd>{d.guard}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
