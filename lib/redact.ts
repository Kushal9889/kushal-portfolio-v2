/**
 * In-browser PII redaction: finds personal data in text and replaces each
 * value with a typed, numbered placeholder, the same value always getting the
 * same placeholder so the redacted text still reads. Pattern detectors with a
 * checksum where one exists (card numbers must pass Luhn), so digits that only
 * look like a card are left alone. Nothing leaves the page.
 */
export type Kind = "EMAIL" | "PHONE" | "CARD" | "SSN" | "IP" | "KEY";
export type Hit = { kind: Kind; start: number; end: number; value: string };

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

const DETECTORS: { kind: Kind; re: RegExp; ok?: (v: string) => boolean }[] = [
  { kind: "EMAIL", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // Provider key shapes: OpenAI-style sk-, AWS access key ids, GitHub tokens, NVIDIA nvapi-.
  { kind: "KEY", re: /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|nvapi-[A-Za-z0-9_-]{20,})\b/g },
  { kind: "CARD", re: /\b\d(?:[ -]?\d){12,18}\b/g, ok: (v) => luhn(v.replace(/\D/g, "")) },
  { kind: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "PHONE", re: /(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g },
  { kind: "IP", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
];

/** Every hit, earliest first; where two overlap, the one found by the earlier detector wins. */
export function find(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const { kind, re, ok } of DETECTORS) {
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (ok && !ok(m[0])) continue;
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      hits.push({ kind, start, end, value: m[0] });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** The text with each hit replaced by [KIND_n]; one value, one placeholder. */
export function redact(text: string, hits = find(text)) {
  const ids = new Map<string, string>();
  const count: Partial<Record<Kind, number>> = {};
  let out = "";
  let at = 0;
  for (const h of hits) {
    const key = `${h.kind}:${h.value}`;
    if (!ids.has(key)) ids.set(key, `[${h.kind}_${(count[h.kind] = (count[h.kind] ?? 0) + 1)}]`);
    out += text.slice(at, h.start) + ids.get(key);
    at = h.end;
  }
  return { text: out + text.slice(at), count };
}
