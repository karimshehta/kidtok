# Open AR artwork notices

The face-camera runtime uses these open-licensed source artworks as its primary
2D overlays. The runtime crops and landmark-aligns the pieces; it does not use
the original files as a full-face replacement.

| Artwork | Source | License |
| --- | --- | --- |
| Cat ears (`cat_ears.png`) | `https://github.com/njpietrow/Filter.io/blob/main/assets/ears.png` | MIT, Copyright (c) 2022 Nick J Pietrow |
| Glasses (`glasses.png`) | `https://github.com/bercoding/SnapArtv2.0/blob/main/SnapArtV2-1/Assets.xcassets/filter_glasses.imageset/filter_glasses.png` | MIT |
| Cat, rabbit and old-man SVG feature artwork | `https://github.com/googlefonts/noto-emoji/tree/main/svg` | Apache License 2.0 |

The original files are bundled under this directory and copied beside the
WebAR page at startup. Runtime filenames are declared in
`src/facear/legacy/legacyRuntimeAdapter.ts` as `OPEN_AR_ART`; no source-host
request is made while a child is using the camera.
