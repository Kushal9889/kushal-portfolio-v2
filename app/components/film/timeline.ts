import { KEYS } from "./beats";

/**
 * Scroll position to film position.
 *
 * Each key belongs to one page element (a section or a transit window). A
 * section holds its key while it is read, creeping forward by a small amount so
 * scrolling always answers; a transit window carries the camera across its own
 * keys. Between those control points the map is linear, and the spring in
 * camera.ts smooths the corners.
 */
const CREEP = 0.15;

type Point = { y: number; u: number };

export function measure(): Point[] {
  const vh = window.innerHeight;
  const half = vh * 0.5;
  const points: Point[] = [];
  const groups = new Map<string, number[]>();
  KEYS.forEach((k, i) => groups.set(k.anchor, [...(groups.get(k.anchor) ?? []), i]));

  for (const [anchor, indices] of groups) {
    let top: number;
    let bottom: number;
    if (anchor === "hero") {
      top = 0;
      const main = document.getElementById("main");
      bottom = main ? main.getBoundingClientRect().top + window.scrollY : vh;
      points.push({ y: 0, u: indices[0] });
      points.push({ y: Math.max(1, bottom - half), u: indices[0] + CREEP });
      continue;
    }
    const el = document.getElementById(anchor) ?? document.querySelector<HTMLElement>(`[data-transit="${anchor}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    top = r.top + window.scrollY;
    bottom = r.bottom + window.scrollY;
    if (el.dataset.transit) {
      const m = indices.length;
      indices.forEach((u, j) => points.push({ y: top - half + ((j + 1) / (m + 1)) * (bottom - top), u }));
    } else {
      points.push({ y: top - half, u: indices[0] });
      points.push({ y: Math.max(top - half + 1, bottom - half), u: indices[0] + CREEP });
    }
  }
  points.sort((a, b) => a.y - b.y);
  // Monotonic in both axes, or the camera would reverse inside a scroll.
  const clean: Point[] = [];
  for (const p of points) {
    const last = clean[clean.length - 1];
    if (last && (p.y <= last.y || p.u < last.u)) continue;
    clean.push(p);
  }
  return clean;
}

export function uAt(points: Point[], y: number) {
  if (points.length === 0) return 0;
  if (y <= points[0].y) return points[0].u;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (y <= b.y) return a.u + ((y - a.y) / (b.y - a.y)) * (b.u - a.u);
  }
  return points[points.length - 1].u;
}
