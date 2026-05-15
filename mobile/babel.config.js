module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // expo-router needs reanimated/plugin to be last
      'react-native-reanimated/plugin',
    ],
  }
}
