import { SENT_EVENT, TELEMETRY_EVENT, type SentDetail, type TelemetryPing } from "@/lib/agent/events";

/**
 * Whose request the orange light is.
 *
 * - running: a request left this tab and has not answered yet.
 * - yours: the visitor's question, answered fresh by a model in this tab.
 * - notes: the visitor's question, answered from the retrieved notes because no
 *   model responded.
 * - stored: the visitor's question matched a stored answer, served as recorded.
 * - recorded: the page's own load-time question, run at `ranAt`.
 * - none: nothing has run, or the load-time request failed. No orange then.
 *
 * YOUR QUESTION is claimed only for a run that started in this tab and came back
 * neither warm nor degraded, because anything else is not the visitor's run.
 */
export type Provenance =
  | { kind: "none" }
  | { kind: "running"; recorded: boolean }
  | { kind: "yours" }
  | { kind: "notes" }
  | { kind: "stored" }
  | { kind: "recorded"; ranAt: number };

export type RequestState = {
  provenance: Provenance;
  /** performance.now() when the latest request left, or -1. */
  sentAt: number;
  /** The visitor's question, or null for the load-time one. */
  question: string | null;
};

/** A request that never answers stops claiming to run: the stream gives up at 20 s. */
const GIVE_UP_MS = 30_000;

type Event = { type: "sent"; detail: SentDetail } | { type: "done"; detail: TelemetryPing } | { type: "timeout" };

export function reduce(state: RequestState, previous: Provenance, e: Event): { state: RequestState; previous: Provenance } {
  if (e.type === "sent") {
    return {
      state: { provenance: { kind: "running", recorded: !!e.detail.recorded }, sentAt: e.detail.t0, question: e.detail.question },
      previous: state.provenance.kind === "running" ? previous : state.provenance,
    };
  }
  if (e.type === "timeout") {
    return state.provenance.kind === "running" ? { state: { ...state, provenance: previous }, previous } : { state, previous };
  }
  const d = e.detail;
  // Only the request in flight settles; a late load-time answer never replaces
  // the visitor's own run.
  if (state.provenance.kind !== "running" || state.provenance.recorded !== !!d.recorded) return { state, previous };
  const provenance: Provenance = d.recorded
    ? d.ranAt
      ? { kind: "recorded", ranAt: d.ranAt }
      : { kind: "none" }
    : d.warm
      ? { kind: "stored" }
      : d.degraded
        ? { kind: "notes" }
        : { kind: "yours" };
  return { state: { ...state, provenance }, previous };
}

let state: RequestState = { provenance: { kind: "none" }, sentAt: -1, question: null };
let previous: Provenance = { kind: "none" };
let timer = 0;
const listeners = new Set<() => void>();

function dispatch(e: Event) {
  ({ state, previous } = reduce(state, previous, e));
  window.clearTimeout(timer);
  if (state.provenance.kind === "running") timer = window.setTimeout(() => dispatch({ type: "timeout" }), GIVE_UP_MS);
  listeners.forEach((fn) => fn());
}

// Attached when the module loads, which is at hydration: the load-time request
// starts in the hero's first effect, before the film has loaded.
if (typeof window !== "undefined") {
  window.addEventListener(SENT_EVENT, (e) => dispatch({ type: "sent", detail: (e as CustomEvent<SentDetail>).detail }));
  window.addEventListener(TELEMETRY_EVENT, (e) => dispatch({ type: "done", detail: (e as CustomEvent<TelemetryPing>).detail }));
}

export function getRequest() {
  return state;
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The chip's words and marker for a provenance. Age in whole seconds. */
export function chipOf(p: Provenance, now = Date.now()): { marker: "filled" | "hollow" | null; text: string; spoken: string } | null {
  switch (p.kind) {
    case "none":
      return null;
    case "running":
      return p.recorded
        ? null
        : { marker: "filled", text: "YOUR QUESTION · RUNNING", spoken: "The orange light is your question, running now." };
    case "yours":
      return { marker: "filled", text: "YOUR QUESTION", spoken: "The orange light is your question." };
    case "notes":
      return { marker: "filled", text: "YOUR QUESTION · NOTES ONLY", spoken: "The orange light is your question, answered from notes only." };
    case "stored":
      return { marker: "hollow", text: "RECORDED · STORED ANSWER", spoken: "The orange light is a stored answer to your question." };
    case "recorded": {
      const s = Math.max(0, Math.round((now - p.ranAt) / 1000));
      return {
        marker: "hollow",
        text: `RECORDED · ${s < 60 ? `${s} S` : `${Math.floor(s / 60)} MIN`} AGO`,
        spoken: "The orange light is a recorded sample question. Ask your own and it becomes yours.",
      };
    }
  }
}
