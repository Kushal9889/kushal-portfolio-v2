import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import field from "@/lib/agent/field.json";
import { distanceOf, eyeOf, fovOf, step } from "./camera";
import { CHANNELS, sample, spans, type Span } from "./plan";
import { ROUTE } from "./shots";
import { createPost, SCRIM_MAX } from "./post";
import { getRequest, subscribe as onRequest } from "./request";
import { PLACES } from "./beats";
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
 * Packet birth (plan C5.2). A request leaves the Ask box as a sprite on the
 * page, flies a quadratic Bezier to where the world packet will appear, hands
 * over in a 120 ms crossfade, then the world packet recedes down the aisle to
 * its rest point at 180 px/s (142 px, 790 ms at 1440 x 900).
 */
const FLY = 700;
const HAND = 120;
const RECEDE = 790;
/** Screen size of the packet (plan O14): core 10 px, halo 28 px. */
const CORE_PX = 10;
const HALO_PX = 28;

/**
 * A soft round falloff for the halo sprite: white, with alpha 0.55 at the
 * centre falling as (1 - r)^2. Colour comes from the sprite material.
 */
function haloTexture() {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.min(1, Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2));
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * 0.55 * (1 - r) ** 2);
    }
  }
  const t = new THREE.DataTexture(data, n, n);
  t.needsUpdate = true;
  return t;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

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

  // The request's colour is read from the page token, so the film and the chip
  // cannot disagree about what orange is.
  const liveToken = getComputedStyle(document.documentElement).getPropertyValue("--film-live").trim();
  const live = cssColour(liveToken);
  const packetMat = new THREE.MeshBasicMaterial({ color: live, transparent: true });
  const packet = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), packetMat);
  const haloMap = haloTexture();
  const haloMat = new THREE.SpriteMaterial({ map: haloMap, color: live, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Sprite(haloMat);
  scene.add(packet, halo);

  // The birth flies over the page, so it draws on its own canvas above it.
  const overlay = document.createElement("canvas");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "var(--z-overlay)" });
  document.body.appendChild(overlay);
  const og = overlay.getContext("2d")!;
  let seenSent = -1;
  let flight = false;
  let flightAt = 0;
  let heroBottom = 0;
  const heroPacket = new THREE.Vector3(...PLACES.heroPacket);
  const birthPacket = new THREE.Vector3(...PLACES.birthPacket);
  const onPath = new THREE.Vector3();
  const projected = new THREE.Vector3();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);

  const pose = new Float64Array(CHANNELS);
  const vel = new Float64Array(CHANNELS);
  const goal = new Float64Array(CHANNELS);
  let list = measure();
  const query = new URLSearchParams(location.search);
  const debug = query.get("film") === "debug";
  // ?lights=off renders nothing through the full pipeline, so the frame must
  // come out as the page ground (scripts/film-black.py).
  const lightsOff = query.get("lights") === "off";
  if (lightsOff) world.root.visible = false;
  let scrims = measureScrims();
  const measureHero = () => {
    const h = document.querySelector("body > header");
    heroBottom = h ? h.getBoundingClientRect().bottom + window.scrollY : 0;
  };
  measureHero();
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
  const stats = { y: 0, beat: where.beat, progress: 0, lens: 0, W: 0, moving: true, p95: 0, draws: 0, tris: 0, bornFor: -1, bornLag: -1 };

  function resize() {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    overlay.width = Math.round(window.innerWidth * renderer.getPixelRatio());
    overlay.height = Math.round(window.innerHeight * renderer.getPixelRatio());
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

    // Where the packet is on the route: at rest in the aisle for the hero,
    // carried onto the route across T1, then with the camera's subject.
    onPath.set(pose[0], pose[1], pose[2]);
    if (where.beat === "hero") onPath.copy(heroPacket);
    else if (where.beat === "T1") onPath.lerpVectors(heroPacket, onPath, smooth(where.progress));

    // Birth: a new request flies out of the Ask box, but only while the hero
    // is on screen to see it leave. Elsewhere the packet simply changes owner.
    const req = getRequest();
    if (req.sentAt !== seenSent) {
      // The load-time request leaves before the film has loaded; if the film
      // arrives within 10 s it is born then, at the Ask box, rather than never.
      const first = seenSent === -1;
      seenSent = req.sentAt;
      flightAt = first ? now : req.sentAt;
      flight = req.sentAt >= 0 && now - req.sentAt < (first ? 10_000 : 1000) && yOf() < heroBottom - window.innerHeight * 0.3 && where.beat === "hero";
    }
    const tb = now - flightAt;
    let worldAlpha = req.provenance.kind === "none" ? 0 : 1;
    let overlayAlpha = 0;
    if (flight && tb < FLY + HAND + RECEDE) {
      if (tb < FLY) {
        worldAlpha = 0;
        overlayAlpha = 1;
      } else if (tb < FLY + HAND) {
        worldAlpha = (tb - FLY) / HAND;
        overlayAlpha = 1 - worldAlpha;
      }
      if (where.beat === "hero") onPath.lerpVectors(birthPacket, heroPacket, Math.min(1, Math.max(0, (tb - FLY) / RECEDE)));
    } else flight = false;

    packet.position.copy(onPath);
    halo.position.copy(onPath);
    const cssH = window.innerHeight;
    const perPx = (2 * camera.position.distanceTo(onPath) * Math.tan((camera.fov * Math.PI) / 360)) / cssH;
    packet.scale.setScalar((CORE_PX / 2) * perPx);
    halo.scale.setScalar(HALO_PX * perPx);
    packetMat.opacity = worldAlpha;
    haloMat.opacity = worldAlpha;
    packet.visible = halo.visible = worldAlpha > 0 && !lightsOff;

    og.setTransform(1, 0, 0, 1, 0, 0);
    og.clearRect(0, 0, overlay.width, overlay.height);
    if (overlayAlpha > 0) {
      const box = document.getElementById("ask")?.closest("form")?.getBoundingClientRect();
      projected.copy(birthPacket).project(camera);
      const bx = ((projected.x + 1) / 2) * window.innerWidth;
      const by = ((1 - projected.y) / 2) * cssH;
      const ax = box ? box.right : bx;
      const ay = box ? box.top + box.height / 2 : by;
      const cx = (ax + bx) / 2;
      const cy = Math.min(ay, by) - 60;
      const t = smooth(Math.min(1, tb / FLY));
      const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
      const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
      const k = renderer.getPixelRatio();
      og.setTransform(k, 0, 0, k, 0, 0);
      og.globalAlpha = overlayAlpha * 0.55;
      const glow = og.createRadialGradient(x, y, 0, x, y, HALO_PX / 2);
      glow.addColorStop(0, liveToken);
      glow.addColorStop(1, "transparent");
      og.fillStyle = glow;
      og.fillRect(x - HALO_PX / 2, y - HALO_PX / 2, HALO_PX, HALO_PX);
      og.globalAlpha = overlayAlpha;
      og.fillStyle = liveToken;
      if (stats.bornFor !== req.sentAt) {
        stats.bornFor = req.sentAt;
        stats.bornLag = now - req.sentAt;
      }
      og.beginPath();
      og.arc(x, y, CORE_PX / 2, 0, Math.PI * 2);
      og.fill();
      og.globalAlpha = 1;
    }

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
    measureHero();
    wake();
  };
  ScrollTrigger.addEventListener("refresh", remeasure);
  // The page grows when an answer arrives; the route and scrims follow it.
  const grow = new ResizeObserver(remeasure);
  grow.observe(document.body);

  const stopRequest = onRequest(wake);
  if (debug) (window as unknown as { __film: typeof stats }).__film = stats;
  document.documentElement.dataset.film = "live";
  wake();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    trigger.kill();
    ScrollTrigger.removeEventListener("refresh", remeasure);
    grow.disconnect();
    stopRequest();
    overlay.remove();
    haloMap.dispose();
    haloMat.dispose();
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
