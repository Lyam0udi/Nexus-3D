import * as THREE from 'three';

/**
 * Production-grade WebGL renderer, camera, and delta-time animation loop.
 */
export class SceneManager {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this._rafId = null;
    this._disposed = false;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this._initPlaceholderMesh();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    this._animate = this._animate.bind(this);
    this._animate();
  }

  /** Temporary dark metallic icosahedron for render-loop validation. */
  _initPlaceholderMesh() {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x1a1a1e,
      metalness: 0.85,
      roughness: 0.25,
    });
    this.placeholder = new THREE.Mesh(geometry, material);
    this.placeholder.position.set(0, 0, 0);
    this.scene.add(this.placeholder);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(3, 4, 5);
    this.scene.add(keyLight);

    const fillLight = new THREE.AmbientLight(0x404050, 0.45);
    this.scene.add(fillLight);
  }

  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
  }

  /**
   * Delta-time calibrated requestAnimationFrame loop.
   */
  _animate() {
    if (this._disposed) return;

    this._rafId = requestAnimationFrame(this._animate);

    const delta = this.clock.getDelta();

    if (this.placeholder) {
      this.placeholder.rotation.x += delta * 0.35;
      this.placeholder.rotation.y += delta * 0.55;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Tear down geometry, materials, listeners, and the renderer. */
  destroy() {
    this._disposed = true;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    window.removeEventListener('resize', this._onResize);

    this.scene.traverse((object) => {
      if (object.isMesh) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });

    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.placeholder = null;
  }
}
