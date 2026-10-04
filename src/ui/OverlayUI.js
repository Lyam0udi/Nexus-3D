import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TILT_MAX = 10;
const TILT_EASE = 0.12;

/**
 * Luxury overlay interactions: glass-card tilt, Act-3 metric counters,
 * sticky nav chrome, and contact form feedback.
 * Keeps pointer-events isolation intact — only `.interactive` nodes receive input.
 */
export class OverlayUI {
  /**
   * @param {{ scrollTo?: (target: string | Element) => void, setScrollingEnabled?: (enabled: boolean) => void }} [options]
   */
  constructor(options = {}) {
    this._disposed = false;
    this._tiltCleanups = [];
    this._triggers = [];
    this._listeners = [];
    this._scrollTo = typeof options.scrollTo === 'function' ? options.scrollTo : null;
    this._setScrollingEnabled =
      typeof options.setScrollingEnabled === 'function' ? options.setScrollingEnabled : null;

    this._header = document.getElementById('site-header');
    this._nav = document.getElementById('site-nav');
    this._navToggle = document.getElementById('nav-toggle');

    this._initTiltCards();
    this._initMetricCounters();
    this._initStickyHeader();
    this._initMobileNav();
    this._initSmoothAnchors();
    this._initContactForm();
    this._initFooterYear();
  }

  _addListener(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    this._listeners.push(() => target.removeEventListener(type, handler, options));
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

  _initStickyHeader() {
    if (!this._header) return;

    const onScroll = () => {
      const scrolled = window.scrollY > 12;
      this._header.classList.toggle('is-scrolled', scrolled);
    };

    onScroll();
    this._addListener(window, 'scroll', onScroll, { passive: true });
  }

  _setNavOpen(open) {
    if (!this._header || !this._navToggle) return;
    this._header.classList.toggle('is-nav-open', open);
    this._navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    this._navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    this._setScrollingEnabled?.(!open);
  }

  _initMobileNav() {
    if (!this._navToggle || !this._nav || !this._header) return;

    this._addListener(this._navToggle, 'click', () => {
      const open = !this._header.classList.contains('is-nav-open');
      this._setNavOpen(open);
    });

    this._nav.querySelectorAll('[data-nav-link]').forEach((link) => {
      this._addListener(link, 'click', () => this._setNavOpen(false));
    });

    this._addListener(window, 'keydown', (event) => {
      if (event.key === 'Escape') this._setNavOpen(false);
    });

    this._addListener(window, 'resize', () => {
      if (window.innerWidth >= 768) this._setNavOpen(false);
    });
  }

  _initSmoothAnchors() {
    const anchors = document.querySelectorAll('a[href^="#"]');
    anchors.forEach((anchor) => {
      this._addListener(anchor, 'click', (event) => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        event.preventDefault();
        this._setNavOpen(false);
        if (this._scrollTo) this._scrollTo(target);
        else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  _initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const status = document.getElementById('contact-status');
    const submit = document.getElementById('contact-submit');

    this._addListener(form, 'submit', (event) => {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        if (status) {
          status.textContent = 'Please complete all required fields.';
          status.classList.add('is-error');
        }
        return;
      }

      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const subject = String(data.get('subject') || '').trim();
      const message = String(data.get('message') || '').trim();

      const body = [
        `Name: ${name}`,
        `Email: ${email}`,
        '',
        message,
      ].join('\n');

      const mailto = `mailto:hello@nexus3d.studio?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

      if (status) {
        status.textContent = 'Opening your mail client…';
        status.classList.remove('is-error');
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Preparing…';
      }

      window.location.href = mailto;

      window.setTimeout(() => {
        if (this._disposed) return;
        form.reset();
        if (status) {
          status.textContent = 'Transmission ready — finish sending in your mail client.';
        }
        if (submit) {
          submit.disabled = false;
          submit.textContent = 'Send Transmission';
        }
      }, 600);
    });
  }

  _initFooterYear() {
    const yearEl = document.getElementById('footer-year');
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
  }

  destroy() {
    this._disposed = true;
    this._setNavOpen(false);
    this._tiltCleanups.forEach((fn) => fn());
    this._tiltCleanups = [];
    this._triggers.forEach((t) => t.kill());
    this._triggers = [];
    this._listeners.forEach((fn) => fn());
    this._listeners = [];
  }
}
