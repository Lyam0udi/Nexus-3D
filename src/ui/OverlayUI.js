import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TILT_MAX = 10;
const TILT_EASE = 0.12;

/**
 * Luxury overlay interactions: glass-card tilt + Act-3 metric counters.
 * Keeps pointer-events isolation intact — only `.interactive` nodes receive input.
 */
export class OverlayUI {
  constructor() {
    this._disposed = false;
    this._tiltCleanups = [];
    this._triggers = [];

    this._initTiltCards();
    this._initMetricCounters();
  }

  _initTiltCards() {
    const cards = document.querySelectorAll('[data-tilt]');
    cards.forEach((card) => {
      const state = { rx: 0, ry: 0, tx: 0, ty: 0 };
      let rafId = 0;

      const tick = () => {
        if (this._disposed) return;
        state.rx += (state.tx - state.rx) * TILT_EASE;
        state.ry += (state.ty - state.ry) * TILT_EASE;
        card.style.transform = `perspective(800px) rotateX(${state.rx}deg) rotateY(${state.ry}deg)`;
        if (Math.abs(state.tx - state.rx) > 0.01 || Math.abs(state.ty - state.ry) > 0.01) {
          rafId = requestAnimationFrame(tick);
        } else {
          rafId = 0;
        }
      };

      const requestTick = () => {
        if (!rafId) rafId = requestAnimationFrame(tick);
      };

      const onMove = (event) => {
        const rect = card.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        state.ty = (px - 0.5) * TILT_MAX * 2;
        state.tx = (0.5 - py) * TILT_MAX * 2;
        requestTick();
      };

      const onLeave = () => {
        state.tx = 0;
        state.ty = 0;
        requestTick();
      };

      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerleave', onLeave);
      card.addEventListener('pointercancel', onLeave);

      this._tiltCleanups.push(() => {
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerleave', onLeave);
        card.removeEventListener('pointercancel', onLeave);
        if (rafId) cancelAnimationFrame(rafId);
        card.style.transform = '';
      });
    });
  }

  _initMetricCounters() {
    const panel = document.getElementById('metrics-panel');
    if (!panel) return;

    const metrics = panel.querySelectorAll('[data-metric]');

    metrics.forEach((metric) => {
      const numEl = metric.querySelector('.metric__num');
      if (!numEl) return;

      const target = Number(metric.dataset.target) || 0;
      const proxy = { value: 0 };

      const trigger = ScrollTrigger.create({
        trigger: metric,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.to(proxy, {
            value: target,
            duration: 1.6,
            ease: 'power2.out',
            onUpdate: () => {
              numEl.textContent = String(Math.round(proxy.value));
            },
          });
        },
      });

      this._triggers.push(trigger);
    });
  }

  destroy() {
    this._disposed = true;
    this._tiltCleanups.forEach((fn) => fn());
    this._tiltCleanups = [];
    this._triggers.forEach((t) => t.kill());
    this._triggers = [];
  }
}
