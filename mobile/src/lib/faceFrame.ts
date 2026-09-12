import type { FilterAnchor } from '@/components/KidFaceFilterParts'

/**
 * Pure face-frame math shared by every mask renderer:
 * - the real-time Reanimated mask (runs this inside UI-thread worklets)
 * - the recording-path Animated mask (plain JS)
 * - the replay mask in preview/feed
 *
 * All functions are marked as worklets so Reanimated can hoist them.
 */

export type TrackedPoint = { x: number; y: number }

export type TrackedLandmarks = {
  leftEye?: TrackedPoint
  rightEye?: TrackedPoint
  leftEar?: TrackedPoint
  rightEar?: TrackedPoint
  noseBase?: TrackedPoint
  mouthLeft?: TrackedPoint
  mouthRight?: TrackedPoint
  upperLip?: TrackedPoint
  lowerLip?: TrackedPoint
  mouthBottom?: TrackedPoint
  faceTop?: TrackedPoint
  chin?: TrackedPoint
  leftCheek?: TrackedPoint
  rightCheek?: TrackedPoint
}

export type TrackedFace = {
  bounds: { x: number; y: number; width: number; height: number }
  rollAngle?: number
  yawAngle?: number
  pitchAngle?: number
  leftEyeOpenProbability?: number
  rightEyeOpenProbability?: number
  smilingProbability?: number
  trackingId?: number
  landmarks?: TrackedLandmarks
}

export type FaceFrame = {
  anchors: Record<FilterAnchor, TrackedPoint>
  angleRad: number
  iod: number
  mouthOpen: number
  yawScale: number
  smile: number
  blink: number
}

export const MAX_ROLL_RAD = 0.7 // about 40 degrees

function dist(a: TrackedPoint, b: TrackedPoint): number {
  'worklet'
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function clamp(value: number, min: number, max: number): number {
  'worklet'
  return Math.max(min, Math.min(max, value))
}

function lerpNumber(previous: number, next: number, amount: number): number {
  'worklet'
  return previous + (next - previous) * amount
}

function smoothPoint(
  previous: TrackedPoint | undefined,
  next: TrackedPoint | undefined,
  amount: number,
): TrackedPoint | undefined {
  'worklet'
  // ML Kit can report a valid face bounds while omitting one landmark for a
  // frame (especially eyes/lips during a blink or fast turn). Retaining the
  // last measured point keeps every mask part attached to the same facial
  // feature instead of jumping to a coarse bounds fallback and back again.
  if (!next) return previous
  if (!previous) return next
  return {
    x: lerpNumber(previous.x, next.x, amount),
    y: lerpNumber(previous.y, next.y, amount),
  }
}

/** Removes landmark jitter once, before the data is rendered or recorded. */
export function smoothTrackedFace(
  previous: TrackedFace | null | undefined,
  next: TrackedFace | null,
  amount = 0.48,
): TrackedFace | null {
  'worklet'
  if (!next) return null
  if (!previous || (
    previous.trackingId != null &&
    next.trackingId != null &&
    previous.trackingId !== next.trackingId
  )) return next

  // Keep still faces calm, but do not make a child feel that the mask is
  // trailing behind them when they turn or lean quickly. ML Kit itself adds a
  // frame of latency; adaptive smoothing spends less time filtering when the
  // face centre has travelled a meaningful fraction of its own width.
  const requested = clamp(amount, 0.15, 1)
  const previousCenterX = previous.bounds.x + previous.bounds.width / 2
  const previousCenterY = previous.bounds.y + previous.bounds.height / 2
  const nextCenterX = next.bounds.x + next.bounds.width / 2
  const nextCenterY = next.bounds.y + next.bounds.height / 2
  const centerMovement = Math.sqrt(
    (nextCenterX - previousCenterX) ** 2 + (nextCenterY - previousCenterY) ** 2,
  )
  const faceScale = Math.max(72, previous.bounds.width, next.bounds.width)
  const movementBoost = clamp((centerMovement / faceScale) * 0.72, 0, 0.20)
  const a = clamp(requested + movementBoost, 0.15, 0.94)
  const p = previous.landmarks || {}
  const n = next.landmarks || {}

  return {
    bounds: {
      x: lerpNumber(previous.bounds.x, next.bounds.x, a),
      y: lerpNumber(previous.bounds.y, next.bounds.y, a),
      width: lerpNumber(previous.bounds.width, next.bounds.width, a),
      height: lerpNumber(previous.bounds.height, next.bounds.height, a),
    },
    rollAngle: lerpNumber(previous.rollAngle || 0, next.rollAngle || 0, a),
    yawAngle: lerpNumber(previous.yawAngle || 0, next.yawAngle || 0, a),
    pitchAngle: lerpNumber(previous.pitchAngle || 0, next.pitchAngle || 0, a),
    leftEyeOpenProbability: next.leftEyeOpenProbability,
    rightEyeOpenProbability: next.rightEyeOpenProbability,
    smilingProbability: next.smilingProbability,
    trackingId: next.trackingId,
    landmarks: {
      leftEye: smoothPoint(p.leftEye, n.leftEye, a),
      rightEye: smoothPoint(p.rightEye, n.rightEye, a),
      leftEar: smoothPoint(p.leftEar, n.leftEar, a),
      rightEar: smoothPoint(p.rightEar, n.rightEar, a),
      noseBase: smoothPoint(p.noseBase, n.noseBase, a),
      mouthLeft: smoothPoint(p.mouthLeft, n.mouthLeft, a),
      mouthRight: smoothPoint(p.mouthRight, n.mouthRight, a),
      upperLip: smoothPoint(p.upperLip, n.upperLip, a),
      lowerLip: smoothPoint(p.lowerLip, n.lowerLip, a),
      mouthBottom: smoothPoint(p.mouthBottom, n.mouthBottom, a),
      faceTop: smoothPoint(p.faceTop, n.faceTop, a),
      chin: smoothPoint(p.chin, n.chin, a),
      leftCheek: smoothPoint(p.leftCheek, n.leftCheek, a),
      rightCheek: smoothPoint(p.rightCheek, n.rightCheek, a),
    },
  }
}

/**
 * Builds the face coordinate frame from ML Kit landmarks. Everything is
 * expressed relative to the line between the eyes: its midpoint is the origin,
 * its length (interocular distance) is the scale unit and its slope is the
 * roll. Falls back to bounds-derived estimates when a landmark is missing so
 * the mask never disappears mid-recording.
 */
export function computeFaceFrame(face: TrackedFace): FaceFrame {
  'worklet'
  const b = face.bounds
  const lm = face.landmarks || {}

  let eyeL = lm.leftEye
  let eyeR = lm.rightEye
  if (!eyeL || !eyeR) {
    eyeL = { x: b.x + b.width * 0.31, y: b.y + b.height * 0.4 }
    eyeR = { x: b.x + b.width * 0.69, y: b.y + b.height * 0.4 }
  } else if (eyeL.x > eyeR.x) {
    const swap = eyeL
    eyeL = eyeR
    eyeR = swap
  }

  // Scale unit: interocular distance, but never smaller than what the detected
  // face box implies (head width ≈ 2.35 × IOD). Eye landmarks can under-report
  // on adults, glasses or angled faces — the box keeps the mask full-size on
  // every face.
  const iod = Math.max(24, dist(eyeL, eyeR), b.width / 2.35)
  const angleRad = clamp(Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x), -MAX_ROLL_RAD, MAX_ROLL_RAD)
  const eyeMid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 }

  // Unit vector pointing "up" from the face (perpendicular to the eye line).
  const up = { x: Math.sin(angleRad), y: -Math.cos(angleRad) }

  const nose = lm.noseBase || { x: eyeMid.x - up.x * 0.62 * iod, y: eyeMid.y - up.y * 0.62 * iod }

  let mouthCenter: TrackedPoint
  if (lm.upperLip && lm.lowerLip) {
    mouthCenter = {
      x: (lm.upperLip.x + lm.lowerLip.x) / 2,
      y: (lm.upperLip.y + lm.lowerLip.y) / 2,
    }
  } else if (lm.mouthLeft && lm.mouthRight) {
    mouthCenter = { x: (lm.mouthLeft.x + lm.mouthRight.x) / 2, y: (lm.mouthLeft.y + lm.mouthRight.y) / 2 }
  } else if (lm.mouthBottom) {
    mouthCenter = { x: lm.mouthBottom.x + up.x * 0.14 * iod, y: lm.mouthBottom.y + up.y * 0.14 * iod }
  } else {
    mouthCenter = { x: eyeMid.x - up.x * 1.02 * iod, y: eyeMid.y - up.y * 1.02 * iod }
  }

  // Closed mouth: nose base → mouth bottom ≈ 0.63 iod. Wide open ≈ 1.0 iod.
  // Speech only drops the jaw a little, so the curve starts reacting almost
  // immediately after the lips part and saturates on a real "aaah".
  const mouthOpen = lm.upperLip && lm.lowerLip
    ? clamp((dist(lm.upperLip, lm.lowerLip) / iod - 0.025) / 0.32, 0, 1)
    : lm.mouthBottom
      ? clamp((dist(nose, lm.mouthBottom) / iod - 0.64) / 0.3, 0, 1)
      : 0

  const headTop = lm.faceTop || {
    x: eyeMid.x + up.x * 1.18 * iod,
    y: eyeMid.y + up.y * 1.18 * iod,
  }
  const yawScale = clamp(1 - Math.abs(face.yawAngle || 0) / 145, 0.74, 1)
  const smile = clamp(face.smilingProbability ?? 0, 0, 1)
  const eyeOpenL = face.leftEyeOpenProbability ?? 1
  const eyeOpenR = face.rightEyeOpenProbability ?? 1
  const blink = 1 - clamp(Math.min(eyeOpenL, eyeOpenR), 0, 1)

  const anchors: Record<FilterAnchor, TrackedPoint> = {
    eyes: eyeMid,
    nose,
    mouth: mouthCenter,
    muzzle: {
      x: nose.x * 0.42 + mouthCenter.x * 0.58,
      y: nose.y * 0.42 + mouthCenter.y * 0.58,
    },
    headTop,
  }

  return { anchors, angleRad, iod, mouthOpen, yawScale, smile, blink }
}

/** How a part reacts to the child's mouth. */
export const MOUTH_MODE_NONE = 0
export const MOUTH_MODE_STRETCH = 1
export const MOUTH_MODE_CAVITY = 2

export type PartPlacement = {
  translateX: number
  translateY: number
  scale: number
  stretch: number
  squashX: number
  angleRad: number
}

/**
 * Where one art part should sit for a given face frame. The view rotates and
 * scales around its centre, so the centre is translated to P + s·R(θ)·(C − A),
 * which lands the design anchor A exactly on the tracked point P.
 */
export function placePart(
  frame: FaceFrame,
  anchor: FilterAnchor,
  designAnchorX: number,
  designAnchorY: number,
  widthInIod: number,
  mouthMode: number,
  artSize: number,
): PartPlacement {
  'worklet'
  const half = artSize / 2
  const cos = Math.cos(frame.angleRad)
  const sin = Math.sin(frame.angleRad)
  const target = frame.anchors[anchor]
  const scale = (widthInIod * frame.iod) / artSize

  const offX = (half - designAnchorX) * scale
  const offY = (half - designAnchorY) * scale
  // STRETCH: whole muzzle piece subtly grows with the jaw.
  // CAVITY: a mouth interior drawn fully open collapses to a thin lip line
  // when the mouth is closed and opens with the child's real jaw.
  const stretch =
    mouthMode === MOUTH_MODE_CAVITY
      ? 0.14 + 1.02 * frame.mouthOpen
      : mouthMode === MOUTH_MODE_STRETCH
        ? 1 + 0.34 * frame.mouthOpen
        : 1
  // scaleY stretches around the view centre, which would lift the top of the
  // part off its anchor. Shifting the centre down by half the extra height
  // keeps the top pinned so the piece opens downward like a jaw.
  const jawDrop = (stretch - 1) * half * scale

  return {
    translateX: target.x + (offX * cos - offY * sin) - sin * jawDrop - half,
    translateY: target.y + (offX * sin + offY * cos) + cos * jawDrop - half,
    scale,
    stretch,
    squashX: frame.yawScale,
    angleRad: frame.angleRad,
  }
}
