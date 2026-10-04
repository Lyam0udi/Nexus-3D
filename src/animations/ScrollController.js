import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Act-1 macro start — close on the sculpture surface. */
const CAM_ACT1_START = { x: 0, y: 0, z: 4 };
/** Act-1 end / Act-2 start. */
const CAM_ACT1_END = { x: 1, y: 0.5, z: 2.5 };
/** Act-2 orbit landing (≈120° sweep around the core). */
const CAM_ACT2_END = { x: 3, y: -1, z: 3 };
/** Act-3 dive toward the mesh core. */
const CAM_ACT3_END = { x: 0.2, y: 0, z: 0.8 };
/** Act-4 fly-through — looking back at origin. */
const CAM_ACT4_END = { x: 0, y: 0, z: -2 };

const NOISE_FREQ_IDLE = 1.65;
const NOISE_FREQ_ACT2 = 3.4;
const DISTORTION_SURGE = 0.48;
const MESH_ROT_ACT1 = Math.PI / 4; // 45°

/**
 * Lenis momentum scroll + master GSAP ScrollTrigger timeline that drives
 * the 4-act camera / shader choreography against `#app` scroll height.
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

    this._initLenis();
    this._buildTimeline();
  }

  _initLenis() {
    this.lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
    });

    // Keep ScrollTrigger in lockstep with Lenis virtual scroll
    this.lenis.on('scroll', ScrollTrigger.update);
  }

  /**
   * Continuous scrubbed timeline: each act is duration 1 → 25% of scroll.
   */
  _buildTimeline() {
    const { camera } = this.sceneManager;
    const uniformsProxy = {
      noiseFrequency: NOISE_FREQ_IDLE,
      distortionBoost: 0,
    };
    const meshProxy = { rotY: 0 };

    // Seed Act-1 macro framing
    camera.position.set(CAM_ACT1_START.x, CAM_ACT1_START.y, CAM_ACT1_START.z);
    camera.lookAt(0, 0, 0);

    this.timeline = gsap.timeline({
      defaults: { ease: 'power2.out' },
      scrollTrigger: {
        // Keep the 4-act camera map locked to Acts 1–4; contact scrolls after.
        trigger: '#app',
        start: 'top top',
        endTrigger: '#act-4',
        end: 'bottom bottom',
        scrub: 1,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        camera.lookAt(0, 0, 0);
      },
    });

    this._scrollTrigger = this.timeline.scrollTrigger;

    // ── Act 1 (0% → 25%): macro focus + 45° core rotation ──────────────
    this.timeline.to(
      camera.position,
      {
        x: CAM_ACT1_END.x,
        y: CAM_ACT1_END.y,
        z: CAM_ACT1_END.z,
        duration: 1,
        ease: 'power2.out',
      },
      0,
    );
    this.timeline.to(
      meshProxy,
      {
        rotY: MESH_ROT_ACT1,
        duration: 1,
        ease: 'power2.out',
        onUpdate: () => {
          this.sceneManager.scrollMeshRotation.y = meshProxy.rotY;
        },
      },
      0,
    );

    // ── Act 2 (25% → 50%): 120° orbit + noise frequency ramp ───────────
    this.timeline.to(
      camera.position,
      {
        x: CAM_ACT2_END.x,
        y: CAM_ACT2_END.y,
        z: CAM_ACT2_END.z,
        duration: 1,
        ease: 'power2.out',
      },
      1,
    );
    this.timeline.to(
      uniformsProxy,
      {
        noiseFrequency: NOISE_FREQ_ACT2,
        duration: 1,
        ease: 'power2.out',
        onUpdate: () => {
          const uniforms = this.sceneManager.modelLoader?.liquidUniforms;
          if (uniforms) {
            uniforms.uNoiseFrequency.value = uniformsProxy.noiseFrequency;
          }
        },
      },
      1,
    );

    // ── Act 3 (50% → 75%): dive inward + distortion surge ──────────────
    this.timeline.to(
      camera.position,
      {
        x: CAM_ACT3_END.x,
        y: CAM_ACT3_END.y,
        z: CAM_ACT3_END.z,
        duration: 1,
        ease: 'power2.out',
      },
      2,
    );
    this.timeline.to(
      uniformsProxy,
      {
        distortionBoost: DISTORTION_SURGE,
        duration: 1,
        ease: 'power2.out',
        onUpdate: () => {
          this.sceneManager.scrollDistortionBoost = uniformsProxy.distortionBoost;
        },
      },
      2,
    );

    // ── Act 4 (75% → 100%): fly through core, look back at origin ──────
    this.timeline.to(
      camera.position,
      {
        x: CAM_ACT4_END.x,
        y: CAM_ACT4_END.y,
        z: CAM_ACT4_END.z,
        duration: 1,
        ease: 'power2.out',
      },
      3,
    );

    // Ensure ScrollTrigger measures after layout / fonts
    ScrollTrigger.refresh();
  }

  /**
   * Drive Lenis from the main application RAF loop.
   * @param {number} timeMs DOMHighResTimeStamp from requestAnimationFrame
   */
  raf(timeMs) {
    if (this._disposed || !this.lenis) return;
    this.lenis.raf(timeMs);
  }

  /**
   * Smooth-scroll to a section/element via Lenis when available.
   * @param {string | Element} target
   */
  scrollTo(target) {
    if (this._disposed) return;
    if (this.lenis) {
      this.lenis.scrollTo(target, { offset: 0, duration: 1.2 });
      return;
    }
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Pause/resume Lenis (e.g. while the mobile nav is open). */
  setScrollingEnabled(enabled) {
    if (!this.lenis) return;
    if (enabled) this.lenis.start();
    else this.lenis.stop();
  }

  /** Tear down Lenis, ScrollTrigger, and the master timeline. */
  destroy() {
    this._disposed = true;

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
