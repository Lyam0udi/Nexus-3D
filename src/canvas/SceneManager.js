import * as THREE from 'three';
import { ModelLoader } from './ModelLoader.js';
import { BASE_DISTORTION } from './shaders/LiquidShader.js';

const MOUSE_LERP = 0.05;
const TILT_STRENGTH = 0.28;
const VELOCITY_TO_DISTORTION = 1.8;

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

    /** Normalized cursor target (−1…+1), updated on pointer move. */
    this._mouseTarget = new THREE.Vector2(0, 0);
    /** Smoothed cursor with rotational inertia (lerp 0.05). */
    this._mouseSmooth = new THREE.Vector2(0, 0);
    this._prevMouseTarget = new THREE.Vector2(0, 0);
    this._mouseVelocity = 0;
    this._smoothVelocity = 0;
    this._tilt = new THREE.Vector2(0, 0);
    this._tiltTarget = new THREE.Vector2(0, 0);
    this._spin = { x: 0, y: 0 };

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
    this._onPointerMove = this._onPointerMove.bind(this);
    this._animate = this._animate.bind(this);

    window.addEventListener('resize', this._onResize);
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });

    this._animate();
    this._mountSculpture();
  }

  /**
   * Track normalized mouse coordinates (−1…+1) and instantaneous sweep speed.
   * @param {PointerEvent} event
   */
  _onPointerMove(event) {
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;

    const dx = x - this._prevMouseTarget.x;
    const dy = y - this._prevMouseTarget.y;
    this._mouseVelocity = Math.min(Math.hypot(dx, dy) * 12, 2.5);
    this._prevMouseTarget.set(x, y);
    this._mouseTarget.set(x, y);
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
    const elapsed = this.clock.getElapsedTime();

    // Cursor inertia — damp toward target at 0.05
    this._mouseSmooth.lerp(this._mouseTarget, MOUSE_LERP);
    this._smoothVelocity += (this._mouseVelocity - this._smoothVelocity) * MOUSE_LERP;
    this._mouseVelocity *= 0.92;

    this._tiltTarget.set(
      this._mouseSmooth.y * TILT_STRENGTH,
      this._mouseSmooth.x * TILT_STRENGTH,
    );
    this._tilt.lerp(this._tiltTarget, MOUSE_LERP);

    const uniforms = this.modelLoader?.liquidUniforms;
    if (uniforms) {
      uniforms.uTime.value = elapsed;
      uniforms.uMouse.value.copy(this._mouseSmooth);
      uniforms.uMouseVelocity.value = this._smoothVelocity;
      uniforms.uDistortion.value =
        BASE_DISTORTION + this._smoothVelocity * VELOCITY_TO_DISTORTION;
    }

    if (this.sculpture) {
      this._spin.x += delta * 0.12;
      this._spin.y += delta * 0.22;
      this.sculpture.rotation.x = this._spin.x + this._tilt.x;
      this.sculpture.rotation.y = this._spin.y + this._tilt.y;
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
    window.removeEventListener('pointermove', this._onPointerMove);

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
