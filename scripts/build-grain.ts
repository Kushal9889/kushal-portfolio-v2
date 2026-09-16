/**
 * Writes `public/stage/grain.png`: a 256px tileable blue-noise tile made with the
 * void-and-cluster method, from a fixed seed so every build writes the same bytes.
 *
 * Blue noise has its energy at high frequencies only, which is what a fine film
 * grain looks like; white noise clumps into blotches at low frequencies. The tile
 * wraps at its edges (the energy kernel is toroidal), so repeating it shows no seam.
 *
 * The PNG is encoded here with zlib from the standard library: one greyscale
 * channel, 8 bits, no filter.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const SIZE = 256;
const N = SIZE * SIZE;
const SIGMA = 1.9;
const RADIUS = 8;
const INITIAL = Math.round(N * 0.1);

// mulberry32: small, deterministic, good enough for a seed pattern.
let seed = 0x2050;
const random = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const kernel: { dx: number; dy: number; w: number }[] = [];
for (let dy = -RADIUS; dy <= RADIUS; dy++) {
  for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    kernel.push({ dx, dy, w: Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA)) });
  }
}

const bits = new Uint8Array(N);
const energy = new Float64Array(N);

function splat(i: number, sign: 1 | -1) {
  const x = i % SIZE;
  const y = (i / SIZE) | 0;
  for (const { dx, dy, w } of kernel) {
    const j = ((y + dy + SIZE) % SIZE) * SIZE + ((x + dx + SIZE) % SIZE);
    energy[j] += sign * w;
  }
}

/** The set pixel in the tightest cluster, or the empty pixel in the largest void. */
function extreme(set: 0 | 1, pickMax: boolean) {
  let best = -1;
  let value = pickMax ? -Infinity : Infinity;
  for (let i = 0; i < N; i++) {
    if (bits[i] !== set) continue;
    if (pickMax ? energy[i] > value : energy[i] < value) {
      value = energy[i];
      best = i;
    }
  }
  return best;
}

// 1. Random initial pattern, then relax it until the tightest cluster is the largest void.
for (let placed = 0; placed < INITIAL; ) {
  const i = Math.floor(random() * N);
  if (bits[i]) continue;
  bits[i] = 1;
  splat(i, 1);
  placed++;
}
for (;;) {
  const cluster = extreme(1, true);
  bits[cluster] = 0;
  splat(cluster, -1);
  const gap = extreme(0, false);
  bits[gap] = 1;
  splat(gap, 1);
  if (gap === cluster) break;
}

// 2. Rank every pixel: remove clusters for the lower ranks, fill voids for the upper ones.
const rank = new Int32Array(N);
const prototype = bits.slice();
const prototypeEnergy = energy.slice();
for (let r = INITIAL - 1; r >= 0; r--) {
  const cluster = extreme(1, true);
  bits[cluster] = 0;
  splat(cluster, -1);
  rank[cluster] = r;
}
bits.set(prototype);
energy.set(prototypeEnergy);
for (let r = INITIAL; r < N; r++) {
  const gap = extreme(0, false);
  bits[gap] = 1;
  splat(gap, 1);
  rank[gap] = r;
}

// 3. Encode the ranks as grey levels.
const raw = Buffer.alloc((SIZE + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE + 1)] = 0;
  for (let x = 0; x < SIZE; x++) raw[y * (SIZE + 1) + 1 + x] = Math.floor((rank[y * SIZE + x] * 256) / N);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 0; // greyscale

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(process.cwd(), "public/stage/grain.png");
mkdirSync(join(process.cwd(), "public/stage"), { recursive: true });
writeFileSync(out, png);
console.log(`build-grain: ${SIZE}px blue-noise tile, ${png.length} bytes`);
