"use client";

import { useEffect, useRef } from "react";
import styles from "./ProofWall.module.css";

/** Medallions boot one at a time and each step on its own frame, so building two
 *  WebGL scenes never lands as a single long frame in the middle of a scroll. */
let queue: Promise<unknown> = Promise.resolve();
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const idle = () =>
  new Promise<void>((r) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(() => r(), { timeout: 1500 });
    else setTimeout(r, 200);
  });

/**
 * An official badge as a small 3D medallion.
 *
 * The vendor's artwork is flat, so it is projected onto an extruded plate cut
 * to the badge's own outline (a hexagon for NVIDIA, an irregular dodecagon for
 * Claude) and tilts with the scroll. It is a real link with the artwork as its
 * fallback: the image is what renders before WebGL is ready, without WebGL,
 * and under reduced motion. The scene is built only when the medallion first
 * scrolls into view, and the loop draws only while it is on screen and moving.
 */
export default function Medallion({
  src,
  name,
  href,
  shape,
  fill,
}: {
  src: string;
  name: string;
  href: string;
  shape: "hex" | "blob";
  fill: string;
}) {
  const host = useRef<HTMLAnchorElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = host.current;
    const cv = canvas.current;
    if (!el || !cv || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stop = false;
    let started = false;
    let cleanup = () => {};

    async function boot() {
      await idle();
      const THREE = await import("three");
      if (stop || !el || !cv) return;
      const node: HTMLAnchorElement = el;
      const size = node.clientWidth;
      const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
      renderer.setSize(size, size, false);
      await frame();
      if (stop) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      camera.position.set(0, 0, 5.2);

      // The outline, in the artwork's own proportions.
      const shapeGeo = new THREE.Shape();
      const jitter = [1, 0.93, 0.98, 0.95, 1, 0.92, 0.97, 1, 0.94, 0.99, 0.93, 0.98];
      const n = shape === "hex" ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (shape === "hex" ? Math.PI / 6 : 0);
        const r = shape === "hex" ? 1 : jitter[i];
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) shapeGeo.moveTo(x, y);
        else shapeGeo.lineTo(x, y);
      }
      shapeGeo.closePath();
      const geo = new THREE.ExtrudeGeometry(shapeGeo, {
        depth: 0.16,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.035,
        bevelSegments: 2,
      });
      geo.translate(0, 0, -0.08);
      // Projection: the plate's x and y map straight onto the artwork.
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 1.05) / 2.1, (pos.getY(i) + 1.05) / 2.1);

      // An opaque texture: the plate colour, then the centre square of the art.
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.src = src;
      await im.decode().catch(() => {});
      if (stop) return;
      const c2 = document.createElement("canvas");
      c2.width = c2.height = 512;
      const g = c2.getContext("2d")!;
      g.fillStyle = fill || "white";
      g.fillRect(0, 0, 512, 512);
      const s = Math.min(im.naturalWidth, im.naturalHeight);
      g.drawImage(im, (im.naturalWidth - s) / 2, 0, s, s, 0, 0, 512, 512);
      await frame();
      if (stop) return;
      const tex = new THREE.CanvasTexture(c2);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;

      const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.05 });
      const edge = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.3, metalness: 0.7 });
      const mesh = new THREE.Mesh(geo, [face, edge]);
      scene.add(mesh);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.7));
      const key = new THREE.DirectionalLight(0xffffff, 1.9);
      key.position.set(2, 3, 4);
      scene.add(key);

      renderer.render(scene, camera);
      await frame();
      if (stop) return;
      cv.hidden = false;
      img.current?.setAttribute("data-3d", "");

      let tilt = 0;
      let drawn = Infinity;
      let visible = false;
      let raf = 0;
      node.addEventListener("pointermove", (e) => {
        const r = node.getBoundingClientRect();
        tilt = ((e.clientX - r.left) / r.width - 0.5) * 0.5;
      });
      node.addEventListener("pointerleave", () => (tilt = 0));
      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !raf) raf = requestAnimationFrame(loop);
      });
      io.observe(node);
      let cur = 0;
      let top = 0;
      const measure = () => (top = node.getBoundingClientRect().top + window.scrollY + node.offsetHeight / 2);
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(document.body);
      function loop() {
        raf = 0;
        if (stop || !visible) return;
        const p = 1 - (top - window.scrollY) / window.innerHeight; // 0 below the fold, 1 above it
        const target = (p - 0.5) * 1.7 + tilt;
        cur += (target - cur) * 0.12;
        if (Math.abs(cur - drawn) > 0.0008) {
          mesh.rotation.y = cur;
          mesh.rotation.x = -0.12 + Math.sin(cur) * 0.05;
          renderer.render(scene, camera);
          drawn = cur;
        }
        raf = requestAnimationFrame(loop);
      }
      cleanup = () => {
        io.disconnect();
        ro.disconnect();
        cancelAnimationFrame(raf);
        geo.dispose();
        face.dispose();
        edge.dispose();
        tex.dispose();
        renderer.dispose();
      };
    }

    const target: HTMLAnchorElement = el;
    const watch = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started) {
        started = true;
        watch.disconnect();
        queue = queue.then(() => (stop ? undefined : boot()));
      }
    }, { rootMargin: "1600px" });
    watch.observe(target);
    return () => {
      stop = true;
      watch.disconnect();
      cleanup();
    };
  }, [src, shape, fill]);

  return (
    <a ref={host} className={styles.medal} href={href} target="_blank" rel="noreferrer" aria-label={`${name}, verify`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the vendor badge, and the fallback for the 3D one */}
      <img ref={img} className={styles.medalImg} data-shape={shape} src={src} alt="" width={160} height={160} loading="lazy" />
      <canvas ref={canvas} className={styles.medalCanvas} aria-hidden="true" hidden />
    </a>
  );
}
