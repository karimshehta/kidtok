/**
 * MediaPipe tracking provider — PLACEHOLDER (Phase 2).
 *
 * In Phase 1 (strict parity) the MediaPipe FaceLandmarker + FilesetResolver
 * still live inside legacy/legacyRuntimeAdapter.ts, exactly as they ship today
 * (WASM from the jsdelivr CDN, model from Google Cloud Storage — unchanged).
 *
 * Phase 2 moves them here behind the `FaceTrackingProvider` contract from
 * core/types.ts, so the rest of the SDK stops importing @mediapipe/* directly
 * and full-offline WASM/model hosting can be added without touching consumers.
 */
export const MEDIAPIPE_PROVIDER_STATUS = 'phase-2-not-yet-extracted' as const
