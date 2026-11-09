import * as THREE from 'three';
import { ModelLoader } from './ModelLoader.js';
import { PostProcessing } from './PostProcessing.js';
import { BASE_DISTORTION } from './shaders/LiquidShader.js';

/** Near-still idle — scroll remains the only director. */
const IDLE_SPIN_X = 0.004;
const IDLE_SPIN_Y = 0.007;
/** Whisper pointer response — never carnival tilt. */
const MOUSE_LERP = 0.04;
const TILT_STRENGTH = 0.028;
const VELOCITY_TO_DISTORTION = 0.06;

/**
 * Production-grade WebGL renderer, camera, and delta-time animation loop.
 * Scene owns the atmosphere (obsidian void + fog); CSS does not compete.
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
    /** @type {import('three').Object3D | null} */
    this.emergence = null;
    this.modelLoader = null;
    /** @type {import('../animations/ScrollController.js').ScrollController | null} */
    this.scrollController = null;

    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    this._lowPower =
      coarsePointer ||
      (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4);

    /** Scroll-driven mesh yaw (radians) — secondary to camera path. */
    this.scrollMeshRotation = { x: 0, y: 0 };
    /** Extra liquid distortion from Act-3 scroll surge. */
    this.scrollDistortionBoost = 0;
    /** Scroll-driven pointer / idle damp (1 = full, 0 = muted). */
    this.motionScale = 1;
    /** 0 = sculpture cinema, 1 = digital interior (mode shift). */
    this.interiorMix = 0;
    /** 0 = system owns frame, 1 = same core reappears in the void. */
    this.emergenceMix = 0;
    this._baseSculptureScale = 1;
    this._baseEmergenceScale = 1;

    this._mouseTarget = new THREE.Vector2(0, 0);
    this._mouseSmooth = new THREE.Vector2(0, 0);
    this._prevMouseTarget = new THREE.Vector2(0, 0);
    this._mouseVelocity = 0;
    this._smoothVelocity = 0;
    this._tilt = new THREE.Vector2(0, 0);
    this._tiltTarget = new THREE.Vector2(0, 0);
    this._spin = { x: 0, y: 0 };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060608);
    // Soft depth falloff — stable void, not a busy atmosphere layer
    this.scene.fog = new THREE.FogExp2(0x060608, 0.016);

    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 0.18, 4.8);
    this.camera.lookAt(0, 0, 0);
    this._baseFov = 40;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x060608, 1);
    // Cap PR so EffectComposer bloom buffers stay stable (high PR + bloom = edge glitter)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this._lowPower ? 1.25 : 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera, {
      reducedMotion: this._reducedMotion,
    });

    this._onResize = this._onResize.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._animate = this._animate.bind(this);

    window.addEventListener('resize', this._onResize);
    if (!this._reducedMotion) {
      window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    }

    this._animate();
    this._mountSculpture();
  }

  /**
   * @param {PointerEvent} event
   */
  _onPointerMove(event) {
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;

    const dx = x - this._prevMouseTarget.x;
    const dy = y - this._prevMouseTarget.y;
    this._mouseVelocity = Math.min(Math.hypot(dx, dy) * 10, 1.6);
    this._prevMouseTarget.set(x, y);
    this._mouseTarget.set(x, y);
  }

  async _mountSculpture() {
    this.modelLoader = new ModelLoader(this.scene, this.renderer);

    try {
      const { sculpture, emergence } = await this.modelLoader.load();
      this.sculpture = sculpture;
      this.emergence = emergence;
      this.sculpture.position.set(1.55, 0.1, 0);
      this._baseSculptureScale = this.sculpture.scale.x;
      if (this.emergence) {
        this.emergence.position.set(1.05, -0.12, 0);
        this.emergence.visible = false;
        this._baseEmergenceScale = this.emergence.scale.x;
      }
      this.renderer.toneMappingExposure = 0.98;
    } catch (err) {
      console.error('[SceneManager] Failed to mount central sculpture.', err);
    }
  }

  _onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this._lowPower ? 1.25 : 1.75));
    this.renderer.setSize(width, height);
    this.postProcessing?.setSize(width, height);
  }

  _animate() {
    if (this._disposed) return;

    this._rafId = requestAnimationFrame(this._animate);

    const timeMs = performance.now();
    this.scrollController?.raf(timeMs);

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    const scale = this._reducedMotion ? 0 : this.motionScale;

    this._mouseSmooth.lerp(this._mouseTarget, MOUSE_LERP);
    this._smoothVelocity += (this._mouseVelocity - this._smoothVelocity) * MOUSE_LERP;
    this._mouseVelocity *= 0.9;

    this._tiltTarget.set(
      this._mouseSmooth.y * TILT_STRENGTH * scale,
      this._mouseSmooth.x * TILT_STRENGTH * scale,
    );
    this._tilt.lerp(this._tiltTarget, MOUSE_LERP);

    const uniforms = this.modelLoader?.liquidUniforms;
    if (uniforms) {
      uniforms.uTime.value = elapsed;
      uniforms.uMouse.value.copy(this._mouseSmooth);
      uniforms.uMouseVelocity.value = this._smoothVelocity * scale;
      const liquidBoost = this._reducedMotion ? 0 : this.scrollDistortionBoost;
      uniforms.uDistortion.value =
        BASE_DISTORTION * (this._reducedMotion ? 0.35 : 1) +
        liquidBoost +
        this._smoothVelocity * VELOCITY_TO_DISTORTION * scale;
    }

    if (!this._reducedMotion) {
      this._spin.x += delta * IDLE_SPIN_X * scale;
      this._spin.y += delta * IDLE_SPIN_Y * scale;
    }

    const rotX = this._spin.x + this._tilt.x + this.scrollMeshRotation.x;
    const rotY = this._spin.y + this._tilt.y + this.scrollMeshRotation.y;

    if (this.sculpture?.visible) {
      this.sculpture.rotation.x = rotX;
      this.sculpture.rotation.y = rotY;
    }

    if (this.emergence?.visible) {
      this.emergence.rotation.x = rotX * 0.55;
      this.emergence.rotation.y = rotY * 0.8;
    }

    this.postProcessing.render();
  }

  /**
   * @param {number} fov
   */
  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Crossfade sculpture cinema → digital interior.
   * @param {number} mix 0–1
   */
  setInteriorMix(mix) {
    const t = Math.max(0, Math.min(1, mix));
    this.interiorMix = t;
    this._applyStageMix();
  }

  /**
   * Reveal the architectural GLB after the system (Act 5).
   * @param {number} mix 0–1
   */
  setEmergenceMix(mix) {
    const t = Math.max(0, Math.min(1, mix));
    this.emergenceMix = t;
    this._applyStageMix();
  }

  /**
   * Square cinema → system owns frame → GLB in the void.
   */
  _applyStageMix() {
    const interior = this.interiorMix;
    const emerge = this.emergenceMix;

    const canvasFade = Math.max(0, interior * (1 - emerge) * 0.96);
    if (this.canvas) {
      this.canvas.style.opacity = String(1 - canvasFade);
    }

    this.motionScale = Math.max(
      0.04,
      (1 - interior * 0.9) * (0.4 + emerge * 0.6),
    );

    if (this.sculpture) {
      const showSquare = interior < 0.9 && emerge < 0.2;
      this.sculpture.visible = showSquare;
      const base = this._baseSculptureScale || 1;
      this.sculpture.scale.setScalar(base * (1 - Math.min(interior, 1) * 0.08));
    }

    if (this.emergence) {
      const showGlb = emerge > 0.06;
      this.emergence.visible = showGlb;
      const base = this._baseEmergenceScale || 1;
      this.emergence.scale.setScalar(base * (0.92 + emerge * 0.1));
    }

    this.renderer.toneMappingExposure =
      0.98 - interior * 0.22 * (1 - emerge) + emerge * 0.05;
  }

  /**
   * @param {import('../animations/ScrollController.js').ScrollController} controller
   */
  setScrollController(controller) {
    this.scrollController = controller;
  }

  destroy() {
    this._disposed = true;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    if (this.scrollController) {
      this.scrollController.destroy();
      this.scrollController = null;
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

    if (this.postProcessing) {
      this.postProcessing.dispose();
      this.postProcessing = null;
    }

    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.sculpture = null;
    this.emergence = null;
  }
}
