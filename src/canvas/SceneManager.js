import * as THREE from 'three';
import { ModelLoader } from './ModelLoader.js';

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
    this.sculpture = null;
    this.modelLoader = null;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 8);

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

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    this._animate = this._animate.bind(this);
    this._animate();

    this._mountSculpture();
  }

  /**
   * Load HDRI + physical centerpiece via ModelLoader and mount at origin.
   */
  async _mountSculpture() {
    this.modelLoader = new ModelLoader(this.scene, this.renderer);

    try {
      this.sculpture = await this.modelLoader.load();
      this.sculpture.position.set(0, 0, 0);
    } catch (err) {
      console.error('[SceneManager] Failed to mount central sculpture.', err);
    }
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

    if (this.sculpture) {
      this.sculpture.rotation.x += delta * 0.12;
      this.sculpture.rotation.y += delta * 0.22;
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

    if (this.modelLoader) {
      this.modelLoader.dispose();
      this.modelLoader = null;
    }

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
    this.sculpture = null;
  }
}
