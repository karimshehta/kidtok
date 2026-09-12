# KidTok Face AR SDK — Architecture

Status: **Phase 1 build harness is active in development builds.** The SDK
bundle is built from TypeScript, the GLB catalog is copied into the recorder's
private WebView cache, and production builds still use the proven legacy
runtime until on-device parity is signed off. This keeps the store binary
unchanged while we validate the new delivery path.

This document is deliverables 1–6 from the redesign request:
folder structure, interfaces, runtime lifecycle, rendering pipeline, migration
plan, and the first reusable presets.

---

## Why this refactor (the load-bearing decision)

Today the entire WebView runtime is authored as **one giant template-literal
string** exported from `webArHtml.ts`. Consequences we have hit repeatedly this
session:

- No type-checking of the runtime code (it's a string). Every change risked
  backtick/`*/` escaping bugs and needed a bespoke extract-and-`node --check`
  verification pass.
- No module boundaries — tracking, rendering, deformation, wrinkles, and
  accessories are interleaved in ~1600 lines.
- Adding a filter means editing the monolith and hand-maintaining `FILTERS`
  branching.

**Decision: author the SDK as real TypeScript modules and bundle them into the
WebView payload with esbuild.** The WebView already supports ES modules and an
importmap (three.js from CDN). We add a build step:
`src/facear/runtime/index.ts` → `armodels/facear.bundle.js`, served next to a
slim `index.html`. Phase 1 bootstraps the existing, tested WebAR runtime
through a typed adapter; later phases extract tracking and rendering into the
modules below. This single decision removes the entire class of
escaping/extraction problems and lets `tsc` check the runtime for real.

> The alternative (keep composing template-literal strings from functions)
> preserves the "no build step" property but defeats modularity and
> type-checking — rejected.

---

## 1. Folder structure

```
src/facear/
  index.ts                     # public SDK barrel (host apps import from here)
  ARCHITECTURE.md              # this file

  core/
    types.ts                   # ALL public interfaces (deliverable 2)
    math.ts                    # vec3/quat/lerp/slerp helpers — no three, no mediapipe
    coordinates.ts             # CoordinateMapper: normalized landmark → render px
    canonical.ts               # canonical mesh access (positions cm, uv, tris, landmark↔slot)

  tracking/
    FaceTracker.ts             # provider-agnostic orchestrator + smoothing
    MediaPipeProvider.ts       # THE ONLY file importing @mediapipe/tasks-vision
    smoothing.ts               # temporal filters (position/rot/scale/landmark)

  render/
    Renderer.ts                # three.js renderer/scene/camera lifecycle + singleton guard
    CameraLayer.ts             # live video as a texture (warp source + fallback background)
    Pipeline.ts                # runs passes in fixed order (deliverable 4)
    passes/
      WarpPass.ts              # canonical-mesh camera warp (consumes GeometryEngine output)
      BeautyPass.ts            # screen-space skin smoothing + region adjustments
      MakeupPass.ts            # UV-space semantic layers (wrinkles, lipstick, …)
      AccessoryPass.ts         # fitted 3D GLBs
      CompositePass.ts         # final composite → canvas

  geometry/
    GeometryEngine.ts          # compile(preset) → CompiledMorph; apply(frame,intensity)
    regionMasks.ts             # procedural per-vertex weights + boundary protection
    presets/                   # geometry presets = DATA
      elderly.ts  slimFace.ts  wideFace.ts  jawReshape.ts  cheekVolume.ts
      noseResize.ts  eyeEnlarge.ts  babyFace.ts

  beauty/
    BeautyEngine.ts            # skin smoothing, brightening, dark-circle, teeth, blush, contour

  makeup/
    MakeupEngine.ts            # alpha-composited UV layers
    uvRegions.ts               # semantic UV region masks (lips, eyes, brows, cheeks…)

  accessories/
    AccessoryEngine.ts         # fitting math + parent-pivot placement + smoothing
    GlbLoader.ts               # XHR file:// loader (the fetch-on-file:// workaround) + normalize

  runtime/
    EffectRuntime.ts           # orchestrates the whole pipeline from an EffectDefinition
    registry.ts                # geometry/skin/accessory/effect registries
    disposal.ts                # deterministic teardown — no stale accessories/textures/GLBs
    debug.ts                   # debug overlays (anchors, bboxes, axes, stats)

  effects/
    definitions.ts             # reusable presets (deliverable 6): grandpa, cat, rabbit, glasses, beauty

  webview/
    entry.ts                   # WebView bootstrap: mounts SDK on <video>/<canvas>, wires bridge
    bridge.ts                  # RN ↔ SDK postMessage protocol (typed)
    html.ts                    # builds the slim index.html shell (importmap + mount points)

  build/
    bundle.mjs                 # esbuild: webview/entry.ts → armodels/facear.bundle.js
```

RN side stays thin: `WebArRecorder.tsx` only hosts the WebView, copies assets
(now including `facear.bundle.js`), and relays UI events over `bridge.ts`.
**No AR logic lives in WebArRecorder.**

---

## 2. TypeScript interfaces

Full contracts live in [`core/types.ts`](./core/types.ts). Summary of the six
engine surfaces:

| Engine | Key types |
|---|---|
| 1. Tracking | `FaceTrackingProvider` (MediaPipe impl), `FaceTracker` (smoothing wrapper), `FaceFrame`, `HeadPose`, `SmoothingConfig` |
| 2. Geometry / Warp | `GeometryPreset`, `DeformationRegion`, `CompiledMorph`, `GeometryEngine` |
| 3. Beauty | `BeautyParams` (all fields 0–1), `BeautyEngine` |
| 4. Makeup / Skin | `MakeupLayer`, `SkinPreset`, `MakeupEngine`, `BlendMode` |
| 5. Accessories | `AccessoryProfile`, `AccessoryInstance`, `AccessoryEngine` |
| 6. Runtime | `EffectDefinition`, `EffectRuntime`, `DebugFlags` |

Design rules encoded in the types:
- **No `@mediapipe/*` or `three` types leak into `core/types.ts`.** The tracking
  provider is the only MediaPipe consumer; three lives inside `render/`.
- `FaceFrame` is the single hand-off between tracking and everything else:
  normalized landmarks + pose + scale + expressions + confidence.
- Every beauty/makeup/effect intensity is a `0..1` number; geometry is mastered
  by one `masterIntensity` (== the old `ageAmount`).

---

## 3. Runtime lifecycle

`EffectRuntime` owns everything; the WebView `entry.ts` is a thin driver.

```
init(canvas, video, config)
  ├─ Renderer.init()                # scene/camera/WebGLRenderer, singleton guard
  ├─ FaceTracker.init(provider)     # MediaPipeProvider loads the .task model
  ├─ CameraLayer.init(video)        # VideoTexture
  └─ Pipeline.init(passes)          # WarpPass, BeautyPass, MakeupPass, AccessoryPass, CompositePass

registerGeometryPreset / registerSkinPreset / registerAccessoryProfile / registerEffect
  # pure data registration; no GPU work

setEffect(id)                       # the ONLY place effects change
  ├─ disposal.releaseActive()       # dispose prev effect's accessories/textures; sweep scene
  ├─ resolve EffectDefinition → { CompiledMorph?, MakeupLayer[]?, BeautyParams?, AccessoryInstance[]? }
  ├─ GeometryEngine.compile(preset) (cached by preset id)
  ├─ AccessoryEngine.load(profile)  (cached GLB template, cloned per instance)
  └─ mark ready

frame(tMs)                          # once per rAF tick — see pipeline below
setIntensity(v) / setBeautyParam(k,v) / setMakeupOpacity(id,v)   # live tweaks, no reload
setDebug(flags)
dispose()                           # full teardown; releases model, GL, textures, GLBs, listeners
```

Guarantees:
- **No stale accessories:** `setEffect` always runs `disposal.releaseActive()`
  first; accessories are tracked by owner so the sweep is exhaustive (this
  formalizes the `userData.filterOwned` sweep from the monolith).
- **Cache vs. dispose:** geometry presets and GLB *templates* are cached and
  reused; per-effect *instances* (clones, per-effect textures) are disposed on
  switch. GPU templates are disposed only at `dispose()`.
- **Request versioning:** async loads (GLB/texture) capture a version token and
  abort if superseded — carried over from the monolith's `filterRequestVersion`.

---

## 4. Rendering pipeline

One fixed, ordered chain per frame (the requested order):

```
Camera frame (VideoTexture)
      │
      ▼
[1] Face Tracking      FaceTracker.detect(video) → smoothed FaceFrame
      │
      ▼
[2] Camera Mesh Warp   WarpPass: canonical 468-mesh, vertices = live landmarks
      │                 + CompiledMorph offset (face-basis, ×masterIntensity),
      │                 fragment samples camera at UNDEFORMED position → warped face
      ▼
[3] Beauty             BeautyPass: skin smoothing + brightening/dark-circle/teeth/
      │                 blush/contour, region-masked, on the warped result
      ▼
[4] Skin / Makeup      MakeupPass: UV-space alpha-composited layers
      │                 (wrinkles, ageSpots, lipstick, eyeliner, …) — never raw black
      ▼
[5] 3D Accessories     AccessoryPass: fitted GLBs (glasses/ears/hats/…),
      │                 drawn after the face so they occlude correctly
      ▼
[6] Final Composite    CompositePass → canvas
```

Notes:
- Steps 2–4 all live on the same canonical mesh / same UV space that already
  works today; they are separate *passes/materials*, not separate meshes,
  where possible (keeps the "one warped face surface" property).
- Boundary vertices carry zero morph and zero effect alpha → the warped/made-up
  region blends seamlessly into the untouched live video around it.
- Expressions are preserved because every pass reads *live* landmark positions;
  deformation is a constant face-local offset added on top, never a replacement.

---

## 5. Migration plan (phased, app stays shippable at every step)

Each phase ends with an on-device parity check; old code is deleted only after
the new path is verified.

| Phase | Scope | Risk retired |
|---|---|---|
| **0 (this doc)** | folder structure, `core/types.ts`, `effects/definitions.ts` | — |
| **1 — build harness** | esbuild bundles a trivial `webview/entry.ts` that reproduces *current* behavior by importing today's logic; RN copies + loads the bundle; prove parity | **the delivery mechanism** — de-risked before any logic moves |
| **2 — tracking** | extract MediaPipe + rig + smoothing + coordinates into `tracking/` + `core/`. Rest still monolithic, calls the new tracker | MediaPipe isolation |
| **3 — geometry + warp** | `Renderer`, `CameraLayer`, `WarpPass`, `GeometryEngine` + `elderly` preset. Today's `agingMesh` becomes WarpPass + GeometryEngine | camera-warp + morph as modules |
| **4 — accessories** | `AccessoryEngine` + fitting profiles; fixes the fitting requirements (multi-landmark transforms, pivot groups) + deterministic disposal | **fitting + stale-accessory bug** |
| **5 — beauty + makeup** | `MakeupEngine` (wrinkle mask → a `wrinkles` layer, spots → `ageSpots`), `BeautyEngine` | skin/makeup as reusable layers |
| **6 — runtime + defs** | `EffectRuntime` + registries + `definitions.ts`; delete `FILTERS` branching | data-driven effects |
| **7 — cleanup** | delete `webArHtml.ts` monolith + the extract/verify tooling | — |

Preserved as-is through migration: the canonical mesh + UV mapping, the
open-topology (852-tri) eye/mouth cutouts, the real-photo wrinkle bake pipeline,
the smoothing constants, and the GLB `file://` XHR loader.

---

## 6. First reusable presets

Defined in [`effects/definitions.ts`](./effects/definitions.ts):

- **`elderly`** geometry preset — the 9 anatomical regions from the working
  `GRANDPA_MORPH` (forehead flatten, temple hollow, cheek loss, nasolabial,
  mouth-corner, under-eye bags, jaw soften/sag, chin), clamped 4mm.
- **`agedSkin`** skin preset — `wrinkles` + `ageSpots` makeup layers over the
  baked canonical-UV mask.
- **`beauty`** skin/beauty preset — smoothing + brightening baseline.
- **Accessory profiles** — `glasses`, `cat_ears`, `rabbit_ears` (multi-landmark
  fit: center from eye/bridge midpoints, width from temple distance, depth along
  the face normal, per-axis calibration, smoothing).
- **Effect definitions** — `grandpa` (elderly + agedSkin), `cat` (cat_ears),
  `rabbit` (rabbit_ears), `glasses` (glasses), `beauty` (beauty preset).

```ts
// the shape the runtime consumes (see definitions.ts for the real objects)
{ id: 'grandpa', geometryPreset: 'elderly', skinPreset: 'agedSkin', accessories: [] }
{ id: 'cat',     accessories: ['cat_ears'] }
{ id: 'glasses', accessories: ['glasses'] }
{ id: 'beauty',  skinPreset: 'beauty' }
```

---

## Open questions for you before Phase 1

1. **Bundler** — esbuild is the lightest add (no config, one script). OK, or do
   you want rollup/tsup? (Recommend esbuild.)
2. **three.js delivery** — keep loading three from the CDN importmap (needs
   network on first load, already how it works), or bundle three in for full
   offline? (Recommend: keep CDN for now, revisit in Phase 7.)
3. **Scope of Phase 1 parity** — reproduce *exactly* today's behavior first
   (safest), vs. start clean-room in modules. (Recommend: exact parity first.)
