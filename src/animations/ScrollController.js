import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Film map:
 * Acts 1–2 — architectural core cinema (presence → orbit)
 * Act 3 — threshold hold, then cross into the system
 * Act 4 — digital interior (not more zoom)
 * Act 5 — same core emerges in deep void
 */
const ORBIT = {
  lookAt: { x: 1.05, y: -0.1, z: 0 },
  act1: { theta: -0.28, phi: 1.36, radius: 5.2, yBias: 0.12, fov: 36 },
  act1End: { theta: -0.06, phi: 1.33, radius: 5.35, yBias: 0.16, fov: 37 },
  act2End: { theta: -0.06 + (Math.PI * 2) / 3, phi: 1.3, radius: 5.4, yBias: -0.05, fov: 38 },
  // Threshold: almost still — whisper approach only
  act3Hold: { theta: -0.06 + (Math.PI * 2) / 3 + 0.04, phi: 1.315, radius: 5.05, yBias: 0.02, fov: 37.5 },
  act3End: { theta: -0.06 + (Math.PI * 2) / 3 + 0.05, phi: 1.32, radius: 4.85, yBias: 0.03, fov: 37 },
  // Interior: locked frame while system UI owns attention
  act4End: { theta: -0.06 + (Math.PI * 2) / 3 + 0.05, phi: 1.32, radius: 4.9, yBias: 0.02, fov: 37 },
  // Emergence: pull back — the same core resolves in space
  act5End: { theta: -0.06 + (Math.PI * 2) / 3 + 0.28, phi: 1.26, radius: 6.55, yBias: 0.22, fov: 32 },
};

const NOISE_FREQ_IDLE = 1.05;
const NOISE_FREQ_ACT2 = 1.2;
const NOISE_FREQ_ACT3 = 1.35;
const DISTORTION_SURGE = 0.018;
const MESH_ROT_TOTAL = Math.PI * 0.08;

/**
 * @param {import('three').PerspectiveCamera} camera
 * @param {{ theta: number, phi: number, radius: number, yBias: number }} state
 */
function applyOrbit(camera, state) {
  const sinPhi = Math.sin(state.phi);
  camera.position.set(
    state.radius * sinPhi * Math.sin(state.theta),
    state.radius * Math.cos(state.phi) + state.yBias,
    state.radius * sinPhi * Math.cos(state.theta),
  );
  camera.lookAt(ORBIT.lookAt.x, ORBIT.lookAt.y, ORBIT.lookAt.z);
}

/**
 * Lenis + scrubbed timeline: core cinema → system → same-core emergence.
 */
export class ScrollController {
  /**
   * @param {import('../canvas/SceneManager.js').SceneManager} sceneManager
   */
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this._disposed = false;
    this.lenis = null;
    this.timeline = null;
    this._scrollTrigger = null;
    this._reducedMotion = sceneManager._reducedMotion;
    this.progress = 0;
    /** 0 = void cinema, 1 = inside the system */
    this.interior = 0;
    /** 0 = no emergence, 1 = GLB revealed */
    this.emergence = 0;
    /** @type {Set<(progress: number, act: number, interior: number, emergence: number) => void>} */
    this._listeners = new Set();

    this._initLenis();
    this._buildTimeline();
  }

  /**
   * @param {(progress: number, act: number, interior: number, emergence: number) => void} fn
   * @returns {() => void}
   */
  onProgress(fn) {
    this._listeners.add(fn);
    fn(this.progress, this.getAct(this.progress), this.interior, this.emergence);
    return () => this._listeners.delete(fn);
  }

  /**
   * @param {number} progress 0–1
   * @returns {number} 1–5
   */
  getAct(progress) {
    if (progress < 0.2) return 1;
    if (progress < 0.4) return 2;
    if (progress < 0.6) return 3;
    if (progress < 0.8) return 4;
    return 5;
  }

  _emit(progress) {
    this.progress = progress;
    const act = this.getAct(progress);
    this._listeners.forEach((fn) => fn(progress, act, this.interior, this.emergence));
  }

  _initLenis() {
    this.lenis = new Lenis({
      lerp: this._reducedMotion ? 0.35 : 0.1,
      smoothWheel: !this._reducedMotion,
      syncTouch: false,
    });

    this.lenis.on('scroll', ScrollTrigger.update);
  }

  _buildTimeline() {
    const { camera, postProcessing } = this.sceneManager;

    const orbit = {
      theta: ORBIT.act1.theta,
      phi: ORBIT.act1.phi,
      radius: ORBIT.act1.radius,
      yBias: ORBIT.act1.yBias,
      fov: ORBIT.act1.fov,
    };

    const optics = {
      noiseFrequency: NOISE_FREQ_IDLE,
      distortionBoost: 0,
      bloomStrength: 0.045,
      bloomThreshold: 0.965,
      chromatic: 0,
      focus: 0,
      meshRot: 0,
      motionScale: 0.28,
      interior: 0,
      emergence: 0,
    };

    applyOrbit(camera, orbit);
    this.sceneManager.setFov(orbit.fov);
    this.sceneManager.setInteriorMix(0);
    this.sceneManager.setEmergenceMix(0);
    postProcessing?.setOpticalState({
      bloomStrength: optics.bloomStrength,
      bloomThreshold: optics.bloomThreshold,
      chromatic: optics.chromatic,
      focus: optics.focus,
    });

    const syncScene = () => {
      applyOrbit(camera, orbit);
      this.sceneManager.setFov(orbit.fov);
      this.sceneManager.scrollDistortionBoost = this._reducedMotion
        ? 0
        : optics.distortionBoost;
      this.sceneManager.scrollMeshRotation.y = optics.meshRot;
      this.sceneManager.motionScale = optics.motionScale * (1 - optics.interior * 0.9);
      this.interior = optics.interior;
      this.emergence = optics.emergence;
      this.sceneManager.setInteriorMix(optics.interior);
      this.sceneManager.setEmergenceMix(optics.emergence);

      const uniforms = this.sceneManager.modelLoader?.liquidUniforms;
      if (uniforms) {
        uniforms.uNoiseFrequency.value = optics.noiseFrequency;
      }

      postProcessing?.setOpticalState({
        bloomStrength: optics.bloomStrength,
        bloomThreshold: optics.bloomThreshold,
        chromatic: optics.chromatic,
        focus: optics.focus,
      });
    };

    const travelEase = this._reducedMotion ? 'none' : 'power1.inOut';

    this.timeline = gsap.timeline({
      defaults: { ease: travelEase },
      scrollTrigger: {
        trigger: '#film',
        start: 'top top',
        end: 'bottom bottom',
        scrub: this._reducedMotion ? 0.35 : 1,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        syncScene();
        const p = this.timeline?.scrollTrigger?.progress ?? this.timeline.progress();
        this._emit(p);
      },
    });

    this._scrollTrigger = this.timeline.scrollTrigger;

    // ── Act 1: presence ────────────────────────────────────────────────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act1End.theta,
        phi: ORBIT.act1End.phi,
        radius: ORBIT.act1End.radius * (this._reducedMotion ? 0.9 : 1),
        yBias: ORBIT.act1End.yBias,
        fov: ORBIT.act1End.fov,
        duration: 1,
        ease: travelEase,
      },
      0,
    );
    this.timeline.to(
      optics,
      {
        bloomStrength: 0.05,
        bloomThreshold: 0.96,
        meshRot: MESH_ROT_TOTAL * 0.15,
        motionScale: 0.3,
        interior: 0,
        emergence: 0,
        duration: 1,
      },
      0,
    );

    // ── Act 2: architectural orbit ─────────────────────────────────────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act2End.theta,
        phi: ORBIT.act2End.phi,
        radius: ORBIT.act2End.radius * (this._reducedMotion ? 0.92 : 1),
        yBias: ORBIT.act2End.yBias,
        fov: ORBIT.act2End.fov,
        duration: 1,
        ease: this._reducedMotion ? 'none' : 'power1.inOut',
      },
      1,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT2,
        distortionBoost: 0.006,
        bloomStrength: 0.055,
        meshRot: MESH_ROT_TOTAL * 0.4,
        motionScale: 0.22,
        interior: 0,
        emergence: 0,
        duration: 1,
      },
      1,
    );

    // ── Act 3a: threshold HOLD — camera almost still, copy owns beat ───
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act3Hold.theta,
        phi: ORBIT.act3Hold.phi,
        radius: ORBIT.act3Hold.radius,
        yBias: ORBIT.act3Hold.yBias,
        fov: ORBIT.act3Hold.fov,
        duration: 0.55,
        ease: this._reducedMotion ? 'none' : 'power1.out',
      },
      2,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT2,
        distortionBoost: 0.004,
        bloomStrength: 0.05,
        bloomThreshold: 0.96,
        meshRot: MESH_ROT_TOTAL * 0.45,
        motionScale: 0.12,
        interior: 0,
        emergence: 0,
        duration: 0.55,
        ease: this._reducedMotion ? 'none' : 'none',
      },
      2,
    );

    // ── Act 3b: CROSS — dissolve into the system (not a zoom crash) ────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act3End.theta,
        phi: ORBIT.act3End.phi,
        radius: ORBIT.act3End.radius,
        yBias: ORBIT.act3End.yBias,
        fov: ORBIT.act3End.fov,
        duration: 0.45,
        ease: this._reducedMotion ? 'none' : 'power2.in',
      },
      2.55,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT3,
        distortionBoost: this._reducedMotion ? 0.006 : DISTORTION_SURGE,
        bloomStrength: 0.06,
        bloomThreshold: 0.955,
        meshRot: MESH_ROT_TOTAL * 0.5,
        motionScale: 0.08,
        interior: this._reducedMotion ? 0.75 : 0.72,
        emergence: 0,
        duration: 0.45,
        ease: this._reducedMotion ? 'none' : 'power2.in',
      },
      2.55,
    );

    // ── Act 4: digital interior — system owns the frame ────────────────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act4End.theta,
        phi: ORBIT.act4End.phi,
        radius: ORBIT.act4End.radius,
        yBias: ORBIT.act4End.yBias,
        fov: ORBIT.act4End.fov,
        duration: 1,
        ease: this._reducedMotion ? 'none' : 'power1.out',
      },
      3,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_IDLE,
        distortionBoost: 0,
        bloomStrength: 0.025,
        bloomThreshold: 0.975,
        chromatic: 0,
        meshRot: MESH_ROT_TOTAL * 0.52,
        motionScale: 0.04,
        interior: 1,
        emergence: 0,
        duration: 1,
        ease: this._reducedMotion ? 'none' : 'power1.out',
      },
      3,
    );

    // ── Act 5: emerge — same core returns in deep void ─────────────────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act5End.theta,
        phi: ORBIT.act5End.phi,
        radius: ORBIT.act5End.radius,
        yBias: ORBIT.act5End.yBias,
        fov: ORBIT.act5End.fov,
        duration: 1,
        ease: this._reducedMotion ? 'none' : 'power2.inOut',
      },
      4,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_IDLE,
        distortionBoost: 0,
        bloomStrength: 0.045,
        bloomThreshold: 0.965,
        meshRot: MESH_ROT_TOTAL * 0.65,
        motionScale: 0.18,
        interior: 0,
        emergence: 1,
        duration: 1,
        ease: this._reducedMotion ? 'none' : 'power2.inOut',
      },
      4,
    );

    syncScene();
    ScrollTrigger.refresh();
  }

  /**
   * @param {number} timeMs
   */
  raf(timeMs) {
    if (this._disposed || !this.lenis) return;
    this.lenis.raf(timeMs);
  }

  /**
   * @param {string | Element} target
   */
  scrollTo(target) {
    if (this._disposed) return;
    if (this.lenis) {
      this.lenis.scrollTo(target, { offset: 0, duration: this._reducedMotion ? 0.4 : 1.25 });
      return;
    }
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    el?.scrollIntoView({ behavior: this._reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  /** @param {boolean} enabled */
  setScrollingEnabled(enabled) {
    if (!this.lenis) return;
    if (enabled) this.lenis.start();
    else this.lenis.stop();
  }

  destroy() {
    this._disposed = true;
    this._listeners.clear();

    if (this.timeline) {
      this.timeline.kill();
      this.timeline = null;
    }

    if (this._scrollTrigger) {
      this._scrollTrigger.kill();
      this._scrollTrigger = null;
    }

    if (this.lenis) {
      this.lenis.destroy();
      this.lenis = null;
    }
  }
}
