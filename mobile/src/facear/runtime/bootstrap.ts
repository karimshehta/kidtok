/**
 * WebView bundle bootstrap (Phase 1).
 *
 * Two side-effecting imports, evaluated IN ORDER by esbuild:
 *   1. diagnostics — posts the sdk-runtime-boot diag + starts the FPS sampler
 *      BEFORE the runtime boots, so the host sees "sdk" is live immediately.
 *   2. legacyRuntimeAdapter — the verbatim current runtime; it self-starts on
 *      evaluation (reads the window globals the HTML bootstrap injected:
 *      __CANONICAL_FACE__, __AR_MODELS__, rnPost, __kidtokQueue).
 *
 * Phases 2–6 will replace import #2 with the real modular engines
 * (tracking → geometry → beauty → makeup → accessories → runtime).
 */
import './diagnostics'
import '../legacy/legacyRuntimeAdapter'
