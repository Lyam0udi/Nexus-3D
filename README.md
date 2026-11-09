# NEXUS // 3D

Portfolio-grade scroll cinema: a liquid-glass WebGL sculpture directed by scroll — five acts inside one continuous engine.

**Visual intent:** dark glass square in an obsidian void — UI accent (`#c8b89a`). Short film with a **mode shift** then **emergence**: square cinema → digital interior → architectural `core.glb` in the void. Emotional map: presence → orbit → threshold → system → core.

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
| `core.glb` | Optional custom sculpture mesh (see below) |
| `studio.hdr` | Studio HDRI for reflections (not used as skybox) |
| `noise.png` | Microscopic grain for the liquid shader |
| `brand/*` | Logo mark / wordmark |

**Demo default:** Acts 1–3 use a dark glass square; `core.glb` appears only at Act 5 emergence (square twin if the GLB is missing).

If `studio.hdr` / `noise.png` are missing, the engine falls back to a warm procedural light probe and generated grain.

## Architecture

```
src/
  canvas/
    SceneManager.js      # Renderer, camera, RAF, mouse inertia, atmosphere
    ModelLoader.js       # Local GLB + HDRI + physical / liquid materials
    PostProcessing.js    # Bloom, chromatic aberration, focus falloff
    shaders/LiquidShader.js
  animations/
    ScrollController.js  # Lenis ↔ master scrub timeline (4 acts)
  ui/
    OverlayUI.js         # HUD enter/hold/exit + nav / contact
  main.js
  style.css              # Tokens, scrims, HUD — not the scene atmosphere
public/assets/           # Local models, HDRI, brand only
index.html               # #film acts + compact #coda
```

**Motion hierarchy**

1. **Scroll** — primary director (camera orbit, dive, post-FX, HUD)
2. **Idle** — barely-alive micro spin
3. **Pointer** — subtle optical response
4. **Post FX** — breathe with acts (not always-on filter)

## Scroll map (taste-test)

Scrub `#film` (Acts 1–4). FAQ / contact live in `#coda` after the climax.

| Act | Scroll | What you should feel |
| --- | --- | --- |
| 1 | 0–25% | Presence — brand + architectural silhouette |
| 2 | 25–50% | Orbit — sculpture cinema (emotional walk-around) |
| 3 | 50–75% | Threshold — slight approach, then **mode shift** into the system |
| 4 | 75–100% | Digital interior — you crossed; system UI + CTA (not more zoom) |
| Coda | after | Compact contact + FAQ — not a second site |

**Desktop:** Acts 1–2 should feel like watching a sculpture; at Act 3 peak the void yields to a grid/system room.  
**Mobile:** same map; open the nav after scrolling to confirm the fullscreen menu still works.  
**Reduced motion:** `prefers-reduced-motion: reduce` shortens travel, disables heavy warp/tilt, keeps UI readable.

## Customize the sculpture

1. Tune the opening square in `ModelLoader._createSquareVolume()`.
2. Replace `public/assets/core.glb` for the Act 5 emergence hero.
3. Optionally swap `studio.hdr` for another local equirectangular HDRI.
4. Interior mode mix is driven in `ScrollController.js` (`optics.interior`) and styled via `#system-interior`.
5. Camera beats live in `ScrollController.js` (`ORBIT` constants).

## Technical notes

- Pixel ratio capped at `Math.min(devicePixelRatio, 2)` (lower on low-power).
- WebGL owns atmosphere (`alpha: false`, obsidian clear + fog). CSS is solid `#060608` + text scrims only.
- Canvas: `position: fixed; inset: 0; pointer-events: none; z-index: 0`. Interactive UI sets `pointer-events: auto`.
- Teardown disposes geometry, materials, composer, Lenis, and ScrollTrigger.

## License

This project is licensed under the [MIT License](./LICENSE).
