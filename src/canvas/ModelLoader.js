import * as THREE from 'three';
import { RGBELoader } from 'three-stdlib';
import {
  applyLiquidShader,
  createLiquidUniforms,
  loadNoiseMap,
} from './shaders/LiquidShader.js';

const HDRI_PATH = '/assets/studio.hdr';

/**
 * Brand bronze glass — matches logo metal `#c8b89a`.
 * Liquid warp stays off so edges stay architectural.
 */
const PHYSICAL_MATERIAL = {
  color: 0x4a4034,
  roughness: 0.2,
  metalness: 0.62,
  transmission: 0.14,
  ior: 1.48,
  reflectivity: 0.9,
  thickness: 0.55,
  clearcoat: 0.55,
  clearcoatRoughness: 0.18,
  envMapIntensity: 0.85,
  transparent: true,
  side: THREE.DoubleSide,
  attenuationColor: new THREE.Color(0x1a1612),
  attenuationDistance: 1.2,
};

/**
 * Dual sculptures (same portal DNA):
 * - Portal rings — Acts 1–3 cinema (first paint, sync)
 * - Portal twin — Act 5 fall → crash → heal (reverse phoenix)
 * Warm probe is sync; real HDRI / noise enrich after first paint.
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
    /** @type {THREE.Object3D | null} */
    this.impactPlate = null;
    this._envMap = null;
    this._noiseMap = null;
    this.liquidUniforms = createLiquidUniforms();
    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileEquirectangularShader();
  }

  /**
   * First paint: warm probe → lights → portal twin → impact plate (all sync).
   * HDRI upgrades reflections in the background (no dark→bright pop).
   * @returns {Promise<{ sculpture: THREE.Object3D, emergence: THREE.Object3D, impactPlate: THREE.Object3D }>}
   */
  async load() {
    // Reflections available before any mesh is created
    this._installProbeFallback();
    this._setupLights();

    this.sculpture = this._createSquareVolume();
    this.sculpture.position.set(0, 0, 0);
    this.scene.add(this.sculpture);

    this.emergence = this._createEmergenceVolume();
    this.emergence.visible = false;
    this.scene.add(this.emergence);

    this.impactPlate = this._createImpactPlate();
    this.impactPlate.visible = false;
    this.scene.add(this.impactPlate);

    void this._enrichAsync();

    return {
      sculpture: this.sculpture,
      emergence: this.emergence,
      impactPlate: this.impactPlate,
    };
  }

  async _enrichAsync() {
    await Promise.allSettled([this._loadEnvironment(), this._loadLiquidNoise()]);
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
      const prev = this._envMap;
      this._envMap = this._pmrem.fromEquirectangular(texture).texture;
      texture.dispose();
      this.scene.environment = this._envMap;
      this.scene.background = new THREE.Color(0x060608);
      this._applyEnvToMaterials();
      if (prev && prev !== this._envMap) prev.dispose();
    } catch (err) {
      console.warn('[ModelLoader] studio.hdr missing; keeping warm probe.', err);
      if (!this._envMap) {
        this._installProbeFallback();
        this._applyEnvToMaterials();
      }
    }
  }

  _applyEnvToMaterials() {
    if (!this._envMap) return;
    const roots = [this.sculpture, this.emergence, this.impactPlate].filter(Boolean);
    for (const root of roots) {
      root.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.envMap = this._envMap;
          child.material.needsUpdate = true;
        }
      });
    }
  }

  /** Sync bronze-warm probe so metal/transmission reads on frame one. */
  _installProbeFallback() {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const v = (x + y) / (size * 2);
        // Warm bronze family — not cool studio blue
        data[i] = Math.floor(110 + v * 70);
        data[i + 1] = Math.floor(92 + v * 52);
        data[i + 2] = Math.floor(68 + v * 38);
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
    // Strong enough to read the portal before HDRI enriches reflections
    const key = new THREE.DirectionalLight(0xf2ede4, 1.15);
    key.position.set(4.5, 6, 3.5);
    key.name = 'nexus-key-light';
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xa89068, 0.5);
    fill.position.set(-5, 2, -2);
    fill.name = 'nexus-fill-light';
    this.scene.add(fill);

    const kick = new THREE.DirectionalLight(0xc8b89a, 0.55);
    kick.position.set(-3, -2, 5);
    kick.name = 'nexus-kick-light';
    this.scene.add(kick);

    const edge = new THREE.PointLight(0xc8b89a, 4.2, 22, 2);
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
        emissiveIntensity: 0.38,
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
   * Act 5 — identical portal twin for fall → crash → heal.
   * Same crossed rings + crystal so the finale matches the opening.
   * Rest local transforms are stored for shatter / reverse-phoenix.
   */
  _createEmergenceVolume() {
    const group = this._createSquareVolume();
    group.name = 'nexus-emergence';

    const rename = {
      'portal-ring-a': 'emergence-ring-a',
      'portal-ring-b': 'emergence-ring-b',
      'portal-crystal': 'emergence-crystal',
    };

    group.traverse((child) => {
      if (rename[child.name]) child.name = rename[child.name];
      if (child.isMesh) {
        child.userData.restPosition = child.position.clone();
        child.userData.restRotation = child.rotation.clone();
        child.userData.restScale = child.scale.clone();
      }
    });

    return group;
  }

  /**
   * Impact cause — dark square plate + crack rings (same DNA).
   * Plate is the thing the portal hits; crack rings light bronze on heal.
   */
  _createImpactPlate() {
    const group = new THREE.Group();
    group.name = 'nexus-impact-plate';

    const plateMat = this.createPhysicalMaterial(
      {
        color: 0x0c0b0a,
        transmission: 0.01,
        metalness: 0.4,
        roughness: 0.62,
        thickness: 0.25,
        clearcoat: 0.12,
        envMapIntensity: 0.35,
        emissive: new THREE.Color(0xc8b89a),
        emissiveIntensity: 0.02,
        transparent: true,
        opacity: 1,
      },
      { liquid: false },
    );

    const crackMat = this.createPhysicalMaterial(
      {
        color: 0x3a3228,
        transmission: 0.08,
        metalness: 0.7,
        roughness: 0.28,
        thickness: 0.2,
        clearcoat: 0.4,
        envMapIntensity: 0.7,
        emissive: new THREE.Color(0xc8b89a),
        emissiveIntensity: 0,
        transparent: true,
        opacity: 1,
      },
      { liquid: false },
    );

    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.09, 3.8), plateMat);
    plate.name = 'impact-plate-body';
    group.add(plate);

    const outerCrack = new THREE.Mesh(this._squareRingGeometry(1.55, 1.28, 0.08), crackMat);
    outerCrack.rotation.x = Math.PI / 2;
    outerCrack.position.y = 0.08;
    outerCrack.name = 'impact-crack-outer';
    group.add(outerCrack);

    const innerCrack = new THREE.Mesh(
      this._squareRingGeometry(1.05, 0.82, 0.06),
      crackMat.clone(),
    );
    innerCrack.rotation.x = Math.PI / 2;
    innerCrack.position.y = 0.1;
    innerCrack.name = 'impact-crack-inner';
    group.add(innerCrack);

    // Store materials for emissive / opacity animation
    group.userData.plateMat = plateMat;
    group.userData.crackMats = [crackMat, innerCrack.material];

    this._normalizeToOrigin(group, 3.4);
    return group;
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
    this.impactPlate = null;
  }
}
