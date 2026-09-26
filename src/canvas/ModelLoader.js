import * as THREE from 'three';
import { GLTFLoader, RGBELoader } from 'three-stdlib';

const HDRI_PATH = '/assets/studio.hdr';
const MODEL_PATH = '/assets/core.glb';

/** Architectural glass / liquid-chrome optical settings. */
const PHYSICAL_MATERIAL = {
  color: 0xf2f6ff,
  roughness: 0.08,
  metalness: 0.15,
  transmission: 0.92,
  ior: 1.52,
  reflectivity: 0.9,
  thickness: 1.2,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1,
  envMapIntensity: 1.4,
  transparent: true,
  side: THREE.DoubleSide,
};

/**
 * Loads studio HDRI environment lighting and the central GLTF sculpture,
 * applying MeshPhysicalMaterial glass/chrome optics. Falls back to a
 * high-density procedural mesh if the GLB is missing or fails.
 */
export class ModelLoader {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sculpture = null;
    this._envMap = null;
    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._pmrem.compileEquirectangularShader();
  }

  /**
   * Load HDRI, lights, and centerpiece. Resolves with the mounted sculpture.
   * @returns {Promise<THREE.Object3D>}
   */
  async load() {
    await this._loadEnvironment();
    this._setupLights();
    this.sculpture = await this._loadSculpture();
    this.sculpture.position.set(0, 0, 0);
    this.scene.add(this.sculpture);
    return this.sculpture;
  }

  /** @returns {THREE.MeshPhysicalMaterial} */
  createPhysicalMaterial() {
    return new THREE.MeshPhysicalMaterial({ ...PHYSICAL_MATERIAL });
  }

  async _loadEnvironment() {
    const loader = new RGBELoader();

    try {
      const texture = await loader.loadAsync(HDRI_PATH);
      texture.mapping = THREE.EquirectangularReflectionMapping;

      const envMap = this._pmrem.fromEquirectangular(texture).texture;
      this.scene.environment = envMap;
      this._envMap = envMap;

      // High-contrast studio exposure for physical glass / chrome read
      this.renderer.toneMappingExposure = 1.4;

      texture.dispose();
    } catch (err) {
      console.warn('[ModelLoader] HDRI load failed; continuing without environment map.', err);
    }
  }

  _setupLights() {
    // Cool white key — high-contrast studio fill
    const key = new THREE.DirectionalLight(0xe8f4ff, 2.4);
    key.position.set(5, 7, 4);
    key.name = 'nexus-key-light';
    this.scene.add(key);

    // Deep violet rim — edge separation against obsidian void
    const rim = new THREE.PointLight(0x4a148c, 12, 28, 2);
    rim.position.set(-5, 1.5, -6);
    rim.name = 'nexus-rim-light';
    this.scene.add(rim);

    // Soft cool fill so transmission never reads as pure black
    const fill = new THREE.AmbientLight(0x1a1a28, 0.25);
    fill.name = 'nexus-fill-light';
    this.scene.add(fill);
  }

  /**
   * @returns {Promise<THREE.Object3D>}
   */
  async _loadSculpture() {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(MODEL_PATH);
      const root = gltf.scene;
      const material = this.createPhysicalMaterial();

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

      this._normalizeToOrigin(root);
      return root;
    } catch (err) {
      console.warn(
        '[ModelLoader] core.glb missing or failed; using procedural sculpture.',
        err,
      );
      return this._createFallbackSculpture();
    }
  }

  /** High-density procedural centerpiece when GLB is unavailable. */
  _createFallbackSculpture() {
    const geometry = new THREE.IcosahedronGeometry(3, 8);
    const mesh = new THREE.Mesh(geometry, this.createPhysicalMaterial());
    mesh.name = 'nexus-procedural-sculpture';
    return mesh;
  }

  /**
   * Center the model at origin and scale so its largest axis fits ~unit radius 2.5.
   * @param {THREE.Object3D} root
   */
  _normalizeToOrigin(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    root.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const target = 5;
      root.scale.multiplyScalar(target / maxDim);
    }
  }

  /** Release PMREM and environment map resources. */
  dispose() {
    if (this._envMap) {
      this._envMap.dispose();
      this._envMap = null;
    }
    if (this.scene) {
      this.scene.environment = null;
    }
    if (this._pmrem) {
      this._pmrem.dispose();
      this._pmrem = null;
    }
    this.sculpture = null;
  }
}
