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

export const SCRIM_MAX = 12;
const SCRIM_CAP = 0.02;
const SCRIM_FEATHER = 24;
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
uniform sampler2D tClip;
uniform float uClip;
uniform vec2 uClipFit;
// One source texel of each clip, for the sharpen.
uniform vec2 uTexelA;
uniform vec2 uTexelB;
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

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// One clip sample: cover-fit, zoom, drift, contrast-adaptive sharpening (the
// footage is upscaled to fill the screen, so detail is restored where the
// local contrast is low and left alone at hard edges, which never ring). No
// motion blur: it softened the picture exactly while it moved (D49).
vec3 clipTap(sampler2D t, vec2 fit, float zoom, vec2 drift, vec2 texel) {
  vec2 d = (vUv - 0.5) * fit * zoom;
  vec2 uv = clamp(d + 0.5 + drift, 0.001, 0.999);
  vec3 c = texture(t, uv).rgb;
  vec3 n = texture(t, uv + vec2(0.0, texel.y)).rgb;
  vec3 s = texture(t, uv - vec2(0.0, texel.y)).rgb;
  vec3 e = texture(t, uv + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture(t, uv - vec2(texel.x, 0.0)).rgb;
  vec3 lo = min(c, min(min(n, s), min(e, w)));
  vec3 hi = max(c, max(max(n, s), max(e, w)));
  vec3 amp = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, 1e-4), 0.0, 1.0));
  vec3 k = -amp / 5.0;
  return clamp((c + k * (n + s + e + w)) / (1.0 + 4.0 * k), 0.0, 1.0);
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
    vec3 v = clipTap(tClip, uClipFit, 0.99 * (1.0 - uPush * m), drift, uTexelA) * uGain.x;
    if (m > 0.0) v = mix(v, clipTap(tClipB, uClipBFit, 0.99 + (0.01 + uPush * 0.5) * (1.0 - m), drift, uTexelB) * uGain.y, m);
    // Highlight shoulder (D51): brightness above 0.6 rolls off toward 0.9, so a
    // sky or a lit wall never flashes white in a dark film; shadows untouched.
    float l = dot(v, LUMA);
    if (l > 0.6) v *= (0.6 + 0.3 * (1.0 - exp(-(l - 0.6) * 2.5))) / l;
    v = uGround + (v - uGround) * fall * grain;
    c = mix(c, v, uClip);
  }

  // Distance in CSS px from this pixel to the nearest scrim rect.
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uDpr;
  float inside = 0.0;
  for (int i = 0; i < ${SCRIM_MAX}; i++) {
    if (i >= uRectCount) break;
    vec4 r = uRects[i];
    vec2 d = max(max(r.xy - px, px - r.zw), 0.0);
    inside = max(inside, 1.0 - smoothstep(0.0, ${SCRIM_FEATHER.toFixed(1)}, length(d)));
  }
  if (inside > 0.0) {
    float lg = dot(uGround, LUMA);
    float l = dot(c, LUMA);
    if (l > ${SCRIM_CAP}) {
      vec3 capped = uGround + (c - uGround) * (${SCRIM_CAP} - lg) / (l - lg);
      c = mix(c, capped, inside);
    }
  }

  outColor = vec4(encode(c), 1.0);
}`;

export type Post = {
  /** Drawing-buffer size in device pixels, and the pixel ratio. */
  resize(width: number, height: number, dpr: number): void;
  /** The clip on screen, or null, and its opacity. */
  setClip(texture: THREE.Texture | null, opacity: number): void;
  /** The clip dissolving in over the current one, and how far (0 to 1). */
  setClipB(texture: THREE.Texture | null, mix: number): void;
  /** Exposure gains of the two clip layers. */
  setGains(gainA: number, gainB: number): void;
  /** Dissolve push: 0.03, or 0 under reduced motion. */
  setPush(push: number): void;
  /** The fluid's velocity field, or null to switch it off. */
  setFlow(texture: THREE.Texture | null): void;
  /** Scrim rects in viewport CSS px: left, top, right, bottom. */
  setRects(rects: Float32Array, count: number): void;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
};

/** Cover-fit: the uv scale that crops whichever axis the screen is narrower in. */
function cover(fit: THREE.Vector2, size: THREE.Vector2, texture: THREE.Texture, texel: THREE.Vector2) {
  const v = texture.image as { videoWidth?: number; videoHeight?: number };
  texel.set(1 / (v.videoWidth || 1920), 1 / (v.videoHeight || 1080));
  const sa = size.x / Math.max(1, size.y);
  const ia = (v.videoWidth || 16) / (v.videoHeight || 9);
  fit.set(sa > ia ? 1 : sa / ia, sa > ia ? ia / sa : 1);
}

const hasFrame = (t: THREE.Texture | null) => !!(t && (t.image as { videoWidth?: number } | undefined)?.videoWidth);

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
      tClip: { value: null as THREE.Texture | null },
      uClip: { value: 0 },
      uClipFit: { value: new THREE.Vector2(1, 1) },
      uTexelA: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
      uTexelB: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
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
