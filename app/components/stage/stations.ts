import type { Vec3 } from "./cloud-gl";

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
};

export const STATIONS: Station[] = [
  { chapter: "bug", sections: [LANDING], from: [0.9, 0.35, 0.6], distance: 4.8, fov: 54, dim: 0.3 },
  {
    chapter: "measured",
    sections: ["How retrieval on this page works", "Defects this page shipped and then fixed", "This site"],
    from: [-0.8, 0.25, 0.7],
    distance: 5.4,
    fov: 52,
    dim: 0.22,
  },
  {
    chapter: "work",
    sections: ["Boston University, Questrom Computational Lab", "IMG Systems", "Growaza"],
    from: [0.55, -0.15, 0.95],
    distance: 5.6,
    fov: 50,
    dim: 0.26,
  },
  { chapter: "research", sections: ["Publications"], from: [-0.85, 0.2, 0.55], distance: 4.6, fov: 54, dim: 0.3 },
  {
    chapter: "proof",
    sections: ["Certifications", "Education", "Achievements", "BU Life AI"],
    from: [0.4, 0.5, 0.85],
    distance: 5.2,
    fov: 52,
    dim: 0.3,
  },
];

/** How hard the field is thrown at the midpoint between two chapters. */
export const SEAM_DISPERSE = 0.85;
/** How much brighter the field reads at a seam than at the chapters either side of it. */
export const SEAM_LIFT = 0.42;
/** Glow on the sections of the chapter being read: present, and quieter than an answer's sources. */
export const STATION_GLOW = 0.3;
