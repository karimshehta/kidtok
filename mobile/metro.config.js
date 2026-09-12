const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)

// 3D face-mask assets for the WebView AR camera — Metro must treat these as
// opaque binary assets (require() returns an asset module id), not try to
// parse them as source.
config.resolver.assetExts.push('glb', 'gltf', 'bin')

// The Face AR SDK bundle ships as assets/facear/facear.bundle.txt — a .txt so
// Metro treats the built JS as a COPYABLE asset (Metro parses .js as source).
// WebArRecorder copies it to AR_DIR/facear.bundle.js at prep time when the
// FACE_AR_RUNTIME flag is 'sdk'. See src/facear/ARCHITECTURE.md.
config.resolver.assetExts.push('txt')

module.exports = config
