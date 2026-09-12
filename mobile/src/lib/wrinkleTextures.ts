/**
 * Bundled wrinkle-detail textures for the Grandpa aging shader (webArHtml.ts).
 *
 * wrinkle_mask.png is baked from a REAL CC0 photograph of an elderly man's
 * face (pixnio.com/people/male-men/old-man-person-portrait-face — license
 * verified on-page: itemprop="license" → creativecommons.org/licenses/
 * publicdomain "Free to use CC0"; original file 2850×1952). Pipeline
 * (scratchpad bake_real_wrinkles.py): MediaPipe FaceLandmarker finds the
 * photo's 468 landmarks → every triangle of the shipped 852-tri open
 * topology is affine-warped photo→UV into 1024², putting real aged skin in
 * EXACT canonical UV space → band-pass structure extraction separates
 * wrinkles/pores from the photo's lighting (so the overlay carries only
 * STRUCTURE and blends onto any skin tone) → attenuation for eyes/mouth/
 * nostrils, eyebrow/stubble zones, hairline band, untrusted outer UV band
 * (photo silhouette = hair/background) and mesh-boundary feather.
 * No existing open asset maps aged skin to MediaPipe's canonical UV layout —
 * this bake pipeline IS how one gets made from an open (CC0) source.
 *
 * wrinkle_mask.png channels (flipY=false, same convention as every other
 * texture in webArHtml.ts — row 0 of the file is UV v=0, which is the CHIN,
 * not the forehead; the face reads upside-down if opened in a normal image
 * viewer, by design):
 *   R = wrinkle shadow mask
 *   G = wrinkle highlight/ridge mask
 *   B = age-spot / blotch mask
 *   A = unused (255 everywhere — data channels must not ride a low PNG
 *       alpha, some WebView decoders premultiply and destroy them)
 *
 * wrinkle_detail.png is a small seamless-tiling grayscale pore/skin-grain
 * texture, unrelated to face UV placement — sampled at a much higher tiling
 * frequency in-shader.
 *
 * See src/assets/models/LICENSES.md for the full audit-trail row.
 */
export interface WrinkleTextureDef {
  id: string
  /** Filename this texture is copied to next to index.html (must be unique). */
  file: string
  /** Metro asset module — require('../assets/textures/xyz.png'). */
  module: number
}

export const WRINKLE_TEXTURES: WrinkleTextureDef[] = [
  { id: 'wrinkle_mask', file: 'wrinkle_mask.png', module: require('../assets/textures/wrinkle_mask.png') },
  { id: 'wrinkle_detail', file: 'wrinkle_detail.png', module: require('../assets/textures/wrinkle_detail.png') },
]
