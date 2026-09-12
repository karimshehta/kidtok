/**
 * KidTok Face AR SDK — runtime selection + version (RN-side, type-checked).
 *
 * The SDK bundle is exercised automatically in development builds, while
 * production builds keep the proven template-literal runtime until the
 * on-device parity check is signed off. This makes it possible to test the
 * new delivery path without changing the live store binary.
 */
export type FaceArRuntime = 'legacy' | 'sdk'

/**
 * Development builds load the bundled SDK. Store/release builds remain on
 * legacy until the SDK has passed the device checklist. `__DEV__` is supplied
 * by Metro/Expo and is compile-time replaced in native bundles.
 */
export const FACE_AR_RUNTIME: FaceArRuntime =
  typeof __DEV__ !== 'undefined' && __DEV__ ? 'sdk' : 'legacy'

/** SDK semver — single source; the esbuild build reads this and stamps it
 * into the bundle (globalThis.__FACEAR_SDK_VERSION__) for the diagnostics. */
export const FACE_AR_SDK_VERSION = '0.1.0'
