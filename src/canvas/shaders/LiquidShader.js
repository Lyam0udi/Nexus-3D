import * as THREE from 'three';

const NOISE_MAP_PATH = '/assets/noise.png';

/** Default optical base distortion when the cursor is idle. */
export const BASE_DISTORTION = 0.12;

/**
 * Shared liquid uniforms driven by the frame loop / mouse inertia.
 * @returns {Object.<string, { value: * }>}
 */
export function createLiquidUniforms() {
  return {
    uTime: { value: 0 },
    uNoiseFrequency: { value: 1.65 },
    uDistortion: { value: BASE_DISTORTION },
    uNoiseMap: { value: null },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uMouseVelocity: { value: 0 },
  };
}

/**
 * Ashima Arts 3D simplex noise — displaces vertices along normals.
 * Injected into MeshPhysicalMaterial via onBeforeCompile.
 */
const SIMPLEX_NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
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
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/**
 * Load the local microscopic noise map used by the fragment stage.
 * @returns {Promise<THREE.Texture>}
 */
export function loadNoiseMap() {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      NOISE_MAP_PATH,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.NoColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      (err) => reject(err),
    );
  });
}

/**
 * Inject liquid vertex displacement + fragment noise/chromatic tint into a
 * MeshPhysicalMaterial while preserving transmission / IOR / clearcoat.
 *
 * @param {THREE.MeshPhysicalMaterial} material
 * @param {ReturnType<typeof createLiquidUniforms>} uniforms
 */
export function applyLiquidShader(material, uniforms) {
  material.userData.liquidUniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
#include <common>
uniform float uTime;
uniform float uNoiseFrequency;
uniform float uDistortion;
uniform vec2 uMouse;
uniform float uMouseVelocity;
varying vec3 vLiquidPos;
${SIMPLEX_NOISE_GLSL}
`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
{
  float freq = uNoiseFrequency;
  float amp = uDistortion * (1.0 + uMouseVelocity * 2.5);
  vec3 noiseCoord = transformed * freq + vec3(uTime * 0.35, uTime * 0.22, uTime * 0.18);
  float n = snoise(noiseCoord);
  float n2 = snoise(noiseCoord * 1.7 + vec3(uMouse * 0.8, uTime * 0.1));
  float displacement = (n * 0.65 + n2 * 0.35) * amp;
  transformed += normalize(objectNormal) * displacement;
  vLiquidPos = transformed;
}
`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
#include <common>
uniform float uTime;
uniform float uDistortion;
uniform float uMouseVelocity;
uniform sampler2D uNoiseMap;
uniform vec2 uMouse;
varying vec3 vLiquidPos;
`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  vec2 noiseUv = vLiquidPos.xy * 1.8 + vLiquidPos.zz * 0.35
    + uMouse * 0.15 + vec2(uTime * 0.03, -uTime * 0.02);
  vec3 micro = texture2D(uNoiseMap, noiseUv).rgb;
  float grain = (micro.r + micro.g + micro.b) / 3.0;

  // Microscopic roughness flecks
  outgoingLight *= mix(0.92, 1.06, grain);

  // Fresnel-weighted chromatic edge tint (liquid glass fringe)
  float fresnel = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 2.8);
  float fringe = fresnel * (0.35 + uDistortion * 1.2 + uMouseVelocity * 0.8);
  vec3 chroma = vec3(
    texture2D(uNoiseMap, noiseUv + vec2(0.012, 0.0)).r,
    texture2D(uNoiseMap, noiseUv).g,
    texture2D(uNoiseMap, noiseUv - vec2(0.012, 0.0)).b
  );
  outgoingLight += chroma * fringe * vec3(0.55, 0.85, 1.15);
}
#include <opaque_fragment>
`,
      );

    material.userData.shader = shader;
  };

  material.customProgramCacheKey = () => 'nexus-liquid-noise-v1';
  material.needsUpdate = true;
}
