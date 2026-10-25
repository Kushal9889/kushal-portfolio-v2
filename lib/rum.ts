/**
 * Field-data beacon schema (ADR-004). One validated shape, shared by the route
 * and its test. Anything outside the shape is dropped, never stored: the
 * payload carries no identifier, no user agent and no URL with a query string.
 */
export type Rum = {
  /** Worst interaction duration in ms, reported as INP (see app/Rum.tsx). */
  inp: number | null;
  /** The three slowest scripts behind long animation frames. */
  loaf: { file: string; fn: string; invoker: string; ms: number }[];
  /** Film stats; null until the film engine exposes them. */
  film: { droppedPct: number | null; heldPct: number | null; stillAfterS: number | null; decodeCap: number | null; tier: "p" | "d" | "d4" | null };
  cores: number | null;
  net: "slow-2g" | "2g" | "3g" | "4g" | null;
  viewport: "phone" | "desktop";
};

/** Bytes accepted by POST /api/rum. */
export const RUM_MAX_BYTES = 2048;

const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) / 10 : null);
const text = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const pick = <T extends string>(v: unknown, ok: readonly T[]) => (ok.includes(v as T) ? (v as T) : null);
/** Source file without origin, query string or fragment. */
const file = (v: unknown) => text(v, 200).replace(/[?#].*$/, "").replace(/^https?:\/\/[^/]+/, "").slice(-80);

/** Returns the cleaned payload, or null when the body is not a beacon at all. */
export function parseRum(raw: unknown): Rum | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const viewport = pick(r.viewport, ["phone", "desktop"] as const);
  if (!viewport) return null;
  const f = (r.film && typeof r.film === "object" ? r.film : {}) as Record<string, unknown>;
  const loaf = (Array.isArray(r.loaf) ? r.loaf : [])
    .slice(0, 3)
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .map((s) => ({ file: file(s.file), fn: text(s.fn, 60), invoker: text(s.invoker, 40), ms: num(s.ms, 60000) ?? 0 }));
  return {
    inp: num(r.inp, 60000),
    loaf,
    film: {
      droppedPct: num(f.droppedPct, 100),
      heldPct: num(f.heldPct, 100),
      stillAfterS: num(f.stillAfterS, 3600),
      decodeCap: num(f.decodeCap, 64),
      tier: pick(f.tier, ["p", "d", "d4"] as const),
    },
    cores: num(r.cores, 256),
    net: pick(r.net, ["slow-2g", "2g", "3g", "4g"] as const),
    viewport,
  };
}
