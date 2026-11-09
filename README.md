# NEXUS // 3D

Portfolio-grade scroll cinema: one WebGL scene directed by scroll — five acts, then contact.

**Visual intent:** obsidian void, brand metal `#c8b89a` (logo mark, `// 3D`, sculpture rim). Opening is a pair of beveled square rings with an inner crystal. After the threshold the void yields to a digital interior. The architectural `core.glb` appears only at the end, in the same bronze family. Emotional map: presence → orbit → threshold → system → core.

**Live demo:** [nexus-3-d-three.vercel.app](https://nexus-3-d-three.vercel.app/)

## Stack

- [Vite](https://vitejs.dev/) + vanilla JavaScript (ES6 modules)
- [Three.js](https://threejs.org/) — WebGL, physical materials, post-processing
- [GSAP](https://gsap.com/) + ScrollTrigger — camera / optical choreography
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

## Required local assets

Place these under `public/assets/` (never fetched remotely):

| File | Role |
| --- | --- |
| `core.glb` | Act 5 emergence sculpture only |
| `studio.hdr` | Studio HDRI for reflections (not used as skybox) |
| `noise.png` | Grain map kept for the liquid-shader path |
| `brand/*` | Logo mark / wordmark — metal `#c8b89a`, no mint accent |

**Demo default:** Acts 1–3 use the procedural portal in `ModelLoader._createSquareVolume()` (two beveled square rings + crystal). `core.glb` is revealed in Act 5. If the GLB is missing, that beat reuses a portal twin.

If `studio.hdr` or `noise.png` is missing, the engine uses a procedural reflection probe and generated grain. Scene lights stay in the brand bronze.

## Architecture

```
src/
  canvas/
    SceneManager.js      # Renderer, camera, RAF, mouse inertia, atmosphere
    ModelLoader.js       # Portal (Acts 1–3), GLB emergence (Act 5), HDRI
    PostProcessing.js    # Bloom, chromatic aberration, focus falloff
    shaders/LiquidShader.js
  animations/
    ScrollController.js  # Lenis ↔ master scrub timeline (5 acts)
  ui/
    OverlayUI.js         # HUD enter/hold/exit + nav / contact
  main.js
  style.css              # Tokens, scrims, HUD — not the scene atmosphere
public/assets/           # Local models, HDRI, brand only
index.html               # #film acts + compact #coda
```

**Motion hierarchy**

1. **Scroll** — primary director (orbit, threshold hold, mode shift, emergence, HUD)
2. **Idle** — barely-alive micro spin
3. **Pointer** — subtle optical response
4. **Post FX** — breathe with acts (not always-on filter)

## Scroll map (taste-test)

Scrub `#film` (Acts 1–5). FAQ and contact live in `#coda` after the film. Navbar **Core** lands on Act 5; that card stays fully opaque through the end of the reel.

| Act | Scroll | What you should feel |
| --- | --- | --- |
| 1 | 0–20% | Presence — brand + square-ring portal |
| 2 | 20–40% | Orbit — sculpture cinema |
| 3 | 40–60% | Threshold — hold, then cross into the system (not a zoom crash) |
| 4 | 60–80% | Digital interior — “You crossed”; system card, not more sculpture |
| 5 | 80–100% | Emergence — same-family `core.glb` in the void; “The core remains” |
| Coda | after | Contact + FAQ. The system veil is gone |

**Desktop:** Acts 1–2 are sculpture cinema. Act 4 is a second experience (grid/system). Act 5 brings the architectural model back.  
**Mobile:** same map; open the nav after scrolling and confirm Core and Contact still read.  
**Reduced motion:** `prefers-reduced-motion: reduce` shortens travel and keeps the cards readable.

## Customize the sculpture

1. Tune the opening portal in `ModelLoader._createSquareVolume()`.
2. Replace `public/assets/core.glb` for the Act 5 emergence hero. Keep it bronze (`#c8b89a` family), not chalk-white.
3. Optionally swap `studio.hdr` for another local equirectangular HDRI.
4. Interior mix is `optics.interior` in `ScrollController.js`, drawn by `#system-interior`. Emergence is `optics.emergence`.
5. Camera beats live in `ScrollController.js` (`ORBIT`).

## Technical notes

- Pixel ratio capped at `1.75` (`1.25` on low-power / coarse pointer).
- WebGL owns atmosphere (`alpha: false`, obsidian clear + fog). CSS is solid `#060608` + text scrims only.
- Canvas: `position: fixed; inset: 0; pointer-events: none; z-index: 0`. Interactive UI sets `pointer-events: auto`.
- Teardown disposes geometry, materials, composer, Lenis, and ScrollTrigger.

## License

This project is licensed under the [MIT License](./LICENSE).
