# KidTok AR Filter Models — Sources & Licenses

Every 3D filter model used by the WebView AR camera (`src/lib/webArHtml.ts`
`FILTERS` registry / `src/lib/arModels.ts` `AR_MODELS`) must be documented
here BEFORE it ships. Rules:

- **ACCESSORY SHAPE ONLY.** A model must leave the child's own eyes and mouth
  visible: ears, horns, a crown, an eye mask, a half-face mask, oversized
  glasses. **Never a full/closed head or anything that covers the whole
  face** — see "Rejected models" below for why this rule exists and how to
  vet a candidate's bounding box before downloading it.
- Allowed licenses: **CC0**, **MIT**, **Apache-2.0**, or **CC-BY** with the
  exact attribution line documented and shown live in the app.
- No Sketchfab downloads unless the model page explicitly says **CC0**.
- Every URL must be verified reachable before shipping:
  `curl -sIL -o /dev/null -w "%{http_code}" "<url>"` → must print `200`, AND
  the downloaded bytes must start with the `glTF` binary magic (first 4
  bytes) — confirm with `head -c4 file.glb | xxd`.
- Inspect the geometry before accepting: `npx @gltf-transform/cli inspect
  file.glb` and check `bboxMin`/`bboxMax`. An accessory is thin in one axis
  (e.g. ears/a mask are shallow front-to-back); a rejected "head" model is
  roughly as deep as it is wide — that depth is the tell.

## Vetted sources

| Source | License | Notes |
|---|---|---|
| poly.pizza | per-model (CC0 or CC-BY "Poly by Google"/named authors) | Search UI is client-rendered — fetch `https://poly.pizza/m/<id>` and grep `og:title` + the embedded `"license":"..."` JSON, and `static.poly.pizza/<uuid>.glb` for the direct download |
| kenney.nl | CC0 | packs (zip) — extract the .glb you need; check bbox, many "animal" packs are full-body/full-head, not accessories |
| quaternius.com | CC0 | download buttons often route through Google Drive (reject — no direct verifiable URL); poly.pizza mirrors many of his packs with direct static.poly.pizza links instead |

## Disabled archive models

The three files below remain in the repository for auditability, but are **not
shipped to the app or exposed in the picker**. Live testing showed that their
archive pivots and proportions are not authored for a landmark-driven face
rig. The active cat, rabbit and glasses filters are procedural and
landmark-rigged instead, so no third-party model attribution is shown in the
camera UI.

| Filter id | Model | Source URL | License | Size (raw) | Tris (approx) | Attribution shown in-app |
|---|---|---|---|---|---|---|
| `cat_ears` | Cat ears | https://poly.pizza/m/197Gkpt6GNV | **CC-BY 3.0** — https://creativecommons.org/licenses/by/3.0/ | 7,968 B | ~110 | disabled |
| `rabbit_ears` | Rabbit ears | https://poly.pizza/m/1bLq_k5vHMt | **CC-BY 3.0** — https://creativecommons.org/licenses/by/3.0/ | 11,180 B | ~250 | disabled |
| `glasses` | Glasses (iPoly3D) | https://poly.pizza/m/1TJPsi4VIT | **CC0 1.0** | 42,768 B | ~1,000 | disabled |

## Shipped textures (src/assets/textures/, registry src/lib/wrinkleTextures.ts)

| File | Derived from | Source URL | License | Notes |
|---|---|---|---|---|
| `wrinkle_mask.png` | CC0 photograph of an elderly man's face, reprojected into MediaPipe canonical UV space (852-tri open topology) and reduced to lighting-free structure channels (R=shadow, G=highlight, B=spots) | https://pixnio.com/people/male-men/old-man-person-portrait-face (original file: https://pixnio.com/free-images/2017/04/10/2017-04-10-17-53-38.jpg, 2850×1952) | **CC0** — verified on-page: `itemprop="license"` → https://creativecommons.org/licenses/publicdomain/ "Free to use CC0" (checked 2026-07-21, HTTP 200) | Bake pipeline: MediaPipe FaceLandmarker landmarks → per-triangle affine warp photo→UV → band-pass structure extraction → eye/mouth/nostril/brow/stubble/hairline/silhouette attenuation. Only STRUCTURE ships — no photo colors/lighting, not identifiable as the source person. |
| `wrinkle_detail.png` | Procedurally generated seamless multi-octave noise (our own code) | n/a | n/a | 256² tiling pore/skin-grain texture |

Verified 2026-07-21: `curl -sIL` → HTTP 200; downloaded bytes start with the
`glTF` magic; `gltf-transform inspect` bbox = x −4.78..4.78 (width 9.57),
y 0.004..10.46 (height 10.46), **z −1.15..1.00 (depth 2.15)** — depth is
~4.5× thinner than width/height, confirming this is a thin top-of-head
accessory, not a closed head volume (compare to the rejected models below,
whose depth was comparable to their width/height).

### Placement calibration — NOT yet visually confirmed on a live face

`offset=[0, 0.75, -0.05]`, `width=0.95`, `rotate=[0,0,0]` in `arModels.ts` are
a first-pass estimate (same reasoning approach used for the crown: anchor at
the between-eyes rig point, offset upward toward the forehead/head-top by a
fraction of face-width). Not confirmed by rendering — the in-session
browser/screenshot tool was unavailable again this pass. First on-device test
may need a one-line `offset`/`rotate` tweak in `arModels.ts` — no rebuild
required (pure JS/data change), just a Metro reload.

## Rejected models (do not re-add without a structural fix)

These three were downloaded, license-verified, and shipped in an earlier
pass, then **pulled** after live testing showed they render as full, closed
animal heads that hide the child's face instead of sitting on it like a worn
accessory — they fail the hard "accessory shape only" rule at the top of
this file:

| Was `king`-style filter id | Model | Source URL | License | Why rejected |
|---|---|---|---|---|
| `bear_head` | Bear Head mount, by Kenney | https://poly.pizza/m/quLiYDFAHt | CC0 | Closed head volume, no eye/mouth openings — reads as a mask covering the whole face |
| `teddy_bear_head` | Teddy Bear Head, by Hayden Lee | https://poly.pizza/m/3lZqpjJzKwq | CC-BY 3.0 | Same — closed head, face hidden |
| `raccoon_head` | Raccoon Head, by Hayden Lee | https://poly.pizza/m/1UiQMj8dPDY | CC-BY 3.0 | Same — closed head, face hidden |

Their `.glb` files were deleted from `src/assets/models/` and their entries
removed from `AR_MODELS`. If reconsidering any of these, first check its
`gltf-transform inspect` bbox depth (Z) against its width/height — all three
had depth comparable to width/height (a real 3D head volume), unlike
`cat_ears`'s 4.5×-thinner profile documented above.

## MindAR investigation (2026-07-21)

Per an explicit request, `mind-ar@1.2.5`'s face-tracking bundle
(`mindar-face-three.prod.js`, verified reachable on jsdelivr, HTTP 200) was
downloaded and its dependency chain inspected. Its `controller-*.js`
(2.2 MB) internally uses **`@mediapipe/tasks-vision`'s `FaceLandmarker`**,
downloading a `face_landmarker.task` model from
`storage.googleapis.com/mediapipe-models/...` at runtime — i.e. MindAR's
face module is a wrapper AROUND the same MediaPipe face-mesh technology this
app already uses directly via `@mediapipe/face_mesh`, not a different/better
tracking engine. Its added value is convenience helpers (`addAnchor(index)`,
`addFaceMesh()` for occlusion) — both of which this app already implements
itself (the `rig` position/quaternion/faceWidth object in `webArHtml.ts`,
plus the Delaunay-based occluder). Switching would add a large new
dependency and an external cloud-hosted model download with no tracking-
quality upside. Decision: kept the existing MediaPipe + custom anchor rig,
per the fallback the user's own instructions already allowed for this case.

## Explored but not yet shipped (honest gaps)

- **Horns, eye mask, half-face mask, oversized glasses**: not yet sourced.
  Next candidates to search on poly.pizza: "devil horns", "eye mask",
  "sunglasses", "half mask" — same verification process as `cat_ears` above
  (direct static.poly.pizza URL + license JSON + bbox depth check).
- **Old man / grandpa accessory** (e.g. glasses + moustache as separate
  accessory pieces, NOT a full face): not yet sourced.

<!-- Add new rows here. NEVER ship a model without a row in this table. -->
