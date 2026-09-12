/**
 * Bundled GLB face-mask ACCESSORY models for the WebView AR camera.
 *
 * HARD RULE: every model here must be a wearable ACCESSORY (ears, horns,
 * crown, eye mask, half-face mask, oversized glasses...) that leaves the
 * child's own eyes and mouth visible. NEVER a full/closed head or a model
 * that covers the whole face — the first three models tried here (bear/
 * teddy/raccoon "heads") looked like the child's face disappeared behind a
 * solid object and were rejected for exactly that reason. When vetting a new
 * candidate, check its bounding box depth (Z): a real accessory is thin
 * front-to-back (ears, a crown band, a mask strip); a closed head is roughly
 * as deep as it is wide/tall — reject anything that isn't clearly thin.
 *
 * Each .glb is a REAL binary asset in src/assets/models/, resolved by Metro
 * (see metro.config.js — 'glb' was added to resolver.assetExts) into an
 * expo-asset module. On mount, WebArRecorder copies each asset's localUri
 * into one shared folder next to the AR page's index.html, so the page's own
 * GLTFLoader can `fetch('./cat_ears.glb')` directly — a same-origin file://
 * read (via XMLHttpRequest — see webArHtml.ts's loadArrayBuffer for why:
 * Android WebView's fetch() rejects the file: scheme). NOTHING is sent
 * through the React Native↔WebView postMessage bridge for model data.
 *
 * Placement fields are in HEAD-RIG units (used by webArHtml.ts's FILTERS
 * registry, generated from this list at build time — see the JSON dump at
 * the top of WEB_AR_HTML):
 * - offset: [x, y, z] in face-widths, head-local (y up, z towards viewer)
 * - width:  desired model width in face-widths (1.0 = temple-to-temple)
 * - rotate: [x, y, z] radians applied to the raw model before normalization
 *           (archive models face arbitrary directions)
 *
 * EVERY entry must have a matching row in src/assets/models/LICENSES.md.
 */
export interface ArModelDef {
  id: string
  /** Filename this model is copied to next to index.html (must be unique). */
  file: string
  /** Metro asset module — require('../assets/models/xyz.glb'). */
  module: number
  emoji: string
  nameAr: string
  nameEn: string
  color: string
  offset: [number, number, number]
  width: number
  rotate: [number, number, number]
  license: string
  sourceUrl: string
  /** Shown in the in-app credits so CC-BY terms are met. Omit for CC0. */
  attribution?: string
}

/**
 * Reserved for vetted GLB accessories. The first imported archive meshes are
 * deliberately disabled: their pivots do not map to a child's live face and
 * produced floating ears/temple arms. The active cat, rabbit and glasses
 * filters are landmark-rigged procedural models in the WebAR runtime.
 */
export const AR_MODELS: ArModelDef[] = []
