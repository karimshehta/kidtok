const { withGradleProperties } = require('@expo/config-plugins')

const NDK_VERSION_16KB = '28.2.13676358'

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find(
    (item) => item.type === 'property' && item.key === key,
  )

  if (existing) {
    existing.value = value
    return
  }

  properties.push({
    type: 'property',
    key,
    value,
  })
}

function withAndroid16KbSupport(config) {
  return withGradleProperties(config, (modConfig) => {
    upsertGradleProperty(modConfig.modResults, 'ndkVersion', NDK_VERSION_16KB)
    upsertGradleProperty(modConfig.modResults, 'android.support16kPages', 'true')

    return modConfig
  })
}

module.exports = withAndroid16KbSupport
