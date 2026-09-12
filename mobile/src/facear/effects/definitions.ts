/**
 * KidTok Face AR SDK — first reusable presets (design deliverable #6).
 *
 * Pure DATA. These are the registry inputs the runtime consumes. Values are
 * carried over 1:1 from the verified working monolith:
 *   - ELDERLY_GEOMETRY  == the current GRANDPA_MORPH (9 regions, 4mm clamp)
 *   - AGED_SKIN         == the current wrinkle_mask.png channels as layers
 *   - accessory profiles == the multi-landmark fit designed for glasses/ears
 *
 * Phase 1 keeps the legacy runtime as the rendering source of truth, while
 * this registry is already the typed catalog used to prepare the modular
 * extraction. Phase 2 will resolve these definitions directly in the runtime.
 */
import type {
  AccessoryProfile,
  BeautyParams,
  EffectDefinition,
  GeometryPreset,
  SkinPreset,
} from '../core/types'

// ───────────────────────── Geometry presets ─────────────────────────

/** Aging shape change — the exact regions from the shipped GRANDPA_MORPH. */
export const ELDERLY_GEOMETRY: GeometryPreset = {
  id: 'elderly',
  maxDisplacementMm: 4,
  regions: [
    { centers: [10, 108, 337], radiusCm: 3.0, amplitudeMm: 2.0, direction: 'in' }, // forehead flatten
    { centers: [70, 300, 234, 454], radiusCm: 2.0, amplitudeMm: 2.5, direction: 'in' }, // temple hollow
    { centers: [50, 280], radiusCm: 2.8, amplitudeMm: 3.5, direction: 'in' }, // cheek volume loss
    { centers: [205, 425], radiusCm: 1.3, amplitudeMm: 2.0, direction: 'in' }, // nasolabial deepen
    { centers: [57, 287], radiusCm: 1.2, amplitudeMm: 2.0, direction: 'down' }, // mouth-corner pull
    { centers: [230, 450], radiusCm: 1.1, amplitudeMm: 2.0, direction: 'out' }, // under-eye bags
    { centers: [136, 365], radiusCm: 2.2, amplitudeMm: 2.0, direction: 'in' }, // jaw soften
    { centers: [136, 365], radiusCm: 2.2, amplitudeMm: 1.2, direction: 'down' }, // jaw sag
    { centers: [199], radiusCm: 1.5, amplitudeMm: 2.0, direction: 'down' }, // chin looseness
  ],
}

/** Placeholder shape presets (regions to be tuned in their own passes). */
export const SLIM_FACE_GEOMETRY: GeometryPreset = {
  id: 'slimFace',
  maxDisplacementMm: 5,
  regions: [
    { centers: [50, 280], radiusCm: 3.0, amplitudeMm: 4.0, direction: 'in' }, // cheeks in
    { centers: [136, 365], radiusCm: 2.6, amplitudeMm: 3.5, direction: 'in' }, // jaw in
  ],
}

export const BABY_FACE_GEOMETRY: GeometryPreset = {
  id: 'babyFace',
  maxDisplacementMm: 5,
  regions: [
    { centers: [50, 280], radiusCm: 3.0, amplitudeMm: 4.0, direction: 'out' }, // rounder cheeks
    { centers: [10], radiusCm: 3.2, amplitudeMm: 3.0, direction: 'out' }, // fuller forehead
  ],
}

// ───────────────────────── Skin / makeup presets ────────────────────

/** Aged skin — the baked canonical-UV wrinkle mask, as alpha-composited layers. */
export const AGED_SKIN: SkinPreset = {
  id: 'agedSkin',
  layers: [
    { id: 'wrinkles', type: 'wrinkles', texture: './wrinkle_mask.png', opacity: 0.7, blend: 'normal' },
    { id: 'ageSpots', type: 'ageSpots', texture: './wrinkle_mask.png', opacity: 0.45, blend: 'multiply' },
  ],
}

/** Beauty baseline — subtle smoothing + brightening. */
export const BEAUTY_PARAMS: Partial<BeautyParams> = {
  skinSmoothing: 0.5,
  blemishReduction: 0.4,
  eyeBrightening: 0.25,
  darkCircleReduction: 0.3,
  teethWhitening: 0.2,
}

// ───────────────────────── Accessory profiles ───────────────────────
// Multi-landmark fit: center from eye/bridge or forehead-side midpoints,
// width from temple distance, depth along the face normal, per-axis
// calibration, per-accessory smoothing. Offsets are first-pass and are the
// intended tuning surface (calibration only — no model edits).

export const GLASSES_PROFILE: AccessoryProfile = {
  id: 'glasses',
  model: './glasses.glb',
  pivot: 'center',
  anchors: { eyeL: 33, eyeR: 263, bridge: 168, bridgeLow: 6, templeL: 234, templeR: 454 },
  centerFrom: ['eyeL', 'eyeR', 'bridge'],
  widthFrom: ['templeL', 'templeR'],
  depthRule: 'faceNormal',
  offset: [0, 0.0, -0.04], // sink back onto the bridge, don't float in front
  rotation: [0, 0, 0],
  scale: [1.0, 1.0, 1.0],
  smoothing: 0.5,
}

export const CAT_EARS_PROFILE: AccessoryProfile = {
  id: 'cat_ears',
  model: './cat_ears.glb',
  pivot: 'bottomCenter', // ear bases sit ON the skull line
  anchors: { sideL: 54, sideR: 284, top: 10, templeL: 234, templeR: 454 },
  centerFrom: ['sideL', 'sideR'],
  widthFrom: ['templeL', 'templeR'],
  depthRule: 'faceNormal',
  offset: [0, 0.12, -0.1],
  rotation: [0, 0, 0],
  scale: [0.95, 0.95, 0.95],
  smoothing: 0.5,
}

export const RABBIT_EARS_PROFILE: AccessoryProfile = {
  id: 'rabbit_ears',
  model: './rabbit_ears.glb',
  pivot: 'bottomCenter',
  anchors: { sideL: 54, sideR: 284, top: 10, templeL: 234, templeR: 454 },
  centerFrom: ['sideL', 'sideR'],
  widthFrom: ['templeL', 'templeR'],
  depthRule: 'faceNormal',
  offset: [0, 0.14, -0.1],
  rotation: [0, 0, 0],
  scale: [0.85, 0.9, 0.85],
  smoothing: 0.5,
}

// ───────────────────────── Effect definitions ───────────────────────
// Data-driven — no hardcoded per-filter branching. The runtime resolves the
// preset/profile ids above against its registries.

export const EFFECT_GRANDPA: EffectDefinition = {
  id: 'grandpa',
  name: { ar: 'جدو', en: 'Grandpa' },
  geometryPreset: 'elderly',
  skinPreset: 'agedSkin',
  accessories: [],
  masterIntensity: 1.0,
}

export const EFFECT_CAT: EffectDefinition = {
  id: 'cat',
  name: { ar: 'قطة', en: 'Cat' },
  accessories: ['cat_ears'],
}

export const EFFECT_RABBIT: EffectDefinition = {
  id: 'rabbit',
  name: { ar: 'أرنب', en: 'Rabbit' },
  accessories: ['rabbit_ears'],
}

export const EFFECT_GLASSES: EffectDefinition = {
  id: 'glasses',
  name: { ar: 'نظارة', en: 'Glasses' },
  accessories: ['glasses'],
}

export const EFFECT_BEAUTY: EffectDefinition = {
  id: 'beauty',
  name: { ar: 'تجميل', en: 'Beauty' },
  skinPreset: 'beauty',
  beauty: BEAUTY_PARAMS,
}

/** Everything a runtime needs to register, in one place. */
export const DEFAULT_REGISTRY = {
  geometryPresets: [ELDERLY_GEOMETRY, SLIM_FACE_GEOMETRY, BABY_FACE_GEOMETRY],
  skinPresets: [AGED_SKIN],
  accessoryProfiles: [GLASSES_PROFILE, CAT_EARS_PROFILE, RABBIT_EARS_PROFILE],
  effects: [EFFECT_GRANDPA, EFFECT_CAT, EFFECT_RABBIT, EFFECT_GLASSES, EFFECT_BEAUTY],
}
