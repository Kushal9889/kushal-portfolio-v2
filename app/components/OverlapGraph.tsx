"use client";

import { useState } from "react";
import graph from "@/lib/agent/graph-data.json";
import Panel from "./Panel";
import styles from "./OverlapGraph.module.css";

/**
 * What recurs across the work.
 *
 * `scripts/build-graph.ts` has produced this on every deploy and nothing has
 * ever imported it: six nodes and eight edges, where an edge means two pieces of
 * work share part of a stack, weighted by how much. It is the one figure on the
 * page that shows the work as connected rather than as a list, which is an
 * argument a CV structurally cannot make -- LangGraph and FastAPI appearing in
 * both a job and a side project says something a bullet list of technologies
 * does not.
 *
 * Laid out by hand rather than by a force simulation. Six nodes do not need one,
 * a simulation is nondeterministic so the figure would differ between loads,
 * and it would ship a physics loop to draw something that never moves. The
 * capability node sits at the centre because it is the only one every other
 * node connects to; the rest are placed around it.
 */
const AT: Record<string, [number, number]> = {
  Skills: [300, 150],
  Questrom: [90, 60],
  "BU Life AI": [510, 60],
  "IMG Systems": [90, 240],
  Growaza: [300, 272],
  deepagents: [510, 240],
};

type Node = { id: string; label: string; kind: string; stack: string[]; weight: number };
type Edge = { a: number; b: number; shared: string[] };

const NODES = graph.nodes as Node[];
const EDGES = graph.edges as Edge[];
const WIDEST = Math.max(...EDGES.map((e) => e.shared.length));

export default function OverlapGraph() {
  const [open, setOpen] = useState<number | null>(null);
  const active = open === null ? null : EDGES[open];

  return (
    <Panel
      label="shared stack"
      state="done"
      status={`${NODES.length} nodes · ${EDGES.length} edges`}
    >
      <svg
        className={styles.svg}
        viewBox="0 0 600 300"
        role="img"
        aria-label={`Six pieces of work linked by shared technology. ${EDGES.map(
          (e) => `${NODES[e.a].label} and ${NODES[e.b].label} share ${e.shared.length}`,
        ).join("; ")}.`}
      >
        {EDGES.map((e, i) => {
          const [x1, y1] = AT[NODES[e.a].label] ?? [0, 0];
          const [x2, y2] = AT[NODES[e.b].label] ?? [0, 0];
          return (
            <line
              key={i}
              className={styles.edge}
              pathLength={1}
              data-draw
              data-live={open === i || undefined}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              // Thickness is the count, so the figure reports magnitude rather
              // than only adjacency. Seven shared technologies should not look
              // like one.
              style={{ "--w": 1 + (e.shared.length / WIDEST) * 5 } as React.CSSProperties}
            />
          );
        })}

        {EDGES.map((e, i) => {
          const [x1, y1] = AT[NODES[e.a].label] ?? [0, 0];
          const [x2, y2] = AT[NODES[e.b].label] ?? [0, 0];
          return (
            <circle
              key={`hit-${i}`}
              className={styles.hit}
              cx={(x1 + x2) / 2}
              cy={(y1 + y2) / 2}
              r={14}
              tabIndex={0}
              role="button"
              aria-label={`${NODES[e.a].label} and ${NODES[e.b].label} share ${e.shared.join(", ")}`}
              onMouseEnter={() => setOpen(i)}
              onMouseLeave={() => setOpen(null)}
              onFocus={() => setOpen(i)}
              onBlur={() => setOpen(null)}
            />
          );
        })}

        {NODES.map((n) => {
          const [x, y] = AT[n.label] ?? [0, 0];
          return (
            <g key={n.id} className={styles.node} data-kind={n.kind}>
              <circle cx={x} cy={y} r={n.kind === "capability" ? 9 : 6} className={styles.dot} />
              <text x={x} y={y - 16} textAnchor="middle" className={styles.text}>
                {n.label}
              </text>
              <text x={x} y={y + 24} textAnchor="middle" className={styles.count}>
                {n.stack.length}
              </text>
            </g>
          );
        })}
      </svg>

      <p className={styles.caption} aria-live="polite">
        {active ? (
          <>
            <b>
              {NODES[active.a].label} and {NODES[active.b].label}
            </b>{" "}
            share {active.shared.length}: {active.shared.join(", ")}.
          </>
        ) : (
          <>
            An edge means two pieces of work share part of a stack, and its weight is how much.
            The number under each node is how many technologies it names. Generated from the corpus
            on every build.
          </>
        )}
      </p>
    </Panel>
  );
}
