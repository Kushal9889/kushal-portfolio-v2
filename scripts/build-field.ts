import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { queryTokens } from "../lib/agent/tokenize";

/**
 * Projects the retrieval index into the 3D field the page renders.
 *
 * Passage vectors are reduced to three principal components, so every passage
 * sits where its embedding actually puts it, scaled to fit. Each passage then
 * gets a small orbit of its most frequent terms on a seeded jitter, which gives
 * the field enough particles to read as a space rather than a scatter plot
 * while keeping every particle attached to the passage it came from.
 *
 * PCA rather than UMAP: linear, deterministic, dependency free, and the share of
 * variance it keeps is a number the page can state.
 */

type Index = {
  passages: { parent: string; text: string }[];
  parents: { title: string }[];
  vectors: (number[] | Record<string, number>)[] | null;
};

const COMPONENTS = 3;
const TERMS_PER_PASSAGE = 12;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Top-k principal components via power iteration on the n×n Gram matrix. */
function principalComponents(rows: number[][], k: number) {
  const n = rows.length;
  const d = rows[0].length;
  const mean = new Float64Array(d);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / n;
  const centered = rows.map((r) => r.map((v, j) => v - mean[j]));

  const gram = centered.map((a) =>
    centered.map((b) => {
      let s = 0;
      for (let j = 0; j < d; j++) s += a[j] * b[j];
      return s;
    }),
  );
  const total = gram.reduce((s, r, i) => s + r[i], 0);
  const work = gram.map((r) => r.slice());
  const values: number[] = [];
  const vectors: number[][] = [];

  for (let c = 0; c < k; c++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i + c + 1));
    for (let it = 0; it < 1000; it++) {
      const w = work.map((r) => r.reduce((s, x, i) => s + x * v[i], 0));
      const norm = Math.hypot(...w) || 1;
      v = w.map((x) => x / norm);
    }
    const mv = work.map((r) => r.reduce((s, x, i) => s + x * v[i], 0));
    const lambda = v.reduce((s, x, i) => s + x * mv[i], 0);
    // The sign of an eigenvector is arbitrary; pinning it keeps a rebuild of
    // the same index in the same orientation.
    const dominant = v.reduce((best, x) => (Math.abs(x) > Math.abs(best) ? x : best), 0);
    if (dominant < 0) v = v.map((x) => -x);
    values.push(lambda);
    vectors.push(v);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) work[i][j] -= lambda * v[i] * v[j];
  }

  const coords = rows.map((_, i) => vectors.map((v, c) => v[i] * Math.sqrt(Math.max(values[c], 0))));
  return { coords, explained: values.map((l) => l / total) };
}

function main() {
  const index: Index = JSON.parse(readFileSync(join(process.cwd(), "lib", "agent", "index.json"), "utf8"));
  if (!index.vectors) {
    console.warn("build-field: index has no vectors (lexical-only build), field.json left as is");
    return;
  }

  const rows = index.vectors.map((v) => (Array.isArray(v) ? v : Object.values(v)));
  const { coords, explained } = principalComponents(rows, COMPONENTS);
  const extent = Math.max(...coords.flat().map(Math.abs)) || 1;
  const anchors = coords.map((p) => p.map((x) => x / extent));

  const titles = index.parents.map((p) => p.title);
  const clusterOf = index.passages.map((p) => titles.indexOf(p.parent));
  if (clusterOf.includes(-1)) throw new Error("build-field: a passage names a section missing from the index");

  const centroids = titles.map((_, c) => {
    const members = anchors.filter((_, i) => clusterOf[i] === c);
    return [0, 1, 2].map((k) => members.reduce((s, p) => s + p[k], 0) / Math.max(members.length, 1));
  });
  const totalSpread = anchors.reduce((s, p) => s + p.reduce((a, x) => a + x * x, 0), 0);
  const withinSpread = anchors.reduce(
    (s, p, i) => s + p.reduce((a, x, k) => a + (x - centroids[clusterOf[i]][k]) ** 2, 0),
    0,
  );

  const round = (x: number) => Math.round(x * 1000) / 1000;
  const positions: number[] = [];
  const clusters: number[] = [];
  const kinds: number[] = [];
  const labels: string[] = [];

  // Term frequency alone filled the field with "because", "already" and
  // "enough": the words the camera passes through are meant to say which part of
  // the corpus it is in, so each term is weighted by inverse document frequency
  // and anything appearing in more than a third of the passages is dropped.
  const perPassage = index.passages.map((passage) => {
    const counts = new Map<string, number>();
    for (const t of queryTokens(passage.text)) {
      if (/^[a-z][a-z-]{3,}$/.test(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  });
  const documents = perPassage.length;
  const frequency = new Map<string, number>();
  for (const counts of perPassage) for (const t of counts.keys()) frequency.set(t, (frequency.get(t) ?? 0) + 1);
  const everywhere = Math.max(2, Math.ceil(documents / 3));

  anchors.forEach((p, i) => {
    positions.push(...p.map(round));
    clusters.push(clusterOf[i]);
    kinds.push(0);
    labels.push("");

    const terms = [...perPassage[i]]
      .filter(([term]) => (frequency.get(term) ?? 0) <= everywhere)
      .map(([term, n]) => [term, n * Math.log(documents / (frequency.get(term) ?? 1))] as const)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TERMS_PER_PASSAGE);

    const rand = mulberry32(i + 1);
    for (const [term] of terms) {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const r = 0.05 + rand() * 0.1;
      const s = Math.sqrt(1 - u * u);
      positions.push(round(p[0] + r * s * Math.cos(phi)), round(p[1] + r * s * Math.sin(phi)), round(p[2] + r * u));
      clusters.push(clusterOf[i]);
      kinds.push(1);
      labels.push(term);
    }
  });

  const pct = (x: number) => Math.round(x * 1000) / 10;
  const out = {
    version: 1,
    source: { passages: rows.length, dimensions: rows[0].length },
    variance: {
      components: explained.map(pct),
      cumulative: pct(explained.reduce((a, b) => a + b, 0)),
      betweenSections: pct(1 - withinSpread / totalSpread),
    },
    sections: titles.map((title, c) => ({
      title,
      centroid: centroids[c].map(round),
      passages: clusterOf.filter((x) => x === c).length,
    })),
    particles: { positions, clusters, kinds, labels },
  };

  const path = join(process.cwd(), "lib", "agent", "field.json");
  writeFileSync(path, JSON.stringify(out));
  console.log(
    `build-field: ${kinds.length} particles from ${rows.length} passages, ` +
      `${out.variance.cumulative}% variance in ${COMPONENTS} components, ` +
      `${out.variance.betweenSections}% between sections, ${(JSON.stringify(out).length / 1024).toFixed(1)}KB`,
  );
}

main();
