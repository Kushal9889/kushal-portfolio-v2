import type { Cloud } from "./cloud-gl";
import { reducedMotion } from "@/lib/verbs";

type Gsap = { to: (target: object, vars: Record<string, unknown>) => unknown };

/** How far in front of the camera the formed shape sits. */
const DEPTH = 220;
/** The field has 871 particles; asking for more points than that wastes the measure. */
const MAX_POINTS = 900;

/**
 * The field takes the shape of a piece of data art while its section is read.
 *
 * The art is already drawn to scale in SVG, so the particles are handed the same
 * points rather than an impression of them: each dot's centre is measured where
 * it actually sits on screen and unprojected into the field. That is why this is
 * measured on the way in rather than precomputed; the art moves with the page.
 *
 * Silent and harmless when it cannot run: no renderer, a lost context, reduced
 * motion, or an art with no dots in it all return without touching the field.
 */
export function morphFieldInto(gsap: Gsap, cloud: Cloud | null, art: SVGElement | null, on: boolean) {
  if (!cloud || cloud.stats.lost || reducedMotion()) return;

  if (!on) {
    gsap.to(
      { v: 1 },
      {
        v: 0,
        duration: 0.45,
        ease: "power2.in",
        onUpdate(this: { targets: () => { v: number }[] }) {
          cloud.setMorph(null, this.targets()[0].v);
        },
      },
    );
    return;
  }

  if (!art) return;
  const dots = Array.from(art.querySelectorAll("rect, circle")).slice(0, MAX_POINTS);
  if (dots.length === 0) return;

  const points = new Float32Array(dots.length * 3);
  dots.forEach((dot, i) => {
    const box = dot.getBoundingClientRect();
    const world = cloud.unproject(box.left + box.width / 2, box.top + box.height / 2, DEPTH);
    points[i * 3] = world[0];
    points[i * 3 + 1] = world[1];
    points[i * 3 + 2] = world[2];
  });

  cloud.setMorph(points, 0);
  gsap.to(
    { v: 0 },
    {
      v: 1,
      duration: 0.9,
      ease: "power2.out",
      onUpdate(this: { targets: () => { v: number }[] }) {
        cloud.setMorph(null, this.targets()[0].v);
      },
    },
  );
}
