const SNAP_ENV_KEYS = [
  'EXPO_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN',
  'EXPO_PUBLIC_SNAP_CAMERA_KIT_STAGING_API_TOKEN',
  'EXPO_PUBLIC_SNAP_CAMERA_KIT_PRODUCTION_API_TOKEN',
  'EXPO_PUBLIC_SNAP_CAMERA_KIT_FORCE_STAGING',
  'EXPO_PUBLIC_SNAP_LENS_GROUP_ID',
]

const staticExpoConfig = require('./app.json').expo

module.exports = ({ config }) => {
  const mergedConfig = {
    ...staticExpoConfig,
    ...config,
    ios: {
      ...(staticExpoConfig.ios || {}),
      ...(config.ios || {}),
      infoPlist: {
        ...((staticExpoConfig.ios || {}).infoPlist || {}),
        ...((config.ios || {}).infoPlist || {}),
      },
    },
    android: {
      ...(staticExpoConfig.android || {}),
      ...(config.android || {}),
    },
    web: {
      ...(staticExpoConfig.web || {}),
      ...(config.web || {}),
    },
    extra: {
      ...(staticExpoConfig.extra || {}),
      ...(config.extra || {}),
    },
  }

  const extra = { ...(mergedConfig.extra || {}) }

  for (const key of SNAP_ENV_KEYS) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      extra[key] = value.trim()
    }
  }

  return {
    ...mergedConfig,
    extra,
  }
}
