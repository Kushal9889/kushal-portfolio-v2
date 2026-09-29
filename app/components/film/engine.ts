import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import field from "@/lib/agent/field.json";
import { distanceOf, eyeOf, fovOf, step } from "./camera";
import { CHANNELS, sample, spans, type Span } from "./plan";
import { ROUTE } from "./shots";
import { createPost, SCRIM_MAX } from "./post";
import { buildWorld } from "./world/greybox";

/** Scroll ranges of every page element the route names, measured now. */
function measure(): Span[] {
  const boxes = ROUTE.filter((b) => b.id !== "hero").flatMap((b) => {
    const el = document.getElementById(b.id) ?? document.querySelector<HTMLElement>(`[data-transit="${b.id}"]`);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return [{ id: b.id, top: r.top + window.scrollY, height: r.height }];
  });
  return spans(boxes, window.innerHeight);
}

/**
 * Document-space boxes of the text that sits straight on the film, tight to
 * the text itself rather than to its block: left, top, right, bottom.
 */
function measureScrims() {
  const range = document.createRange();
  return [...document.querySelectorAll<HTMLElement>("[data-film-scrim]")].map((el) => {
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return [r.left, r.top + window.scrollY, r.right, r.bottom + window.scrollY];
  });
}

/** A cut dissolves to ground and back: out fast, in slower, like a film edit. */
const CUT_OUT = 140;
const CUT_IN = 260;

type Triggers = typeof import("gsap/ScrollTrigger").ScrollTrigger;

/** Reads a CSS colour (any syntax the browser knows) as an sRGB THREE.Color. */
function cssColour(value: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d");
  if (!g) return new THREE.Color(0x121416);
  g.fillStyle = value;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace);
}

const PARK_AFTER = 45_000;

/**
 * The film renderer. One scene, one camera, one packet. The camera goal is read
 * from the scroll position every frame; the spring carries the camera to it.
 * While the reader holds still the camera makes a slow orbit around the goal,
 * and after PARK_AFTER of stillness the loop stops until the next scroll.
 */
export function start(host: HTMLElement, ScrollTrigger: Triggers) {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  // The scene renders linear light into post.target; post.ts tone maps it and
  // adds the ground. Empty space and fog are therefore 0 here, not the ground.
  renderer.setClearColor(0x000000, 1);
  renderer.info.autoReset = false;

  const ground = cssColour(getComputedStyle(document.body).getPropertyValue("--paper").trim() || getComputedStyle(document.body).backgroundColor);
  const post = createPost(ground);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.02);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new RoomEnvironment();
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x101214, 0.2));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(4, 8, 6);
  scene.add(key);

  const world = buildWorld(field.particles);
  scene.add(world.root);

  const packetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 0.31, 0, THREE.SRGBColorSpace) });
  const packet = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), packetMat);
  scene.add(packet);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  const pose = new Float64Array(CHANNELS);
  const vel = new Float64Array(CHANNELS);
  const goal = new Float64Array(CHANNELS);
  let list = measure();
  const query = new URLSearchParams(location.search);
  const debug = query.get("film") === "debug";
  // ?lights=off renders nothing through the full pipeline, so the frame must
  // come out as the page ground (scripts/film-black.py).
  if (query.get("lights") === "off") world.root.visible = packet.visible = false;
  let scrims = measureScrims();
  const rects = new Float32Array(SCRIM_MAX * 4);
  // ?frame=film:<y> renders the goal for scroll position y, for stills.
  const framed = new URLSearchParams(location.search).get("frame")?.match(/^film:([\d.]+)$/);
  const yOf = () => (framed ? Number(framed[1]) : window.scrollY);
  let where = sample(list, yOf(), pose);
  let cutAt = -1;

  let last = performance.now();
  let lastInput = last;
  let raf = 0;
  let stopped = false;
  const eye: [number, number, number] = [0, 0, 0];
  const frames: number[] = [];
  const stats = { y: 0, beat: where.beat, progress: 0, lens: 0, W: 0, moving: true, p95: 0, draws: 0, tris: 0 };

  function resize() {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.resize(buffer.x, buffer.y, renderer.getPixelRatio());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now: number) {
    raf = 0;
    if (stopped) return;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30);
    frames.push(now - last);
    last = now;
    if (frames.length >= 45) {
      const sorted = [...frames].sort((a, b) => a - b);
      stats.p95 = sorted[Math.floor(sorted.length * 0.95)];
      frames.length = 0;
    }

    const next = sample(list, yOf(), goal);
    // Crossing a cut: dissolve out, jump the camera while the frame is ground,
    // dissolve in. The spring never flies across the scale a cut removes.
    if (next.run !== where.run && !framed) cutAt = now;
    where = next;
    if (cutAt >= 0) {
      const t = now - cutAt;
      if (t >= CUT_OUT && t - dt * 1000 < CUT_OUT) {
        pose.set(goal);
        vel.fill(0);
      }
      canvas.style.opacity = String(t < CUT_OUT ? 1 - t / CUT_OUT : Math.min(1, (t - CUT_OUT) / CUT_IN));
      if (t >= CUT_OUT + CUT_IN) {
        cutAt = -1;
        canvas.style.opacity = "";
      }
    }
    // The resting film breathes, and only while the reader is still: the
    // amplitude is the time since the last input, so it encodes idleness.
    // Arrived means at the scroll goal, breathing aside: framing within 1%,
    // angles within 2 degrees, target within 1% of the distance.
    stats.moving =
      Math.abs(pose[3] - goal[3]) > 0.01 ||
      Math.abs(pose[4] - goal[4]) > 2 ||
      Math.abs(pose[5] - goal[5]) > 2 ||
      Math.hypot(pose[0] - goal[0], pose[1] - goal[1], pose[2] - goal[2]) > 0.01 * distanceOf(goal);
    const idle = Math.min(1, (now - lastInput) / 2000);
    goal[4] += Math.sin(now / 3183) * 1.5 * idle;
    if (framed) pose.set(goal);
    else step(pose, vel, goal, dt);

    const d = distanceOf(pose);
    eyeOf(pose, eye);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.fov = fovOf(pose);
    camera.near = Math.max(0.0004, d * 0.02);
    camera.far = Math.max(60, d * 600);
    camera.lookAt(pose[0], pose[1], pose[2]);
    // Lens shift: the target lands on screen point (sx, sy) with verticals
    // kept parallel, the way a shift lens frames architecture.
    const vw = renderer.domElement.width;
    const vh = renderer.domElement.height;
    camera.setViewOffset(vw, vh, vw * (0.5 - pose[7]), vh * (0.5 - pose[8]), vw, vh);
    camera.updateProjectionMatrix();
    (scene.fog as THREE.FogExp2).density = 0.4 / d;

    packet.position.set(pose[0], pose[1], pose[2]);
    packet.scale.setScalar(d * 0.006);

    // The cold plate lifts over the last act of the descent.
    world.setLift(where.beat === "T3" ? Math.min(1, Math.max(0, (where.progress - 0.75) / 0.2)) : where.run > 2 ? 1 : 0);
    world.cull(camera.position);

    // Scrim rects that reach into the viewport, in viewport CSS px.
    const sy = window.scrollY;
    const vhCss = window.innerHeight;
    let n = 0;
    for (const [l, t, r, b] of scrims) {
      if (n === SCRIM_MAX || b - sy < -24 || t - sy > vhCss + 24) continue;
      rects[n * 4] = l;
      rects[n * 4 + 1] = t - sy;
      rects[n * 4 + 2] = r;
      rects[n * 4 + 3] = b - sy;
      n++;
    }
    post.setRects(rects, n);

    renderer.info.reset();
    renderer.setRenderTarget(post.target);
    renderer.render(scene, camera);
    post.render(renderer);
    stats.y = yOf();
    stats.beat = where.beat;
    stats.progress = where.progress;
    stats.lens = Math.exp(pose[6]);
    stats.W = Math.exp(pose[3]);
    stats.draws = renderer.info.render.calls;
    stats.tris = renderer.info.render.triangles;

    if (framed && !document.documentElement.dataset.frameReady) {
      requestAnimationFrame(() => (document.documentElement.dataset.frameReady = "true"));
    }
    if (framed) return;
    if (now - lastInput < PARK_AFTER) raf = requestAnimationFrame(frame);
  }

  function wake() {
    lastInput = performance.now();
    if (!raf && !stopped) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  resize();
  window.addEventListener("resize", resize);
  const trigger = ScrollTrigger.create({ start: 0, end: "max", onUpdate: wake });
  const remeasure = () => {
    list = measure();
    scrims = measureScrims();
    wake();
  };
  ScrollTrigger.addEventListener("refresh", remeasure);
  // The page grows when an answer arrives; the route and scrims follow it.
  const grow = new ResizeObserver(remeasure);
  grow.observe(document.body);

  if (debug) (window as unknown as { __film: typeof stats }).__film = stats;
  document.documentElement.dataset.film = "live";
  wake();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    trigger.kill();
    ScrollTrigger.removeEventListener("refresh", remeasure);
    grow.disconnect();
    window.removeEventListener("resize", resize);
    delete document.documentElement.dataset.film;
    world.dispose();
    packet.geometry.dispose();
    packetMat.dispose();
    pmrem.dispose();
    post.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
