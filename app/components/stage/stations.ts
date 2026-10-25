import type { RGB, Vec3 } from "./cloud-gl";

/*
 * Where the camera is in the corpus field, chapter by chapter.
 *
 * The field is one object for the whole page. The hero dive ends inside the
 * section its first chapter is about; from there the camera travels a single
 * curve through the sections each later chapter draws on, and arrives at the
 * finale framed on the whole field, where it gathers into one point. Every
 * station is the cluster of the corpus that chapter's claims were written in,
 * so the field behind a chapter is literally that chapter's source.
 */

/** The dive ends inside this section's cluster, where the next chapter picks up. */
export const LANDING = "Open source, LangChain deepagents";

/*
 * Framed from the projection, not by eye: with this camera the sections a hero
 * answer usually draws on land below the console at 1440×900, so the wires from
 * the source chips cross open ground instead of hiding under the panel.
 */
export const HERO_EYE: Vec3 = [-1.1, 0.6, 6.2];
export const HERO_TARGET: Vec3 = [-1.1, 0.5, 0];
export const HERO_FOV = 40;
export const DIVE_FOV = 70;

/** The camera's end of the dive: just short of the landing cluster, looking through it. */
export function diveEnd(land: Vec3): { eye: Vec3; target: Vec3 } {
  return { eye: [land[0], land[1], land[2] + 0.9], target: [land[0], land[1], land[2] - 3] };
}

/**
 * A point the dive bends through on its way in: lifted and swung off the straight
 * line, so the camera banks into the field instead of sliding along a rail.
 */
export function diveBend(land: Vec3): Vec3 {
  const end = diveEnd(land).eye;
  return [
    HERO_EYE[0] + (end[0] - HERO_EYE[0]) * 0.45 + 0.9,
    HERO_EYE[1] + (end[1] - HERO_EYE[1]) * 0.45 + 0.55,
    HERO_EYE[2] + (end[2] - HERO_EYE[2]) * 0.45,
  ];
}

/** The finale frames the whole field from here and gathers it at the centre. */
export const CONTACT_CORE: Vec3 = [0, 0, 0];
export const CONTACT_EYE: Vec3 = [0, 0.4, 7.6];
export const CONTACT_FOV = 40;

export type Station = {
  /** The chapter's section id. */
  chapter: string;
  /** Corpus sections the chapter is written from. The camera looks at their centre. */
  sections: string[];
  /** Direction the camera sits in from that centre. Varied, so the field turns as it travels. */
  from: Vec3;
  distance: number;
  fov: number;
  /** Field brightness while the chapter is read over it. */
  dim: number;
  /** Particle tint for this chapter, as OKLCH lightness is held and only hue and chroma vary (plan 3.1). */
  tint: Tint;
};

/** Hue in degrees and chroma, 0.02 to 0.05. Chroma 0 is neutral ink. */
export type Tint = { hue: number; chroma: number };

export const NEUTRAL: Tint = { hue: 0, chroma: 0 };

/**
 * An OKLCH tint as an RGB multiplier on the ink colour: the ratio of the tinted
 * colour to the neutral colour at the same lightness, so tinting never brightens
 * or dims the field, it only turns it.
 */
export function tintRGB({ hue, chroma }: Tint, lightness = 0.95): RGB {
  const toRGB = (c: number): RGB => {
    const h = (hue * Math.PI) / 180;
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  };
  const tinted = toRGB(chroma);
  const neutral = toRGB(0);
  return tinted.map((v, i) => Math.max(0, v / (neutral[i] || 1))) as RGB;
}

/*
 * One station per chapter, in page order. A station whose chapter is not on the
 * page (a lab, or the page before the restructure) is skipped by the director.
 * Tints follow plan 3.1: open source cool steel, measured neutral, work warm ink,
 * built phosphor, research paper warm, credentials spectral, beyond amber.
 */
export const STATIONS: Station[] = [
  { chapter: "bug", sections: [LANDING], from: [0.9, 0.35, 0.6], distance: 4.8, fov: 54, dim: 0.3, tint: { hue: 235, chroma: 0.03 } },
  {
    chapter: "measured",
    sections: ["How retrieval on this page works", "Defects this page shipped and then fixed", "This site"],
    from: [-0.8, 0.25, 0.7],
    distance: 5.4,
    fov: 52,
    dim: 0.22,
    tint: NEUTRAL,
  },
  {
    chapter: "work",
    sections: ["Boston University, Questrom Computational Lab", "IMG Systems", "Growaza"],
    from: [0.55, -0.15, 0.95],
    distance: 5.6,
    fov: 50,
    dim: 0.26,
    tint: { hue: 70, chroma: 0.035 },
  },
  {
    chapter: "built",
    sections: ["This site"],
    from: [-0.5, 0.4, 0.8],
    distance: 5,
    fov: 52,
    dim: 0.28,
    tint: { hue: 150, chroma: 0.045 },
  },
  { chapter: "research", sections: ["Publications"], from: [-0.85, 0.2, 0.55], distance: 4.6, fov: 54, dim: 0.3, tint: { hue: 85, chroma: 0.03 } },
  {
    chapter: "credentials",
    sections: ["Certifications"],
    from: [0.4, 0.5, 0.85],
    distance: 5.2,
    fov: 52,
    dim: 0.3,
    tint: { hue: 200, chroma: 0.04 },
  },
  {
    chapter: "beyond",
    sections: ["Education", "Achievements"],
    from: [0.7, -0.3, 0.7],
    distance: 5.6,
    fov: 52,
    dim: 0.34,
    tint: { hue: 75, chroma: 0.05 },
  },
];

/** Seam post pass runs only in the middle 30% of a seam (plan 3.7). */
export const SEAM_FX_FROM = 0.35;
export const SEAM_FX_TO = 0.65;
/**
 * Seam labels read between these points of a seam (plan 4.3). Inside that window
 * a name is still withdrawn wherever a chapter's text or surface sits under it.
 */
export const SEAM_LABEL_FROM = 0.3;
export const SEAM_LABEL_TO = 0.85;
/** Condense pulls for the verb's own duration (lib/verbs.ts), then releases the particles over this (F-017). */
export const CONDENSE_RETURN_MS = 1500;

/** How hard the field is thrown at the midpoint between two chapters. */
export const SEAM_DISPERSE = 0.85;
/** How much brighter the field reads at a seam than at the chapters either side of it. */
export const SEAM_LIFT = 0.42;
/** Glow on the sections of the chapter being read: present, and quieter than an answer's sources. */
export const STATION_GLOW = 0.3;
