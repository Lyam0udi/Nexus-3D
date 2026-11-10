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
 * Act 5 — long fall → crash → reverse-phoenix heal
 */
const ORBIT = {
  lookAt: { x: 1.05, y: -0.1, z: 0 },
  act1: { theta: -0.28, phi: 1.36, radius: 5.2, yBias: 0.12, fov: 36, lookAtY: -0.1 },
  act1End: { theta: -0.06, phi: 1.33, radius: 5.35, yBias: 0.16, fov: 37, lookAtY: -0.1 },
  act2End: { theta: -0.06 + (Math.PI * 2) / 3, phi: 1.3, radius: 5.4, yBias: -0.05, fov: 38, lookAtY: -0.1 },
  act3Hold: { theta: -0.06 + (Math.PI * 2) / 3 + 0.04, phi: 1.315, radius: 5.12, yBias: 0.02, fov: 37.5, lookAtY: -0.08 },
  act3End: { theta: -0.06 + (Math.PI * 2) / 3 + 0.045, phi: 1.318, radius: 5.0, yBias: 0.025, fov: 37.2, lookAtY: -0.08 },
  act4End: { theta: -0.06 + (Math.PI * 2) / 3 + 0.05, phi: 1.32, radius: 4.95, yBias: 0.02, fov: 37, lookAtY: -0.08 },
  // Fall start: 3/4 view on the high portal (readable silhouette)
  act5FallStart: {
    theta: -0.06 + (Math.PI * 2) / 3 + 0.08,
    phi: 1.18,
    radius: 6.2,
    yBias: 0.4,
    fov: 40,
    lookAtY: 3.2,
  },
  // Fall end: still tracking the portal as it nears the ground
  act5Fall: {
    theta: -0.06 + (Math.PI * 2) / 3 + 0.14,
    phi: 1.12,
    radius: 5.7,
    yBias: 0.15,
    fov: 44,
    lookAtY: -0.35,
  },
  // Impact: punch into the plate
  act5Impact: {
    theta: -0.06 + (Math.PI * 2) / 3 + 0.16,
    phi: 1.22,
    radius: 4.55,
    yBias: -0.08,
    fov: 42,
    lookAtY: -1.05,
  },
  // Broken hold: linger on shattered portal + plate
  act5Broken: {
    theta: -0.06 + (Math.PI * 2) / 3 + 0.18,
    phi: 1.2,
    radius: 4.9,
    yBias: 0.02,
    fov: 38,
    lookAtY: -0.9,
  },
  // Heal: pull back as the original portal reforms upright
  act5End: {
    theta: -0.06 + (Math.PI * 2) / 3 + 0.22,
    phi: 1.3,
    radius: 5.5,
    yBias: 0.2,
    fov: 34,
    lookAtY: 0.08,
  },
};

/**
 * Fallback beat map (progress 0–1) if DOM measure is unavailable.
 * Real beats are measured from #film section offsets in _measureBeats().
 */
const FALLBACK_BEATS = {
  tAct2: 0.1,
  tAct3: 0.2,
  tBoot: 0.3,
  tDwell: 0.42,
  tExit: 0.62,
  tFall: 0.74,
  tHit: 0.9,
  tBroken: 0.92,
  tHeal: 0.95,
  d1: 0.1,
  d2: 0.1,
  d3Hold: 0.055,
  d3Cross: 0.045,
  dBoot: 0.12,
  dDwell: 0.2,
  dExit: 0.12,
  dFall: 0.16,
  dHit: 0.02,
  dBroken: 0.03,
  dHeal: 0.05,
  T_TOTAL: 1,
};

/**
 * Map film section layout → timeline durations (progress units).
 * Keeps system veil through #act-4-exit and starts fall with #act-5-fall.
 */
function measureFilmBeats() {
  const film = document.getElementById('film');
  if (!film) return { ...FALLBACK_BEATS };

  const span = Math.max(1, film.offsetHeight - window.innerHeight);
  const origin = film.offsetTop;
  const pAt = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    return Math.max(0, Math.min(1, (el.offsetTop - origin) / span));
  };

  const tBoot = pAt('act-4-boot');
  const tDwell = pAt('act-4');
  const tExit = pAt('act-4-exit');
  const tFall = pAt('act-5-fall');
  const tCore = pAt('act-5');
  if (
    tBoot == null ||
    tDwell == null ||
    tExit == null ||
    tFall == null ||
    tCore == null
  ) {
    return { ...FALLBACK_BEATS };
  }

  const early = Math.max(0.06, tBoot);
  const d1 = early / 3;
  const d2 = early / 3;
  const d3 = early / 3;
  const d3Hold = d3 * 0.55;
  const d3Cross = d3 * 0.45;

  const dBoot = Math.max(0.03, tDwell - tBoot);
  const dDwell = Math.max(0.04, tExit - tDwell);
  const dExit = Math.max(0.04, tFall - tExit);
  const fallBlock = Math.max(0.08, tCore - tFall);
  const dFall = fallBlock * 0.72;
  const dHit = fallBlock * 0.1;
  const dBroken = fallBlock * 0.18;
  const dHeal = Math.max(0.04, 1 - tCore);

  return {
    tAct2: d1,
    tAct3: d1 + d2,
    tBoot,
    tDwell,
    tExit,
    tFall,
    tHit: tFall + dFall,
    tBroken: tFall + dFall + dHit,
    tHeal: tFall + dFall + dHit + dBroken,
    d1,
    d2,
    d3Hold,
    d3Cross,
    dBoot,
    dDwell,
    dExit,
    dFall,
    dHit,
    dBroken,
    dHeal,
    T_TOTAL: 1,
  };
}

const NOISE_FREQ_IDLE = 1.05;
const NOISE_FREQ_ACT2 = 1.2;
const NOISE_FREQ_ACT3 = 1.28;
const DISTORTION_SURGE = 0.01;
const MESH_ROT_TOTAL = Math.PI * 0.08;
/** Navbar click speed in pixels per second. This is the only knob. */
const NAV_PX_PER_SEC = 672;

/**
 * @param {import('three').PerspectiveCamera} camera
 * @param {{ theta: number, phi: number, radius: number, yBias: number, lookAtY?: number }} state
 */
function applyOrbit(camera, state) {
  const sinPhi = Math.sin(state.phi);
  camera.position.set(
    state.radius * sinPhi * Math.sin(state.theta),
    state.radius * Math.cos(state.phi) + state.yBias,
    state.radius * sinPhi * Math.cos(state.theta),
  );
  const lookY = typeof state.lookAtY === 'number' ? state.lookAtY : ORBIT.lookAt.y;
  camera.lookAt(ORBIT.lookAt.x, lookY, ORBIT.lookAt.z);
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
    this._coarsePointer = Boolean(sceneManager._lowPower);
    this.progress = 0;
    /** 0 = void cinema, 1 = inside the system */
    this.interior = 0;
    /** 0 = no emergence, 1 = fall/crash/heal complete */
    this.emergence = 0;
    /** 0–1 reverse-phoenix heal */
    this.heal = 0;
    this._beats = { ...FALLBACK_BEATS };
    /** When true, timeline tracks scroll 1:1 (navbar travel — no scrub whoosh). */
    this._navLockstep = false;
    /** @type {gsap.core.Tween | null} */
    this._navTween = null;
    /** @type {Set<(progress: number, act: number, interior: number, emergence: number, heal: number) => void>} */
    this._listeners = new Set();

    this._initLenis();
    this._buildTimeline();
  }

  /**
   * @param {(progress: number, act: number, interior: number, emergence: number, heal: number) => void} fn
   * @returns {() => void}
   */
  onProgress(fn) {
    this._listeners.add(fn);
    fn(this.progress, this.getAct(this.progress), this.interior, this.emergence, this.heal);
    return () => this._listeners.delete(fn);
  }

  /**
   * @param {number} progress 0–1
   * @returns {number} 1–5
   */
  getAct(progress) {
    const b = this._beats || FALLBACK_BEATS;
    const p = Math.max(0, Math.min(1, progress));
    if (p < b.tAct2) return 1;
    if (p < b.tAct3) return 2;
    if (p < b.tBoot) return 3;
    if (p < b.tFall) return 4;
    return 5;
  }

  _emit(progress) {
    this.progress = progress;
    const act = this.getAct(progress);
    this._listeners.forEach((fn) => fn(progress, act, this.interior, this.emergence, this.heal));
  }

  _initLenis() {
    this.lenis = new Lenis({
      lerp: this._reducedMotion ? 0.35 : this._coarsePointer ? 0.18 : 0.1,
      smoothWheel: !this._reducedMotion,
      syncTouch: false,
      // Nav travel is driven by our tween. Don't let reduced-motion turn clicks into jumps.
      respectReducedMotion: false,
    });

    this.lenis.on('scroll', () => {
      ScrollTrigger.update();
      if (this._navLockstep) this._syncFilmToScroll();
    });

    this._offNavWheel = this.lenis.on('virtual-scroll', (data) => {
      if (!this._navTween) return;
      const delta = Math.abs(data?.deltaY || 0) + Math.abs(data?.deltaX || 0);
      if (delta < 0.5) return;
      this._cancelNavTravel();
    });

    this._onNavKey = (event) => {
      if (!this._navTween) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) {
        this._cancelNavTravel();
      }
    };
    window.addEventListener('keydown', this._onNavKey);
  }

  /** Stop navbar auto-scroll so a real user scroll can take over. */
  _cancelNavTravel() {
    if (!this._navTween) return;
    this._navTween.kill();
  }

  _releaseNavTravel() {
    this._navTween = null;
    this._navLockstep = false;
  }

  _scrubAmount() {
    if (this._reducedMotion) return 0.35;
    // Mobile: less lag so threshold/cross don't feel sticky then snap
    if (this._coarsePointer) return 0.35;
    // Keep some cinematic lag, but tight enough that nav can settle on System
    return 0.5;
  }

  _buildTimeline() {
    const { camera, postProcessing } = this.sceneManager;
    const b = measureFilmBeats();
    this._beats = b;

    const orbit = {
      theta: ORBIT.act1.theta,
      phi: ORBIT.act1.phi,
      radius: ORBIT.act1.radius,
      yBias: ORBIT.act1.yBias,
      fov: ORBIT.act1.fov,
      lookAtY: ORBIT.act1.lookAtY,
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
      impact: 0,
      heal: 0,
      plate: 0,
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
      this.heal = optics.heal;
      this.sceneManager.setInteriorMix(optics.interior);
      this.sceneManager.setEmergenceMix(
        optics.emergence,
        optics.impact,
        optics.heal,
        optics.plate,
      );

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
        scrub: this._scrubAmount(),
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        syncScene();
        const p = this.timeline?.scrollTrigger?.progress ?? this.timeline.progress();
        this._emit(p);
      },
    });

    this._scrollTrigger = this.timeline.scrollTrigger;

    // Durations are film-progress units from measured section offsets
    const {
      d1,
      d2,
      d3Hold,
      d3Cross,
      dBoot,
      dDwell,
      dExit,
      dFall,
      dHit,
      dBroken,
      dHeal,
      tAct2,
      tAct3,
      tBoot,
      tDwell,
      tExit,
      tFall,
      tHit,
      tBroken,
      tHeal,
    } = b;

    // ── Act 1: presence ────────────────────────────────────────────────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act1End.theta,
        phi: ORBIT.act1End.phi,
        radius: ORBIT.act1End.radius * (this._reducedMotion ? 0.9 : 1),
        yBias: ORBIT.act1End.yBias,
        fov: ORBIT.act1End.fov,
        lookAtY: ORBIT.act1End.lookAtY,
        duration: d1,
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
        impact: 0,
        heal: 0,
        plate: 0,
        duration: d1,
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
        lookAtY: ORBIT.act2End.lookAtY,
        duration: d2,
        ease: this._reducedMotion ? 'none' : 'power1.inOut',
      },
      tAct2,
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
        impact: 0,
        heal: 0,
        plate: 0,
        duration: d2,
      },
      tAct2,
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
        lookAtY: ORBIT.act3Hold.lookAtY,
        duration: d3Hold,
        ease: this._reducedMotion ? 'none' : 'power1.out',
      },
      tAct3,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT2,
        distortionBoost: 0.003,
        bloomStrength: 0.048,
        bloomThreshold: 0.962,
        meshRot: MESH_ROT_TOTAL * 0.45,
        motionScale: 0.12,
        interior: 0,
        emergence: 0,
        impact: 0,
        heal: 0,
        plate: 0,
        duration: d3Hold,
        ease: 'none',
      },
      tAct3,
    );

    // ── Act 3b: CROSS — commit fully into the system (forget the square) ─
    const crossEase = this._reducedMotion ? 'none' : 'power2.inOut';
    const tCross = tAct3 + d3Hold;
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act3End.theta,
        phi: ORBIT.act3End.phi,
        radius: ORBIT.act3End.radius,
        yBias: ORBIT.act3End.yBias,
        fov: ORBIT.act3End.fov,
        lookAtY: ORBIT.act3End.lookAtY,
        duration: d3Cross,
        ease: crossEase,
      },
      tCross,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT3,
        distortionBoost: this._reducedMotion ? 0.004 : DISTORTION_SURGE,
        bloomStrength: this._coarsePointer ? 0.035 : 0.045,
        bloomThreshold: 0.96,
        meshRot: MESH_ROT_TOTAL * 0.5,
        motionScale: 0.04,
        // Full interior — sculpture leaves memory before the card
        interior: 1,
        emergence: 0,
        impact: 0,
        heal: 0,
        plate: 0,
        duration: d3Cross,
        ease: crossEase,
      },
      tCross,
    );

    // ── Act 4a: BOOT — liminal system void, no terminal card yet ───────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act4End.theta,
        phi: ORBIT.act4End.phi,
        radius: ORBIT.act4End.radius,
        yBias: ORBIT.act4End.yBias,
        fov: ORBIT.act4End.fov,
        lookAtY: ORBIT.act4End.lookAtY,
        duration: dBoot,
        ease: this._reducedMotion ? 'none' : 'power1.out',
      },
      tBoot,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_IDLE,
        distortionBoost: 0,
        bloomStrength: 0.02,
        bloomThreshold: 0.98,
        chromatic: 0,
        focus: 0,
        meshRot: MESH_ROT_TOTAL * 0.52,
        motionScale: 0.02,
        interior: 1,
        emergence: 0,
        impact: 0,
        heal: 0,
        plate: 0,
        duration: dBoot,
        ease: 'none',
      },
      tBoot,
    );

    // ── Act 4b: DWELL — breathe inside the room ────────────────────────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act4End.theta,
        phi: ORBIT.act4End.phi,
        radius: ORBIT.act4End.radius * 0.98,
        yBias: ORBIT.act4End.yBias,
        fov: ORBIT.act4End.fov,
        lookAtY: ORBIT.act4End.lookAtY,
        duration: dDwell,
        ease: this._reducedMotion ? 'none' : 'none',
      },
      tDwell,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_IDLE,
        distortionBoost: 0,
        bloomStrength: 0.02,
        bloomThreshold: 0.98,
        chromatic: 0,
        meshRot: MESH_ROT_TOTAL * 0.52,
        motionScale: 0.02,
        interior: 1,
        emergence: 0,
        impact: 0,
        heal: 0,
        plate: 0,
        duration: dDwell,
        ease: 'none',
      },
      tDwell,
    );

    // ── Act 4c: EXIT — liminal hinge; still in system, no fall yet ─────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act4End.theta,
        phi: ORBIT.act4End.phi,
        radius: ORBIT.act4End.radius * 0.98,
        yBias: ORBIT.act4End.yBias,
        fov: ORBIT.act4End.fov,
        lookAtY: ORBIT.act4End.lookAtY,
        duration: dExit,
        ease: 'none',
      },
      tExit,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_IDLE,
        distortionBoost: 0,
        bloomStrength: 0.02,
        bloomThreshold: 0.98,
        chromatic: 0,
        meshRot: MESH_ROT_TOTAL * 0.52,
        motionScale: 0.02,
        interior: 1,
        emergence: 0,
        impact: 0,
        heal: 0,
        plate: 0,
        duration: dExit,
        ease: 'none',
      },
      tExit,
    );

    // ── Act 5: FALL → HIT plate → BROKEN hold → HEAL ───────────────────
    const fallEase = this._reducedMotion ? 'none' : 'power1.in';
    const dFallSnap = Math.min(dFall * 0.12, dFall * 0.5);
    const dInteriorPeel = Math.min(dFall * 0.18, dFall);

    this.timeline.to(
      optics,
      {
        interior: 0,
        duration: dInteriorPeel,
        ease: this._reducedMotion ? 'none' : 'power2.out',
      },
      tFall,
    );

    // Snap onto the high portal, then ride the drop (plate fades in mid-fall)
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act5FallStart.theta,
        phi: ORBIT.act5FallStart.phi,
        radius: ORBIT.act5FallStart.radius,
        yBias: ORBIT.act5FallStart.yBias,
        fov: ORBIT.act5FallStart.fov,
        lookAtY: ORBIT.act5FallStart.lookAtY,
        duration: dFallSnap,
        ease: this._reducedMotion ? 'none' : 'power2.out',
      },
      tFall,
    );
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act5Fall.theta,
        phi: ORBIT.act5Fall.phi,
        radius: ORBIT.act5Fall.radius,
        yBias: ORBIT.act5Fall.yBias,
        fov: ORBIT.act5Fall.fov,
        lookAtY: ORBIT.act5Fall.lookAtY,
        duration: Math.max(0.01, dFall - dFallSnap),
        ease: fallEase,
      },
      tFall + dFallSnap,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT3,
        distortionBoost: this._reducedMotion ? 0 : 0.008,
        bloomStrength: this._coarsePointer ? 0.04 : 0.05,
        bloomThreshold: 0.958,
        chromatic: this._coarsePointer ? 0 : 0.004,
        focus: this._coarsePointer ? 0.08 : 0.2,
        meshRot: MESH_ROT_TOTAL * 0.7,
        motionScale: 0.16,
        emergence: 0.7,
        impact: 0,
        heal: 0,
        plate: 1,
        duration: dFall,
        ease: fallEase,
      },
      tFall,
    );

    // ── HIT — contact with the square plate ────────────────────────────
    const hitEase = this._reducedMotion ? 'none' : 'power4.in';
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act5Impact.theta,
        phi: ORBIT.act5Impact.phi,
        radius: ORBIT.act5Impact.radius,
        yBias: ORBIT.act5Impact.yBias,
        fov: ORBIT.act5Impact.fov,
        lookAtY: ORBIT.act5Impact.lookAtY,
        duration: dHit,
        ease: hitEase,
      },
      tHit,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT3,
        distortionBoost: this._reducedMotion ? 0 : 0.018,
        bloomStrength: this._coarsePointer ? 0.09 : 0.14,
        bloomThreshold: 0.93,
        chromatic: this._coarsePointer ? 0 : 0.016,
        focus: this._coarsePointer ? 0.18 : 0.4,
        meshRot: MESH_ROT_TOTAL * 0.78,
        motionScale: 0.05,
        interior: 0,
        emergence: 0.86,
        impact: 1,
        heal: 0,
        plate: 1,
        duration: dHit,
        ease: hitEase,
      },
      tHit,
    );

    // ── BROKEN — hold the shatter so the crash reads ───────────────────
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act5Broken.theta,
        phi: ORBIT.act5Broken.phi,
        radius: ORBIT.act5Broken.radius,
        yBias: ORBIT.act5Broken.yBias,
        fov: ORBIT.act5Broken.fov,
        lookAtY: ORBIT.act5Broken.lookAtY,
        duration: dBroken,
        ease: this._reducedMotion ? 'none' : 'power1.out',
      },
      tBroken,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_ACT3,
        distortionBoost: this._reducedMotion ? 0 : 0.006,
        bloomStrength: 0.06,
        bloomThreshold: 0.95,
        chromatic: this._coarsePointer ? 0 : 0.004,
        focus: 0.12,
        meshRot: MESH_ROT_TOTAL * 0.78,
        motionScale: 0.04,
        interior: 0,
        emergence: 0.88,
        impact: 1,
        heal: 0,
        plate: 1,
        duration: dBroken,
        ease: 'none',
      },
      tBroken,
    );

    // ── HEAL — magnet → lock → rise; plate cracks light bronze ─────────
    const healEase = this._reducedMotion ? 'none' : 'power2.inOut';
    this.timeline.to(
      orbit,
      {
        theta: ORBIT.act5End.theta,
        phi: ORBIT.act5End.phi,
        radius: ORBIT.act5End.radius,
        yBias: ORBIT.act5End.yBias,
        fov: ORBIT.act5End.fov,
        lookAtY: ORBIT.act5End.lookAtY,
        duration: dHeal,
        ease: healEase,
      },
      tHeal,
    );
    this.timeline.to(
      optics,
      {
        noiseFrequency: NOISE_FREQ_IDLE,
        distortionBoost: 0,
        bloomStrength: 0.055,
        bloomThreshold: 0.96,
        chromatic: 0,
        focus: 0,
        meshRot: MESH_ROT_TOTAL * 0.5,
        motionScale: 0.24,
        interior: 0,
        emergence: 1,
        impact: 0,
        heal: 1,
        plate: 0.15,
        duration: dHeal,
        ease: healEase,
      },
      tHeal,
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
    if (this._navLockstep) this._syncFilmToScroll();
  }

  /** @param {number} scrollY */
  _rawProgressFromScroll(scrollY) {
    const st = this._scrollTrigger;
    if (!st) return this.progress;
    const start = st.start;
    const end = st.end;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return this.progress;
    const span = end - start;
    if (span <= 1e-6) return 0;
    return Math.max(0, Math.min(1, (scrollY - start) / span));
  }

  /** Keep the scrubbed film on the live scroll position (used during nav). */
  _syncFilmToScroll(emit = false) {
    if (!this.timeline || this._disposed) return;
    const scroll = this.lenis?.scroll ?? window.scrollY ?? 0;
    const p = this._rawProgressFromScroll(scroll);
    if (!Number.isFinite(p)) return;
    this.timeline.progress(p);
    if (emit) {
      ScrollTrigger.update();
      this._emit(p);
    }
  }

  /** @param {Element} el @param {number} scrollY */
  _absoluteTop(el, scrollY) {
    return el.getBoundingClientRect().top + scrollY;
  }

  /** Land in Act 4 dwell — past boot, before exit. */
  _systemDestination(scrollY, vh) {
    const room = document.getElementById('act-4');
    if (!room) return scrollY;

    const roomTop = this._absoluteTop(room, scrollY);
    let destination = roomTop + Math.round(vh * 0.2);

    const exit = document.getElementById('act-4-exit');
    if (exit) {
      const exitTop = this._absoluteTop(exit, scrollY);
      destination = Math.min(destination, exitTop - Math.round(vh * 0.65));
    }

    return Math.max(destination, roomTop + Math.round(vh * 0.08));
  }

  /** @param {number} y */
  _setScrollY(y) {
    const top = Math.max(0, y);
    if (this.lenis) {
      this.lenis.scrollTo(top, { immediate: true, force: true });
      return;
    }
    window.scrollTo(0, top);
  }

  /**
   * Navbar travel at a fixed slow pace. GSAP moves scroll; Lenis only applies it.
   * @param {string | Element} target
   */
  scrollTo(target) {
    if (this._disposed) return;

    const el =
      typeof target === 'string'
        ? document.querySelector(target)
        : target instanceof Element
          ? target
          : null;
    if (!el) return;

    const headerH = document.getElementById('site-header')?.offsetHeight ?? 52;
    const id = el.id || '';
    const current = this.lenis?.scroll ?? window.scrollY ?? 0;
    const vh = window.innerHeight || 800;
    const toSystem = id === 'system-room' || id === 'act-4';

    let destination = toSystem
      ? this._systemDestination(current, vh)
      : this._absoluteTop(el, current) -
        (id === 'act-5' || id === 'coda' || id === 'contact' ? headerH + 24 : headerH + 12);

    destination = Math.max(0, destination);
    if (!Number.isFinite(destination)) return;

    this._cancelNavTravel();

    const distance = Math.abs(destination - current);
    if (distance < 4) {
      this._setScrollY(destination);
      this._syncFilmToScroll(true);
      return;
    }

    const duration = distance / NAV_PX_PER_SEC;

    const state = { y: current };
    this._navLockstep = true;

    this._navTween = gsap.to(state, {
      y: destination,
      duration,
      ease: 'none',
      onUpdate: () => {
        if (!this._navTween) return;
        this._setScrollY(state.y);
        this._syncFilmToScroll();
      },
      onComplete: () => {
        this._releaseNavTravel();
        this._setScrollY(destination);
        this._syncFilmToScroll(true);
      },
      onInterrupt: () => {
        this._releaseNavTravel();
      },
    });
  }

  /** @param {boolean} enabled */
  setScrollingEnabled(enabled) {
    if (!this.lenis) return;
    if (enabled) this.lenis.start();
    else this.lenis.stop();
  }

  destroy() {
    this._disposed = true;
    this._cancelNavTravel();
    this._releaseNavTravel();
    if (this._onNavKey) window.removeEventListener('keydown', this._onNavKey);
    if (typeof this._offNavWheel === 'function') this._offNavWheel();
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
