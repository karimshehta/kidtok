import { Image, StyleProp, View, ViewStyle } from 'react-native'

const logo = require('../../assets/images/logo.png')

type Props = {
  opacity?: number
  placement?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  size?: number
  style?: StyleProp<ViewStyle>
}

export default function BrandWatermark({
  opacity = 0.045,
  placement = 'bottom-right',
  size = 260,
  style,
}: Props) {
  const top = placement.startsWith('top') ? -size * 0.18 : undefined
  const bottom = placement.startsWith('bottom') ? -size * 0.16 : undefined
  const left = placement.endsWith('left') ? -size * 0.24 : undefined
  const right = placement.endsWith('right') ? -size * 0.24 : undefined

  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          top,
          bottom,
          left,
          right,
          opacity,
          transform: [{ rotate: '-8deg' }],
        },
        style,
      ]}
    >
      <Image
        source={logo}
        accessible={false}
        resizeMode="contain"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  )
}
