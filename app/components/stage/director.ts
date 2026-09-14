import type { Cloud, Vec3 } from "./cloud-gl";
import type { FieldInfo } from "./CorpusCloud";
import { dwell, segment } from "./path";
import {
  CONTACT_CORE,
  CONTACT_EYE,
  CONTACT_FOV,
  DIVE_FOV,
  LANDING,
  SEAM_DISPERSE,
  SEAM_LIFT,
  STATION_GLOW,
  STATIONS,
  diveEnd,
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
};

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
    const centre = (titles: string[]): Vec3 | null => {
      const points = info.sections.filter((s) => titles.includes(s.title)).map((s) => s.point);
      if (points.length === 0) return null;
      return [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length) as Vec3;
    };

    const hero = box("top");
    const contact = box("contact");
    const land = centre([LANDING]);
    if (!hero || !contact || !land) {
      anchors = [];
      return;
    }

    const dive = diveEnd(land);
    const list: Anchor[] = [
      {
        y: hero.top + hero.height - window.innerHeight,
        eye: dive.eye,
        target: dive.target,
        fov: DIVE_FOV,
        dim: 1,
        glow: null,
      },
    ];
    for (const s of STATIONS) {
      const b = box(s.chapter);
      const c = centre(s.sections);
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
      });
    }
    list.push({
      y: contact.top,
      eye: CONTACT_EYE,
      target: CONTACT_CORE,
      fov: CONTACT_FOV,
      dim: 1,
      glow: info.sections.map(() => 0),
    });
    // A station that measured out of order (a chapter missing its pin during a
    // re-measure) would fold the curve back on itself; it is dropped instead.
    anchors = list.filter((a, i) => i === 0 || a.y > list[i - 1].y);
    side = null;
    station = -1;
  };

  const lit = (a: Anchor, info: FieldInfo) => a.glow ?? glow.current ?? info.sections.map(() => 0);

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

    const seam = Math.sin(Math.PI * u) ** 2;
    c.setField({
      disperse: SEAM_DISPERSE * seam,
      // A different throw at every seam. It changes where the throw is zero.
      phase: i * 1.7 + 0.4,
      dim: Math.min(1, a.dim + (b.dim - a.dim) * e + SEAM_LIFT * seam),
    });

    const nearest = u < 0.5 ? i : i + 1;
    if (nearest !== station) {
      station = nearest;
      c.highlight(lit(anchors[nearest], info), 700);
    }
  };

  return { measure, drive };
}
