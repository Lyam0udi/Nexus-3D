# NEXUS // 3D

Portfolio-grade scroll cinema: one WebGL scene directed by scroll — five acts, then contact.

**Visual intent:** obsidian void, brand metal `#c8b89a` (logo mark, `// 3D`, sculpture rim). Opening form is a pair of beveled square rings with an inner crystal. After the threshold the sculpture leaves memory and a digital system room takes the frame. Leaving that room, Act 5 drops the same portal onto a square impact plate, holds the shatter, then reverse-phoenix heals it upright as the plate’s crack rings light bronze.

**Emotional map:** presence → orbit → threshold → system (boot → dwell → exit) → fall → hit → broken → heal → coda.

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
| `studio.hdr` | Studio HDRI for reflections (not used as skybox) — loads after first paint |
| `noise.png` | Grain map kept for the liquid-shader path — loads after first paint |
| `brand/*` | Logo mark / wordmark — metal `#c8b89a`, no mint accent |

**Demo default:** Acts 1–3 use the procedural portal in `ModelLoader._createSquareVolume()`. Act 5 uses an identical portal twin from `_createEmergenceVolume()` for fall → shatter → heal, plus `_createImpactPlate()` (dark square plate + crack rings). All mount on first paint with a warm reflection probe; real HDRI and noise enrich in the background.

If `studio.hdr` or `noise.png` is missing, the engine uses a procedural reflection probe and generated grain. Scene lights stay in the brand bronze.

## Shapes & scene forms

| Form | Where | Role |
| --- | --- | --- |
| Square-ring portal + crystal | Acts 1–3 | Opening sculpture (beveled rings, inner crystal, bronze rim) |
| Portal twin | Act 5 | Same DNA — freefall, shatter, reverse-phoenix heal |
| Impact plate + crack rings | Act 5 | Crash cause; cracks surge bronze mid-heal, then calm |
| System interior (CSS) | Act 4 | Second experience: wash, floor plane, horizon, grid, scan, vignette, side rails — not more WebGL zoom |

Canvas fully hides while the system room owns the frame (`interior` high, `emergence` low), then returns for the fall.

## Story copy (voice)

User-facing copy lives in `index.html`. Voice is short, present-tense, no em dash (`—`) in story/UI lines.

| Beat | Section | Copy cues |
| --- | --- | --- |
| Presence | `#act-1` | **NEXUS // 3D** — “One form. One scroll. A door you do not know is a door yet.” |
| Orbit | `#act-2` | HUD: Read the edge / Keep moving / Something waits |
| Threshold | `#act-3` | “The door finds you” · “Do not push. Cross.” |
| Boot | `#act-4-boot` | `› signal locked` · “the square is gone” |
| System | `#act-4` / `#system-room` | “You are inside” · **No void here** · “The door closed behind you. Breathe.” · `› room stable` |
| Exit | `#act-4-exit` | `› signal unlocked` · “the square returns below” |
| Fall | `#act-5-fall` | “Down” · “It followed you out” |
| Core | `#act-5` | “Still here” · **The form returns** · “Broken. Whole. Ready when you are.” |
| Coda | `#coda` | “Build what comes after” + FAQ/contact |

Whispers (boot / exit / fall) stay sticky in their runways so they remain readable while the scroll length plays out.

## Digital system room (Act 4)

Act 4 is a real second experience, not a camera push:

1. **Boot** — liminal void; sculpture forgotten (`› signal locked`)
2. **Dwell** — long sticky terminal card (`#system-room`); room atmosphere behind it
3. **Exit** — liminal hinge before fall (`› signal unlocked`); must not overlap fall copy

`#system-interior` is a fixed CSS veil (bronze wash, floor, horizon line, grid drift, scanlines, vignette, mono rails). It deepens when `is-deep` and peels as emergence rises so coda/contact stay clear.

## Architecture

```
src/
  canvas/
    SceneManager.js      # Renderer, camera, RAF, shatter/heal/plate mixes
    ModelLoader.js       # Portal + twin + impact plate; probe-first then HDRI
    PostProcessing.js    # Bloom, chromatic aberration, focus falloff
    shaders/LiquidShader.js
  animations/
    ScrollController.js  # Lenis ↔ DOM-measured scrub timeline + nav scrollTo
  ui/
    OverlayUI.js         # Section frame-presence overlays + nav / contact
  main.js
  style.css              # Tokens, system room, scrims, HUD
public/assets/           # Local HDRI, noise, brand only
index.html               # #film acts (incl. boot/exit/fall) + #coda
```

**Motion hierarchy**

1. **Scroll** — primary director (orbit, threshold, system, fall/heal, HUD)
2. **Idle** — barely-alive micro spin
3. **Pointer** — subtle optical response
4. **Post FX** — breathe with acts (not always-on filter)

**Choreography notes**

- Timeline beat lengths are **measured from `#film` section offsets** so optics (veil / fall) line up with the DOM runways.
- Overlay visibility uses **section frame presence** (not hard-coded % only), with later beats winning (exit vs fall).
- Optics: `interior`, `emergence`, `impact`, `heal`, `plate`.

## Scroll map (taste-test)

Scrub `#film`. FAQ and contact live in `#coda` after the film. Exact % shift with viewport height; treat the table as a feel guide.

| Beat | DOM | What you should feel |
| --- | --- | --- |
| 1 Presence | `#act-1` | Brand + square-ring portal |
| 2 Orbit | `#act-2` | Sculpture cinema + HUD |
| 3 Threshold | `#act-3` | Hold, then cross into the system (not a zoom crash) |
| 4a Boot | `#act-4-boot` | System void; square gone |
| 4b Dwell | `#act-4` | System room; terminal card between matching boot/exit hinges |
| 4c Exit | `#act-4-exit` | Liminal unlock before the drop |
| 5a Fall | `#act-5-fall` | Freefall toward the plate |
| 5b Core | `#act-5` | Hit → broken hold → bronze heal; card after lock |
| Coda | `#coda` | Contact + FAQ; system veil gone |

**Navbar (Lenis)**

| Link | Lands on |
| --- | --- |
| Orbit | `#act-2` |
| System | `#system-room` (settles into the Act 4 dwell so the card owns the frame) |
| Core | `#act-5` |
| Contact | `#coda` |

`ScrollController.scrollTo` uses distance-scaled duration and cubic easing (not a hard jump). System arrival syncs the scrubbed timeline so the room/card are lit when you arrive.

**Desktop:** Acts 1–2 sculpture cinema; Act 4 digital room; Act 5 fall → crash → heal of the opening form.  
**Mobile:** same map with a tighter scrub/FX budget.  
**Reduced motion:** `prefers-reduced-motion: reduce` shortens travel and keeps cards readable.

## Customize

1. Opening portal: `ModelLoader._createSquareVolume()` — Act 5 twin reuses the same DNA via `_createEmergenceVolume()`.
2. Shatter offsets: `SceneManager.js` (`SHATTER_OFFSETS`). Plate: `ModelLoader._createImpactPlate()`.
3. System room look: `#system-interior` layers in `index.html` + `.system-interior*` in `style.css`.
4. Story/UI copy: `index.html` (avoid em dashes in user-facing lines).
5. Optics: `interior` / `emergence` / `impact` / `heal` / `plate`. Camera beats: `act5FallStart` → `act5Fall` → `act5Impact` → `act5Broken` → `act5End`.
6. Optional: swap `studio.hdr` for another local equirectangular HDRI.

## Technical notes

- Pixel ratio capped at `1.75` (`1.25` on low-power / coarse pointer).
- WebGL owns sculpture atmosphere (`alpha: false`, obsidian clear + fog). System room is CSS on top of a faded canvas.
- Canvas: `position: fixed; inset: 0; pointer-events: none; z-index: 0`. Interactive UI sets `pointer-events: auto`.
- Teardown disposes geometry, materials, composer, Lenis, and ScrollTrigger.

## License

This project is licensed under the [MIT License](./LICENSE).
