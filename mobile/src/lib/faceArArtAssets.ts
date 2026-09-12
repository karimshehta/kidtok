/**
 * Open-licensed 2D face-filter art copied beside the WebAR page.
 *
 * Keeping these files in the app bundle makes filter selection immediate and
 * deterministic on a child's device; no raw GitHub request is needed while
 * the camera is open. Source URLs and licences are recorded in
 * src/assets/facear/OPEN_ART_LICENSES.md.
 */
export interface FaceArArtAsset {
  file: string
  module: number
}

export const FACE_AR_ART_ASSETS: FaceArArtAsset[] = [
  { file: 'cat_ears.png', module: require('../assets/facear/cat_ears.png') },
  { file: 'glasses.png', module: require('../assets/facear/glasses.png') },
  // Metro treats the downloaded SVG sources as opaque .txt assets. They are
  // restored to their real extension when copied to the WebView directory.
  { file: 'cat_face.svg', module: require('../assets/facear/cat_face.svg.txt') },
  { file: 'rabbit_face.svg', module: require('../assets/facear/rabbit_face.svg.txt') },
  { file: 'old_man_face.svg', module: require('../assets/facear/old_man_face.svg.txt') },
]
