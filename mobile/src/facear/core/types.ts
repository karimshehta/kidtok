/**
 * KidTok Face AR SDK — core type contracts (design deliverable #2).
 *
 * These are the interfaces every engine implements or consumes. Two hard
 * rules are encoded here:
 *   1. This file imports NOTHING — no `three`, no `@mediapipe/*`. The public
 *      SDK surface is renderer- and provider-agnostic. MediaPipe types live
 *      only in tracking/MediaPipeProvider.ts; three types only in render/*.
 *   2. Every effect intensity is a normalized 0..1 number; geometry is
 *      mastered by a single `masterIntensity` (the old `ageAmount`).
 *
 * Nothing here is wired into the app yet — see ARCHITECTURE.md.
 */

export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]
export type Quat = readonly [number, number, number, number]

/** A landmark id in MediaPipe's 468-point canonical indexing. */
export type LandmarkId = number

// ───────────────────────────── 1. Face Tracking ─────────────────────────────

/** Head pose in a normalized, provider-agnostic face basis. */
export interface HeadPose {
  /** Face center in normalized image space [0,1] (e.g. landmark 168). */
  readonly position: Vec3
  /** Face-basis → world orientation (x=temple→temple, y=chin→forehead, z=out). */
  readonly rotation: Quat
  /** Overall face scale in normalized units (e.g. temple-to-temple distance). */
  readonly scale: number
}

/**
 * The single hand-off between tracking and the rest of the SDK. Everything
 * downstream (warp, beauty, makeup, accessories) reads ONLY this — never a
 * MediaPipe result object.
 */
export interface FaceFrame {
  readonly timestampMs: number
  readonly found: boolean
  /** 0..1 detector confidence (0 when not found). */
  readonly confidence: number
  /** 468 normalized landmarks; x,y in [0,1] image space, z relative depth. */
  readonly landmarks: ReadonlyArray<Vec3>
  readonly pose: HeadPose
  /** ARKit-style blendshapes 0..1 keyed by name, e.g. 'mouthSmileLeft'. */
  readonly expressions: Readonly<Record<string, number>>
}

/** Raw per-frame landmark source. MediaPipe is one implementation. */
export interface FaceTrackingProvider {
  init(): Promise<void>
  /** Detect on one frame; returns raw (unsmoothed) landmarks or null. */
  detect(source: TexImageSource, timestampMs: number): RawDetection | null
  dispose(): void
}

export interface RawDetection {
  readonly landmarks: ReadonlyArray<Vec3>
  readonly expressions: Readonly<Record<string, number>>
  readonly confidence: number
}

export interface SmoothingConfig {
  /** Per-frame lerp factor for pose position (0..1, higher = snappier). */
  readonly positionAlpha: number
  /** Per-frame slerp factor for pose rotation. */
  readonly rotationAlpha: number
  readonly scaleAlpha: number
  /** Per-landmark position smoothing (0..1). */
  readonly landmarkAlpha: number
  /** Snap (skip smoothing) on the first frame after (re)acquisition. */
  readonly snapOnReacquire: boolean
}

export interface TrackerConfig {
  readonly maxFaces: number
  /** Run detection every Nth frame (1 = every frame). */
  readonly processEveryNthFrame: number
  readonly smoothing: SmoothingConfig
}

/**
 * Provider-agnostic tracker: wraps a FaceTrackingProvider, derives pose from
 * landmarks, and applies temporal smoothing. Downstream code depends on THIS.
 */
export interface FaceTracker {
  init(provider: FaceTrackingProvider, config: TrackerConfig): Promise<void>
  /** Feed a video frame; returns the smoothed FaceFrame (or last-known). */
  detect(source: TexImageSource, timestampMs: number): FaceFrame
  dispose(): void
}

// ──────────────────────────── coordinate mapping ────────────────────────────

export interface Viewport {
  readonly width: number
  readonly height: number
  readonly video: { readonly width: number; readonly height: number }
  /** Selfie mirror (front camera). */
  readonly mirror: boolean
}

/** Maps normalized landmarks → render-space screen px (cover-crop + mirror). */
export interface CoordinateMapper {
  update(viewport: Viewport): void
  toScreen(landmark: Vec3, out: MutableVec3): MutableVec3
}

export interface MutableVec3 {
  x: number
  y: number
  z: number
}

// ─────────────────────────── 2. Geometry / Warp ─────────────────────────────

export type DeformDirection =
  | 'in' // along the inverse vertex normal (volume loss)
  | 'out' // along the vertex normal (volume gain)
  | 'down' // -y in face space (gravity sag)
  | 'up' // +y in face space
  | 'lateral' // ±x, away from the face midline

/** One radial deformation zone, resolved procedurally from the canonical mesh. */
export interface DeformationRegion {
  /** Landmark ids whose canonical positions center this region's falloff. */
  readonly centers: LandmarkId[]
  /** Falloff radius, canonical cm. */
  readonly radiusCm: number
  /** Peak displacement, mm (before masterIntensity). */
  readonly amplitudeMm: number
  readonly direction: DeformDirection
}

export interface GeometryPreset {
  readonly id: string
  readonly regions: DeformationRegion[]
  /** Per-vertex safety clamp on the summed displacement, mm. */
  readonly maxDisplacementMm: number
}

/** Baked, ready-to-upload result of compiling a GeometryPreset. Opaque. */
export interface CompiledMorph {
  readonly presetId: string
  /** 468×3 face-local offsets (cm), boundary-protected. */
  readonly offsets: Float32Array
  readonly maxDispMm: number
  readonly affectedVerts: number
}

export interface GeometryEngine {
  /** Precompute static per-vertex offsets from a preset (cached by id). */
  compile(preset: GeometryPreset): CompiledMorph
  /** Per-frame: push morph basis + scale uniforms for the given intensity. */
  apply(morph: CompiledMorph, frame: FaceFrame, masterIntensity: number): void
}

// ───────────────────────────────── 3. Beauty ────────────────────────────────

/** Every field 0..1 (0 = off, neutral baseline). */
export interface BeautyParams {
  readonly skinSmoothing: number
  readonly blemishReduction: number
  readonly skinTone: number
  readonly eyeBrightening: number
  readonly darkCircleReduction: number
  readonly teethWhitening: number
  readonly lipColor: number
  readonly blush: number
  readonly contour: number
}

export interface BeautyEngine {
  setParams(params: Partial<BeautyParams>): void
  /** Per-frame processing hook (screen-space + region-masked). */
  apply(frame: FaceFrame): void
}

// ──────────────────────────── 4. Makeup / Skin ──────────────────────────────

export type MakeupType =
  | 'lipstick'
  | 'eyeliner'
  | 'eyeshadow'
  | 'eyebrows'
  | 'freckles'
  | 'wrinkles'
  | 'ageSpots'
  | 'tattoo'
  | 'facePaint'

export type BlendMode = 'normal' | 'multiply' | 'overlay' | 'softlight'

/**
 * One UV-space semantic layer. Rendered with proper alpha compositing over the
 * warped face — never a raw black mask drawn directly.
 */
export interface MakeupLayer {
  readonly id: string
  readonly type: MakeupType
  /** Canonical-UV texture asset path (mask/detail). */
  readonly texture?: string
  /** Semantic region to confine the layer to (when not texture-driven). */
  readonly region?: SemanticRegion
  /** Tint applied through the layer (rgb 0..1). */
  readonly color?: Vec3
  readonly opacity: number // 0..1
  readonly blend: BlendMode
}

export type SemanticRegion =
  | 'lips'
  | 'upperLip'
  | 'lowerLip'
  | 'leftEyeLid'
  | 'rightEyeLid'
  | 'leftBrow'
  | 'rightBrow'
  | 'leftCheek'
  | 'rightCheek'
  | 'forehead'
  | 'nose'
  | 'chin'
  | 'fullFace'

export interface SkinPreset {
  readonly id: string
  readonly layers: MakeupLayer[]
}

export interface MakeupEngine {
  setLayers(layers: MakeupLayer[]): void
  setLayerOpacity(layerId: string, opacity: number): void
  apply(frame: FaceFrame): void
}

// ───────────────────────────── 5. Accessories ───────────────────────────────

export type PivotMode = 'center' | 'bottomCenter' | 'topCenter'

export type DepthRule =
  | 'faceNormal' // offset.z runs along the face normal (glasses sink onto bridge)
  | 'fixed' // offset.z is a fixed head-local push

/**
 * A reusable fitting config. Transforms are computed from MULTIPLE landmarks,
 * never one fixed anchor:
 *   center = midpoint of `centerFrom` anchors  (symmetric under yaw)
 *   scale  = live distance between `widthFrom` anchors × per-axis scale
 *   rotate = face basis ∘ local rotation
 *   depth  = depthRule applied to offset.z
 */
export interface AccessoryProfile {
  readonly id: string
  /** GLB asset path (loaded via file:// XHR, normalized by bbox). */
  readonly model: string
  /** How the GLB origin is recentered at normalize time. */
  readonly pivot: PivotMode
  /** Named anchors → landmark ids used by centerFrom/widthFrom. */
  readonly anchors: Readonly<Record<string, LandmarkId>>
  /** Anchor names averaged into the placement center. */
  readonly centerFrom: string[]
  /** Anchor pair whose live screen distance drives scale. */
  readonly widthFrom: readonly [string, string]
  readonly depthRule: DepthRule
  /** Head-local offset in width units (x,y,z). z used per depthRule. */
  readonly offset: Vec3
  /** Local rotation (radians) composed after the face basis. */
  readonly rotation: Vec3
  /** Per-axis multiplier on the landmark-derived width. */
  readonly scale: Vec3
  /** Per-frame damping 0..1 (higher = snappier, lower = smoother). */
  readonly smoothing: number
}

/** A loaded, fitted accessory. Opaque handle owned by the engine. */
export interface AccessoryInstance {
  readonly id: string
  readonly profileId: string
}

export interface AccessoryEngine {
  /** Load + normalize a GLB into a cached template. */
  load(profile: AccessoryProfile): Promise<AccessoryInstance>
  /** Per-frame fit from the current FaceFrame. */
  fit(instance: AccessoryInstance, frame: FaceFrame): void
  dispose(instance: AccessoryInstance): void
}

// ───────────────────────────── 6. Runtime / Effects ─────────────────────────

/**
 * A data-driven effect. The runtime resolves preset/profile ids against its
 * registries. This replaces the monolith's hardcoded `FILTERS` branching.
 */
export interface EffectDefinition {
  readonly id: string
  readonly name?: { readonly ar?: string; readonly en?: string }
  /** Geometry preset id (registered separately). */
  readonly geometryPreset?: string
  /** Skin preset id (resolves to MakeupLayer[]). */
  readonly skinPreset?: string
  /** Inline makeup layers (merged after skinPreset). */
  readonly makeup?: MakeupLayer[]
  /** Beauty parameter overrides. */
  readonly beauty?: Partial<BeautyParams>
  /** Accessory profile ids to fit. */
  readonly accessories?: string[]
  /** Default master intensity (== ageAmount) for this effect, 0..1. */
  readonly masterIntensity?: number
}

export interface DebugFlags {
  readonly landmarks?: boolean
  readonly fitting?: boolean
  readonly boundingBoxes?: boolean
  readonly axes?: boolean
  readonly geometryWeights?: boolean
  readonly stats?: boolean
}

export interface RuntimeConfig {
  readonly tracker: TrackerConfig
  /** Downgrade rules when frame time exceeds budget. */
  readonly performance?: {
    readonly targetFps: number
    readonly disableBeautyBelowFps?: number
  }
}

/**
 * The single orchestrator. `entry.ts` (WebView) drives this; RN never touches
 * AR logic. Runs the fixed pipeline: track → warp → beauty → makeup →
 * accessories → composite.
 */
export interface EffectRuntime {
  init(canvas: HTMLCanvasElement, video: HTMLVideoElement, config: RuntimeConfig): Promise<void>

  registerGeometryPreset(preset: GeometryPreset): void
  registerSkinPreset(preset: SkinPreset): void
  registerAccessoryProfile(profile: AccessoryProfile): void
  registerEffect(effect: EffectDefinition): void

  /** The ONLY place effects change; runs disposal of the previous effect first. */
  setEffect(effectId: string): Promise<void>
  setIntensity(value: number): void
  setBeautyParam(key: keyof BeautyParams, value: number): void
  setMakeupOpacity(layerId: string, value: number): void

  /** One render tick (call per requestAnimationFrame). */
  frame(timestampMs: number): void

  setDebug(flags: DebugFlags): void
  dispose(): void
}
