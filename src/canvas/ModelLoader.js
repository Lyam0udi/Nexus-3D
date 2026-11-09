import * as THREE from 'three';
import { GLTFLoader, RGBELoader } from 'three-stdlib';
import {
  applyLiquidShader,
  createLiquidUniforms,
  loadNoiseMap,
} from './shaders/LiquidShader.js';

const HDRI_PATH = '/assets/studio.hdr';
const MODEL_PATH = '/assets/core.glb';

/**
 * Dark cool glass — silhouette in the void, never chalk-white.
 * Liquid warp stays off so edges stay architectural.
 */
const PHYSICAL_MATERIAL = {
  color: 0x3d4652,
  roughness: 0.12,
  metalness: 0.28,
  transmission: 0.62,
  ior: 1.48,
  reflectivity: 0.9,
  thickness: 1.1,
  clearcoat: 0.85,
  clearcoatRoughness: 0.14,
  envMapIntensity: 1.15,
  transparent: true,
  side: THREE.DoubleSide,
  attenuationColor: new THREE.Color(0x1c222c),
  attenuationDistance: 1.6,
};

/**
 * Dual sculptures:
 * - Square glass volume — Acts 1–3 cinema
 * - Architectural `core.glb` — Act 5 emergence only
 */
export class ModelLoader {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    /** @type {THREE.Object3D | null} */
    this.sculpture = null;
    /** @type {THREE.Object3D | null} */
    this.emergence = null;
    this._envMap = null;
    this._noiseMap = null;
    this.liquidUniforms = createLiquidUniforms();
    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileEquirectangularShader();
  }

  /**
   * @returns {Promise<{ sculpture: THREE.Object3D, emergence: THREE.Object3D | null }>}
   */
  async load() {
    await this._loadEnvironment();
    await this._loadLiquidNoise();
    this._setupLights();

    this.sculpture = this._createSquareVolume();
    this.sculpture.position.set(0, 0, 0);
    this.scene.add(this.sculpture);

    this.emergence = await this._loadEmergenceGlb();
    if (this.emergence) {
      this.emergence.visible = false;
      this.scene.add(this.emergence);
    }

    return { sculpture: this.sculpture, emergence: this.emergence };
  }

  async _loadLiquidNoise() {
    try {
      this._noiseMap = await loadNoiseMap();
      this.liquidUniforms.uNoiseMap.value = this._noiseMap;
    } catch (err) {
      console.warn('[ModelLoader] noise.png load failed; generating procedural grain.', err);
      this._noiseMap = this._createProceduralNoise();
      this.liquidUniforms.uNoiseMap.value = this._noiseMap;
    }
  }

  _createProceduralNoise() {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const n = Math.floor(Math.random() * 255);
      const o = i * 4;
      data[o] = n;
      data[o + 1] = Math.floor(n * 0.92 + Math.random() * 20);
      data[o + 2] = Math.floor(n * 0.85 + Math.random() * 30);
      data[o + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * @param {object} [overrides]
   * @param {{ liquid?: boolean }} [options]
   * @returns {THREE.MeshPhysicalMaterial}
   */
  createPhysicalMaterial(overrides = {}, options = {}) {
    const material = new THREE.MeshPhysicalMaterial({
      ...PHYSICAL_MATERIAL,
      ...overrides,
    });
    if (this._envMap) {
      material.envMap = this._envMap;
    }
    if (options.liquid === true) {
      applyLiquidShader(material, this.liquidUniforms);
    }
    return material;
  }

  async _loadEnvironment() {
    try {
      const texture = await new RGBELoader().loadAsync(HDRI_PATH);
      this._envMap = this._pmrem.fromEquirectangular(texture).texture;
      texture.dispose();
      this.scene.environment = this._envMap;
      this.scene.background = new THREE.Color(0x060608);
    } catch (err) {
      console.warn('[ModelLoader] studio.hdr missing; using cool probe fallback.', err);
      this._installProbeFallback();
    }
  }

  _installProbeFallback() {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const v = (x + y) / (size * 2);
        data[i] = Math.floor(70 + v * 50);
        data[i + 1] = Math.floor(82 + v * 48);
        data[i + 2] = Math.floor(98 + v * 55);
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    this._envMap = this._pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    this.scene.environment = this._envMap;
  }

  _setupLights() {
    const key = new THREE.DirectionalLight(0xf2ede4, 0.85);
    key.position.set(4.5, 6, 3.5);
    key.name = 'nexus-key-light';
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xa89068, 0.35);
    fill.position.set(-5, 2, -2);
    fill.name = 'nexus-fill-light';
    this.scene.add(fill);

    const kick = new THREE.DirectionalLight(0xc8b89a, 0.4);
    kick.position.set(-3, -2, 5);
    kick.name = 'nexus-kick-light';
    this.scene.add(kick);

    const edge = new THREE.PointLight(0xc8b89a, 3.2, 22, 2);
    edge.position.set(3.5, 0.5, -4);
    edge.name = 'nexus-edge-light';
    this.scene.add(edge);
  }

  /**
   * Opening sculpture — two beveled square rings crossed, one inner crystal.
   * Continuous machined surfaces, not a cage of boxes.
   */
  _createSquareVolume() {
    const group = new THREE.Group();
    group.name = 'nexus-portal';

    const ringMat = this.createPhysicalMaterial(
      {
        color: 0x4a4034,
        transmission: 0.12,
        metalness: 0.74,
        roughness: 0.22,
        thickness: 0.4,
        clearcoat: 0.55,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.8,
        attenuationColor: new THREE.Color(0x1a1612),
        attenuationDistance: 1.1,
      },
      { liquid: false },
    );

    const crystalMat = this.createPhysicalMaterial(
      {
        color: 0x2a241c,
        transmission: 0.06,
        metalness: 0.55,
        roughness: 0.24,
        thickness: 0.3,
        clearcoat: 0.35,
        envMapIntensity: 0.65,
        emissive: new THREE.Color(0xc8b89a),
        emissiveIntensity: 0.22,
      },
      { liquid: false },
    );

    const ringGeo = this._squareRingGeometry(1.15, 0.62, 0.42);

    const ringA = new THREE.Mesh(ringGeo, ringMat);
    ringA.rotation.set(0.42, 0.35, 0);
    ringA.name = 'portal-ring-a';
    group.add(ringA);

    const ringB = new THREE.Mesh(ringGeo, ringMat);
    ringB.rotation.set(0.42, 0.35 + Math.PI / 2, 0);
    ringB.name = 'portal-ring-b';
    group.add(ringB);

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), crystalMat);
    crystal.rotation.set(0.4, 0.2, 0.15);
    crystal.name = 'portal-crystal';
    group.add(crystal);

    this._normalizeToOrigin(group, 1.85);
    return group;
  }

  /**
   * Beveled square annulus, centered.
   * @param {number} outer
   * @param {number} inner
   * @param {number} depth
   */
  _squareRingGeometry(outer, inner, depth) {
    const shape = new THREE.Shape();
    shape.moveTo(-outer, -outer);
    shape.lineTo(outer, -outer);
    shape.lineTo(outer, outer);
    shape.lineTo(-outer, outer);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner);
    hole.lineTo(-inner, inner);
    hole.lineTo(inner, inner);
    hole.lineTo(inner, -inner);
    hole.closePath();
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.055,
      bevelSegments: 2,
      curveSegments: 1,
    });
    geo.center();
    return geo;
  }

  /**
   * Architectural GLB for Act 5 only — dark chrome, not white.
   * @returns {Promise<THREE.Object3D | null>}
   */
  async _loadEmergenceGlb() {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(MODEL_PATH);
      const root = gltf.scene;
      root.name = 'nexus-emergence';

      const material = this.createPhysicalMaterial(
        {
          color: 0x6e624f,
          transmission: 0.12,
          metalness: 0.72,
          roughness: 0.24,
          thickness: 0.45,
          clearcoat: 0.55,
          clearcoatRoughness: 0.2,
          envMapIntensity: 0.95,
          attenuationColor: new THREE.Color(0x2a2418),
          attenuationDistance: 1.6,
        },
        { liquid: false },
      );

      root.traverse((child) => {
        if (child.isMesh) {
          if (child.material && typeof child.material.dispose === 'function') {
            child.material.dispose();
          }
          child.material = material;
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });

      this._normalizeToOrigin(root, 3.7);
      return root;
    } catch (err) {
      console.warn('[ModelLoader] core.glb missing; Act 5 will reuse a darkened square.', err);
      const twin = this._createSquareVolume();
      twin.name = 'nexus-emergence-fallback';
      return twin;
    }
  }

  /**
   * @param {THREE.Object3D} root
   * @param {number} [target=3.6]
   */
  _normalizeToOrigin(root, target = 3.6) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      root.scale.multiplyScalar(target / maxDim);
    }
  }

  dispose() {
    if (this._envMap) {
      this._envMap.dispose();
      this._envMap = null;
    }
    if (this._noiseMap) {
      this._noiseMap.dispose();
      this._noiseMap = null;
    }
    if (this.liquidUniforms) {
      this.liquidUniforms.uNoiseMap.value = null;
    }
    if (this.scene) {
      this.scene.environment = null;
    }
    if (this._pmrem) {
      this._pmrem.dispose();
      this._pmrem = null;
    }
    this.sculpture = null;
    this.emergence = null;
  }
}
