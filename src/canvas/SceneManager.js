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

/** Local shatter offsets — wide enough to read as a real break. */
const SHATTER_OFFSETS = [
  { p: [1.15, 0.7, 0.45], r: [0.85, 0.55, 0.65] },
  { p: [-1.1, 0.55, -0.5], r: [-0.7, 0.8, -0.5] },
  { p: [0.15, 1.45, 0.2], r: [1.0, 0.6, 0.4] },
];

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
    /** @type {import('three').Object3D | null} */
    this.impactPlate = null;
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
    /** 0 = system owns frame, 1 = fall through crash/heal. */
    this.emergenceMix = 0;
    /** 0–1 crash punch (squash + shatter). */
    this.impactMix = 0;
    /** 0–1 reverse-phoenix heal (reassemble + rise). */
    this.healMix = 0;
    /** 0–1 impact plate visibility (cause of the crash). */
    this.plateMix = 0;
    this._baseSculptureScale = 1;
    this._baseEmergenceScale = 1;
    this._baseEmergenceY = -0.85;
    this._fallStartY = 4.2;
    this._healY = 0.2;
    this._plateY = -1.15;
    /** @type {THREE.Object3D[]} */
    this._emergenceParts = [];

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
      lowPower: this._lowPower,
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
      const { sculpture, emergence, impactPlate } = await this.modelLoader.load();
      this.sculpture = sculpture;
      this.emergence = emergence;
      this.impactPlate = impactPlate;
      this.sculpture.position.set(1.55, 0.1, 0);
      this._baseSculptureScale = this.sculpture.scale.x;
      if (this.emergence) {
        this.emergence.position.set(1.05, this._baseEmergenceY, 0);
        this.emergence.visible = false;
        this._baseEmergenceScale = this.emergence.scale.x;
        this._fallStartY = this._baseEmergenceY + 5.1;
        this._emergenceParts = this.emergence.children.filter((c) => c.isMesh);
      }
      if (this.impactPlate) {
        this.impactPlate.position.set(1.05, this._plateY, 0);
        this.impactPlate.visible = false;
      }
      this.renderer.toneMappingExposure = 0.98;
      // Warm first draw — avoids a blank frame while shaders compile
      this.renderer.compile(this.scene, this.camera);
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
      // Tumble while falling; calm as we heal back into the opening pose
      const tumble = Math.max(0, this.emergenceMix * (1 - this.healMix) * (1 - this.impactMix * 0.35));
      this.emergence.rotation.x = rotX * 0.55 * tumble + this.impactMix * 0.2;
      this.emergence.rotation.y = rotY * (0.35 + tumble * 0.55);
      this.emergence.rotation.z = this.impactMix * 0.08 * (1 - this.healMix);
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
   * Act 5: fall → hit plate → broken hold → reverse-phoenix heal.
   * @param {number} mix 0–1 sequence progress
   * @param {number} [impact=0] 0–1 crash punch / shatter
   * @param {number} [heal=0] 0–1 reassemble / rise
   * @param {number} [plate=0] 0–1 impact plate presence
   */
  setEmergenceMix(mix, impact = 0, heal = 0, plate = 0) {
    this.emergenceMix = Math.max(0, Math.min(1, mix));
    this.impactMix = Math.max(0, Math.min(1, impact));
    this.healMix = Math.max(0, Math.min(1, heal));
    this.plateMix = Math.max(0, Math.min(1, plate));
    this._applyStageMix();
  }

  /**
   * Portal cinema → system → freefall → hit plate → shatter hold → heal.
   */
  _applyStageMix() {
    const interior = this.interiorMix;
    const emerge = this.emergenceMix;
    const impact = this.impactMix;
    const heal = this.healMix;
    const plate = this.plateMix;

    // Full commit inside the system — forget the sculpture completely
    const canvasFade = Math.max(0, interior * (1 - emerge));
    if (this.canvas) {
      this.canvas.style.opacity = String(1 - canvasFade);
      this.canvas.style.visibility = canvasFade > 0.98 ? 'hidden' : 'visible';
    }

    this.motionScale = Math.max(
      0.02,
      (1 - interior * 0.95) *
        (0.35 + emerge * 0.45) *
        (1 - impact * 0.55) *
        (0.5 + heal * 0.5),
    );

    if (this.sculpture) {
      const showPortal = interior < 0.85 && emerge < 0.12;
      this.sculpture.visible = showPortal;
      const base = this._baseSculptureScale || 1;
      this.sculpture.scale.setScalar(base * (1 - Math.min(interior, 1) * 0.12));
    }

    this._applyImpactPlate(plate, impact, heal);

    if (this.emergence) {
      const showTwin = emerge > 0.02;
      this.emergence.visible = showTwin;
      const base = this._baseEmergenceScale || 1;
      const crashY = this._baseEmergenceY || -0.85;
      const startY = this._fallStartY ?? crashY + 5.1;
      const healY = this._healY ?? 0.2;

      // Mostly linear drop toward the plate
      const dropT = Math.min(1, emerge / 0.7);
      const dropCurve = dropT * 0.7 + dropT * dropT * 0.3;
      let y = startY + (crashY - startY) * dropCurve;

      // Dig into the plate on impact; rise on heal
      y += -0.22 * impact * (1 - heal);
      y += (healY - crashY) * this._healRise(heal);

      this.emergence.position.y = y;

      // Harder squash on contact; recover through heal
      const squash = impact * (1 - heal * 0.9);
      const sy = 1 - squash * 0.38;
      const sxz = 1 + squash * 0.22;
      const size = 0.92 + emerge * 0.05 + this._healRise(heal) * 0.1;
      this.emergence.scale.set(base * size * sxz, base * size * sy, base * size * sxz);

      this._applyShatterPose(impact, heal);
      this._applyHealGlow(heal);
    }

    this.renderer.toneMappingExposure =
      0.98 -
      interior * 0.22 * (1 - emerge) +
      emerge * 0.03 +
      impact * 0.12 +
      heal * 0.06;
  }

  /**
   * Heal ease: magnet early, rise late.
   * @param {number} heal
   */
  _healRise(heal) {
    const t = Math.max(0, Math.min(1, heal));
    // Slow magnet (0–0.45), then lift (0.45–1)
    if (t < 0.45) return t * 0.15;
    return 0.0675 + ((t - 0.45) / 0.55) * 0.9325;
  }

  /**
   * Square plate fades in as the fall target, cracks light on heal, then dims.
   * @param {number} plate
   * @param {number} impact
   * @param {number} heal
   */
  _applyImpactPlate(plate, impact, heal) {
    if (!this.impactPlate) return;

    const show = plate > 0.04;
    this.impactPlate.visible = show;
    if (!show) return;

    this.impactPlate.position.set(1.05, this._plateY, 0);

    // Presence: full through crash/broken, fades as healed portal rises
    const presence = plate * (1 - Math.max(0, (heal - 0.55) / 0.45));
    const scale = 0.92 + plate * 0.1 + impact * 0.04;
    this.impactPlate.scale.setScalar(scale);

    const plateMat = this.impactPlate.userData.plateMat;
    const crackMats = this.impactPlate.userData.crackMats || [];

    if (plateMat) {
      plateMat.opacity = Math.max(0.08, presence);
      plateMat.transparent = true;
      // Impact flash + residual heat
      plateMat.emissiveIntensity = 0.02 + impact * 0.35 * (1 - heal * 0.7) + heal * 0.08;
    }

    // Crack rings: dark until hit, bronze surge mid-heal, then calm
    const crackGlow =
      impact * 0.25 * (1 - heal) +
      // Peak bronze around mid-heal (magnet / lock)
      Math.sin(Math.min(1, heal) * Math.PI) * 0.85 +
      heal * 0.15;
    for (const mat of crackMats) {
      if (!mat) continue;
      mat.opacity = Math.max(0.15, presence);
      mat.transparent = true;
      mat.emissiveIntensity = crackGlow;
    }
  }

  /**
   * Crystal / rings pick up bronze life as heal progresses.
   * @param {number} heal
   */
  _applyHealGlow(heal) {
    const parts = this._emergenceParts;
    if (!parts?.length) return;
    const pulse = Math.sin(Math.min(1, heal) * Math.PI) * 0.35 + heal * 0.25;
    for (const part of parts) {
      const mat = part.material;
      if (!mat || mat.emissiveIntensity === undefined) continue;
      if (!part.userData.baseEmissive) {
        part.userData.baseEmissive = mat.emissiveIntensity;
      }
      mat.emissiveIntensity = part.userData.baseEmissive + pulse;
    }
  }

  /**
   * Parts fly apart on impact, hold broken, then magnet home on heal.
   * @param {number} impact
   * @param {number} heal
   */
  _applyShatterPose(impact, heal) {
    const parts = this._emergenceParts;
    if (!parts?.length) return;

    // Stay fully shattered while impact is high and heal hasn't started
    // Heal 0–0.45 = magnet pull; after that parts are home
    const magnet = Math.min(1, heal / 0.45);
    const shatterAmt = Math.max(0, impact * (1 - magnet));

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const restP = part.userData.restPosition;
      const restR = part.userData.restRotation;
      if (!restP || !restR) continue;

      const off = SHATTER_OFFSETS[i] || SHATTER_OFFSETS[SHATTER_OFFSETS.length - 1];
      part.position.set(
        restP.x + off.p[0] * shatterAmt,
        restP.y + off.p[1] * shatterAmt,
        restP.z + off.p[2] * shatterAmt,
      );
      part.rotation.set(
        restR.x + off.r[0] * shatterAmt,
        restR.y + off.r[1] * shatterAmt,
        restR.z + off.r[2] * shatterAmt,
      );
    }
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
    this.impactPlate = null;
    this._emergenceParts = [];
  }
}
