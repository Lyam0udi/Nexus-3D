import { Vector2 } from 'three';
import {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  ShaderPass,
} from 'three-stdlib';

/** Radial RGB channel split — stronger toward viewport edges. */
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDistortion: { value: 0.0018 },
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

/**
 * Optical post-processing pipeline: subtle Unreal bloom + edge chromatic aberration.
 */
export class PostProcessing {
  /**
   * @param {import('three').WebGLRenderer} renderer
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this._disposed = false;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(
      new Vector2(width * pixelRatio, height * pixelRatio),
      0.4, // strength — subtle high-end glow
      0.6, // radius
      0.85, // threshold — prevents blown-out white halos
    );
    this.composer.addPass(this.bloomPass);

    this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
    this.chromaticPass.renderToScreen = true;
    this.composer.addPass(this.chromaticPass);
  }

  /** Drive the full EffectComposer stack (replaces renderer.render). */
  render() {
    if (this._disposed) return;
    this.composer.render();
  }

  /**
   * Keep composer / bloom targets in sync with the display.
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    if (this._disposed) return;

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /**
   * @param {number} value Radial RGB split amount (uDistortion).
   */
  setDistortion(value) {
    if (this.chromaticPass?.uniforms?.uDistortion) {
      this.chromaticPass.uniforms.uDistortion.value = value;
    }
  }

  /** Dispose all passes, materials, and composer render targets. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }

    if (this.chromaticPass) {
      this.chromaticPass.dispose();
      this.chromaticPass = null;
    }

    // RenderPass has no GPU resources of its own
    this.renderPass = null;

    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
  }
}
