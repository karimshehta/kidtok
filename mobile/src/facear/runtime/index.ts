/**
 * esbuild ENTRY POINT for the WebView Face AR runtime.
 *
 * Bundled by src/facear/build/bundle.mjs into assets/facear/facear.bundle.txt
 * (served on-device as facear.bundle.js) with three.js, three/addons,
 * d3-delaunay and @mediapipe/tasks-vision all bundled locally — no CDN
 * importmap. See ARCHITECTURE.md.
 */
import './bootstrap'
