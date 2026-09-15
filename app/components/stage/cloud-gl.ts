/**
 * The corpus cloud renderer. Raw WebGL2, one draw call, no dependencies.
 *
 * Nothing draws unless something changed: `invalidate()` schedules exactly one
 * frame, and the only callers are a camera move, a pointer move, a resize, or a
 * highlight tween that is still running. At rest the GPU does no work.
 */

export type Vec3 = [number, number, number];
export type RGB = [number, number, number];

export type CloudData = {
  positions: Float32Array;
  clusters: Float32Array;
  kinds: Float32Array;
  count: number;
};

export type CameraOptions = {
  /**
   * Follow the new pose on a critically damped spring instead of jumping to it.
   * Used by the page-long travel between chapters, where scroll input arrives in
   * steps and a camera that copied it would stop dead the moment scrolling does.
   */
  damp?: boolean;
};

/** The field between chapters: how far the particles are thrown, and how bright the field reads. */
export type FieldState = {
  /** 0 at rest, 1 fully dispersed along the curl field. */
  disperse: number;
  /** Seed for the curl field, so each chapter seam throws the particles differently. */
  phase: number;
  /** Overall brightness, 0..1. Dimmed while a chapter is being read over the field. */
  dim: number;
};

/** The seam post pass: 0 inside chapters, rising to 1 in the middle 30% of a seam. */
export type SeamFx = { amount: number };

export type Cloud = {
  setCamera(eye: Vec3, target: Vec3, fov?: number, options?: CameraOptions): void;
  /** Chapter tint multiplied into the particle ink, low chroma (plan 3.1). */
  setTint(rgb: RGB): void;
  /** Scroll velocity as 0..1; particles stretch along the scroll axis (F-012). */
  setStreak(amount: number): void;
  /**
   * Morph targets for the dot morphs (plan F.5): world positions, xyz per
   * particle in draw order. Particles past the end of the list keep their place.
   * `amount` 0..1 blends from the corpus position to the target.
   */
  setMorph(targets: Float32Array | null, amount: number): void;
  /**
   * Condense: pulls the particles of one section toward a world point, at most
   * 1,200 particles (F-017). Amount 0 releases them.
   */
  setAttract(section: number, point: Vec3, amount: number): void;
  /** Seam post pass strength (F-014, F-015). */
  setSeam(fx: SeamFx): void;
  /** Idle drift, 0 off to 1 on (F-033). Draws at a low rate while on. */
  setDrift(amount: number): void;
  /** Viewport CSS pixels at a given view depth back to a world point, for condense targets. */
  unproject(x: number, y: number, depth: number): Vec3;
  setField(state: Partial<FieldState>): void;
  setPointer(x: number, y: number): void;
  /** Per-section intensity 0..1, eased over `duration` ms. */
  highlight(values: number[], duration?: number): void;
  /** World point to viewport CSS pixels, with its distance in front of the camera. */
  project(p: Vec3): { x: number; y: number; visible: boolean; depth: number };
  /** Pulls every particle toward `core`, 0 (at rest) to 1 (one point). */
  setCollapse(core: Vec3, amount: number): void;
  invalidate(): void;
  onFrame(cb: () => void): () => void;
  stats: { draws: number; lost: boolean; frozen: boolean; p95: number | null };
  destroy(): void;
};

const SECTIONS = 18;

const VERT = `#version 300 es
precision highp float;
in vec3 aPos;
in float aCluster;
in float aKind;
in vec4 aTarget;
uniform mat4 uView;
uniform mat4 uProj;
uniform float uHighlight[${SECTIONS}];
uniform float uPx;
uniform float uCollapse;
uniform vec3 uCore;
uniform float uDisperse;
uniform float uPhase;
uniform float uMorph;
uniform vec3 uAttract;
uniform float uAttractAmount;
uniform float uAttractCluster;
uniform float uDrift;
uniform float uDriftTime;
uniform float uStreak;
uniform float uArrive;
out float vGlow;
out float vFade;
out float vKind;

// 3D simplex noise, Ashima Arts and Stefan Gustavson (webgl-noise, MIT licence).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// A vector potential of three decorrelated noise fields. Its curl is
// divergence-free, so particles pushed along it swirl past each other instead of
// flying outward or clumping: the field opens like smoke rather than exploding.
vec3 potential(vec3 p) {
  return vec3(
    snoise(p + vec3(uPhase, 0.0, 0.0)),
    snoise(p + vec3(31.4, uPhase * 1.3, 7.1)),
    snoise(p + vec3(-17.9, 5.3, uPhase * 0.7))
  );
}

vec3 curl(vec3 p) {
  const float e = 0.08;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  vec3 x0 = potential(p - dx), x1 = potential(p + dx);
  vec3 y0 = potential(p - dy), y1 = potential(p + dy);
  vec3 z0 = potential(p - dz), z1 = potential(p + dz);
  return vec3(
    (y1.z - y0.z) - (z1.y - z0.y),
    (z1.x - z0.x) - (x1.z - x0.z),
    (x1.y - x0.y) - (y1.x - y0.x)
  ) / (2.0 * e);
}

void main() {
  // Each particle keeps its own pace, so the field tightens or opens gradually
  // instead of moving as one solid.
  float lag = fract(sin(float(gl_VertexID) * 12.9898) * 43758.5453);

  vec3 pos = aPos;
  // Between chapters the field is advected two steps along the curl field.
  if (uDisperse > 0.0005) {
    float k = uDisperse * (0.55 + lag * 0.9);
    vec3 mid = pos + curl(pos * 0.9) * 0.22 * k;
    pos += curl(mid * 0.9) * 0.44 * k;
  }

  // Idle drift: a slow wander along the same curl field, only while the reader is idle.
  if (uDrift > 0.0005) {
    pos += curl(pos * 0.6 + vec3(uDriftTime * 0.05)) * 0.035 * uDrift;
  }

  // Dot morphs: particles with a target blend to it, each at its own pace.
  if (uMorph > 0.0005 && aTarget.w > 0.5) {
    float m = clamp(uMorph * (1.0 + lag * 0.5) - lag * 0.25, 0.0, 1.0);
    pos = mix(pos, aTarget.xyz, m * m * (3.0 - 2.0 * m));
  }

  // Condense: one section's particles gather toward the element they become.
  // Capped at 1,200 by the lag threshold; the field has fewer particles than
  // that today, so every particle of the section may take part.
  float attracted = 0.0;
  if (uAttractAmount > 0.0005 && abs(aCluster - uAttractCluster) < 0.5) {
    float a = clamp(uAttractAmount * (1.0 + lag * 0.8) - lag * 0.4, 0.0, 1.0);
    attracted = a;
    vec3 bend = curl(pos * 0.9 + vec3(uPhase)) * 0.25 * (1.0 - a);
    pos = mix(pos, uAttract + bend, a * a * (3.0 - 2.0 * a));
  }

  // The finale gathers the field into one point.
  float pull = clamp(uCollapse * (1.0 + lag * 0.6) - lag * 0.3, 0.0, 1.0);
  pos = mix(pos, uCore, pull * pull * (3.0 - 2.0 * pull));

  vec4 viewPos = uView * vec4(pos, 1.0);
  // On first load the field arrives out of the far plane, each particle at its own pace.
  if (uArrive < 0.9995) {
    float r = clamp(uArrive * (1.0 + lag * 0.7) - lag * 0.35, 0.0, 1.0);
    viewPos.z -= (1.0 - r * r * (3.0 - 2.0 * r)) * 9.0;
  }
  gl_Position = uProj * viewPos;
  float dist = max(-viewPos.z, 0.001);
  float h = uHighlight[int(aCluster)];
  float base = aKind < 0.5 ? 8.0 : 3.4;
  // Capped near the lens: uncapped, a particle at 0.8 units grew to a 100px disc
  // and the dive read as out-of-focus dust rather than motion through the field.
  gl_PointSize = min(base * uPx * (1.0 + h * 0.9) / dist, uPx * 3.2) * (1.0 + uStreak * 1.6);
  vGlow = max(max(h, pull), attracted * 0.6);
  // Depth reads as volume: particles fade on a curve toward the far plane rather
  // than holding full strength and then clipping, and anything about to pass the
  // lens fades out instead of filling the screen.
  float fog = 1.0 - smoothstep(3.5, 13.0, dist);
  vFade = mix(0.14, 1.0, fog) * smoothstep(0.25, 1.3, dist);
  vKind = aKind;
}`;

const FRAG = `#version 300 es
precision mediump float;
in float vGlow;
in float vFade;
in float vKind;
uniform vec3 uInk;
uniform vec3 uVoltage;
uniform vec3 uTint;
uniform float uDim;
// Shared with the vertex shader, so its precision must match there (highp).
uniform highp float uStreak;
out vec4 outColor;
void main() {
  // At speed a particle becomes a short streak along the scroll axis: the point
  // sprite grows and the disc is compressed across it.
  vec2 pc = gl_PointCoord - 0.5;
  float d = length(vec2(pc.x * (1.0 + uStreak * 1.6), pc.y));
  float disc = smoothstep(0.5, 0.34, d);
  if (disc <= 0.002) discard;
  vec3 col = mix(uInk * uTint, uVoltage, vGlow);
  float a = disc * vFade * (vKind < 0.5 ? 0.95 : 0.68) * (0.62 + 0.38 * vGlow) * uDim;
  outColor = vec4(col * a, a);
}`;

/*
 * The seam post pass. Only built and only used while a seam is running: the
 * points render into a texture and one full-screen triangle samples it with a
 * 0.6px chromatic split and a 0.04 barrel warp. Inside chapters the points draw
 * straight to the canvas and this costs nothing (plan 3.7).
 */
const POST_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const POST_FRAG = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uSeam;
out vec4 outColor;
void main() {
  vec2 c = vUv - 0.5;
  vec2 uv = vUv + c * dot(c, c) * 0.04 * uSeam;
  vec2 split = normalize(c + 1e-5) * uTexel * 0.6 * uSeam;
  vec4 g = texture(uScene, uv);
  float r = texture(uScene, uv + split).r;
  float b = texture(uScene, uv - split).b;
  outColor = vec4(r, g.g, b, g.a);
}`;

function shader(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

function perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
}

function lookAt(out: Float32Array, e: Vec3, t: Vec3) {
  let zx = e[0] - t[0];
  let zy = e[1] - t[1];
  let zz = e[2] - t[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  // x = up(0,1,0) × z
  let xx = zz;
  let xz = -zx;
  const xl = Math.hypot(xx, xz) || 1;
  xx /= xl;
  xz /= xl;
  const xy = 0;
  // y = z × x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
  out[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
  out[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
  out[15] = 1;
}

export function createCloud(
  canvas: HTMLCanvasElement,
  data: CloudData,
  colors: { ink: RGB; voltage: RGB },
  options: { watchdog?: boolean; arrive?: boolean } = {},
): Cloud | null {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return null;

  const link = (vert: string, frag: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vert));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    return p;
  };
  let program: WebGLProgram;
  try {
    program = link(VERT, FRAG);
  } catch (err) {
    console.warn("corpus cloud unavailable:", err);
    return null;
  }
  // The post pass is optional: if it fails to compile the seam simply has no warp.
  let post: WebGLProgram | null = null;
  try {
    post = link(POST_VERT, POST_FRAG);
  } catch {
    post = null;
  }

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const attrs: [string, Float32Array, number][] = [
    ["aPos", data.positions, 3],
    ["aCluster", data.clusters, 1],
    ["aKind", data.kinds, 1],
  ];
  const buffers = attrs.map(([name, array, size]) => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  });
  // Morph targets: xyz plus a flag in w. Empty until a morph is set.
  const targetData = new Float32Array(data.count * 4);
  const targetBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, targetData, gl.DYNAMIC_DRAW);
  const targetLoc = gl.getAttribLocation(program, "aTarget");
  gl.enableVertexAttribArray(targetLoc);
  gl.vertexAttribPointer(targetLoc, 4, gl.FLOAT, false, 0, 0);
  buffers.push(targetBuffer);

  const u = {
    view: gl.getUniformLocation(program, "uView"),
    proj: gl.getUniformLocation(program, "uProj"),
    highlight: gl.getUniformLocation(program, "uHighlight"),
    px: gl.getUniformLocation(program, "uPx"),
    ink: gl.getUniformLocation(program, "uInk"),
    voltage: gl.getUniformLocation(program, "uVoltage"),
    collapse: gl.getUniformLocation(program, "uCollapse"),
    core: gl.getUniformLocation(program, "uCore"),
    disperse: gl.getUniformLocation(program, "uDisperse"),
    phase: gl.getUniformLocation(program, "uPhase"),
    dim: gl.getUniformLocation(program, "uDim"),
    tint: gl.getUniformLocation(program, "uTint"),
    streak: gl.getUniformLocation(program, "uStreak"),
    morph: gl.getUniformLocation(program, "uMorph"),
    attract: gl.getUniformLocation(program, "uAttract"),
    attractAmount: gl.getUniformLocation(program, "uAttractAmount"),
    attractCluster: gl.getUniformLocation(program, "uAttractCluster"),
    drift: gl.getUniformLocation(program, "uDrift"),
    driftTime: gl.getUniformLocation(program, "uDriftTime"),
    arrive: gl.getUniformLocation(program, "uArrive"),
  };
  const pu = post
    ? {
        scene: gl.getUniformLocation(post, "uScene"),
        texel: gl.getUniformLocation(post, "uTexel"),
        seam: gl.getUniformLocation(post, "uSeam"),
      }
    : null;
  let fbo: WebGLFramebuffer | null = null;
  let fboTexture: WebGLTexture | null = null;
  let fboSize = [0, 0];
  const postVao = gl.createVertexArray()!;

  const view = new Float32Array(16);
  const proj = new Float32Array(16);
  // The pose drawn, the pose asked for, and the velocity of each value between
  // them. Only a damped request lets the two differ.
  const pose = new Float64Array([0, 0, 6.5, 0, 0, 0, 40]);
  const goal = Float64Array.from(pose);
  const velocity = new Float64Array(7);
  let settling = false;
  let lastStep = 0;
  const field: FieldState = { disperse: 0, phase: 0, dim: 1 };
  let pointer: [number, number] = [0, 0];
  let collapse = 0;
  let core: Vec3 = [0, 0, 0];
  let tint: RGB = [1, 1, 1];
  let streak = 0;
  let morph = 0;
  let attract: Vec3 = [0, 0, 0];
  let attractAmount = 0;
  let attractCluster = -1;
  let seam = 0;
  let drift = 0;
  let driftTimer = 0;
  /** Far-plane arrival (F-003): 600ms from the first frame, skipped for captures. */
  const ARRIVE_MS = 600;
  let arriveStart = options.arrive === false ? -1 : 0;
  let arrive = options.arrive === false ? 1 : 0;

  const glow = new Float32Array(SECTIONS);
  const glowFrom = new Float32Array(SECTIONS);
  const glowTo = new Float32Array(SECTIONS);
  let tweenStart = 0;
  let tweenDuration = 0;

  const stats = { draws: 0, lost: false, frozen: false, p95: null as number | null };
  // Frame intervals while the field is drawing continuously. If a machine cannot
  // hold the field at 50 frames a second, the field stops redrawing rather than
  // taking the rest of the page's frames down with it.
  const intervals: number[] = [];
  let lastRender = 0;
  const frameListeners = new Set<() => void>();
  let scheduled = false;
  let dpr = 1;
  // A renderer torn down with a frame still queued (a remount on the same canvas
  // shares its context) must not draw with programs it has already deleted.
  let destroyed = false;

  function effectiveEye(): Vec3 {
    return [pose[0] + pointer[0] * 0.35, pose[1] - pointer[1] * 0.22, pose[2]];
  }

  function updateMatrices() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    perspective(proj, (pose[6] * Math.PI) / 180, w / h, 0.05, 80);
    lookAt(view, effectiveEye(), [pose[3], pose[4], pose[5]]);
  }

  /** Critically damped: the fastest approach to the goal that never overshoots it. */
  const OMEGA = 7.5;
  function stepCamera(now: number) {
    if (!settling) return;
    const dt = Math.min(Math.max((now - lastStep) / 1000, 0), 1 / 30);
    lastStep = now;
    let moving = false;
    for (let i = 0; i < 7; i++) {
      const offset = pose[i] - goal[i];
      velocity[i] += (-2 * OMEGA * velocity[i] - OMEGA * OMEGA * offset) * dt;
      pose[i] += velocity[i] * dt;
      if (Math.abs(pose[i] - goal[i]) > 1e-4 || Math.abs(velocity[i]) > 1e-3) moving = true;
    }
    if (moving) {
      invalidate();
    } else {
      pose.set(goal);
      velocity.fill(0);
      settling = false;
    }
  }

  function watch(now: number) {
    // Idle drift draws on a 33ms timer by design, and the arrival runs while the
    // page is still hydrating; neither is the steady cost the guard measures.
    if (!options.watchdog || stats.frozen || drift > 0.0005 || arrive < 1) {
      lastRender = now;
      return;
    }
    const gap = now - lastRender;
    lastRender = now;
    if (gap <= 0 || gap > 100) return;
    intervals.push(gap);
    if (intervals.length < 45) return;
    const sorted = [...intervals].sort((a, b) => a - b);
    stats.p95 = sorted[Math.floor(sorted.length * 0.95)];
    intervals.length = 0;
    if (stats.p95 > 20) {
      stats.frozen = true;
      canvas.dataset.frozen = "true";
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function render(now: number) {
    scheduled = false;
    if (stats.lost || destroyed) return;
    watch(now);
    resize();
    stepCamera(now);

    if (tweenDuration > 0) {
      const t = Math.min((now - tweenStart) / tweenDuration, 1);
      const e = 1 - Math.pow(1 - t, 3);
      for (let i = 0; i < SECTIONS; i++) glow[i] = glowFrom[i] + (glowTo[i] - glowFrom[i]) * e;
      if (t < 1) invalidate();
      else tweenDuration = 0;
    }

    if (arrive < 1) {
      if (arriveStart === 0) arriveStart = now;
      arrive = Math.min((now - arriveStart) / ARRIVE_MS, 1);
      if (arrive < 1) invalidate();
    }

    updateMatrices();
    const usePost = post !== null && seam > 0.001;
    if (usePost) {
      if (!fbo || fboSize[0] !== canvas.width || fboSize[1] !== canvas.height) {
        if (fboTexture) gl!.deleteTexture(fboTexture);
        if (fbo) gl!.deleteFramebuffer(fbo);
        fboTexture = gl!.createTexture();
        gl!.bindTexture(gl!.TEXTURE_2D, fboTexture);
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, canvas.width, canvas.height, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
        gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
        fbo = gl!.createFramebuffer();
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
        gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, fboTexture, 0);
        fboSize = [canvas.width, canvas.height];
      }
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    } else {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    }
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE);
    gl!.useProgram(program);
    gl!.uniformMatrix4fv(u.view, false, view);
    gl!.uniformMatrix4fv(u.proj, false, proj);
    gl!.uniform1fv(u.highlight, glow);
    gl!.uniform1f(u.px, dpr * (canvas.clientHeight / 900) * 10);
    gl!.uniform3fv(u.ink, colors.ink);
    gl!.uniform3fv(u.voltage, colors.voltage);
    gl!.uniform1f(u.collapse, collapse);
    gl!.uniform3fv(u.core, core);
    gl!.uniform1f(u.disperse, field.disperse);
    gl!.uniform1f(u.phase, field.phase);
    gl!.uniform1f(u.dim, field.dim);
    gl!.uniform3fv(u.tint, tint);
    gl!.uniform1f(u.streak, streak);
    gl!.uniform1f(u.morph, morph);
    gl!.uniform3fv(u.attract, attract);
    gl!.uniform1f(u.attractAmount, attractAmount);
    gl!.uniform1f(u.attractCluster, attractCluster);
    gl!.uniform1f(u.drift, drift);
    gl!.uniform1f(u.driftTime, now / 1000);
    gl!.uniform1f(u.arrive, arrive);
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.POINTS, 0, data.count);
    if (usePost && pu) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, canvas.width, canvas.height);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.disable(gl!.BLEND);
      gl!.useProgram(post);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, fboTexture);
      gl!.uniform1i(pu.scene, 0);
      gl!.uniform2f(pu.texel, 1 / canvas.width, 1 / canvas.height);
      gl!.uniform1f(pu.seam, seam);
      gl!.bindVertexArray(postVao);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }
    stats.draws++;
    if (drift > 0.0005 && !driftTimer) {
      // Idle drift draws at about 30 frames a second, never continuously at 60.
      driftTimer = window.setTimeout(() => {
        driftTimer = 0;
        invalidate();
      }, 33);
    }
    frameListeners.forEach((cb) => cb());
  }

  function invalidate() {
    if (destroyed || scheduled || stats.lost || stats.frozen || document.visibilityState === "hidden") return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  const resizeObserver = new ResizeObserver(() => invalidate());
  resizeObserver.observe(canvas);

  const onLost = (e: Event) => {
    e.preventDefault();
    stats.lost = true;
    canvas.dataset.lost = "true";
  };
  canvas.addEventListener("webglcontextlost", onLost);

  invalidate();

  return {
    stats,
    invalidate,
    setCamera(nextEye, nextTarget, nextFov, cameraOptions) {
      const next = [...nextEye, ...nextTarget, nextFov ?? goal[6]];
      // Scrub smoothing keeps reporting the settled value; that is not a change.
      if (next.every((v, i) => v === goal[i])) return;
      goal.set(next);
      if (cameraOptions?.damp) {
        if (!settling) {
          settling = true;
          lastStep = performance.now();
        }
      } else {
        pose.set(goal);
        velocity.fill(0);
        settling = false;
      }
      invalidate();
    },
    setField(next) {
      let changed = false;
      for (const key of ["disperse", "phase", "dim"] as const) {
        const value = next[key];
        if (value !== undefined && value !== field[key]) {
          field[key] = value;
          changed = true;
        }
      }
      if (changed) invalidate();
    },
    setTint(rgb) {
      if (rgb.every((v, i) => Math.abs(v - tint[i]) < 1e-4)) return;
      tint = rgb;
      invalidate();
    },
    setStreak(amount) {
      const v = Math.min(Math.max(amount, 0), 1);
      if (Math.abs(v - streak) < 1e-3) return;
      streak = v;
      invalidate();
    },
    setMorph(targets, amount) {
      if (targets) {
        targetData.fill(0);
        const n = Math.min(Math.floor(targets.length / 3), data.count);
        for (let i = 0; i < n; i++) {
          targetData[i * 4] = targets[i * 3];
          targetData[i * 4 + 1] = targets[i * 3 + 1];
          targetData[i * 4 + 2] = targets[i * 3 + 2];
          targetData[i * 4 + 3] = 1;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, targetBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, targetData);
      }
      morph = Math.min(Math.max(amount, 0), 1);
      invalidate();
    },
    setAttract(section, point, amount) {
      attractCluster = section;
      attract = point;
      attractAmount = Math.min(Math.max(amount, 0), 1);
      invalidate();
    },
    setSeam(fx) {
      const v = Math.min(Math.max(fx.amount, 0), 1);
      if (Math.abs(v - seam) < 1e-3) return;
      seam = v;
      invalidate();
    },
    setDrift(amount) {
      const v = Math.min(Math.max(amount, 0), 1);
      if (v === drift) return;
      drift = v;
      invalidate();
    },
    unproject(x, y, depth) {
      updateMatrices();
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const ndcX = (x / w) * 2 - 1;
      const ndcY = 1 - (y / h) * 2;
      // View space at the requested depth, then back through the (orthonormal) view matrix.
      const vx = (ndcX * depth) / proj[0];
      const vy = (ndcY * depth) / proj[5];
      const vz = -depth;
      const tx = vx - view[12];
      const ty = vy - view[13];
      const tz = vz - view[14];
      return [
        view[0] * tx + view[1] * ty + view[2] * tz,
        view[4] * tx + view[5] * ty + view[6] * tz,
        view[8] * tx + view[9] * ty + view[10] * tz,
      ];
    },
    setPointer(x, y) {
      if (x === pointer[0] && y === pointer[1]) return;
      pointer = [x, y];
      invalidate();
    },
    highlight(values, duration = 700) {
      glowFrom.set(glow);
      for (let i = 0; i < SECTIONS; i++) glowTo[i] = values[i] ?? 0;
      if (duration <= 0) {
        glow.set(glowTo);
        tweenDuration = 0;
      } else {
        tweenStart = performance.now();
        tweenDuration = duration;
      }
      invalidate();
    },
    project(p) {
      updateMatrices();
      const vx = view[0] * p[0] + view[4] * p[1] + view[8] * p[2] + view[12];
      const vy = view[1] * p[0] + view[5] * p[1] + view[9] * p[2] + view[13];
      const vz = view[2] * p[0] + view[6] * p[1] + view[10] * p[2] + view[14];
      const cx = proj[0] * vx;
      const cy = proj[5] * vy;
      const cw = -vz;
      if (cw <= 0.05) return { x: 0, y: 0, visible: false, depth: cw };
      return {
        x: ((cx / cw) * 0.5 + 0.5) * canvas.clientWidth,
        y: (1 - ((cy / cw) * 0.5 + 0.5)) * canvas.clientHeight,
        visible: true,
        depth: cw,
      };
    },
    setCollapse(nextCore, amount) {
      const value = Math.min(Math.max(amount, 0), 1);
      if (value === collapse && nextCore.every((v, i) => v === core[i])) return;
      collapse = value;
      core = nextCore;
      invalidate();
    },
    onFrame(cb) {
      frameListeners.add(cb);
      return () => frameListeners.delete(cb);
    },
    destroy() {
      destroyed = true;
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      frameListeners.clear();
      window.clearTimeout(driftTimer);
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(postVao);
      if (fbo) gl.deleteFramebuffer(fbo);
      if (fboTexture) gl.deleteTexture(fboTexture);
      gl.deleteProgram(program);
      if (post) gl.deleteProgram(post);
    },
  };
}
