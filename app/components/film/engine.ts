import * as THREE from "three";
import { CHANNELS, pieceStart, sample, spans, type Span } from "./plan";
import { ROUTE } from "./shots";
import { createFluid } from "./fluid";
import { createPost, SCRIM_MAX } from "./post";
import { getRequest, subscribe as onRequest } from "./request";
import clipList from "@/content/film-clips.json";

/** Scroll ranges of every page element the route names, measured now. */
function measure(): Span[] {
  const boxes = ROUTE.filter((b) => b.id !== "hero").flatMap((b) => {
    const el = document.querySelector<HTMLElement>(`[data-beat="${b.id}"]`) ?? document.getElementById(b.id) ?? document.querySelector<HTMLElement>(`[data-transit="${b.id}"]`);
    // A section hidden at this width (data-phone="hide") has no box to map.
    if (!el || el.getClientRects().length === 0) return [];
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

/** Beat ids in page order. */
const BEAT_ORDER = ROUTE.map((b) => b.id);
const T3_AT = BEAT_ORDER.indexOf("T3");
/** Seconds for the clip clock to close about 63 percent of the gap to the scroll. */
const CLIP_EASE = 0.045;

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
 * Request birth (plan C5.2): a question leaves the Ask box as an orange point,
 * flies a quadratic Bezier into the film lane, then recedes into the footage,
 * shrinking and fading, the way the request goes into the building.
 */
const FLY = 700;
const RECEDE = 790;
const CORE_PX = 10;
const HALO_PX = 28;
/** Where the point lands: the film lane, at the hall's vanishing point. */
const LAND = [0.72, 0.44];

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The film renderer: scroll-scrubbed footage (content/film-clips.json) drawn
 * by one full-screen pass. The code-built 3D world it began as was removed
 * (D46); the route (plan.ts, shots.ts) still defines the beats and their
 * scroll windows.
 */
export function start(host: HTMLElement, ScrollTrigger: Triggers) {
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  // Native density up to 2x: at 1.5 the browser stretched the film on Retina screens.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.info.autoReset = false;

  const ground = cssColour(getComputedStyle(document.body).getPropertyValue("--paper").trim() || getComputedStyle(document.body).backgroundColor);
  const post = createPost(ground);
  // The fluid needs float render targets and stays off under reduced motion.
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fluid = !calm && renderer.capabilities.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float") ? createFluid() : null;
  post.setFlow(fluid ? fluid.velocity : null);
  // Reduced motion: dissolves stay (they carry the change) but do not push, and
  // footage does not play on by itself.
  post.setPush(calm ? 0 : 0.03);
  // The fluid runs only while the pointer has moved in the last 2 s; still,
  // it settles and costs nothing (D47).
  const stir = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, at: -1e9 };
  const liveToken = getComputedStyle(document.documentElement).getPropertyValue("--film-live").trim();

  // The birth flies over the page, so it draws on its own canvas above it.
  const overlay = document.createElement("canvas");
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "var(--z-overlay)" });
  document.body.appendChild(overlay);
  const og = overlay.getContext("2d")!;
  let seenSent = -1;
  let lastAct = -2;
  let overlayDirty = false;
  let flight = false;
  let flightAt = 0;
  let heroBottom = 0;
  // Where T3's acts fall in its window, for the transit card's lines.
  const cuts = { t3a2: 1, t3a3: 1 };
  const readCuts = () => {
    cuts.t3a2 = pieceStart("T3", 1);
    cuts.t3a3 = pieceStart("T3", 2);
  };

  const goal = new Float64Array(CHANNELS);
  let list = measure();
  readCuts();
  const query = new URLSearchParams(location.search);
  const debug = query.get("film") === "debug";
  // ?lights=off renders nothing through the full pipeline, so the frame must
  // come out as the page ground (scripts/film-black.py).
  const lightsOff = query.get("lights") === "off";
  // ?hud=1 prints what the film shows, every frame, so a reader can quote an
  // exact frame back ("T6 42% · v4-kv10 8.06s f483") for debugging.
  const hud = query.get("hud") === "1" ? document.createElement("div") : null;
  if (hud) {
    Object.assign(hud.style, { position: "fixed", left: "8px", bottom: "56px", zIndex: "2147483647", padding: "6px 8px", font: "12px/1.4 ui-monospace, monospace", color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--rule)", pointerEvents: "none", whiteSpace: "pre" });
    document.body.appendChild(hud);
  }

  // ---- Clips --------------------------------------------------------------
  // Every section is video. Each clip is an MP4 seeked by scroll; its time
  // eases toward the scroll position every frame, so the picture glides at
  // display rate instead of jumping with the wheel.
  type ClipRow = { beat: string; file: string; span: number[]; time?: number[]; fadeIn?: boolean; gain?: number };
  const clips = clipList.clips as ClipRow[];
  // `drawn` is the frame this clip last drew on: a clip that did not draw on
  // the previous frame is entering, so its clock snaps instead of easing from
  // wherever it was left. `pending` holds while that snap's seek decodes.
  // `living` is the living clock (D49): a clip time that plays on at 0.35x
  // while the page is still; the clip shows the later of it and the scroll.
  type Live = { video: HTMLVideoElement; tex: THREE.Texture; t: number; ready: boolean; drawn: number; pending: boolean; living: number };
  const liveClips = new Map<string, Live>();
  const clipOf = (file: string) => {
    let l = liveClips.get(file);
    if (!l) {
      const video = document.createElement("video");
      // Phones get the 540p, 30 fps set (about 67 MB against 430 MB).
      video.src = `/film/clips/${window.innerWidth < 768 ? "m/" : ""}${file}.mp4`;
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      // VideoTexture sizes its storage from videoWidth and videoHeight; a plain
      // Texture allocated before the metadata arrived got 0 by 0 storage, which
      // WebGL then refused to resize, so the clip never drew.
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      l = { video, tex, t: 0, ready: false, drawn: -2, pending: false, living: 0 };
      const ll = l;
      // Parked on its first row's entry frame while it waits off screen, so
      // the frame it enters on is already decoded (D44).
      video.addEventListener("loadedmetadata", () => {
        const first = clips.find((c) => c.file === file);
        if (first && ll.drawn < 0) video.currentTime = (first.time?.[0] ?? 0) * Math.max(0, video.duration - 0.05);
      });
      // Once a first frame has decoded the texture always holds a picture, even
      // while a seek drops readyState back down.
      video.addEventListener("loadeddata", () => {
        ll.ready = true;
        tex.needsUpdate = true;
      });
      video.addEventListener("seeked", () => {
        ll.pending = false;
        if (ll.ready) tex.needsUpdate = true;
      });
      liveClips.set(file, l);
    }
    return l;
  };
  const beatIndex = (id: string) => BEAT_ORDER.indexOf(id);
  let clipBeat = "";
  let clipFrame = 0;
  let shown: Live | null = null;
  let lastScrollY = window.scrollY;
  let clipSpeed = 0;
  let lastMoved = 0;
  // A held picture keeps the exposure of the row it was shown under.
  const gains = new Map<Live, number>();
  const gainOf = (l: Live | null) => (l ? gains.get(l) ?? 1 : 1);
  // The pointer stirs the fluid.
  const onPointer = (e: PointerEvent) => {
    stir.x = e.clientX / window.innerWidth;
    stir.y = 1 - e.clientY / window.innerHeight;
    stir.at = performance.now();
    // The fluid answers the pointer even after the loop has parked.
    if (fluid) wake();
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  // Moves one row's clip toward where the scroll puts it and returns it, or
  // null while it has no picture yet.
  const driveClip = (c: ClipRow, progress: number, dt: number): Live | null => {
    const l = clipOf(c.file);
    const f = Math.min(1, Math.max(0, (progress - c.span[0]) / (c.span[1] - c.span[0])));
    // `time` is the part of the clip this row plays (0 to 1), so one clip can
    // run as slow motion across several neighbouring beats.
    const tw = c.time ?? [0, 1];
    const d = l.video.duration || 0;
    if (d > 0) {
      // The footage never freezes under a reader: while the page is still the
      // clip plays on at 0.35x (at most 40 percent of its row ahead of the
      // scroll), scrolling down continues from the later of the two, and
      // scrolling up takes it back with the page, so no frame ever runs back
      // on its own (D49).
      const scrollT = (tw[0] + f * (tw[1] - tw[0])) * (d - 0.05);
      const end = tw[1] * (d - 0.05);
      const room = (tw[1] - tw[0]) * (d - 0.05);
      if (l.drawn < clipFrame - 1 || window.scrollY < lastScrollY) l.living = scrollT;
      // Stops 5 s after the last scroll (WCAG 2.2.2: motion that starts by
      // itself must stop within five seconds or be pausable).
      else if (!calm && clipSpeed < 0.02 && performance.now() - lastMoved < 5000) l.living = Math.min(end, scrollT + room * 0.4, l.living + dt * 0.35);
      l.living = Math.max(l.living, scrollT);
      const target = l.living;
      if (l.drawn < clipFrame - 1) {
        // Entering (or re-entering from a jump): start where the scroll is,
        // never from the clip's opening frame or a stale time (D43).
        l.t = target;
        l.video.currentTime = target;
        l.pending = true;
      } else {
        // Eased by elapsed time, not per frame, so 60 and 120 Hz screens glide
        // alike. Seeks land within half a 60 fps frame.
        l.t += (target - l.t) * (1 - Math.exp(-dt / CLIP_EASE));
        if (!l.video.seeking && Math.abs(l.video.currentTime - l.t) > 1 / 120) l.video.currentTime = l.t;
      }
    }
    l.drawn = clipFrame;
    return l.ready && !l.pending ? l : null;
  };
  const drawClip = (beat: string, progress: number, dt: number) => {
    clipFrame++;
    // On a new beat, load every clip within one beat either side (two cost
    // frame time, D44), so a hand-off never waits on the network.
    if (beat !== clipBeat) {
      clipBeat = beat;
      const here = beatIndex(beat);
      for (const c of clips) if (Math.abs(beatIndex(c.beat) - here) <= 1) clipOf(c.file);
    }
    // At most two rows overlap: the outgoing clip and the one dissolving in.
    let a: ClipRow | null = null;
    let b: ClipRow | null = null;
    for (const c of clips) {
      if (c.beat !== beat || progress < c.span[0] || progress > c.span[1]) continue;
      if (!a) a = c;
      else if (!b) b = c;
    }
    if (!a) {
      stats.clip = "";
      post.setClip(null, 0);
      post.setClipB(null, 0);
      return;
    }
    const la = driveClip(a, progress, dt);
    const lb = b ? driveClip(b, progress, dt) : null;
    const m = b ? smooth(Math.min(1, Math.max(0, (progress - b.span[0]) / (a.span[1] - b.span[0])))) : 0;
    // Until a clip's frame at the scroll position has decoded, the last
    // picture shown stays up, so an entry never flashes the wrong frame.
    const base = la ?? shown;
    if (la) {
      shown = la;
      gains.set(la, a.gain ?? 1);
    }
    const cur = b && m > 0.5 ? b : a;
    stats.clip = cur.file;
    stats.clipTime = clipOf(cur.file).video.currentTime;
    stats.clipReady = base ? 1 : 0;
    stats.shown = base ? base.video.src.split("/").pop()!.replace(".mp4", "") : "";
    stats.shownTime = base ? base.video.currentTime : -1;
    stats.mixClip = lb ? b!.file : "";
    stats.mix = lb ? m : 0;
    post.setClip(base ? base.tex : null, a.fadeIn === true ? smooth(Math.min(1, (progress - a.span[0]) / (a.span[1] - a.span[0]) / 0.1)) : 1);
    post.setClipB(lb ? lb.tex : null, lb ? m : 0);
    // Scroll speed in screens a second, eased, gates the living clock; the
    // pointer eases by time like the clip clock.
    const k = 1 - Math.exp(-dt / 0.12);
    const v = dt > 0 ? Math.abs(window.scrollY - lastScrollY) / window.innerHeight / dt : 0;
    if (v > 0.001) lastMoved = performance.now();
    lastScrollY = window.scrollY;
    clipSpeed += (Math.min(1, v / 2.5) - clipSpeed) * k;
    post.setGains(gainOf(base), lb ? (b!.gain ?? 1) : 1);
    if (fluid && performance.now() - stir.at < 2000) {
      fluid.step(renderer, dt, stir.x, stir.y, stir.x - stir.px, stir.y - stir.py, window.innerWidth / window.innerHeight);
      post.setFlow(fluid.velocity);
    } else post.setFlow(null);
    stir.px = stir.x;
    stir.py = stir.y;
    if (lb && m >= 1) {
      shown = lb;
      gains.set(lb, b!.gain ?? 1);
    }
  };

  let scrims = measureScrims();
  const measureHero = () => {
    const h = document.querySelector("body > header");
    heroBottom = h ? h.getBoundingClientRect().bottom + window.scrollY : 0;
  };
  measureHero();
  const rects = new Float32Array(SCRIM_MAX * 4);
  // Two result slots swapped each frame, so reading the scroll allocates nothing.
  let where = sample(list, window.scrollY, goal, { beat: "", run: 0, progress: 0 });
  let spare = { beat: "", run: 0, progress: 0 };

  let last = performance.now();
  let lastInput = last;
  let raf = 0;
  let stopped = false;
  const frameMs = new Float64Array(45);
  const costMs = new Float64Array(45);
  const sorted = new Float64Array(45);
  let frameN = 0;
  // CPU time the film spends per frame, from the top of frame() to its end.
  let costSlot = 0;
  let costStart = 0;
  const stats = { y: 0, beat: where.beat, progress: 0, moving: false, p95: 0, draws: 0, bornFor: -1, bornLag: -1, frames: 0, cost95: 0, clip: "", clipTime: 0, clipReady: 0, shown: "", shownTime: -1, mixClip: "", mix: 0 };

  function resize() {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    overlay.width = Math.round(window.innerWidth * renderer.getPixelRatio());
    overlay.height = Math.round(window.innerHeight * renderer.getPixelRatio());
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.resize(buffer.x, buffer.y, renderer.getPixelRatio());
  }

  /** The request's birth over the page; returns while it is in the air. */
  function drawBirth(now: number) {
    const req = getRequest();
    if (req.sentAt !== seenSent) {
      // The load-time request leaves before the film has loaded; if the film
      // arrives within 10 s it is born then, at the Ask box, rather than never.
      const first = seenSent === -1;
      seenSent = req.sentAt;
      flightAt = first ? now : req.sentAt;
      flight = req.sentAt >= 0 && now - req.sentAt < (first ? 10_000 : 1000) && window.scrollY < heroBottom - window.innerHeight * 0.3 && where.beat === "hero";
    }
    if (overlayDirty) {
      og.setTransform(1, 0, 0, 1, 0, 0);
      og.clearRect(0, 0, overlay.width, overlay.height);
      overlayDirty = false;
    }
    const tb = now - flightAt;
    if (!flight || tb >= FLY + RECEDE) {
      flight = false;
      return;
    }
    overlayDirty = true;
    const box = document.getElementById("ask")?.closest("form")?.getBoundingClientRect();
    const bx = LAND[0] * window.innerWidth;
    const by = LAND[1] * window.innerHeight;
    const ax = box ? box.right : bx;
    const ay = box ? box.top + box.height / 2 : by;
    const t = smooth(Math.min(1, tb / FLY));
    const cx = (ax + bx) / 2;
    const cy = Math.min(ay, by) - 60;
    const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx;
    const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by;
    // After landing it recedes into the footage: smaller and fainter.
    const r = tb < FLY ? 0 : smooth(Math.min(1, (tb - FLY) / RECEDE));
    const size = 1 - 0.8 * r;
    const k = renderer.getPixelRatio();
    og.setTransform(k, 0, 0, k, 0, 0);
    og.globalAlpha = (1 - r) * 0.55;
    const halo = (HALO_PX / 2) * size;
    const glow = og.createRadialGradient(x, y, 0, x, y, halo);
    glow.addColorStop(0, liveToken);
    glow.addColorStop(1, "transparent");
    og.fillStyle = glow;
    og.fillRect(x - halo, y - halo, halo * 2, halo * 2);
    og.globalAlpha = 1 - r;
    og.fillStyle = liveToken;
    if (stats.bornFor !== req.sentAt) {
      stats.bornFor = req.sentAt;
      stats.bornLag = now - req.sentAt;
    }
    og.beginPath();
    og.arc(x, y, (CORE_PX / 2) * size, 0, Math.PI * 2);
    og.fill();
    og.globalAlpha = 1;
  }

  function frame(now: number) {
    raf = 0;
    if (stopped || lost || document.hidden) return;
    stats.frames++;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30);
    const began = performance.now();
    frameMs[frameN++] = now - last;
    last = now;
    if (frameN === frameMs.length) {
      sorted.set(frameMs);
      sorted.sort();
      stats.p95 = sorted[Math.floor(sorted.length * 0.95)];
      sorted.set(costMs);
      sorted.sort();
      stats.cost95 = sorted[Math.floor(sorted.length * 0.95)];
      frameN = 0;
    }
    costSlot = frameN === 0 ? frameMs.length - 1 : frameN - 1;
    costStart = began;

    const next = sample(list, window.scrollY, goal, spare);
    spare = where;
    where = next;
    drawBirth(now);

    // Scrim rects that reach into the viewport, in viewport CSS px.
    const sy = window.scrollY;
    const vhCss = window.innerHeight;
    let n = 0;
    for (let k = 0; k < scrims.length; k++) {
      const l = scrims[k][0], t = scrims[k][1], r = scrims[k][2], b = scrims[k][3];
      if (n === SCRIM_MAX || b - sy < -24 || t - sy > vhCss + 24) continue;
      rects[n * 4] = l;
      rects[n * 4 + 1] = t - sy;
      rects[n * 4 + 2] = r;
      rects[n * 4 + 3] = b - sy;
      n++;
    }
    post.setRects(rects, n);

    renderer.info.reset();
    if (lightsOff) post.setClip(null, 0);
    else drawClip(where.beat, where.progress, dt);
    post.render(renderer);
    costMs[costSlot] = performance.now() - costStart;
    stats.y = sy;
    stats.beat = where.beat;
    stats.progress = where.progress;
    stats.draws = renderer.info.render.calls;
    // Which act of T3 the reader is in, for the transit card (FilmTransit.tsx
    // swaps its lines on it). Written only when it changes.
    const act = where.beat === "T3" ? (where.progress >= cuts.t3a3 ? 2 : where.progress >= cuts.t3a2 ? 1 : 0) : BEAT_ORDER.indexOf(where.beat) > T3_AT ? 2 : 0;
    if (act !== lastAct) {
      lastAct = act;
      document.documentElement.dataset.filmAct = String(act);
    }
    if (hud) {
      const top = document.documentElement.scrollHeight - window.innerHeight;
      const f60 = (t: number) => `f${Math.round(t * 60)}`;
      hud.textContent =
        `${where.beat} ${Math.round(where.progress * 100)}% · y ${Math.round(sy)} (${((sy / Math.max(1, top)) * 100).toFixed(1)}% of page)\n` +
        `shown ${stats.shown || "-"} ${stats.shownTime.toFixed(2)}s ${f60(stats.shownTime)}` +
        (stats.mixClip ? `\nmix → ${stats.mixClip} ${Math.round(stats.mix * 100)}%` : "");
    }
    if (now - lastInput < PARK_AFTER) raf = requestAnimationFrame(frame);
  }

  function wake() {
    lastInput = performance.now();
    if (!raf && !stopped && !lost) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  // Degrade, never break: a lost GPU context stops the film and hands the page
  // its plain ground back (the chip hides with data-film); a restored one
  // brings it back where the reader is.
  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    delete document.documentElement.dataset.film;
    delete document.documentElement.dataset.filmAct;
    lastAct = -2;
  };
  const onRestored = () => {
    lost = false;
    document.documentElement.dataset.film = "live";
    resize();
    wake();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);


  resize();
  window.addEventListener("resize", resize);
  const trigger = ScrollTrigger.create({ start: 0, end: "max", onUpdate: wake });
  const remeasure = () => {
    list = measure();
    readCuts();
    scrims = measureScrims();
    measureHero();
    wake();
  };
  ScrollTrigger.addEventListener("refresh", remeasure);
  // The page grows when an answer arrives; the route and scrims follow it.
  const grow = new ResizeObserver(remeasure);
  grow.observe(document.body);

  const stopRequest = onRequest(wake);
  // A hidden tab draws nothing (plan C6.3).
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else wake();
  };
  document.addEventListener("visibilitychange", onVisibility);
  if (debug) (window as unknown as { __film: typeof stats; __filmFlow: () => number }).__film = stats;
  if (debug) (window as unknown as { __filmFlow: () => number }).__filmFlow = () => (fluid ? fluid.peek(renderer) : -1);
  document.documentElement.dataset.film = "live";
  wake();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    trigger.kill();
    ScrollTrigger.removeEventListener("refresh", remeasure);
    grow.disconnect();
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    stopRequest();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("resize", resize);
    overlay.remove();
    hud?.remove();
    for (const l of liveClips.values()) {
      l.tex.dispose();
      l.video.removeAttribute("src");
      l.video.load();
    }
    delete document.documentElement.dataset.film;
    delete document.documentElement.dataset.filmAct;
    lastAct = -2;
    fluid?.dispose();
    post.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
