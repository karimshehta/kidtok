import type { TrackedFace, TrackedLandmarks, TrackedPoint } from '@/components/KidTrackedFaceMask'

/**
 * A recorded face-tracking timeline: where the child's face was at every
 * sampled moment of the clip. Captured live while recording, replayed in the
 * preview player and in the feed so the mask stays glued to the face wherever
 * the video plays — the raw video itself never contains the mask pixels.
 */
export type AvatarTrackSample = {
  t: number
  face: TrackedFace | null
}

/** Screen metrics captured at record time so playback can rescale. */
export type AvatarTrack = {
  v: 1
  w: number
  h: number
  samples: AvatarTrackSample[]
}

const MAX_SAMPLES = 1400 // 30s at ~45 samples/s — far above real callback rates
const MAX_LERP_GAP_SEC = 0.34
const NEAREST_TOLERANCE_SEC = 0.17

export function createAvatarTrack(width: number, height: number): AvatarTrack {
  return { v: 1, w: width, h: height, samples: [] }
}

export function pushAvatarSample(track: AvatarTrack, t: number, face: TrackedFace | null) {
  if (track.samples.length >= MAX_SAMPLES) return
  const last = track.samples[track.samples.length - 1]
  if (last && t - last.t < 0.03) return
  track.samples.push({ t, face })
}

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k
}

function lerpPoint(a?: TrackedPoint, b?: TrackedPoint, k = 0): TrackedPoint | undefined {
  if (!a || !b) return undefined
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
}

function lerpFace(a: TrackedFace, b: TrackedFace, k: number): TrackedFace {
  const la: TrackedLandmarks = a.landmarks || {}
  const lb: TrackedLandmarks = b.landmarks || {}
  return {
    bounds: {
      x: lerp(a.bounds.x, b.bounds.x, k),
      y: lerp(a.bounds.y, b.bounds.y, k),
      width: lerp(a.bounds.width, b.bounds.width, k),
      height: lerp(a.bounds.height, b.bounds.height, k),
    },
    rollAngle: lerp(a.rollAngle || 0, b.rollAngle || 0, k),
    yawAngle: lerp(a.yawAngle || 0, b.yawAngle || 0, k),
    pitchAngle: lerp(a.pitchAngle || 0, b.pitchAngle || 0, k),
    leftEyeOpenProbability: lerp(a.leftEyeOpenProbability ?? 1, b.leftEyeOpenProbability ?? 1, k),
    rightEyeOpenProbability: lerp(a.rightEyeOpenProbability ?? 1, b.rightEyeOpenProbability ?? 1, k),
    smilingProbability: lerp(a.smilingProbability ?? 0, b.smilingProbability ?? 0, k),
    landmarks: {
      leftEye: lerpPoint(la.leftEye, lb.leftEye, k),
      rightEye: lerpPoint(la.rightEye, lb.rightEye, k),
      leftEar: lerpPoint(la.leftEar, lb.leftEar, k),
      rightEar: lerpPoint(la.rightEar, lb.rightEar, k),
      noseBase: lerpPoint(la.noseBase, lb.noseBase, k),
      mouthLeft: lerpPoint(la.mouthLeft, lb.mouthLeft, k),
      mouthRight: lerpPoint(la.mouthRight, lb.mouthRight, k),
      upperLip: lerpPoint(la.upperLip, lb.upperLip, k),
      lowerLip: lerpPoint(la.lowerLip, lb.lowerLip, k),
      mouthBottom: lerpPoint(la.mouthBottom, lb.mouthBottom, k),
      faceTop: lerpPoint(la.faceTop, lb.faceTop, k),
      chin: lerpPoint(la.chin, lb.chin, k),
      leftCheek: lerpPoint(la.leftCheek, lb.leftCheek, k),
      rightCheek: lerpPoint(la.rightCheek, lb.rightCheek, k),
    },
  }
}

/**
 * Face at playback time `t`, interpolated between the two nearest samples.
 * Returns null in stretches where the face was genuinely lost on camera.
 */
export function sampleAvatarTrack(track: AvatarTrack | null | undefined, t: number): TrackedFace | null {
  const samples = track?.samples
  if (!samples || samples.length === 0) return null

  // Binary search for the last sample at or before t.
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (samples[mid].t <= t) lo = mid
    else hi = mid - 1
  }

  const before = samples[lo]
  const after = samples[Math.min(lo + 1, samples.length - 1)]

  if (t < before.t) {
    return before.t - t <= NEAREST_TOLERANCE_SEC ? before.face : null
  }
  if (before === after || after.t <= before.t) {
    return t - before.t <= NEAREST_TOLERANCE_SEC ? before.face : null
  }

  const gap = after.t - before.t
  if (before.face && after.face && gap <= MAX_LERP_GAP_SEC) {
    const k = Math.min(1, Math.max(0, (t - before.t) / gap))
    return lerpFace(before.face, after.face, k)
  }

  // Around gaps or lost faces, snap to whichever sample is closest.
  const nearest = t - before.t <= after.t - t ? before : after
  return Math.abs(nearest.t - t) <= NEAREST_TOLERANCE_SEC ? nearest.face : null
}

// ─── Storage encoding ─────────────────────────────────────────────────────────
// Compact JSON for the database: rounded ints, landmark arrays, null = face
// lost. Kept dumb and versioned so old clients simply ignore it.

type EncodedSample = [number, number[], (number | null)[]] | [number]

export type EncodedAvatarTrack = {
  v: 1
  w: number
  h: number
  s: EncodedSample[]
}

const LANDMARK_ORDER: (keyof TrackedLandmarks)[] = [
  'leftEye', 'rightEye', 'noseBase', 'mouthLeft', 'mouthRight', 'mouthBottom',
  'leftEar', 'rightEar', 'upperLip', 'lowerLip', 'faceTop', 'chin', 'leftCheek', 'rightCheek',
]

export function encodeAvatarTrack(track: AvatarTrack): EncodedAvatarTrack {
  return {
    v: 1,
    w: Math.round(track.w),
    h: Math.round(track.h),
    s: track.samples.map((sample) => {
      const t = Math.round(sample.t * 1000)
      if (!sample.face) return [t] as EncodedSample
      const b = sample.face.bounds
      const bounds = [
        Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height),
        Math.round((sample.face.rollAngle || 0) * 10),
        Math.round((sample.face.yawAngle || 0) * 10),
        Math.round((sample.face.pitchAngle || 0) * 10),
        Math.round((sample.face.leftEyeOpenProbability ?? -1) * 1000),
        Math.round((sample.face.rightEyeOpenProbability ?? -1) * 1000),
        Math.round((sample.face.smilingProbability ?? -1) * 1000),
      ]
      const lm = sample.face.landmarks || {}
      const points: (number | null)[] = []
      for (const key of LANDMARK_ORDER) {
        const point = lm[key]
        if (point) points.push(Math.round(point.x), Math.round(point.y))
        else points.push(null, null)
      }
      return [t, bounds, points] as EncodedSample
    }),
  }
}

export function decodeAvatarTrack(raw: unknown): AvatarTrack | null {
  try {
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as EncodedAvatarTrack | null
    if (!data || data.v !== 1 || !Array.isArray(data.s)) return null
    const track = createAvatarTrack(Number(data.w) || 0, Number(data.h) || 0)
    for (const rawEntry of data.s) {
      const entry = rawEntry as unknown as unknown[]
      if (!Array.isArray(entry) || entry.length === 0) continue
      const t = Number(entry[0]) / 1000
      if (entry.length < 3 || !Array.isArray(entry[1]) || !Array.isArray(entry[2])) {
        track.samples.push({ t, face: null })
        continue
      }
      const bounds = entry[1] as number[]
      const points = entry[2] as (number | null)[]
      const landmarks: TrackedLandmarks = {}
      LANDMARK_ORDER.forEach((key, index) => {
        const x = points[index * 2]
        const y = points[index * 2 + 1]
        if (typeof x === 'number' && typeof y === 'number') landmarks[key] = { x, y }
      })
      track.samples.push({
        t,
        face: {
          bounds: { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] },
          rollAngle: (bounds[4] || 0) / 10,
          yawAngle: (bounds[5] || 0) / 10,
          pitchAngle: (bounds[6] || 0) / 10,
          leftEyeOpenProbability: bounds[7] != null && bounds[7] >= 0 ? bounds[7] / 1000 : undefined,
          rightEyeOpenProbability: bounds[8] != null && bounds[8] >= 0 ? bounds[8] / 1000 : undefined,
          smilingProbability: bounds[9] != null && bounds[9] >= 0 ? bounds[9] / 1000 : undefined,
          landmarks,
        },
      })
    }
    return track.samples.length ? track : null
  } catch {
    return null
  }
}

/**
 * Rescales a track recorded on one screen size onto the playback viewport.
 * The camera preview and the feed player both render full-screen "cover", so
 * proportional scaling on each axis keeps the mask aligned with the face.
 */
export function scaleAvatarTrack(track: AvatarTrack, targetW: number, targetH: number): AvatarTrack {
  if (!track.w || !track.h || (track.w === targetW && track.h === targetH)) return track

  // The camera preview, recorded 9:16 video and every playback surface all
  // use centered `cover`. A direct X/Y stretch moves masks vertically whenever
  // the feed viewport has a different aspect ratio than the recording screen.
  // Convert screen coordinates back into video pixels, then apply the target
  // viewport's own cover transform.
  const frameW = 720
  const frameH = 1280
  const sourceScale = Math.max(track.w / frameW, track.h / frameH)
  const sourceCropX = (frameW * sourceScale - track.w) / 2
  const sourceCropY = (frameH * sourceScale - track.h) / 2
  const targetScale = Math.max(targetW / frameW, targetH / frameH)
  const targetCropX = (frameW * targetScale - targetW) / 2
  const targetCropY = (frameH * targetScale - targetH) / 2
  const relativeScale = targetScale / sourceScale

  const scalePoint = (p?: TrackedPoint) => (p ? {
    x: ((p.x + sourceCropX) / sourceScale) * targetScale - targetCropX,
    y: ((p.y + sourceCropY) / sourceScale) * targetScale - targetCropY,
  } : undefined)
  return {
    v: 1,
    w: targetW,
    h: targetH,
    samples: track.samples.map((sample) => ({
      t: sample.t,
      face: sample.face
        ? {
            bounds: {
              x: ((sample.face.bounds.x + sourceCropX) / sourceScale) * targetScale - targetCropX,
              y: ((sample.face.bounds.y + sourceCropY) / sourceScale) * targetScale - targetCropY,
              width: sample.face.bounds.width * relativeScale,
              height: sample.face.bounds.height * relativeScale,
            },
            rollAngle: sample.face.rollAngle,
            yawAngle: sample.face.yawAngle,
            pitchAngle: sample.face.pitchAngle,
            leftEyeOpenProbability: sample.face.leftEyeOpenProbability,
            rightEyeOpenProbability: sample.face.rightEyeOpenProbability,
            smilingProbability: sample.face.smilingProbability,
            landmarks: {
              leftEye: scalePoint(sample.face.landmarks?.leftEye),
              rightEye: scalePoint(sample.face.landmarks?.rightEye),
              leftEar: scalePoint(sample.face.landmarks?.leftEar),
              rightEar: scalePoint(sample.face.landmarks?.rightEar),
              noseBase: scalePoint(sample.face.landmarks?.noseBase),
              mouthLeft: scalePoint(sample.face.landmarks?.mouthLeft),
              mouthRight: scalePoint(sample.face.landmarks?.mouthRight),
              upperLip: scalePoint(sample.face.landmarks?.upperLip),
              lowerLip: scalePoint(sample.face.landmarks?.lowerLip),
              mouthBottom: scalePoint(sample.face.landmarks?.mouthBottom),
              faceTop: scalePoint(sample.face.landmarks?.faceTop),
              chin: scalePoint(sample.face.landmarks?.chin),
              leftCheek: scalePoint(sample.face.landmarks?.leftCheek),
              rightCheek: scalePoint(sample.face.landmarks?.rightCheek),
            },
          }
        : null,
    })),
  }
}
