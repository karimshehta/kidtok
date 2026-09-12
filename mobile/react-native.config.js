module.exports = {
  dependencies: {
    '@wokcito/ffmpeg-kit-react-native': {
      platforms: {
        // ffmpeg-kit iOS binary releases used by the transitive CocoaPods pod
        // currently return 404 during pod install. The Android binaries are
        // also the most likely legacy native payload to fail Google Play's
        // 16 KB memory page-size check, so KidTok keeps the dependency in JS
        // but does not autolink its native code on store builds.
        ios: null,
        android: null,
      },
    },
  },
}
