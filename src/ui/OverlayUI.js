import gsap from 'gsap';

/**
 * Cinematic HUD / overlay choreography.
 * Act overlays enter · hold · exit with the film; coda stays readable.
 * Keeps pointer-events isolation — only `.interactive` nodes receive input.
 */
export class OverlayUI {
  /**
   * @param {{
   *   scrollTo?: (target: string | Element) => void,
   *   setScrollingEnabled?: (enabled: boolean) => void,
   *   onProgress?: (fn: (progress: number, act: number) => void) => () => void,
   * }} [options]
   */
  constructor(options = {}) {
    this._disposed = false;
    this._navOpen = false;
    this._listeners = [];
    this._unsubscribeProgress = null;
    this._introTween = null;
    this._scrollTo = typeof options.scrollTo === 'function' ? options.scrollTo : null;
    this._setScrollingEnabled =
      typeof options.setScrollingEnabled === 'function' ? options.setScrollingEnabled : null;
    this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._header = document.getElementById('site-header');
    this._nav = document.getElementById('site-nav');
    this._navToggle = document.getElementById('nav-toggle');

    this._acts = {
      1: document.getElementById('act-1'),
      2: document.getElementById('act-2'),
      3: document.getElementById('act-3'),
      boot: document.getElementById('act-4-boot'),
      4: document.getElementById('act-4'),
      exit: document.getElementById('act-4-exit'),
      fall: document.getElementById('act-5-fall'),
      5: document.getElementById('act-5'),
    };
    this._hudItems = Array.from(document.querySelectorAll('[data-hud-item]'));
    this._systemInterior = document.getElementById('system-interior');
    this._introDone = this._reducedMotion;
    this._lastProgress = 0;
    this._lastAct = 1;
    this._lastInterior = 0;
    this._lastEmergence = 0;
    this._lastHeal = 0;

    this._initStickyHeader();
    this._initMobileNav();
    this._initSmoothAnchors();
    this._initContactForm();
    this._initFooterYear();
    this._initLoadIntro();

    if (typeof options.onProgress === 'function') {
      this._unsubscribeProgress = options.onProgress(
        (progress, act, interior = 0, emergence = 0, heal = 0) => {
          this._lastProgress = progress;
          this._lastAct = act;
          this._lastInterior = interior;
          this._lastEmergence = emergence;
          this._lastHeal = heal;
          this._choreograph(progress, act, interior, emergence, heal);
        },
      );
    } else {
      this._choreograph(0, 1, 0, 0, 0);
    }
  }

  _addListener(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    this._listeners.push(() => target.removeEventListener(type, handler, options));
  }

  _initLoadIntro() {
    const hero = this._acts[1]?.querySelector('[data-act-stage]');
    if (!hero) return;

    if (this._reducedMotion) {
      gsap.set(hero, { opacity: 1, y: 0 });
      this._introDone = true;
      return;
    }

    gsap.set(hero, { opacity: 0, y: 28 });
    this._introTween = gsap.to(hero, {
      opacity: 1,
      y: 0,
      duration: 1.15,
      delay: 0.2,
      ease: 'power3.out',
      onComplete: () => {
        this._introDone = true;
        this._choreograph(
          this._lastProgress,
          this._lastAct,
          this._lastInterior,
          this._lastEmergence,
          this._lastHeal,
        );
      },
    });
  }

  /**
   * Map film progress → overlay visibility + interior / emergence modes.
   * Boot / system / exit / fall copy follow their DOM sections so text
   * cannot fire on the wrong runway.
   * @param {number} progress
   * @param {number} act
   * @param {number} interior 0–1
   * @param {number} emergence 0–1
   * @param {number} heal 0–1
   */
  _choreograph(progress, act, interior = 0, emergence = 0, heal = 0) {
    if (this._disposed) return;

    const interiorT = Math.max(0, Math.min(1, interior));
    const emergeT = Math.max(0, Math.min(1, emergence));
    const healT = Math.max(0, Math.min(1, heal));

    const p1 = this._framePresence(this._acts[1]);
    const p2 = this._framePresence(this._acts[2]);
    const p3 = this._framePresence(this._acts[3]);
    const pBoot = this._framePresence(this._acts.boot);
    const pTerm = this._framePresence(this._acts[4]);
    const pExit = this._framePresence(this._acts.exit);
    const pFall = this._framePresence(this._acts.fall);
    const pCore = this._framePresence(this._acts[5]);

    // Section presence can unlock System UI even if scrubbed interior lags behind nav
    const inTerminalFrame = pTerm > 0.5 && pExit < 0.4 && emergeT < 0.12;
    const systemGate =
      emergeT < 0.12 ? (interiorT > 0.45 || inTerminalFrame ? 1 : 0) : 0;

    // Veil: optics first, but keep the room lit when the terminal owns the frame
    const veil = Math.max(
      0,
      Math.max(interiorT, inTerminalFrame ? pTerm * 0.95 : 0) * (1 - emergeT),
    );

    // Later beats win so exit never shares the frame with fall copy
    this._setActVisibility(1, p1 * (1 - p2) * (1 - Math.min(1, interiorT + pTerm)));
    this._setActVisibility(2, p2 * (1 - p3) * (1 - Math.min(1, interiorT + pTerm)));
    this._setActVisibility(
      3,
      p3 * (1 - pBoot) * (1 - Math.max(0, (interiorT - 0.15) / 0.85)),
    );
    this._setActVisibility(
      'boot',
      pBoot * (1 - pTerm) * (interiorT > 0.55 && emergeT < 0.08 ? 1 : 0),
    );
    this._setActVisibility(4, pTerm * (1 - pExit) * systemGate);
    this._setActVisibility(
      'exit',
      pExit * (1 - Math.min(1, pFall * 1.15)) * (interiorT > 0.45 && emergeT < 0.2 ? 1 : 0),
    );
    this._setActVisibility(
      'fall',
      pFall * (1 - pExit * 0.85) * (emergeT > 0.04 && emergeT < 0.8 && healT < 0.05 ? 1 : 0),
    );
    this._setActVisibility(5, pCore * (healT > 0.4 ? 1 : 0));

    const hud = p2 * (1 - Math.min(1, interiorT + pTerm));
    this._hudItems.forEach((item, index) => {
      const stagger = index * 0.035;
      const local = Math.max(0, Math.min(1, (hud - stagger) / Math.max(0.001, 1 - stagger)));
      item.style.opacity = String(local);
      item.style.transform = `translate3d(${(1 - local) * -1.25}rem, 0, 0)`;
    });

    if (this._systemInterior) {
      this._systemInterior.style.opacity = String(veil);
      this._systemInterior.style.visibility = veil < 0.04 ? 'hidden' : 'visible';
      this._systemInterior.setAttribute('aria-hidden', veil < 0.2 ? 'true' : 'false');
      this._systemInterior.classList.toggle('is-live', veil > 0.45);
      // Deep room once fully inside — denser scan / grid
      this._systemInterior.classList.toggle('is-deep', veil > 0.75 && emergeT < 0.1);
    }

    document.documentElement.dataset.act = String(act);
    document.documentElement.dataset.interior = veil > 0.45 ? '1' : '0';
    document.documentElement.dataset.emergence = emergeT > 0.45 ? '1' : '0';
    document.documentElement.dataset.heal = healT > 0.45 ? '1' : '0';
    document.documentElement.style.setProperty('--interior', String(veil));
    document.documentElement.style.setProperty('--emergence', String(emergeT));
    document.documentElement.style.setProperty('--heal', String(healT));
  }

  /**
   * How strongly a section owns the viewport (0–1).
   * Tall runways stay present while they cover the frame.
   * @param {HTMLElement | null} el
   */
  _framePresence(el) {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    if (visible <= 0) return 0;

    const cover = visible / vh;
    // Fade in as the section claims the upper half; hold while it covers;
    // fade out as its bottom leaves the lower third.
    const enter = this._smooth(
      Math.max(0, Math.min(1, (vh * 0.72 - rect.top) / Math.max(vh * 0.55, 1e-6))),
    );
    const leave = this._smooth(
      Math.max(0, Math.min(1, (rect.bottom - vh * 0.28) / Math.max(vh * 0.45, 1e-6))),
    );
    const body = this._smooth(Math.max(0, Math.min(1, (cover - 0.22) / 0.48)));
    return Math.min(enter, leave, Math.max(body, enter * leave));
  }

  /** @param {number} t */
  _smooth(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  /**
   * @param {1|2|3|4|5|'fall'|'boot'|'exit'} act
   * @param {number} visibility 0–1
   */
  _setActVisibility(act, visibility) {
    const el = this._acts[act];
    if (!el) return;
    const stage = el.querySelector('[data-act-stage]') || el;
    const v = Math.max(0, Math.min(1, visibility));

    // Load intro owns Act-1 opacity until complete
    if (act === 1 && !this._introDone) {
      el.classList.toggle('is-active', true);
      el.setAttribute('aria-hidden', 'false');
      return;
    }

    stage.style.opacity = String(v);
    stage.style.visibility = v < 0.02 ? 'hidden' : 'visible';
    const drift = (1 - v) * (act === 2 ? 18 : 12);
    stage.style.transform = `translate3d(0, ${drift}px, 0)`;
    el.classList.toggle('is-active', v > 0.2);
    el.setAttribute('aria-hidden', v < 0.15 ? 'true' : 'false');
  }

  _initStickyHeader() {
    if (!this._header) return;

    const onScroll = () => {
      const scrolled = window.scrollY > 8;
      this._header.classList.toggle('is-scrolled', scrolled);
    };

    onScroll();
    this._addListener(window, 'scroll', onScroll, { passive: true });
  }

  _setNavOpen(open) {
    if (!this._header || !this._navToggle) return;
    if (this._navOpen === open) return;
    this._navOpen = open;

    this._header.classList.toggle('is-nav-open', open);
    this._navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    this._navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.documentElement.classList.toggle('is-nav-locked', open);
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

    const desktopMq = window.matchMedia('(min-width: 768px)');
    const onBreakpoint = (event) => {
      if (event.matches) this._setNavOpen(false);
    };
    this._addListener(desktopMq, 'change', onBreakpoint);
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
          status.textContent = 'Please complete the required fields.';
          status.classList.add('is-error');
        }
        return;
      }

      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const email = String(data.get('email') || '').trim();
      const subject = String(data.get('subject') || '').trim();
      const message = String(data.get('message') || '').trim();

      const body = [`Name: ${name}`, `Email: ${email}`, '', message].join('\n');
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
          status.textContent = 'Ready — finish sending in your mail client.';
        }
        if (submit) {
          submit.disabled = false;
          submit.textContent = 'Send message';
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
    this._unsubscribeProgress?.();
    this._unsubscribeProgress = null;
    this._introTween?.kill();
    this._introTween = null;
    this._listeners.forEach((fn) => fn());
    this._listeners = [];
  }
}
