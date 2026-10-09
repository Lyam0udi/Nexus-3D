# NEXUS // 3D

Liquid-glass WebGL sculpture choreographed by scroll — four cinematic acts inside one continuous engine for immersive product launches.

**Live demo:** [nexus-3-d-three.vercel.app](https://nexus-3-d-three.vercel.app/)

## Stack

- [Vite](https://vitejs.dev/) + vanilla JavaScript (ES6 modules)
- [Three.js](https://threejs.org/) — WebGL, physical materials, post-processing
- [GSAP](https://gsap.com/) + ScrollTrigger — camera choreography
- [Lenis](https://github.com/darkroomengineering/lenis) — momentum smooth scroll

## Requirements

- Node.js 20 or newer (see `.nvmrc`)

## Getting started

```bash
npm install
npm run dev
```

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

## Project structure

```
src/
  canvas/
    SceneManager.js      # WebGL renderer, camera, tone mapping, resize
    ModelLoader.js       # Local .glb loading, HDRI, physical materials
    PostProcessing.js    # Bloom, chromatic aberration
    shaders/             # Custom GLSL (e.g. liquid / noise warp)
  animations/
    ScrollController.js  # Lenis + master GSAP ScrollTrigger timeline
  ui/
    OverlayUI.js         # Section overlays and interactive UI
  main.js
  style.css              # Obsidian theme, glassmorphism, CSS variables
public/assets/           # Local models, HDRI, brand assets only
index.html               # Semantic markup (#act-1 … #act-4)
```

## Scroll choreography

| Act | Scroll range | Camera / scene |
| --- | --- | --- |
| 1 | 0% – 25% | Macro close-up on the central sculpture |
| 2 | 25% – 50% | ~120° orbit while feature cards enter |
| 3 | 50% – 75% | Dive toward the mesh with noise-warp displacement |
| 4 | 75% – 100% | Pass through the core into the terminal / footer |

## Technical notes

- Pixel ratio is capped at `Math.min(devicePixelRatio, 2)`.
- 3D assets and images load only from local `/public/assets/` paths (no remote model/image fetches).
- Centerpiece materials use `MeshPhysicalMaterial` with optical settings suited to liquid glass (high transmission, low roughness, IOR ~1.5).
- The WebGL canvas stays fixed full-viewport with `pointer-events: none`; interactive UI re-enables pointer events explicitly.

## License

This project is licensed under the [MIT License](./LICENSE).
