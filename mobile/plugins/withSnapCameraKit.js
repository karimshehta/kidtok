const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('@expo/config-plugins')

const SNAP_TOKEN_KEYS = [
  'EXPO_PUBLIC_SNAP_CAMERA_KIT_PRODUCTION_API_TOKEN',
  'EXPO_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN',
  'EXPO_PUBLIC_SNAP_CAMERA_KIT_STAGING_API_TOKEN',
]

function isTruthy(value) {
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on', 'staging'].includes(value.trim().toLowerCase())
}

function configValue(config, key) {
  const value = process.env[key] || config.extra?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function resolveSnapToken(config) {
  const forceStaging = isTruthy(configValue(config, 'EXPO_PUBLIC_SNAP_CAMERA_KIT_FORCE_STAGING'))
  if (forceStaging) {
    const stagingToken =
      configValue(config, 'EXPO_PUBLIC_SNAP_CAMERA_KIT_STAGING_API_TOKEN') ||
      configValue(config, 'EXPO_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN')
    if (stagingToken) return stagingToken
  }

  for (const key of SNAP_TOKEN_KEYS) {
    const value = configValue(config, key)
    if (value) return value
  }
  return ''
}

function withSnapCameraKit(config) {
  config = withAndroidManifest(config, (config) => {
    const token = resolveSnapToken(config)
    if (!token) return config

    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults)
    mainApplication['meta-data'] = mainApplication['meta-data'] || []
    const metadata = mainApplication['meta-data']
    const existing = metadata.find((item) => item?.$?.['android:name'] === 'com.snap.camerakit.app.id')
    if (existing) {
      existing.$['android:value'] = token
    } else {
      metadata.push({
        $: {
          'android:name': 'com.snap.camerakit.app.id',
          'android:value': token,
        },
      })
    }

    return config
  })

  config = withInfoPlist(config, (config) => {
    const token = resolveSnapToken(config)
    if (token) {
      config.modResults.SCCameraKitAPIToken = token
    }
    return config
  })

  return config
}

module.exports = withSnapCameraKit
