import { createHash } from "node:crypto";

/**
 * Content-addressed embedding cache for the index build.
 *
 * A rebuild used to embed every sentence and every passage again, so changing
 * one line of facts.md paid for the whole corpus. A vector is a pure function
 * of (model, input type, text): if none of the three changed, the vector did
 * not either. Keying on their hash makes an unchanged rebuild cost 0 calls and
 * a one-section edit cost only the strings that edit produced.
 *
 * The model is in the key so swapping models can never serve a vector from the
 * old space. A cache that silently mixes two spaces would score queries
 * against vectors they were never comparable with.
 */

export type InputType = "query" | "passage";
export type EmbedCache = Record<string, number[]>;
export type Embed = (texts: string[], inputType: InputType) => Promise<number[][] | null>;

export function embedKey(model: string, inputType: InputType, text: string): string {
  return createHash("sha256").update(`${model}\0${inputType}\0${text}`).digest("hex");
}

export type CachedResult = { vectors: number[][] | null; hits: number; misses: number };

/**
 * Embeds only the texts the cache does not hold, in one batch, and returns
 * every vector in input order. Duplicate texts are sent once.
 *
 * If the misses cannot be embedded the whole result is null, matching
 * `embedAll`: a partial vector list would misalign with the passages.
 */
export async function cachedEmbed(
  texts: string[],
  inputType: InputType,
  model: string,
  cache: EmbedCache,
  embed: Embed,
): Promise<CachedResult> {
  const keys = texts.map((t) => embedKey(model, inputType, t));
  const missing = new Map<string, string>();
  keys.forEach((k, i) => {
    if (!cache[k] && !missing.has(k)) missing.set(k, texts[i]);
  });

  if (missing.size > 0) {
    const fresh = await embed([...missing.values()], inputType);
    if (!fresh) return { vectors: null, hits: texts.length - missing.size, misses: missing.size };
    [...missing.keys()].forEach((k, i) => {
      cache[k] = fresh[i];
    });
  }

  return {
    vectors: keys.map((k) => cache[k]),
    hits: texts.length - missing.size,
    misses: missing.size,
  };
}

/** Keeps only the keys this build used, so deleted text does not grow the file forever. */
export function prune(cache: EmbedCache, used: Set<string>): EmbedCache {
  return Object.fromEntries(Object.entries(cache).filter(([k]) => used.has(k)));
}
