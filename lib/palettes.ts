/**
 * The stage palettes, one source of truth.
 *
 * Every palette is the 60/30/10 rule written down as roles: `ground` is the 60
 * (the void every chapter sits on), `ink` is the 30 (everything read on it), and
 * `accent` is the 10 (the one colour that names something, see DESIGN.md 2). The
 * remaining tokens are steps of those three, never a fourth colour.
 *
 * Every ground is dark on purpose. The corpus field draws with additive blending
 * (cloud-gl.ts, `blendFunc(ONE, ONE)`), so on a light ground its particles add
 * up to white and vanish. A combination quoted with a light colour first ("warm
 * ivory and deep blue") keeps that light colour as the ink and the paper sheets,
 * and the dark colour takes the ground.
 *
 * `scripts/build-palettes.ts` writes app/palettes.css from this file and
 * `scripts/check-palettes.ts` fails the build on any pair below its contrast
 * floor. `signal` is the shipped design and writes no CSS: with no attribute on
 * <html> the page is byte for byte what DESIGN.md measures.
 */

export type PaletteRoles = {
  /** 60: the ground of every chapter. */
  ground: string;
  /** One surface step up: console core, cards, slabs. */
  raised: string;
  /** 30: text and hairlines on the ground. */
  ink: string;
  inkSoft: string;
  /** 10: the only accent. */
  accent: string;
  /** Text on the accent: the finale ground and the primary button. */
  onAccent: string;
  /** The two paper objects (bug report, paper) and the ink on them. */
  sheet: string;
  inkOnSheet: string;
};

export type Palette = {
  id: string;
  label: string;
  /** The combination as it was described, kept so the mapping can be checked. */
  source: string;
  roles: PaletteRoles;
};

export const DEFAULT_PALETTE = "signal";

export const palettes: Palette[] = [
  {
    id: "signal",
    label: "Void and International Orange",
    source: "The shipped design",
    roles: {
      ground: "oklch(0.16 0.002 90)",
      raised: "oklch(0.205 0.002 90)",
      ink: "oklch(0.96 0.003 90)",
      inkSoft: "oklch(0.76 0.003 90)",
      accent: "oklch(0.6697 0.2218 37.48)",
      onAccent: "oklch(0.14 0.002 90)",
      sheet: "oklch(0.975 0.004 90)",
      inkOnSheet: "oklch(0.18 0.003 90)",
    },
  },
  {
    id: "cobalt",
    label: "Graphite and cobalt",
    source: "Premium neutrals, plus a little cobalt blue",
    roles: {
      ground: "oklch(0.17 0.006 260)",
      raised: "oklch(0.215 0.008 260)",
      ink: "oklch(0.96 0.004 260)",
      inkSoft: "oklch(0.77 0.008 260)",
      // Cobalt itself (#0047ab) is 2.3:1 on a dark ground. Lifted in lightness
      // only, so it keeps cobalt's hue and still reads as text.
      accent: "oklch(0.64 0.19 262)",
      onAccent: "oklch(0.14 0.01 262)",
      sheet: "oklch(0.975 0.004 260)",
      inkOnSheet: "oklch(0.18 0.006 260)",
    },
  },
  {
    id: "cacao",
    label: "Chocolate, cream and burnt orange",
    source: "Chocolate brown and cream, plus burnt orange",
    roles: {
      ground: "oklch(0.2 0.025 50)",
      raised: "oklch(0.25 0.03 50)",
      ink: "oklch(0.94 0.025 85)",
      inkSoft: "oklch(0.78 0.03 75)",
      accent: "oklch(0.68 0.17 45)",
      onAccent: "oklch(0.18 0.025 50)",
      sheet: "oklch(0.95 0.025 85)",
      inkOnSheet: "oklch(0.22 0.03 50)",
    },
  },
  {
    id: "bordeaux",
    label: "Burgundy, warm cream and dusty pink",
    source: "Burgundy and warm cream, plus dusty pink",
    roles: {
      ground: "oklch(0.21 0.06 15)",
      raised: "oklch(0.26 0.07 15)",
      ink: "oklch(0.95 0.02 80)",
      inkSoft: "oklch(0.8 0.035 30)",
      accent: "oklch(0.8 0.075 10)",
      onAccent: "oklch(0.2 0.06 15)",
      sheet: "oklch(0.96 0.02 80)",
      inkOnSheet: "oklch(0.24 0.06 15)",
    },
  },
  {
    id: "atlantic",
    label: "Deep blue, warm ivory and coral",
    source: "Warm ivory and deep blue, plus coral orange",
    roles: {
      ground: "oklch(0.21 0.055 255)",
      raised: "oklch(0.26 0.06 255)",
      ink: "oklch(0.96 0.018 85)",
      inkSoft: "oklch(0.8 0.025 240)",
      accent: "oklch(0.73 0.16 38)",
      onAccent: "oklch(0.18 0.05 255)",
      sheet: "oklch(0.965 0.018 85)",
      inkOnSheet: "oklch(0.22 0.05 255)",
    },
  },
  {
    id: "ember",
    label: "Soft black, warm ivory and burnt orange",
    source: "Burnt orange and warm ivory, plus soft black (warm ivory and soft black is the same system without the accent)",
    roles: {
      ground: "oklch(0.19 0.006 60)",
      raised: "oklch(0.235 0.008 60)",
      ink: "oklch(0.95 0.02 85)",
      inkSoft: "oklch(0.77 0.02 75)",
      accent: "oklch(0.67 0.17 47)",
      onAccent: "oklch(0.17 0.006 60)",
      sheet: "oklch(0.955 0.02 85)",
      inkOnSheet: "oklch(0.2 0.006 60)",
    },
  },
  {
    id: "ensign",
    label: "Navy, gray and crimson",
    source: "Navy and gray, plus crimson red",
    roles: {
      ground: "oklch(0.22 0.045 262)",
      raised: "oklch(0.27 0.045 262)",
      ink: "oklch(0.93 0.006 262)",
      inkSoft: "oklch(0.76 0.012 262)",
      accent: "oklch(0.64 0.2 22)",
      onAccent: "oklch(0.2 0.045 262)",
      sheet: "oklch(0.95 0.006 262)",
      inkOnSheet: "oklch(0.22 0.045 262)",
    },
  },
  {
    id: "indigo",
    label: "Black, neon red and indigo",
    source: "Deep black and neon red, plus indigo",
    roles: {
      ground: "oklch(0.14 0.012 280)",
      // Indigo is the intensity: it lives in the surfaces, not as a second accent.
      raised: "oklch(0.23 0.07 280)",
      ink: "oklch(0.95 0.008 280)",
      inkSoft: "oklch(0.76 0.03 280)",
      accent: "oklch(0.65 0.24 25)",
      onAccent: "oklch(0.13 0.012 280)",
      sheet: "oklch(0.97 0.006 280)",
      inkOnSheet: "oklch(0.17 0.03 280)",
    },
  },
  {
    id: "gilt",
    label: "Deep navy, ivory and gold",
    source: "Ivory and gold, plus deep navy",
    roles: {
      ground: "oklch(0.19 0.045 262)",
      raised: "oklch(0.24 0.05 262)",
      ink: "oklch(0.95 0.02 90)",
      inkSoft: "oklch(0.79 0.03 85)",
      accent: "oklch(0.8 0.13 85)",
      onAccent: "oklch(0.18 0.045 262)",
      sheet: "oklch(0.96 0.02 90)",
      inkOnSheet: "oklch(0.2 0.045 262)",
    },
  },
  {
    id: "periwinkle",
    label: "Black, periwinkle and coral red",
    source: "Periwinkle and deep black, plus coral red",
    roles: {
      ground: "oklch(0.15 0.01 280)",
      raised: "oklch(0.2 0.02 280)",
      ink: "oklch(0.86 0.07 280)",
      inkSoft: "oklch(0.72 0.06 280)",
      accent: "oklch(0.69 0.19 28)",
      onAccent: "oklch(0.14 0.01 280)",
      sheet: "oklch(0.95 0.02 280)",
      inkOnSheet: "oklch(0.18 0.02 280)",
    },
  },
  {
    id: "berry",
    label: "Crimson, strawberry and lime",
    source: "Strawberry pink and crimson red, plus lime green",
    roles: {
      ground: "oklch(0.2 0.07 15)",
      raised: "oklch(0.26 0.09 15)",
      ink: "oklch(0.93 0.04 0)",
      inkSoft: "oklch(0.78 0.08 5)",
      accent: "oklch(0.88 0.2 125)",
      onAccent: "oklch(0.2 0.07 15)",
      sheet: "oklch(0.96 0.02 0)",
      inkOnSheet: "oklch(0.24 0.08 15)",
    },
  },
];

export const paletteIds = palettes.map((p) => p.id);

/**
 * Switches the stage palette in place: the attribute drives app/palettes.css,
 * storage carries the choice to the next visit (restored before paint in
 * app/layout.tsx), and `stage:palette` tells the field to re-read its colours,
 * since WebGL cannot see a custom property change.
 */
export function applyPalette(id: string) {
  if (!paletteIds.includes(id)) return;
  const root = document.documentElement;
  if (id === DEFAULT_PALETTE) delete root.dataset.palette;
  else root.dataset.palette = id;
  try {
    localStorage.setItem("palette", id);
  } catch {}
  window.dispatchEvent(new CustomEvent("stage:palette", { detail: id }));
}
