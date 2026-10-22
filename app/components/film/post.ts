import * as THREE from "three";

/**
 * The film's only pass: the scroll-scrubbed footage (D38 to D44), drawn
 * straight to the screen over the page ground.
 *
 * Black lock: wherever no clip is drawn the screen shows the page ground
 * exactly, so a panel painted in --paper meets the film with no seam.
 *
 * Edge falloff takes 7% off the signal at the corners, never the ground.
 * Grain is a fixed pattern at 3% of the signal, so it breaks up 8-bit banding
 * in the dark gradients and is exactly zero where the frame is ground.
 *
 * Footage sits in a 1 percent overscan and flows along a small fluid the
 * pointer stirs (fluid.ts). A join
 * dissolves into the next clip with both pushing forward, and each clip
 * carries an exposure gain so a join never jumps in brightness.
 *
 * Scrim: under text that sits straight on the film (the hero, transit
 * captions) the output luminance is capped at 0.02, feathered over 24 px, so
 * that text keeps its contrast whatever passes behind it.
 */

export const SCRIM_MAX = 24;
/** Exposure under the text column: low enough that full ink clears 7:1 over the brightest frame. */
const VEIL_K = 0.62;
/** Highest footage luminance (linear) left behind a text block. */
const TEXT_CAP = 0.1;
const FALLOFF = 0.07;
const GRAIN = 0.03;

const vertex = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
uniform vec3 uGround;
uniform vec2 uSize;
uniform float uDpr;
uniform vec4 uRects[${SCRIM_MAX}];
uniform int uRectCount;
uniform float uVeil;
uniform sampler2D tClip;
uniform float uClip;
uniform vec2 uClipFit;
// One source texel of each clip, for the sharpen.
uniform vec2 uTexelA;
uniform vec2 uTexelB;
// The stored frame after the one in tClip and how far the scroll is between
// them: footage is kept at its real 24 fps and blended here every refresh.
uniform sampler2D tClipN;
uniform float uClipN;
// The clip's flow atlas: xy = columns and rows of cells, zw = this pair's
// cell (column, row counted from the bottom); uFlowSize = one cell in texels.
uniform sampler2D tFlowA;
uniform vec4 uFlowCell;
uniform vec2 uFlowSize;
uniform float uFlowOn;
uniform sampler2D tClipB;
uniform float uClipB;
uniform vec2 uClipBFit;
uniform vec2 uGain;
// How far a dissolve pushes in: 0.03, or 0 under reduced motion.
uniform float uPush;
// The fluid's velocity (fluid.ts), cells a frame; the footage flows along it.
uniform sampler2D tFlow;
uniform float uFlow;
in vec2 vUv;
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The clips arrive as the sRGB bytes the video decoder wrote (engine.ts
// uploads them raw). Decoded here once, so the veil, gains and shoulder work
// in linear light and the one encode on the way out is exact. Encoding
// undecoded bytes lifted every shadow about tenfold: the dark half of every
// frame read as teal fog and its compression steps showed as blocks.
vec3 decode(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// One clip sample: cover-fit, zoom, drift, contrast-adaptive sharpening (the
// footage is upscaled to fill the screen, so detail is restored where the
// local contrast is low and left alone at hard edges, which never ring). No
// motion blur: it softened the picture exactly while it moved (D49).
vec2 clipUv(vec2 fit, float zoom, vec2 drift) {
  return (vUv - 0.5) * fit * zoom + 0.5 + drift;
}

vec3 tapAt(sampler2D t, vec2 at, vec2 texel) {
  vec2 uv = clamp(at, 0.001, 0.999);
  vec3 c = texture(t, uv).rgb;
  vec3 n = texture(t, uv + vec2(0.0, texel.y)).rgb;
  vec3 s = texture(t, uv - vec2(0.0, texel.y)).rgb;
  vec3 e = texture(t, uv + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture(t, uv - vec2(texel.x, 0.0)).rgb;
  vec3 lo = min(c, min(min(n, s), min(e, w)));
  vec3 hi = max(c, max(max(n, s), max(e, w)));
  vec3 amp = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, 1e-4), 0.0, 1.0));
  vec3 k = -amp / 5.0;
  return decode(clamp((c + k * (n + s + e + w)) / (1.0 + 4.0 * k), 0.0, 1.0));
}

vec3 clipTap(sampler2D t, vec2 fit, float zoom, vec2 drift, vec2 texel) {
  return tapAt(t, clipUv(fit, zoom, drift), texel);
}

// Motion between the two stored frames at uv, in frame units, read from the
// clip's flow atlas (film-flow.py): one 64x36 cell per frame pair. The atlas
// and the frames are both uploaded flipped, so +y here is up the frame.
vec2 flowAt(vec2 uv) {
  vec2 cell = clamp(uv, 0.5 / uFlowSize, 1.0 - 0.5 / uFlowSize);
  vec2 at = (uFlowCell.zw + cell) / uFlowCell.xy;
  vec2 f = (texture(tFlowA, at).rg * 255.0 - 128.0) / 1024.0;
  return vec2(f.x, -f.y);
}

void main() {
  vec3 c = uGround;
  if (uClip > 0.0) {
    vec2 q = (vUv - 0.5) * 2.0;
    float fall = 1.0 - ${FALLOFF.toFixed(2)} * 0.5 * dot(q, q);
    float grain = 1.0 + ${GRAIN.toFixed(2)} * (hash(floor(gl_FragCoord.xy)) - 0.5) * 2.0;
    // The one displacement is the fluid the pointer stirs (D49): drift and
    // parallax did the same job and were cut.
    vec2 drift = uFlow > 0.0 ? -texture(tFlow, vUv).xy * 0.0016 * uFlow : vec2(0.0);
    float m = uClipB;
    // Both clips only ever push forward: the outgoing zooms in as it leaves,
    // the incoming arrives from a wider framing (D44).
    float za = 0.99 * (1.0 - uPush * m);
    vec2 at = clipUv(uClipFit, za, drift);
    vec3 v;
    if (uClipN > 0.0 && uFlowOn > 0.0) {
      // Both frames slide to where this point is between them, then mix: the
      // in-between position, not a double exposure of two.
      vec2 f = flowAt(at);
      v = mix(tapAt(tClip, at - f * uClipN, uTexelA), tapAt(tClipN, at + f * (1.0 - uClipN), uTexelA), uClipN);
    } else {
      v = tapAt(tClip, at, uTexelA);
      if (uClipN > 0.0) v = mix(v, tapAt(tClipN, at, uTexelA), uClipN);
    }
    v *= uGain.x;
    if (m > 0.0) v = mix(v, clipTap(tClipB, uClipBFit, 0.99 + (0.01 + uPush * 0.5) * (1.0 - m), drift, uTexelB) * uGain.y, m);
    // Highlight shoulder (D51): brightness above 0.6 rolls off toward 0.9, so a
    // sky or a lit wall never flashes white in a dark film; shadows untouched.
    float l = dot(v, LUMA);
    if (l > 0.6) v *= (0.6 + 0.3 * (1.0 - exp(-(l - 0.6) * 2.5))) / l;
    v = uGround + (v - uGround) * fall * grain;
    c = mix(c, v, uClip);
  }

  // The reading side is lit lower, like a stage, but only behind the text
  // blocks themselves: each block's box (engine.ts) multiplies the footage
  // down (an ND filter, so colour and contrast stay intact and nothing turns
  // to grey fog), feathered 56 px above and below and ramping back to full
  // exposure past the block's right edge. Gaps between blocks, and a closed
  // fold's unused space, keep the film at full exposure.
  if (uVeil > 0.0 && uRectCount > 0) {
    float x = gl_FragCoord.x / uDpr;
    float y = (uSize.y - gl_FragCoord.y) / uDpr;
    float m = 0.0;
    for (int i = 0; i < ${SCRIM_MAX}; i++) {
      if (i >= uRectCount) break;
      vec4 r = uRects[i];
      float vy = smoothstep(r.y - 56.0, r.y + 8.0, y) * (1.0 - smoothstep(r.w - 8.0, r.w + 56.0, y));
      float vx = smoothstep(r.x - 120.0, r.x, x) * (1.0 - smoothstep(r.z - 40.0, r.z + 260.0, x));
      m = max(m, vx * vy);
    }
    // Highlights are lowered more than shadows (a soft shoulder on luminance),
    // so a lit copper plate or a white lamp behind a paragraph drops to the
    // level of the rest of the frame while the dark detail keeps its depth.
    float lv = dot(c, LUMA);
    c = uGround + (c - uGround) * mix(1.0, ${VEIL_K.toFixed(3)} / (1.0 + 3.0 * lv), m * uVeil);
    // Readable by construction: behind a block no pixel stays above 0.10
    // relative luminance, so white text holds at least about 6:1 over any
    // footage (a lit copper plate measured near 2:1 with the shoulder alone).
    float lc = dot(c, LUMA);
    c *= mix(1.0, min(1.0, ${TEXT_CAP.toFixed(3)} / max(lc, 1e-4)), m * uVeil);
  }

  outColor = vec4(encode(c), 1.0);
}`;

export type Post = {
  /** Drawing-buffer size in device pixels, and the pixel ratio. */
  resize(width: number, height: number, dpr: number): void;
  /** The clip on screen, or null, and its opacity. */
  setClip(texture: THREE.Texture | null, opacity: number): void;
  /** The next stored frame of the current clip and the blend toward it (0 to 1). */
  setNext(texture: THREE.Texture | null, mix: number): void;
  /** The clip's flow atlas and the cell of the frame pair on screen, or null for a plain blend. */
  setFlow2(atlas: THREE.Texture | null, pair: number, cellW: number, cellH: number): void;
  /** The clip dissolving in over the current one, and how far (0 to 1). */
  setClipB(texture: THREE.Texture | null, mix: number): void;
  /** Exposure gains of the two clip layers. */
  setGains(gainA: number, gainB: number): void;
  /** Dissolve push: 0.03, or 0 under reduced motion. */
  setPush(push: number): void;
  /** The fluid's velocity field, or null to switch it off. */
  setFlow(texture: THREE.Texture | null): void;
  /** Strength of the text veil, 0 to 1. */
  setVeil(v: number): void;
  /** Scrim rects in viewport CSS px: left, top, right, bottom. */
  setRects(rects: Float32Array, count: number): void;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
};

/** Cover-fit: the uv scale that crops whichever axis the screen is narrower in. */
// Clip frames are ImageBitmaps (ADR-003); a video element reports videoWidth.
const dims = (t: THREE.Texture) => {
  const v = t.image as { videoWidth?: number; videoHeight?: number; width?: number; height?: number } | undefined;
  return [v?.videoWidth || v?.width || 0, v?.videoHeight || v?.height || 0];
};

function cover(fit: THREE.Vector2, size: THREE.Vector2, texture: THREE.Texture, texel: THREE.Vector2) {
  const [w, h] = dims(texture);
  texel.set(1 / (w || 1920), 1 / (h || 1080));
  const sa = size.x / Math.max(1, size.y);
  const ia = (w || 16) / (h || 9);
  fit.set(sa > ia ? 1 : sa / ia, sa > ia ? ia / sa : 1);
}

const hasFrame = (t: THREE.Texture | null) => !!(t && dims(t)[0]);

export function createPost(ground: THREE.Color): Post {
  const rects = Array.from({ length: SCRIM_MAX }, () => new THREE.Vector4());
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      // THREE.Color holds linear values; the lock works in linear light.
      uGround: { value: new THREE.Vector3(ground.r, ground.g, ground.b) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uRects: { value: rects },
      uRectCount: { value: 0 },
      uVeil: { value: 0 },
      tClip: { value: null as THREE.Texture | null },
      uClip: { value: 0 },
      uClipFit: { value: new THREE.Vector2(1, 1) },
      uTexelA: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
      uTexelB: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
      tClipN: { value: null as THREE.Texture | null },
      uClipN: { value: 0 },
      tFlowA: { value: null as THREE.Texture | null },
      uFlowCell: { value: new THREE.Vector4(1, 1, 0, 0) },
      uFlowSize: { value: new THREE.Vector2(64, 36) },
      uFlowOn: { value: 0 },
      tClipB: { value: null as THREE.Texture | null },
      uClipB: { value: 0 },
      uClipBFit: { value: new THREE.Vector2(1, 1) },
      uGain: { value: new THREE.Vector2(1, 1) },
      uPush: { value: 0.03 },
      tFlow: { value: null as THREE.Texture | null },
      uFlow: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera();
  const u = material.uniforms;

  return {
    resize(width, height, dpr) {
      u.uSize.value.set(width, height);
      u.uDpr.value = dpr;
    },
    setClip(texture, opacity) {
      const on = hasFrame(texture) ? opacity : 0;
      u.tClip.value = on > 0 ? texture : null;
      u.uClip.value = on;
      if (on > 0) cover(u.uClipFit.value, u.uSize.value, texture!, u.uTexelA.value);
    },
    setNext(texture, mix) {
      const on = hasFrame(texture) && mix > 0.002 ? mix : 0;
      u.tClipN.value = on > 0 ? texture : null;
      u.uClipN.value = on;
    },
    setFlow2(atlas, pair, cellW, cellH) {
      const img = atlas?.image as { width?: number; height?: number } | undefined;
      if (!atlas || !img?.width || !img.height || pair < 0) {
        u.uFlowOn.value = 0;
        u.tFlowA.value = null;
        return;
      }
      const cols = Math.round(img.width / cellW);
      const rows = Math.round(img.height / cellH);
      const row = Math.floor(pair / cols);
      if (row >= rows) {
        u.uFlowOn.value = 0;
        return;
      }
      u.tFlowA.value = atlas;
      u.uFlowCell.value.set(cols, rows, pair % cols, rows - 1 - row);
      u.uFlowSize.value.set(cellW, cellH);
      u.uFlowOn.value = 1;
    },
    setClipB(texture, mix) {
      const on = hasFrame(texture) ? mix : 0;
      u.tClipB.value = on > 0 ? texture : null;
      u.uClipB.value = on;
      if (on > 0) cover(u.uClipBFit.value, u.uSize.value, texture!, u.uTexelB.value);
    },
    setGains(gainA, gainB) {
      u.uGain.value.set(gainA, gainB);
    },
    setPush(push) {
      u.uPush.value = push;
    },
    setFlow(texture) {
      u.tFlow.value = texture;
      u.uFlow.value = texture ? 1 : 0;
    },
    setVeil(v) {
      u.uVeil.value = v;
    },
    setRects(values, count) {
      for (let i = 0; i < count; i++) rects[i].set(values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3]);
      u.uRectCount.value = count;
    },
    render(renderer) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      material.dispose();
      geometry.dispose();
    },
  };
}
