"use client";

import { useEffect, useState } from "react";
import topology from "@/lib/agent/topology.json";
import { ROUTE_EVENT } from "./Agent";
import Panel from "./Panel";
import styles from "./Topology.module.css";

/**
 * The agent's shape, read off the compiled graph.
 *
 * The comment at the top of graph.ts has always carried an ASCII drawing of
 * this, which is a picture of an intention: nothing checked it against the graph
 * that actually compiled. `scripts/build-topology.ts` asks LangGraph what it
 * built, so an edge added or a branch that stops being conditional changes this
 * figure on the next build with nobody editing it.
 *
 * The two conditional edges out of `route` are the whole point. Every other edge
 * here is a pipeline step; those two are the reason a compensation question
 * never reaches a model, and they light up individually as the reader watches a
 * question take one of them.
 */
const AT: Record<string, [number, number]> = {
  start: [46, 100],
  route: [178, 100],
  retrieve: [336, 52],
  answer: [474, 52],
  deflect: [336, 148],
  end: [600, 100],
};

/** Which nodes a route runs through, so a live answer can light its own path. */
const PATH: Record<string, string[]> = {
  answer: ["start", "route", "retrieve", "answer", "end"],
  handoff: ["start", "route", "retrieve", "answer", "end"],
  deflect: ["start", "route", "deflect", "end"],
  authorisation: ["start", "route", "deflect", "end"],
};

export default function Topology() {
  const [taken, setTaken] = useState<string[] | null>(null);
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    const onRoute = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      setRoute(name);
      setTaken(PATH[name] ?? null);
    };
    window.addEventListener(ROUTE_EVENT, onRoute);
    return () => window.removeEventListener(ROUTE_EVENT, onRoute);
  }, []);

  const live = (id: string) => (taken ? taken.includes(id) : null);
  const edgeLive = (from: string, to: string) => {
    if (!taken) return null;
    const i = taken.indexOf(from);
    return i >= 0 && taken[i + 1] === to;
  };

  return (
    <Panel
      label="compiled graph"
      state={route ? "done" : "idle"}
      status={route ? `routed to ${route}` : `${topology.conditional} conditional`}
    >
      <figure className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox="0 0 640 200"
        role="img"
        aria-label={`The compiled agent graph: ${topology.nodes.join(", ")}, with ${topology.conditional} conditional edges out of route.`}
      >
        {topology.edges.map((e) => {
          const [x1, y1] = AT[e.from] ?? [0, 0];
          const [x2, y2] = AT[e.to] ?? [0, 0];
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={`${e.from}-${e.to}`}
              className={styles.edge}
              /* Normalised length, so the draw-on needs no getTotalLength() call
                 and no measurement that a reflow could invalidate: the dash
                 units below are fractions of the path, whatever its geometry. */
              pathLength={1}
              data-draw
              data-conditional={e.conditional || undefined}
              data-live={edgeLive(e.from, e.to) || undefined}
              // Curved only where the branch changes row. A straight line
              // between two nodes at the same height reads as a step; a curve
              // there would imply a detour that does not exist.
              d={
                y1 === y2
                  ? `M ${x1 + 30} ${y1} L ${x2 - 34} ${y2}`
                  : `M ${x1 + 30} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2 - 34} ${y2}`
              }
            />
          );
        })}

        {topology.nodes.map((n) => {
          const [x, y] = AT[n] ?? [0, 0];
          const terminal = n === "start" || n === "end";
          return (
            <g key={n} data-live={live(n) || undefined} className={styles.node}>
              <rect
                x={x - 30}
                y={y - 15}
                width={60}
                height={30}
                rx={terminal ? 15 : 3}
                className={styles.box}
              />
              <text x={x} y={y + 4} textAnchor="middle" className={styles.text}>
                {n}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className={styles.caption}>
        {topology.nodes.length} nodes, {topology.edges.length} edges,{" "}
        <b>{topology.conditional} of them conditional</b>, read off the compiled graph at build time
        rather than drawn.{" "}
        {route ? (
          <>
            The last question routed to <b>{route}</b>, so it took the{" "}
            {PATH[route]?.includes("deflect") ? "deflect" : "retrieve"} branch.
          </>
        ) : (
          <>Ask the agent something and the branch it takes lights up here.</>
        )}
      </figcaption>
      </figure>
    </Panel>
  );
}
