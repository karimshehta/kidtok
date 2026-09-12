/**
 * SDK WebView shell generator (RN-side, type-checked).
 *
 * Produces the index.html for the "sdk" runtime. It is IDENTICAL to the legacy
 * WEB_AR_HTML shell — same DOM, same CSS, same inline bootstrap (which injects
 * __AR_MODELS__ / __CANONICAL_FACE__ and defines rnPost / the message queue) —
 * with exactly two differences:
 *   1. the CDN <script type="importmap"> is REMOVED (three etc. are bundled), and
 *   2. the inline <script type="module"> runtime is replaced by
 *      <script src="./facear.bundle.js"></script> (a classic script, so it loads
 *      over file:// like an <img>/GLB — module scripts use fetch semantics that
 *      Android WebView blocks on file://, the same reason GLBs use XHR).
 *
 * Kept as a generated string (not a static file) so the injected data stays
 * single-sourced from arModels.ts + canonicalFaceMesh.json, exactly matching
 * the legacy injection.
 */
import { AR_MODELS } from '@/lib/arModels'
import canonicalFaceMesh from '@/lib/canonicalFaceMesh.json'

/** Filename the bundle is served as inside AR_DIR (copied there at prep time). */
export const FACE_AR_BUNDLE_FILE = 'facear.bundle.js'

const AR_MODELS_META = JSON.stringify(
  AR_MODELS.map((m) => ({ id: m.id, file: m.file, offset: m.offset, width: m.width, rotate: m.rotate })),
)
const CANONICAL_FACE_META = JSON.stringify(canonicalFaceMesh)

export function buildSdkIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="ar">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000; }
  #cam { position:fixed; inset:0; width:100%; height:100%; object-fit:cover; background:#000; }
  #cam.mirrored { transform: scaleX(-1); }
  #gl { position:fixed; inset:0; width:100%; height:100%; }
</style>
</head>
<body>
<video id="cam" class="mirrored" autoplay muted playsinline></video>
<canvas id="gl"></canvas>
<script>
  window.__AR_MODELS__ = ${AR_MODELS_META}
  window.__CANONICAL_FACE__ = ${CANONICAL_FACE_META}
  // Set as soon as teardown starts (pagehide, explicit {type:'destroy'}, or a
  // fatal boot error). Checked by rnPost and by every async continuation so
  // nothing touches the (possibly gone) native bridge after destruction.
  window.__kidtokDestroyed = false
  function rnPost(payload) {
    if (window.__kidtokDestroyed) return
    try {
      // window.__WEB_AR_RUNTIME__ does not exist yet for the first couple of
      // boot messages (it is created once the module script below runs) —
      // every message from that point on carries the id so RN-side logs can
      // tell, definitively, whether more than one runtime is talking to it.
      const runtime = window.__WEB_AR_RUNTIME__
      const stamped = Object.assign({}, payload, { runtimeInstanceId: runtime ? runtime.runtimeInstanceId : null })
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(stamped))
    } catch (e) {}
  }
  window.onerror = function (message, source, line) {
    rnPost({ type: 'error', message: String(message) + ' @' + (source || '') + ':' + line })
  }
  window.addEventListener('unhandledrejection', function (e) {
    rnPost({ type: 'error', message: 'unhandled: ' + String(e.reason && e.reason.message || e.reason) })
  })
  rnPost({ type: 'loading', label: 'boot' })
  window.__kidtokQueue = []
  window.__kidtokHandle = function (raw) { window.__kidtokQueue.push(raw) }
  function listenRN(event) { window.__kidtokHandle(event.data) }
  window.addEventListener('message', listenRN)
  document.addEventListener('message', listenRN)
</script>
<script src="./${FACE_AR_BUNDLE_FILE}"></script>
</body>
</html>`
}
