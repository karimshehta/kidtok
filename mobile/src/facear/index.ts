/**
 * KidTok Face AR SDK — public barrel (RN-side, type-checked).
 *
 * Only RN-safe modules are re-exported here (types, effect definitions,
 * runtime config, the WebView shell generator). The browser-bundle code
 * (runtime/*, legacy/*, providers/*, rendering/*) is NOT exported — it is
 * consumed only by the esbuild entry and must never be imported by RN code.
 */
export * from './core/types'
export * from './effects/definitions'
export { FACE_AR_RUNTIME, FACE_AR_SDK_VERSION, type FaceArRuntime } from './config'
export { buildSdkIndexHtml, FACE_AR_BUNDLE_FILE } from './webview/sdkHtml'
