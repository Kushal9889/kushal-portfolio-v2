export type CtaSelection = { featured: number[]; lit: number | null };

const index = (rng: () => number, length: number) => {
  const value = rng();
  return Number.isFinite(value) ? Math.min(length - 1, Math.max(0, Math.floor(value * length))) : 0;
};

/** Select up to three brief CTAs; at most one is lit, never the prior one if avoidable. */
export function chooseCtas(eligible: number[], previousLit: number | null = null, rng = Math.random): CtaSelection {
  const pool = [...new Set((Array.isArray(eligible) ? eligible : []).filter((value) => Number.isInteger(value) && value >= 0))];
  const count = Math.min(3, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + index(rng, pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const featured = pool.slice(0, count);
  const glow = featured.filter((value) => pool.length <= 1 || value !== previousLit);
  return { featured, lit: glow.length ? glow[index(rng, glow.length)] : null };
}
