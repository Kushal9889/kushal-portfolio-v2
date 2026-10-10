import * as THREE from "three";
import { CHANNELS, pieceStart, sample, spans, type Span } from "./plan";
import { ROUTE } from "./shots";
import { createFluid } from "./fluid";
import { createPost, SCRIM_MAX } from "./post";
import { getRequest, subscribe as onRequest } from "./request";
import clipList from "@/content/film-clips.json";
import frameCounts from "@/content/film-frames.json";

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

/** A text box taller than this is split into its children's boxes. */
const SCRIM_SPLIT = 360;

/** Viewport box of the visible text inside an element, or null when it shows none. */
function textBox(el: Element) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  // A closed fold's content still has boxes but is never painted, so its
  // subtree is skipped (one selector test per element; a per-node visibility
  // check cost six times as much). Hidden subtrees report no boxes at all.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (x) =>
      x.nodeType === Node.TEXT_NODE
        ? NodeFilter.FILTER_ACCEPT
        : (x as Element).tagName !== "SUMMARY" && x.parentElement?.matches("details:not([open])")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP,
  });
  const range = document.createRange();
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const q of range.getClientRects()) {
      if (q.width < 1 || q.height < 1) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
  }
  return l === Infinity ? null : [l, t, r, b];
}

/**
 * Where the film is dimmed for reading: tight to the visible text, so empty
 * space (a plate, a gap between columns, a closed fold) keeps the film at full
 * exposure instead of reading as a dark slab.
 *
 * `fixed` holds document-space boxes (left, top, right, bottom). A block whose
 * text runs taller than SCRIM_SPLIT is split into its children, so two columns
 * or a stack of panels are dimmed one by one. Sticky and pinned elements move
 * against the document while the reader scrolls, so they go to `live` and are
 * measured every frame instead.
 */
function measureScrims() {
  const fixed: number[][] = [];
  const live: Element[] = [];
  const collect = (el: Element, depth: number) => {
    if (el.classList.contains("pin-spacer")) {
      if (el.firstElementChild) live.push(el.firstElementChild);
      return;
    }
    const pos = getComputedStyle(el).position;
    if (pos === "sticky" || pos === "fixed") {
      live.push(el);
      return;
    }
    // Opaque seals with their own caption plates (the proof wall): dimming
    // the film behind them only merged into one dark slab.
    if (el.hasAttribute("data-scrim-skip")) return;
    const box = textBox(el);
    if (!box) return;
    if (box[3] - box[1] > SCRIM_SPLIT && depth < 5 && el.children.length > 0) {
      for (const child of el.children) collect(child, depth + 1);
      return;
    }
    fixed.push([box[0], box[1] + window.scrollY, box[2], box[3] + window.scrollY]);
  };
  for (const el of document.querySelectorAll<HTMLElement>("[data-film-scrim]")) {
    if (el.matches("main > section > .wrap")) for (const child of el.children) collect(child, 0);
    else collect(el, 0);
  }
  return { fixed, live };
}

/** Beat ids in page order. */
const BEAT_ORDER = ROUTE.map((b) => b.id);
const T3_AT = BEAT_ORDER.indexOf("T3");
/** Seconds for the clip clock to close about 63 percent of the gap to the scroll. */
const CLIP_EASE = 0.045;
/** Scroll length of a clip-to-clip dissolve, in screen heights. */
const DISSOLVE = 0.35;

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
export function start(host: HTMLElement, ScrollTrigger: Triggers, onSlow?: () => void) {
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
  // Every section is footage. Each clip's time eases toward the scroll
  // position every frame, so the picture glides at display rate instead of
  // jumping with the wheel.
  type ClipRow = { beat: string; file: string; span: number[]; time?: number[]; fadeIn?: boolean; gain?: number };
  const clips = clipList.clips as ClipRow[];
  // `drawn` is the frame this clip last drew on: a clip that did not draw on
  // the previous frame is entering, so its clock snaps instead of easing from
  // wherever it was left. `pending` holds while that snap's seek decodes.
  // `living` is the living clock (D49): a clip time that plays on at 0.35x
  // while the page is still; the clip shows the later of it and the scroll.
  // Each clip is an image sequence (ADR-003, the Apple product-page method):
  // every frame of a clip is fetched before the clip plays, the few frames
  // around the scroll position are decoded off the main thread, a frame
  // reaches the GPU only when the frame index changes, and the shader blends
  // the two stored frames either side of the scroll position every refresh,
  // so 24 real frames a second move at the display's own rate.
  // Desktop: 3840x2160 (1920x1080 for clips shot at 1080p), 24 fps. Under
  // 768 px: the upright middle at 1080x1920, every second frame (12 fps).
  type Slot = { tex: THREE.Texture; i: number };
  type Live = {
    base: string; tier: string; fps: number; n: number; dur: number; waitSince: number;
    entry: number; order: number[]; coarse: number; blobs: (Blob | undefined)[]; loaded: number; next: number; started: boolean; gen: number; prio: number;
    bitmaps: Map<number, ImageBitmap>; decoding: Set<number>;
    a: Slot; b: Slot; mix: number; flow: THREE.Texture | null;
    t: number; ready: boolean; drawn: number; pending: boolean; living: number; target: number; decoded: number;
  };
  const phone = window.innerWidth < 768;
  const tier = phone ? "p" : "d";
  const tierFps = phone ? 12 : 24;
  const liveClips = new Map<string, Live>();
  // 4K first (d4/) where the canvas is wider than a 1080p frame, so the extra
  // detail can reach the screen; a clip the reader has reached that shows no
  // picture for 400 ms drops the rest of the film to 1080p for good.
  // The drawing buffer is the viewport at min(dpr, 2); a 16:9 frame covers it.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let hi = !phone && Math.max(window.innerWidth, (window.innerHeight * 16) / 9) * dpr > 1920;
  const downgrade = () => {
    if (!hi) return;
    hi = false;
    for (const l of liveClips.values()) {
      if (l.tier !== "d4" || l === shown) continue;
      const was = l.started;
      release(l);
      l.tier = tier;
      if (was) load(l);
    }
  };
  const slot = (): Slot => {
    const tex = new THREE.Texture();
    // Raw bytes, decoded in post.ts like the video was; bitmaps arrive flipped.
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = false;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return { tex, i: -1 };
  };
  // At most 40 percent of the cores decode frames at once, film-wide (4 on a
  // 10-core Mac, 3 on an 8-core phone, never under 2). Unbounded, a fast flick
  // started about 130 decodes a second (each request runs to the end once
  // begun, even for frames already scrolled past) and filled every core, so
  // the compositor and GPU threads missed vsync: 11 percent of frames dropped
  // with the main thread idle (desk-fast trace, 2026-10-07). showAt asks in
  // order of need every frame, so a frame refused here is asked for again.
  let decoding = 0;
  // A/B on desk-slow / desk-fast (load 4 to 6): cap 2 held the picture 43 /
  // 99 percent, cap 4 held 21 / 92 percent with 0 dropped, unbounded 15 / 81
  // percent but dropped 8 percent on the flick. ?film=debug&dmax=N overrides.
  const DECODE_MAX = (debug && Number(query.get("dmax"))) || Math.max(2, Math.floor((navigator.hardwareConcurrency || 4) * 0.4));
  const decode = (l: Live, i: number, force = false) => {
    const blob = l.blobs[i];
    if (!blob || l.bitmaps.has(i) || l.decoding.has(i)) return;
    if (decoding >= DECODE_MAX && !force) return;
    decoding++;
    stats.decodes++;
    l.decoding.add(i);
    const opts: ImageBitmapOptions = { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" };
    createImageBitmap(blob, opts)
      .then((bmp) => {
        if (l.blobs[i]) l.bitmaps.set(i, bmp);
        else bmp.close();
      })
      .catch(() => {})
      .finally(() => {
        decoding--;
        l.decoding.delete(i);
      });
  };
  // Puts frame i on a slot's texture if it has decoded. Returns whether the
  // slot now holds frame i.
  const put = (s: Slot, l: Live, i: number) => {
    if (s.i === i) return true;
    const bmp = l.bitmaps.get(i);
    if (!bmp) return false;
    s.tex.image = bmp;
    s.tex.needsUpdate = true;
    s.i = i;
    stats.seeks++;
    return true;
  };
  // Download order inside a clip, coarse to fine in time: the entry frame,
  // then every 8th frame, every 4th, every 2nd, the rest. A fast scroll that
  // lands deep in a clip finds a frame near it within the first eighth of the
  // bytes and the motion fills in behind it, instead of the old picture
  // holding until the frames before it arrived (1.4 s on a fast flick).
  const coarseToFine = (n: number, entry: number) => {
    const seen = new Uint8Array(n);
    const out: number[] = [];
    const add = (i: number) => {
      if (i >= 0 && i < n && !seen[i]) {
        seen[i] = 1;
        out.push(i);
      }
    };
    add(entry);
    for (const step of [8, 4, 2, 1]) {
      for (let i = entry; i < n; i += step) add(i);
      for (let i = entry - step; i >= 0; i -= step) add(i);
    }
    return out;
  };
  // One download queue for the whole film, six requests in flight, always
  // serving the nearest clip first (the one being entered, then the next,
  // the previous, the one after), so the clip the reader reaches is never
  // sharing the link with clips two beats away. Within a clip, frames come
  // from its entry frame onward. `gen` retires the requests of a released
  // clip so a late reply never counts toward its next load.
  let inflight = 0;
  // The link, measured rather than guessed from navigator.connection (a slow
  // "4g" never reports 3g): bytes over the time the queue was busy. Once 12
  // frames have arrived over at least a second, a link that cannot carry the
  // footage at its own rate (average frame bytes times fps) hands over to the
  // still frame (Film.tsx): on 1.6 Mbps the phone film held one picture for
  // 93 percent of a scroll, up to 5.4 s at a time (phone-4g-cold, 2026-10-07).
  const link = { bytes: 0, frames: 0, busy: 0, since: 0, decided: false };
  const meter = (bytes: number) => {
    const now = performance.now();
    link.bytes += bytes;
    link.frames++;
    if (link.decided || link.frames < 12) return;
    const busy = (link.busy + (inflight > 0 ? now - link.since : 0)) / 1000;
    if (busy < 1) return;
    link.decided = true;
    const need = (link.bytes / link.frames) * tierFps;
    if (link.bytes / busy < need && !(debug && query.get("slow") === "0")) onSlow?.();
  };
  // Coarse frames (the entry and every 8th) of this beat, then of the next,
  // then this beat's fine frames, then the beats either side: a fast scroll
  // reaches every nearby clip with a picture in hand instead of waiting while
  // the current one fills in. `prio` holds the beat rank (0 this beat, 1 next,
  // 2 previous, 3 the one after) times 1000 plus the row.
  const COARSE = [0, 1, 3, 3];
  const FINE = [2, 4, 5, 5];
  const keyOf = (c: Live) => {
    const rank = Math.floor(c.prio / 1000);
    if (rank > 3) return 1e9;
    return (c.next < c.coarse ? COARSE[rank] : FINE[rank]) * 1000 + (c.prio % 1000);
  };
  // One frame over the network: 8 s timeout, then up to 3 retries 250 ms,
  // 500 ms, 1 s apart with jitter. Before, a stalled request held one of the
  // six slots for good and one failed reply lost that frame for the visit.
  // The breaker: 6 failures in a row (the link is down, not one frame) stop
  // all requests for 5 s, then one probe decides whether to resume.
  const breaker = { fails: 0, openUntil: 0 };
  const fetchFrame = async (url: string): Promise<Blob> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status));
        breaker.fails = 0;
        return await r.blob();
      } catch (e) {
        if (++breaker.fails >= 6) breaker.openUntil = performance.now() + 5000;
        // A missing file will not appear on a retry.
        if (attempt >= 3 || (e as Error).message === "404") throw e;
        await new Promise((ok) => setTimeout(ok, 250 * 2 ** attempt * (0.75 + Math.random() / 2)));
      }
    }
  };
  const pump = () => {
    const now = performance.now();
    if (now < breaker.openUntil) {
      setTimeout(pump, breaker.openUntil - now);
      return;
    }
    while (inflight < 6) {
      let l: Live | null = null;
      for (const c of liveClips.values()) if (c.started && c.next < c.n && (!l || keyOf(c) < keyOf(l))) l = c;
      if (!l) return;
      const c = l;
      const g = c.gen;
      const i = c.order[c.next++];
      if (inflight++ === 0) link.since = performance.now();
      fetchFrame(`/film/frames/${c.tier}/${c.base}/${String(i + 1).padStart(4, "0")}.webp`)
        .then((b) => {
          meter(b.size);
          if (c.gen === g) c.blobs[i] = b;
        })
        // A missing frame is held over by its neighbour rather than blanking.
        .catch(() => {})
        .finally(() => {
          if (--inflight === 0) link.busy += performance.now() - link.since;
          if (c.gen === g && ++c.loaded >= c.n && c.a.i < 0) {
            // Parked on its entry frame while it waits off screen, so the
            // frame it enters on is already decoded (D44).
            decode(c, c.entry, true);
            decode(c, c.entry + 1, true);
          }
          pump();
        });
    }
  };
  // The clip's optical-flow atlas (film-flow.py, about 200 KB), so the shader
  // slides frames along the motion instead of cross-fading them. Without it
  // the plain blend stands in.
  const flowCell: [number, number] = phone ? [36, 64] : [64, 36];
  // ?film=debug&flow=0: the plain blend, for A/B runs.
  const noFlow = debug && query.get("flow") === "0";
  const loadFlow = (l: Live) => {
    const g = l.gen;
    fetch(`/film/flow/${phone ? "p" : "d"}/${l.base}.png`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => createImageBitmap(b, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }))
      .then((bmp) => {
        if (l.gen !== g) return bmp.close();
        const tex = new THREE.Texture(bmp);
        tex.colorSpace = THREE.NoColorSpace;
        tex.flipY = false;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        l.flow = tex;
      })
      .catch(() => {});
  };
  const load = (l: Live) => {
    if (l.started) return;
    l.started = true;
    loadFlow(l);
    pump();
  };
  const release = (l: Live) => {
    l.gen++;
    l.started = false;
    l.next = 0;
    l.blobs = [];
    l.loaded = 0;
    for (const b of l.bitmaps.values()) b.close();
    l.bitmaps.clear();
    l.ready = false;
    // Frees the two GL textures too (33 MB each at 4K); three.js reallocates
    // them on the next upload.
    l.a.tex.dispose();
    l.b.tex.dispose();
    l.a.i = l.b.i = -1;
    l.flow?.dispose();
    l.flow = null;
  };
  // Closes the decoded frames of a clip that is not drawing, keeping only the
  // two on its texture slots.
  const shed = (l: Live) => {
    for (const [k, bmp] of l.bitmaps) {
      if (k !== l.a.i && k !== l.b.i) {
        bmp.close();
        l.bitmaps.delete(k);
      }
    }
  };
  const clipOf = (file: string) => {
    let l = liveClips.get(file);
    if (!l) {
      const n = (frameCounts as Record<string, Record<string, number>>)[tier]?.[file] ?? 2;
      const first = clips.find((c) => c.file === file);
      const entry = Math.round((first?.time?.[0] ?? 0) * (n - 1));
      l = {
        base: file, tier: hi && (frameCounts as { w?: Record<string, number> }).w?.[file] === 3840 ? "d4" : tier, waitSince: 0, fps: tierFps, n, dur: (n - 1) / tierFps + 0.05, entry, order: coarseToFine(n, entry), coarse: 1 + Math.ceil(n / 8),
        blobs: [], loaded: 0, next: 0, started: false, gen: 0, prio: 1e9, bitmaps: new Map(), decoding: new Set(),
        a: slot(), b: slot(), mix: 0, flow: null,
        t: 0, ready: false, drawn: -2, pending: false, living: 0, target: 0, decoded: -1,
      };
      liveClips.set(file, l);
    }
    load(l);
    return l;
  };
  // Shows the frame pair for time t: decodes from the shown frame toward the
  // scroll target (a fling's frames are ready before the eased clock gets
  // there), frees what is behind, and swaps the two slots when the scroll
  // steps one frame either way, so one upload covers a step. Holds the
  // nearest decoded frame while one decodes.
  const showAt = (l: Live, t: number) => {
    let pos = Math.min(l.n - 1, Math.max(0, t * l.fps));
    let i = Math.floor(pos);
    // Not downloaded yet: the nearest frame that has arrived stands in.
    if (!l.blobs[i]) {
      for (let r = 1; r < l.n; r++) {
        if (l.blobs[i - r]) { i -= r; break; }
        if (l.blobs[i + r]) { i += r; break; }
      }
      pos = i;
    }
    const j = Math.min(l.n - 1, i + 1);
    const to = Math.min(l.n - 1, Math.max(0, Math.round(l.target * l.fps)));
    const dir = to >= i ? 1 : -1;
    // Most needed first: the pair on screen, then toward the target, then
    // the frame behind.
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, -1]) {
      const f = i + dir * k;
      if (f >= 0 && f < l.n && (k <= 2 || (dir > 0 ? f <= to + 2 : f >= to - 2))) decode(l, f);
    }
    for (const [k, bmp] of l.bitmaps) {
      if ((k < i - 2 || k > i + 9) && (dir > 0 || k < i - 9 || k > i + 2) && k !== l.a.i && k !== l.b.i) {
        bmp.close();
        l.bitmaps.delete(k);
      }
    }
    // Forward step: b already holds i. Backward step: a holds j, so it moves
    // to b and only a uploads.
    if (l.b.i === i || (l.a.i === j && l.b.i !== j)) [l.a, l.b] = [l.b, l.a];
    if (!put(l.a, l, i)) {
      // Not decoded yet: the nearest decoded frame stands in.
      let best = -1;
      for (const k of l.bitmaps.keys()) if (best < 0 || Math.abs(k - i) < Math.abs(best - i)) best = k;
      if (best >= 0) put(l.a, l, best);
      l.mix = 0;
    } else l.mix = put(l.b, l, j) && j > i ? pos - i : 0;
    if (l.a.i >= 0) {
      // The position on screen, blend included, for the lag reading.
      l.decoded = (l.a.i + l.mix) / l.fps;
      l.ready = true;
    }
    return l.a.i >= 0;
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
    // Frames load in order from the entry frame, so the clip shows its entry
    // frame as soon as that arrives and starts moving once half a second
    // ahead is in; the rest streams behind the reader. Waiting for every
    // frame held the picture up to 5.5 s on a large clip.
    const d = l.loaded >= Math.min(l.n, Math.ceil(l.fps / 2)) ? l.dur : 0;
    if (d === 0 && l.loaded > 0) l.pending = !showAt(l, l.entry / l.fps);
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
      l.target = target;
      if (l.drawn < clipFrame - 1) {
        // Entering (or re-entering from a jump): start where the scroll is,
        // never from the clip's opening frame or a stale time (D43).
        l.t = target;
      } else {
        // Eased by elapsed time, not per frame, so 60 and 120 Hz screens glide
        // alike.
        l.t += (target - l.t) * (1 - Math.exp(-dt / CLIP_EASE));
      }
      l.pending = !showAt(l, l.t);
    }
    l.drawn = clipFrame;
    const ok = l.ready && !l.pending;
    if (ok) l.waitSince = 0;
    else if (!l.waitSince) l.waitSince = performance.now();
    else if (l.tier === "d4" && performance.now() - l.waitSince > 400) downgrade();
    return ok ? l : null;
  };
  const drawClip = (beat: string, progress: number, dt: number) => {
    clipFrame++;
    // On a new beat, load every clip within one beat either side (two cost
    // frame time, D44), so a hand-off never waits on the network.
    if (beat !== clipBeat) {
      clipBeat = beat;
      const here = beatIndex(beat);
      // Frames for one beat back and two ahead; clips further away give their
      // memory back (HTTP cache makes a return trip cheap).
      const near = new Set<string>();
      for (const l of liveClips.values()) l.prio = 1e9;
      clips.forEach((c, row) => {
        const k = beatIndex(c.beat) - here;
        // This beat, the next, the previous, the one after; inside a beat,
        // in scroll order, so the next hand-off's clip is always first.
        if (k >= -1 && k <= 2) {
          const l = clipOf(c.file);
          l.prio = Math.min(l.prio, [2, 0, 1, 3][k + 1] * 1000 + row);
        }
        if (k >= -2 && k <= 3) near.add(c.file);
      });
      pump();
      for (const [f, l] of liveClips) if (!near.has(f) && l !== shown && l.started) release(l);
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
    // Only the clips on screen keep a decode window.
    for (const l of liveClips.values()) if (l.drawn < clipFrame && l !== shown && l.bitmaps.size > 2) shed(l);
    // A dissolve lasts a fixed scroll distance (DISSOLVE of the screen
    // height, about one wheel flick) centred in the rows' overlap. Spread over
    // the whole overlap (up to a third of a beat) two unrelated shots sat
    // double-exposed for a full screen of scrolling.
    let m = 0;
    if (b) {
      const span = list.find((s) => s.id === beat);
      const px = span ? Math.max(1, span.y1 - span.y0) : window.innerHeight;
      const lap = a.span[1] - b.span[0];
      const w = Math.min(lap, (DISSOLVE * window.innerHeight) / px);
      const mid = b.span[0] + lap / 2;
      m = smooth(Math.min(1, Math.max(0, (progress - (mid - w / 2)) / Math.max(1e-6, w))));
    }
    // Until a clip's frame at the scroll position has decoded, the last
    // picture shown stays up, so an entry never flashes the wrong frame.
    const base = la ?? shown;
    if (la) {
      shown = la;
      gains.set(la, a.gain ?? 1);
    }
    const cur = b && m > 0.5 ? b : a;
    stats.clip = cur.file;
    stats.clipTime = clipOf(cur.file).t;
    stats.clipReady = base ? 1 : 0;
    // Seconds between the frame the scroll asks for and the last one decoded:
    // the film's visible lag, which a frame timer cannot see.
    const lc = clipOf(cur.file);
    stats.lag = lc.decoded < 0 ? -1 : Math.abs(lc.t - lc.decoded);
    stats.ease = Math.abs(lc.target - lc.t);
    stats.shown = base ? base.base : "";
    stats.shownTime = base ? base.decoded : -1;
    stats.mixClip = lb ? b!.file : "";
    stats.mix = lb ? m : 0;
    post.setNext(base ? base.b.tex : null, base ? base.mix : 0);
    post.setFlow2(noFlow ? null : base?.flow ?? null, base && base.mix > 0 && base.b.i === base.a.i + 1 ? base.a.i : -1, flowCell[0], flowCell[1]);
    post.setClip(base ? base.a.tex : null, a.fadeIn === true ? smooth(Math.min(1, (progress - a.span[0]) / (a.span[1] - a.span[0]) / 0.1)) : 1);
    post.setClipB(lb ? lb.a.tex : null, lb ? m : 0);
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
  let veil = 0;
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
  const stats = { y: 0, beat: where.beat, progress: 0, moving: false, p95: 0, draws: 0, bornFor: -1, bornLag: -1, frames: 0, cost95: 0, clip: "", clipTime: 0, clipReady: 0, lag: -1, ease: 0, seeks: 0, shown: "", shownTime: -1, mixClip: "", mix: 0, veil: 0, rects: 0, decodes: 0 };

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
    const push = (l: number, t: number, r: number, b: number) => {
      if (n === SCRIM_MAX || b < -24 || t > vhCss + 24 || r - l < 1 || b - t < 1) return;
      rects[n * 4] = l;
      rects[n * 4 + 1] = t;
      rects[n * 4 + 2] = r;
      rects[n * 4 + 3] = b;
      n++;
    };
    // Live (sticky, pinned) boxes first: they are on screen whenever they matter.
    for (const el of scrims.live) {
      const q = el.getBoundingClientRect();
      push(q.left, q.top, q.right, q.bottom);
    }
    for (const box of scrims.fixed) push(box[0], box[1] - sy, box[2], box[3] - sy);
    post.setRects(rects, n);
    stats.rects = n;
    // The veil fades in and out as text arrives and leaves rather than switching.
    veil += ((n > 0 ? 1 : 0) - veil) * Math.min(1, dt * 6);
    post.setVeil(veil);
    stats.veil = veil;

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
  // Remeasuring walks every text node on the page (about 7 ms) and forces a
  // layout. Folds, counters and streamed answers resize the body many times in
  // a row, so the work runs once, after the page has been still for 120 ms.
  let settle = 0;
  const grow = new ResizeObserver(() => {
    window.clearTimeout(settle);
    settle = window.setTimeout(remeasure, 120);
  });
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
  if (debug) (window as unknown as { __filmRects: () => number[] }).__filmRects = () => Array.from(rects.subarray(0, stats.rects * 4));
  if (debug) (window as unknown as { __filmFlow: () => number }).__filmFlow = () => (fluid ? fluid.peek(renderer) : -1);
  document.documentElement.dataset.film = "live";
  delete document.documentElement.dataset.filmPre;
  wake();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    trigger.kill();
    ScrollTrigger.removeEventListener("refresh", remeasure);
    grow.disconnect();
    window.clearTimeout(settle);
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    stopRequest();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onPointer);
    window.removeEventListener("resize", resize);
    overlay.remove();
    hud?.remove();
    for (const l of liveClips.values()) {
      release(l);
      l.a.tex.dispose();
      l.b.tex.dispose();
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
