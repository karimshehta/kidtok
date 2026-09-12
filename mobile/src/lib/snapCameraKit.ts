import Constants from 'expo-constants'

const DEFAULT_LENS_GROUP_ID = '808b634e-f5b4-4ab3-afe5-2e1ee0b4b8a8'

function extraValue(key: string) {
  const constants = Constants as any
  const extra =
    constants?.expoConfig?.extra ||
    constants?.manifest?.extra ||
    constants?.manifest2?.extra ||
    {}
  return typeof extra?.[key] === 'string' ? extra[key] : ''
}

function truthyConfigValue(value: unknown) {
  if (typeof value !== 'string') return false
  return ['1', 'true', 'yes', 'on', 'staging'].includes(value.trim().toLowerCase())
}

export function getSnapCameraKitConfig() {
  const stagingToken = (
    process.env.EXPO_PUBLIC_SNAP_CAMERA_KIT_STAGING_API_TOKEN ||
    extraValue('EXPO_PUBLIC_SNAP_CAMERA_KIT_STAGING_API_TOKEN') ||
    ''
  ).trim()
  const productionToken = (
    process.env.EXPO_PUBLIC_SNAP_CAMERA_KIT_PRODUCTION_API_TOKEN ||
    extraValue('EXPO_PUBLIC_SNAP_CAMERA_KIT_PRODUCTION_API_TOKEN') ||
    ''
  ).trim()
  const forceStaging = truthyConfigValue(
    process.env.EXPO_PUBLIC_SNAP_CAMERA_KIT_FORCE_STAGING ||
    extraValue('EXPO_PUBLIC_SNAP_CAMERA_KIT_FORCE_STAGING')
  )
  const genericToken = (
    process.env.EXPO_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN ||
    extraValue('EXPO_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN') ||
    extraValue('SNAP_CAMERA_KIT_API_TOKEN') ||
    ''
  ).trim()
  const apiToken = (
    (forceStaging ? (stagingToken || genericToken) : (__DEV__ ? stagingToken : productionToken)) ||
    genericToken ||
    stagingToken ||
    productionToken ||
    ''
  ).trim()
  const lensGroupId = (
    process.env.EXPO_PUBLIC_SNAP_LENS_GROUP_ID ||
    extraValue('EXPO_PUBLIC_SNAP_LENS_GROUP_ID') ||
    extraValue('SNAP_LENS_GROUP_ID') ||
    DEFAULT_LENS_GROUP_ID
  ).trim()

  return {
    apiToken,
    lensGroupId,
    usingStagingToken: Boolean(forceStaging && stagingToken),
    enabled: Boolean(apiToken && lensGroupId),
  }
}

export function isSnapCameraKitConfigured() {
  return getSnapCameraKitConfig().enabled
}
