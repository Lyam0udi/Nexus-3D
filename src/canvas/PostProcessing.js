import { Vector2 } from 'three';
import {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  ShaderPass,
} from 'three-stdlib';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

/** Soft radial RGB split — early-outs when amount is ~0. */
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDistortion: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDistortion;
    varying vec2 vUv;

    void main() {
      if (uDistortion < 1e-6) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 center = vUv - 0.5;
      float radial = length(center);
      vec2 direction = radial > 1e-5 ? normalize(center) : vec2(0.0);
      vec2 offset = direction * radial * uDistortion;

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      float a = texture2D(tDiffuse, vUv).a;

      gl_FragColor = vec4(r, g, b, a);
    }
  `,
};

/** Macro focus falloff — no-op unless amount is meaningful. */
const FocusFalloffShader = {
  uniforms: {
    tDiffuse: { value: null },
    uFocus: { value: 0.4 },
    uAmount: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFocus;
    uniform float uAmount;
    varying vec2 vUv;

    void main() {
      vec4 c0 = texture2D(tDiffuse, vUv);
      if (uAmount < 0.01) {
        gl_FragColor = c0;
        return;
      }

      vec2 center = vUv - 0.5;
      float radial = length(center) * 1.35;
      float falloff = smoothstep(uFocus, 1.15, radial) * uAmount;
      vec2 dir = radial > 1e-5 ? normalize(center) : vec2(0.0);
      vec2 step = dir * falloff * 0.008;

      vec4 c1 = texture2D(tDiffuse, vUv + step);
      vec4 c2 = texture2D(tDiffuse, vUv - step);
      vec4 blur = (c0 + c1 + c2) * 0.3333;
      gl_FragColor = mix(c0, blur, clamp(falloff, 0.0, 1.0));
    }
  `,
};

/**
 * Optical stack with FXAA finish.
 * EffectComposer disables native MSAA — FXAA restores stable edges.
 * Bloom is gated off during calm acts to prevent specular fireflies.
 */
export class PostProcessing {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {{ reducedMotion?: boolean }} [options]
   */
  constructor(renderer, scene, camera, options = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this._disposed = false;
    this._reducedMotion = Boolean(options.reducedMotion);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new Vector2(width * pixelRatio, height * pixelRatio),
      0.04,
      0.3,
      0.97,
    );
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    this.focusPass = new ShaderPass(FocusFalloffShader);
    this.composer.addPass(this.focusPass);

    this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.chromaticPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.renderToScreen = true;
    this._syncFxaaResolution(width, height, pixelRatio);
    this.composer.addPass(this.fxaaPass);

    if (this._reducedMotion) {
      this.setBloom(0, 0.98);
      this.setDistortion(0);
      this.setFocus(0);
    }
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {number} pixelRatio
   */
  _syncFxaaResolution(width, height, pixelRatio) {
    if (!this.fxaaPass?.material?.uniforms?.resolution) return;
    this.fxaaPass.material.uniforms.resolution.value.set(
      1 / (width * pixelRatio),
      1 / (height * pixelRatio),
    );
  }

  render() {
    if (this._disposed) return;

    // Calm acts: skip composer so native MSAA keeps glass edges clean.
    // EffectComposer render-targets are not multisampled and create glitter.
    const chroma = this.chromaticPass?.uniforms?.uDistortion?.value ?? 0;
    const focus = this.focusPass?.uniforms?.uAmount?.value ?? 0;
    const quiet =
      !this.bloomPass?.enabled && chroma < 1e-6 && focus < 0.01;

    if (quiet) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.composer.render();
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    if (this._disposed) return;

    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this._syncFxaaResolution(width, height, pixelRatio);
  }

  /** @param {number} value */
  setDistortion(value) {
    if (this.chromaticPass?.uniforms?.uDistortion) {
      this.chromaticPass.uniforms.uDistortion.value = value;
    }
  }

  /**
   * @param {number} strength
   * @param {number} [threshold]
   */
  setBloom(strength, threshold) {
    if (!this.bloomPass) return;
    this.bloomPass.strength = strength;
    if (typeof threshold === 'number') {
      this.bloomPass.threshold = threshold;
    }
    this.bloomPass.enabled = strength > 0.07;
  }

  /**
   * @param {number} amount
   * @param {number} [focus=0.4]
   */
  setFocus(amount, focus = 0.4) {
    if (!this.focusPass?.uniforms) return;
    this.focusPass.uniforms.uAmount.value = amount;
    this.focusPass.uniforms.uFocus.value = focus;
  }

  /**
   * @param {{ bloomStrength?: number, bloomThreshold?: number, chromatic?: number, focus?: number }} state
   */
  setOpticalState(state) {
    if (this._disposed || this._reducedMotion) return;
    if (typeof state.bloomStrength === 'number') {
      this.setBloom(state.bloomStrength, state.bloomThreshold);
    }
    if (typeof state.chromatic === 'number') {
      this.setDistortion(state.chromatic);
    }
    if (typeof state.focus === 'number') {
      this.setFocus(state.focus);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this.focusPass) {
      this.focusPass.dispose();
      this.focusPass = null;
    }
    if (this.chromaticPass) {
      this.chromaticPass.dispose();
      this.chromaticPass = null;
    }
    if (this.fxaaPass) {
      this.fxaaPass.dispose();
      this.fxaaPass = null;
    }

    this.renderPass = null;

    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
  }
}
