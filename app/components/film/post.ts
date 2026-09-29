import * as THREE from "three";

/**
 * The film's last pass. The scene renders into a linear half-float target with
 * 4x multisampling and a black clear; this pass turns it into the pixels on
 * screen.
 *
 * Black lock: final = ground + (1 - ground) * T(c), in linear light, with a
 * tone curve where T(0) = 0. Wherever the scene is empty the screen shows the
 * page ground exactly, so a panel painted in --paper meets the film with no
 * seam, and nothing the scene does (fog, exposure, falloff) can lift or sink
 * that black. The curve is the Khronos PBR Neutral one, which is linear
 * through the shadows and keeps hues where they were authored.
 *
 * Edge falloff takes 7% off the signal at the corners, never the ground.
 * Grain is a fixed pattern at 3% of the signal, so it breaks up 8-bit banding
 * in the dark fog gradients and is exactly zero where the frame is ground.
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
uniform sampler2D tScene;
uniform vec3 uGround;
uniform vec2 uSize;
uniform float uDpr;
uniform vec4 uRects[${SCRIM_MAX}];
uniform int uRectCount;
in vec2 vUv;
out vec4 outColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Khronos PBR Neutral tone mapping. T(0) = 0.
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec3 t = neutral(max(texture(tScene, vUv).rgb, 0.0));

  vec2 q = (vUv - 0.5) * 2.0;
  t *= 1.0 - ${FALLOFF.toFixed(2)} * 0.5 * dot(q, q);
  t *= 1.0 + ${GRAIN.toFixed(2)} * (hash(floor(gl_FragCoord.xy)) - 0.5) * 2.0;

  vec3 c = uGround + (1.0 - uGround) * clamp(t, 0.0, 1.0);

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
  /** The target the scene renders into. */
  target: THREE.WebGLRenderTarget;
  /** Drawing-buffer size in device pixels, and the pixel ratio. */
  resize(width: number, height: number, dpr: number): void;
  /** Scrim rects in viewport CSS px: left, top, right, bottom. */
  setRects(rects: Float32Array, count: number): void;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
};

export function createPost(ground: THREE.Color): Post {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
  const rects = Array.from({ length: SCRIM_MAX }, () => new THREE.Vector4());
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      tScene: { value: target.texture },
      // THREE.Color holds linear values; the lock works in linear light.
      uGround: { value: new THREE.Vector3(ground.r, ground.g, ground.b) },
      uSize: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uRects: { value: rects },
      uRectCount: { value: 0 },
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

  return {
    target,
    resize(width, height, dpr) {
      target.setSize(width, height);
      material.uniforms.uSize.value.set(width, height);
      material.uniforms.uDpr.value = dpr;
    },
    setRects(values, count) {
      for (let i = 0; i < count; i++) rects[i].set(values[i * 4], values[i * 4 + 1], values[i * 4 + 2], values[i * 4 + 3]);
      material.uniforms.uRectCount.value = count;
    },
    render(renderer) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    dispose() {
      target.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
