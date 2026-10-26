import type { Cloud, RGB, Vec3 } from "./cloud-gl";
import type { FieldInfo } from "./CorpusCloud";
import { dwell, segment } from "./path";
import { reducedMotion, VERBS } from "@/lib/verbs";
import {
  CONDENSE_RETURN_MS,
  CONTACT_CORE,
  CONTACT_EYE,
  CONTACT_FOV,
  DIVE_FOV,
  LANDING,
  NEUTRAL,
  SEAM_DISPERSE,
  SEAM_FX_FROM,
  SEAM_FX_TO,
  SEAM_LABEL_FROM,
  SEAM_LABEL_TO,
  SEAM_LIFT,
  STATION_GLOW,
  STATIONS,
  diveEnd,
  tintRGB,
} from "./stations";

type Anchor = {
  /** Scroll position at which the camera is exactly at this station. */
  y: number;
  eye: Vec3;
  target: Vec3;
  fov: number;
  dim: number;
  /** Sections lit while this station is nearest. Null means whatever the hero answer lit. */
  glow: number[] | null;
  /** Corpus sections the station is written from, named at the seam that leads into it. */
  sections: string[];
  /** Chapter tint as an ink multiplier. */
  tint: RGB;
};

/** A cluster named at a seam: its section title, how many passages it holds, and where it sits. */
export type SeamLabel = { title: string; passages: number; point: Vec3 };

/** What the seam label layer should show right now. Read on the renderer's frame, never through React. */
export type SeamState = { visible: boolean; labels: SeamLabel[] };

/**
 * The camera between the end of the hero dive and the start of the finale.
 *
 * The hero owns the camera through its own hold, and the finale owns it through
 * its gathering. Between them this reads the scroll position and places the
 * camera on one centripetal Catmull-Rom curve through a station per chapter,
 * starting on the exact pose the dive ends on and ending on the exact pose the
 * finale starts from, so neither handover is a cut.
 *
 * Scroll arrives in steps; the renderer follows each request on a critically
 * damped spring, so the camera eases to rest when the reader stops rather than
 * stopping dead. Midway between two chapters the particles are thrown along a
 * curl field and the field brightens, then settle and dim as the next chapter
 * arrives: the seam is the field's moment, and the chapter is the reader's.
 *
 * At each seam the clusters the next chapter is written from are named beside
 * the particles, the field turns from one chapter's tint to the next, and the
 * middle of the seam alone goes through the lens pass (chromatic split and warp).
 */
export function directField({
  getCloud,
  getField,
  glow,
  framed,
}: {
  getCloud: () => Cloud | null;
  getField: () => FieldInfo | null;
  glow: { current: number[] | null };
  /** A `?frame=` capture: every pose is set exactly, never eased toward. */
  framed: boolean;
}) {
  let anchors: Anchor[] = [];
  let side: "before" | "inside" | "after" | null = null;
  let station = -1;
  const seam: SeamState = { visible: false, labels: [] };
  let labelsFor = -1;

  const centre = (info: FieldInfo, titles: string[]): Vec3 | null => {
    const points = info.sections.filter((s) => titles.includes(s.title)).map((s) => s.point);
    if (points.length === 0) return null;
    return [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length) as Vec3;
  };

  const measure = () => {
    const info = getField();
    if (!info) {
      anchors = [];
      return;
    }
    const box = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const outer = el.parentElement?.classList.contains("pin-spacer") ? el.parentElement : el;
      return { top: outer.getBoundingClientRect().top + window.scrollY, height: outer.offsetHeight };
    };

    const hero = box("top");
    const contact = box("contact");
    const land = centre(info, [LANDING]);
    if (!hero || !contact || !land) {
      anchors = [];
      return;
    }

    const dive = diveEnd(land);
    const landing = STATIONS.find((s) => s.sections.includes(LANDING));
    const list: Anchor[] = [
      {
        y: hero.top + hero.height - window.innerHeight,
        eye: dive.eye,
        target: dive.target,
        fov: DIVE_FOV,
        dim: 1,
        glow: null,
        sections: [LANDING],
        tint: tintRGB(landing?.tint ?? NEUTRAL),
      },
    ];
    for (const s of STATIONS) {
      const b = box(s.chapter);
      const c = centre(info, s.sections);
      if (!b || !c) continue;
      const len = Math.hypot(...s.from) || 1;
      list.push({
        // The middle of the chapter's own scroll: the centre of its hold when pinned.
        y: b.top + Math.max(b.height - window.innerHeight, 0) / 2,
        eye: [
          c[0] + (s.from[0] / len) * s.distance,
          c[1] + (s.from[1] / len) * s.distance,
          c[2] + (s.from[2] / len) * s.distance,
        ],
        target: c,
        fov: s.fov,
        dim: s.dim,
        glow: info.sections.map((x) => (s.sections.includes(x.title) ? STATION_GLOW : 0)),
        sections: s.sections,
        tint: tintRGB(s.tint),
      });
    }
    list.push({
      y: contact.top,
      eye: CONTACT_EYE,
      target: CONTACT_CORE,
      fov: CONTACT_FOV,
      dim: 1,
      glow: info.sections.map(() => 0),
      // The finale is the whole corpus, so no single cluster is named on the way in.
      sections: [],
      tint: tintRGB(NEUTRAL),
    });
    // A station that measured out of order (a chapter missing its pin during a
    // re-measure) would fold the curve back on itself; it is dropped instead.
    anchors = list.filter((a, i) => i === 0 || a.y > list[i - 1].y);
    side = null;
    station = -1;
    labelsFor = -1;
  };

  const lit = (a: Anchor, info: FieldInfo) => a.glow ?? glow.current ?? info.sections.map(() => 0);

  const rest = (c: Cloud, a: Anchor) => {
    c.setTint(a.tint);
    c.setSeam({ amount: 0 });
    seam.visible = false;
  };

  const drive = () => {
    const c = getCloud();
    const info = getField();
    if (!c || !info || anchors.length < 2) return;
    const y = window.scrollY;
    const first = anchors[0];
    const last = anchors[anchors.length - 1];

    // Before the dive has ended the hero places the camera; the field is only
    // returned to rest and to the hero's own highlight.
    if (y <= first.y) {
      if (side !== "before") {
        side = "before";
        station = -1;
        c.setField({ disperse: 0, dim: 1 });
        c.highlight(lit(first, info), 500);
        rest(c, first);
      }
      return;
    }
    // From the finale's first frame the finale gathers the field; the camera is
    // left on the pose it gathers from.
    if (y >= last.y) {
      if (side !== "after") {
        side = "after";
        station = -1;
        c.setCamera(last.eye, last.target, last.fov, { damp: !framed });
        c.setField({ disperse: 0, dim: 1 });
        c.highlight(lit(last, info), 500);
        rest(c, last);
      }
      return;
    }

    side = "inside";
    let i = 0;
    while (i < anchors.length - 2 && y >= anchors[i + 1].y) i++;
    const a = anchors[i];
    const b = anchors[i + 1];
    const u = Math.min(Math.max((y - a.y) / (b.y - a.y || 1), 0), 1);
    const e = dwell(u);

    c.setCamera(
      segment(
        anchors.map((x) => x.eye),
        i,
        e,
      ),
      segment(
        anchors.map((x) => x.target),
        i,
        e,
      ),
      a.fov + (b.fov - a.fov) * e,
      { damp: !framed },
    );

    const throw_ = Math.sin(Math.PI * u) ** 2;
    c.setField({
      disperse: SEAM_DISPERSE * throw_,
      // A different throw at every seam. It changes where the throw is zero.
      phase: i * 1.7 + 0.4,
      dim: Math.min(1, a.dim + (b.dim - a.dim) * e + SEAM_LIFT * throw_),
    });
    c.setTint([0, 1, 2].map((k) => a.tint[k] + (b.tint[k] - a.tint[k]) * e) as RGB);

    // The lens pass rises and falls inside the middle of the seam only, so a
    // chapter being read is never drawn through it.
    const fx = (u - SEAM_FX_FROM) / (SEAM_FX_TO - SEAM_FX_FROM);
    c.setSeam({ amount: fx > 0 && fx < 1 ? Math.sin(Math.PI * fx) : 0 });

    if (labelsFor !== i + 1) {
      labelsFor = i + 1;
      seam.labels = info.sections
        .filter((s) => b.sections.includes(s.title))
        .map((s) => ({ title: s.title, passages: s.passages, point: s.point }));
    }
    seam.visible = seam.labels.length > 0 && u >= SEAM_LABEL_FROM && u <= SEAM_LABEL_TO;

    const nearest = u < 0.5 ? i : i + 1;
    if (nearest !== station) {
      station = nearest;
      c.highlight(lit(anchors[nearest], info), 700);
    }
  };

  /** Field-space centre of the sections a chapter is written from, or null when it has no station. */
  const originOf = (chapter: string): Vec3 | null => {
    const info = getField();
    const s = STATIONS.find((x) => x.chapter === chapter);
    return info && s ? centre(info, s.sections) : null;
  };

  let condensing = 0;
  /**
   * Condense (F-009, F-017): the particles of the cluster nearest on screen to
   * `el` (from the chapter's own sections when given) gather at the element's
   * centre, held at that cluster's depth, then return to the field. Pulls for
   * the verb's own duration and releases over 1.5s. One condense at a time;
   * a newer one takes the particles over.
   */
  const condense = (el: Element, chapter?: string) => {
    const c = getCloud();
    const info = getField();
    if (!c || !info || reducedMotion()) return;
    const titles = STATIONS.find((x) => x.chapter === chapter)?.sections;
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;

    let best = -1;
    let bestDistance = Infinity;
    let depth = 0;
    info.sections.forEach((s, index) => {
      if (titles && !titles.includes(s.title)) return;
      const p = c.project(s.point);
      if (!p.visible) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
        depth = p.depth;
      }
    });
    if (best < 0) return;

    const point = c.unproject(x, y, depth);
    const pull = VERBS.condense.duration * 1000;
    const start = performance.now();
    const token = ++condensing;
    const step = (now: number) => {
      if (token !== condensing) return;
      const t = now - start;
      let amount: number;
      if (t < pull) amount = 1 - Math.pow(2, (-10 * t) / pull);
      else if (t < pull + CONDENSE_RETURN_MS) amount = 0.5 + 0.5 * Math.cos((Math.PI * (t - pull)) / CONDENSE_RETURN_MS);
      else amount = 0;
      c.setAttract(best, point, amount);
      if (amount > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /** Where each station sits in the scroll and which sections it names, for captures and checks. */
  const stations = () => anchors.map((x) => ({ y: Math.round(x.y), sections: x.sections }));

  return { measure, drive, seam, originOf, condense, stations };
}

export type Director = ReturnType<typeof directField>;
