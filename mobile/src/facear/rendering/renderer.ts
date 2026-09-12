/**
 * Renderer — PLACEHOLDER (Phase 3).
 *
 * In Phase 1 the three.js WebGLRenderer / scene / camera and the
 * singleton-runtime guard still live inside legacy/legacyRuntimeAdapter.ts,
 * unchanged. Phase 3 extracts them here (Renderer + CameraLayer + Pipeline)
 * behind the render interfaces, and the current agingMesh becomes the
 * WarpPass + GeometryEngine.
 */
export const RENDERER_STATUS = 'phase-3-not-yet-extracted' as const
