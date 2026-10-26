import * as THREE from "three";

/**
 * A small incompressible fluid over the film (D47): stable fluids at 128 by 72.
 * Each frame the pointer's movement is splatted in as force, the velocity is
 * advected through itself, its curl is confined so eddies survive (D49), made divergence-free by a Jacobi pressure solve,
 * and fades. post.ts displaces the footage along the result, so the film
 * flows where the reader moves, like heat haze on glass, and settles when
 * they stop.
 */
const W = 128;
const H = 72;
const JACOBI = 14;

const vertex = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const head = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uTexel;
`;

const passes = {
  // Pointer force as a gaussian splat.
  splat: `${head}
uniform sampler2D tVel;
uniform vec2 uPoint;
uniform vec2 uForce;
uniform float uAspect;
void main() {
  vec2 d = vUv - uPoint;
  d.x *= uAspect;
  vec2 v = texture(tVel, vUv).xy + uForce * exp(-dot(d, d) / 0.0025);
  outColor = vec4(v, 0.0, 1.0);
}`,
  // Semi-Lagrangian advection with dissipation.
  advect: `${head}
uniform sampler2D tVel;
uniform float uDt;
uniform float uFade;
void main() {
  // Velocity is in cells a frame at 60 Hz.
  vec2 back = vUv - uDt * texture(tVel, vUv).xy * uTexel;
  outColor = vec4(texture(tVel, back).xy * uFade, 0.0, 1.0);
}`,
  curl: `${head}
uniform sampler2D tVel;
void main() {
  float l = texture(tVel, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(tVel, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(tVel, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(tVel, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}`,
  // Vorticity confinement: feeds curl back in where the solver would smooth
  // it away, so a stir leaves eddies rather than a smear.
  vorticity: `${head}
uniform sampler2D tVel;
uniform sampler2D tCurl;
uniform float uStrength;
uniform float uDt;
void main() {
  float l = abs(texture(tCurl, vUv - vec2(uTexel.x, 0.0)).x);
  float r = abs(texture(tCurl, vUv + vec2(uTexel.x, 0.0)).x);
  float b = abs(texture(tCurl, vUv - vec2(0.0, uTexel.y)).x);
  float t = abs(texture(tCurl, vUv + vec2(0.0, uTexel.y)).x);
  float c = texture(tCurl, vUv).x;
  vec2 n = vec2(r - l, t - b);
  n /= length(n) + 1e-5;
  vec2 force = uStrength * vec2(n.y, -n.x) * c;
  outColor = vec4(texture(tVel, vUv).xy + force * uDt, 0.0, 1.0);
}`,
  divergence: `${head}
uniform sampler2D tVel;
void main() {
  float l = texture(tVel, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(tVel, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(tVel, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(tVel, vUv + vec2(0.0, uTexel.y)).y;
  outColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}`,
  jacobi: `${head}
uniform sampler2D tPressure;
uniform sampler2D tDiv;
void main() {
  float l = texture(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(tPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(tPressure, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4((l + r + b + t - texture(tDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`,
  // Subtract the pressure gradient: what is left has no divergence.
  project: `${head}
uniform sampler2D tVel;
uniform sampler2D tPressure;
void main() {
  float l = texture(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(tPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(tPressure, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4(texture(tVel, vUv).xy - 0.5 * vec2(r - l, t - b), 0.0, 1.0);
}`,
};

export type Fluid = {
  /** Advances the fluid. Pointer in 0..1 uv (y up) and its move since the last frame in uv. */
  step(renderer: THREE.WebGLRenderer, dt: number, x: number, y: number, dx: number, dy: number, aspect: number): void;
  /** Debug: the largest speed in the field, in cells a frame. */
  peek(renderer: THREE.WebGLRenderer): number;
  /** The current velocity field, for post.ts. */
  readonly velocity: THREE.Texture;
  dispose(): void;
};

export function createFluid(): Fluid {
  const target = () => new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  let vel = target();
  let velNext = target();
  let pressure = target();
  let pressureNext = target();
  const div = target();
  const curl = target();
  const texel = new THREE.Vector2(1 / W, 1 / H);
  const make = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
    new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader, uniforms: { uTexel: { value: texel }, ...uniforms }, depthTest: false, depthWrite: false });
  const m = {
    splat: make(passes.splat, { tVel: { value: null }, uPoint: { value: new THREE.Vector2() }, uForce: { value: new THREE.Vector2() }, uAspect: { value: 1 } }),
    advect: make(passes.advect, { tVel: { value: null }, uDt: { value: 0 }, uFade: { value: 0.97 } }),
    curl: make(passes.curl, { tVel: { value: null } }),
    vorticity: make(passes.vorticity, { tVel: { value: null }, tCurl: { value: curl.texture }, uStrength: { value: 0.35 }, uDt: { value: 1 } }),
    divergence: make(passes.divergence, { tVel: { value: null } }),
    jacobi: make(passes.jacobi, { tPressure: { value: null }, tDiv: { value: div.texture } }),
    project: make(passes.project, { tVel: { value: null }, tPressure: { value: null } }),
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(geometry, m.splat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera();
  const run = (renderer: THREE.WebGLRenderer, material: THREE.RawShaderMaterial, out: THREE.WebGLRenderTarget) => {
    quad.material = material;
    renderer.setRenderTarget(out);
    renderer.render(scene, camera);
  };
  const swapVel = () => ([vel, velNext] = [velNext, vel]);

  return {
    get velocity() {
      return vel.texture;
    },
    step(renderer, dt, x, y, dx, dy, aspect) {
      m.splat.uniforms.tVel.value = vel.texture;
      m.splat.uniforms.uPoint.value.set(x, y);
      // Force in cells a frame: a fast flick stirs hard, a still pointer not at all.
      m.splat.uniforms.uForce.value.set(Math.max(-6, Math.min(6, dx * W * 4)), Math.max(-6, Math.min(6, dy * H * 4)));
      m.splat.uniforms.uAspect.value = aspect;
      run(renderer, m.splat, velNext);
      swapVel();
      m.advect.uniforms.tVel.value = vel.texture;
      m.advect.uniforms.uDt.value = dt * 60;
      // Settles in about a second at 60 Hz whatever the frame rate.
      m.advect.uniforms.uFade.value = Math.pow(0.95, dt * 60);
      run(renderer, m.advect, velNext);
      swapVel();
      m.curl.uniforms.tVel.value = vel.texture;
      run(renderer, m.curl, curl);
      m.vorticity.uniforms.tVel.value = vel.texture;
      m.vorticity.uniforms.uDt.value = dt * 60;
      run(renderer, m.vorticity, velNext);
      swapVel();
      m.divergence.uniforms.tVel.value = vel.texture;
      run(renderer, m.divergence, div);
      for (let i = 0; i < JACOBI; i++) {
        m.jacobi.uniforms.tPressure.value = pressure.texture;
        run(renderer, m.jacobi, pressureNext);
        [pressure, pressureNext] = [pressureNext, pressure];
      }
      m.project.uniforms.tVel.value = vel.texture;
      m.project.uniforms.tPressure.value = pressure.texture;
      run(renderer, m.project, velNext);
      swapVel();
    },
    peek(renderer) {
      const buf = new Uint16Array(W * H * 4);
      renderer.readRenderTargetPixels(vel, 0, 0, W, H, buf);
      let most = 0;
      for (let i = 0; i < buf.length; i += 4) most = Math.max(most, Math.hypot(THREE.DataUtils.fromHalfFloat(buf[i]), THREE.DataUtils.fromHalfFloat(buf[i + 1])));
      return most;
    },
    dispose() {
      for (const t of [vel, velNext, pressure, pressureNext, div, curl]) t.dispose();
      for (const mat of Object.values(m)) mat.dispose();
      geometry.dispose();
    },
  };
}
