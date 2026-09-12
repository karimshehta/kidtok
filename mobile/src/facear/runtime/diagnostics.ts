/// <reference lib="dom" />
/**
 * SDK runtime diagnostics — runs INSIDE the WebView bundle. Additive and
 * non-invasive: it never touches the legacy render loop, tracking, shaders,
 * or accessory placement. Imported for its side effects BEFORE the legacy
 * runtime so the boot diag posts first.
 *
 * Emits:
 *   - {stage:'sdk-runtime-boot'} runtime flag, SDK version, bundle hash, WebGL renderer
 *   - {stage:'sdk-fps'} sampled FPS + last runtime error, ~every 2s
 *
 * The legacy runtime already emits the rest of the requested diagnostics,
 * unchanged (texture load → 'wrinkle-texture-loaded'; model/tracking init →
 * 'loading' labels; active effect → 'filterReady'; errors → 'error').
 */
const w = window as unknown as Record<string, unknown>
const g = globalThis as unknown as Record<string, unknown>

function post(payload: Record<string, unknown>): void {
  try {
    const fn = w.rnPost as ((p: Record<string, unknown>) => void) | undefined
    if (typeof fn === 'function') fn(payload)
  } catch {
    /* bridge gone — ignore */
  }
}

function webglRenderer(): string {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return 'no-webgl'
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
    return String(gl.getParameter(gl.RENDERER))
  } catch {
    return 'webgl-probe-failed'
  }
}

let lastError: string | null = null
window.addEventListener('error', (e: ErrorEvent) => {
  lastError = String(e.message || e)
})
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  const reason = e.reason as { message?: string } | undefined
  lastError = 'unhandled: ' + String((reason && reason.message) || e.reason)
})

post({
  type: 'diag',
  stage: 'sdk-runtime-boot',
  runtime: 'sdk',
  sdkVersion: (g.__FACEAR_SDK_VERSION__ as string) || 'unknown',
  bundleHash: (g.__FACEAR_BUNDLE_HASH__ as string) || 'unknown',
  webglRenderer: webglRenderer(),
})

// Independent FPS sampler — its own requestAnimationFrame, purely observational.
let frames = 0
let windowStart = 0
function tick(t: number): void {
  if (w.__kidtokDestroyed === true) return
  if (!windowStart) windowStart = t
  frames++
  const elapsed = t - windowStart
  if (elapsed >= 2000) {
    post({ type: 'diag', stage: 'sdk-fps', fps: Math.round((frames * 1000) / elapsed), lastError })
    frames = 0
    windowStart = t
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
