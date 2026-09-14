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

export type Cloud = {
  setCamera(eye: Vec3, target: Vec3, fov?: number, options?: CameraOptions): void;
  setField(state: Partial<FieldState>): void;
  setPointer(x: number, y: number): void;
  /** Per-section intensity 0..1, eased over `duration` ms. */
  highlight(values: number[], duration?: number): void;
  /** World point to viewport CSS pixels. */
  project(p: Vec3): { x: number; y: number; visible: boolean };
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
uniform mat4 uView;
uniform mat4 uProj;
uniform float uHighlight[${SECTIONS}];
uniform float uPx;
uniform float uCollapse;
uniform vec3 uCore;
uniform float uDisperse;
uniform float uPhase;
out float vGlow;
out float vFade;
out float vKind;

// A vector potential made of offset sine products. Its curl is divergence-free,
// so particles pushed along it swirl past each other instead of all flying
// outward or clumping: the field opens like smoke rather than exploding.
vec3 potential(vec3 p) {
  return vec3(
    sin(p.y * 1.3 + uPhase) * cos(p.z * 0.9 - uPhase),
    sin(p.z * 1.1 + uPhase * 1.3) * cos(p.x * 1.4),
    sin(p.x * 0.8 - uPhase * 0.7) * cos(p.y * 1.2 + uPhase)
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

  // The finale gathers the field into one point.
  float pull = clamp(uCollapse * (1.0 + lag * 0.6) - lag * 0.3, 0.0, 1.0);
  pos = mix(pos, uCore, pull * pull * (3.0 - 2.0 * pull));

  vec4 viewPos = uView * vec4(pos, 1.0);
  gl_Position = uProj * viewPos;
  float dist = max(-viewPos.z, 0.001);
  float h = uHighlight[int(aCluster)];
  float base = aKind < 0.5 ? 8.0 : 3.4;
  // Capped near the lens: uncapped, a particle at 0.8 units grew to a 100px disc
  // and the dive read as out-of-focus dust rather than motion through the field.
  gl_PointSize = min(base * uPx * (1.0 + h * 0.9) / dist, uPx * 3.2);
  vGlow = max(h, pull);
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
uniform float uDim;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.34, d);
  if (disc <= 0.002) discard;
  vec3 col = mix(uInk, uVoltage, vGlow);
  float a = disc * vFade * (vKind < 0.5 ? 0.95 : 0.68) * (0.62 + 0.38 * vGlow) * uDim;
  outColor = vec4(col * a, a);
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
  options: { watchdog?: boolean } = {},
): Cloud | null {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
  } catch (err) {
    console.warn("corpus cloud unavailable:", err);
    return null;
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
  };

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
    if (!options.watchdog || stats.frozen) return;
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
    if (stats.lost) return;
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

    updateMatrices();
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
    gl!.bindVertexArray(vao);
    gl!.drawArrays(gl!.POINTS, 0, data.count);
    stats.draws++;
    frameListeners.forEach((cb) => cb());
  }

  function invalidate() {
    if (scheduled || stats.lost || stats.frozen) return;
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
    setPointer(x, y) {
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
      if (cw <= 0.05) return { x: 0, y: 0, visible: false };
      return {
        x: ((cx / cw) * 0.5 + 0.5) * canvas.clientWidth,
        y: (1 - ((cy / cw) * 0.5 + 0.5)) * canvas.clientHeight,
        visible: true,
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
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      frameListeners.clear();
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
