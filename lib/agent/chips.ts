import { queryTokens } from "./tokenize";

/**
 * The record chips under the brief, and which of them an answer is about.
 *
 * They used to be shuffled per load, so the chip beside an answer about the
 * harness was as likely to be a ranking as the harness itself. Now the answer
 * picks: first the sections it cited, then the words it shares with each chip,
 * then, for ties, how close the chip's sections sit to the cited ones in the
 * stored passage vectors. That last table is computed on the server from the
 * index the site already ships, so ranking calls no model.
 */
export type Chip = {
  /** Who vouches for it: the issuer for a credential, the role for work. */
  kind: string;
  /** What it is, without the kind's words repeated. */
  label: string;
  href: string;
  ask: string;
  image?: string;
  cert?: boolean;
  /** Ranking group: no two of one group sit side by side before an answer. */
  group: "role" | "cert" | "oss" | "last";
  /** Corpus sections the chip is the record of. */
  homes: string[];
  /** Words an answer about this chip would use: its own, then its sections' most distinctive. */
  terms: string[];
  /** Section title to centroid cosine against the chip's homes, top few only. */
  near: Record<string, number>;
};

/** The label minus a leading kind, so "NVIDIA" + "NVIDIA-Certified Professional: Agentic AI" reads "Professional: Agentic AI". */
export function remainder(kind: string, label: string): string {
  const k = kind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rest = label.replace(new RegExp(`^${k}[\\s-]+(certified[\\s:-]+)?`, "i"), "").trim();
  return rest || label;
}

type Index = { passages: { parent: string }[]; tf: Record<string, number>[]; df: Record<string, number>; vectors: number[][] };

/** Terms and section affinities for each chip, from the shipped index. Server only. */
export function profileChips<T extends Omit<Chip, "terms" | "near">>(chips: T[], index: unknown, nTerms = 8, nNear = 6): (T & Pick<Chip, "terms" | "near">)[] {
  const idx = index as Index;
  const n = idx.passages.length;
  const centroid = new Map<string, number[]>();
  idx.passages.forEach((p, i) => {
    const v = idx.vectors[i];
    if (!v) return;
    const c = centroid.get(p.parent) ?? new Array(v.length).fill(0);
    v.forEach((x, j) => (c[j] += x));
    centroid.set(p.parent, c);
  });
  const norm = (v: number[]) => Math.hypot(...v) || 1;
  const cos = (a: number[], b: number[]) => a.reduce((s, x, j) => s + x * b[j], 0) / (norm(a) * norm(b));
  return chips.map((chip) => {
    const tf: Record<string, number> = {};
    idx.passages.forEach((p, i) => {
      if (!chip.homes.includes(p.parent)) return;
      for (const [t, f] of Object.entries(idx.tf[i])) tf[t] = (tf[t] ?? 0) + f;
    });
    const stop = new Set(queryTokens(chip.kind));
    const distinctive = Object.entries(tf)
      .filter(([t]) => queryTokens(t).length && !/^\d+$/.test(t) && !stop.has(t))
      .map(([t, f]) => [t, f * Math.log(n / (idx.df[t] ?? 1))] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, nTerms)
      .map(([t]) => t);
    const terms = [...new Set([...queryTokens(chip.label), ...distinctive])];
    const own = chip.homes.map((h) => centroid.get(h)).filter((v): v is number[] => !!v);
    const near = Object.fromEntries(
      [...centroid.entries()]
        .map(([title, c]) => [title, own.length ? Math.max(...own.map((o) => cos(o, c))) : 0] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, nNear)
        .map(([title, s]) => [title, Math.round(s * 1000) / 1000]),
    );
    return { ...chip, terms, near };
  });
}

/** Before any answer: source order, interleaved so no two of one group touch, ranking last. */
export function defaultOrder(chips: Pick<Chip, "group">[]): number[] {
  const groups = new Map<string, number[]>();
  chips.forEach((c, i) => c.group !== "last" && groups.set(c.group, [...(groups.get(c.group) ?? []), i]));
  const out: number[] = [];
  for (let round = 0; out.length < chips.length; round++) {
    let added = false;
    for (const list of groups.values()) if (list[round] !== undefined) (out.push(list[round]), (added = true));
    if (!added) break;
  }
  chips.forEach((c, i) => c.group === "last" && out.push(i));
  return out;
}

/**
 * Chip order for one answer: cited section first (100), shared words next (10
 * each, capped at 5), then vector closeness to the cited sections (0 to 1) to
 * break ties. Equal scores keep the default order. Null answer: the default.
 */
export function rankChips(chips: Pick<Chip, "group" | "homes" | "terms" | "near">[], answer: { sources: string[]; answer: string } | null): number[] {
  const base = defaultOrder(chips);
  if (!answer) return base;
  const words = new Set(queryTokens(answer.answer));
  const score = (c: (typeof chips)[number]) =>
    (c.homes.some((h) => answer.sources.includes(h)) ? 100 : 0) +
    10 * Math.min(5, c.terms.filter((t) => words.has(t)).length) +
    Math.max(0, ...answer.sources.map((s) => c.near[s] ?? 0));
  const s = chips.map(score);
  return [...base].sort((a, b) => s[b] - s[a] || base.indexOf(a) - base.indexOf(b));
}
