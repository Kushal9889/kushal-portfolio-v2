/** References behind the film's typical sizes (content/film.json scale rows), checked by scripts/film-copy.ts. */
export const SOURCES = {
  eia310: "EIA-310-E rack standard: 19 in racks, 1U = 44.45 mm, hole pattern",
  raisedFloor: "Raised-floor practice: 600 mm tiles, perforated and grate tiles",
  aisle: "Hot/cold aisle containment practice (ASHRAE TC 9.9 guidance)",
  fire: "Sprinkler and aspirating smoke detection practice (NFPA 13, NFPA 75)",
  tray: "Cable tray and fibre practice (TIA-942, TIA-568)",
  busway: "Overhead busway practice for data halls",
  qsfp: "QSFP-DD and OSFP module outlines (MSA hardware specifications)",
  lc: "LC duplex connector, 1.25 mm ferrule (IEC 61754-20)",
  fibreSpeed: "Light in glass travels at about 2 x 10^8 m/s",
  serverChassis: "Common 1U and 4U rack server chassis dimensions",
  fans: "Common server fan sizes: 40 mm in 1U, 80 mm in 4U",
  crps: "CRPS (common redundant power supply) form factor: 73.5 x 40 x 185 mm",
  jedecDimm: "JEDEC DDR5 RDIMM outline: 133.35 x 31.25 mm, 288 pins",
  jedecHbm: "JEDEC HBM3 (JESD238) stack: base die plus 8 DRAM dies",
  passives: "EIA chip case codes (0402, 0805, 1206) and common power parts",
  ipc: "IPC-2221 / IPC-6012 board practice: layer counts, drills, finishes",
  gpuModule: "Public photos and outlines of 8-GPU baseboards and their modules",
  gpuDie: "Public die-size and SM-count ranges of current data-center GPUs",
  packaging: "2.5D packaging practice: substrate, interposer, C4 bumps, BGA",
  coldPlate: "Direct-to-chip liquid cooling practice (OCP cold plate guidance)",
  quickDisconnect: "OCP universal quick disconnect (UQD) class couplings",
  oring: "AS568 O-ring cross sections",
  pagedKv: "Paged KV caches: fixed blocks of 16 tokens (vLLM PagedAttention)",
  ringAllreduce: "Ring all-reduce: 2(N - 1) steps for N ranks",
  corpus: "This site's own corpus projection (lib/agent/field.json)",
  illustration: "Illustration: shows a process, not a dimension",
} as const;
export type SourceId = keyof typeof SOURCES;

// -- Materials (plan section 6) ---------------------------------------------
export type Material = {
  hex: string;
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
  anisotropy?: number;
  iridescence?: number;
  sheen?: number;
  /** Emissive strength; colour is the hex. */
  emissive?: number;
  /** Straight alpha for glass. */
  opacity?: number;
};
