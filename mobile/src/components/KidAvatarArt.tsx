import { useEffect, useMemo, useRef } from 'react'
import { Animated, StyleProp, View, ViewStyle } from 'react-native'

import KidFaceFilterArt from '@/components/KidFaceFilterArt'
import { getKidAvatar } from '@/lib/kidAvatars'

interface Props {
  avatarId: string
  size?: number
  active?: boolean
  style?: StyleProp<ViewStyle>
  imageStyle?: StyleProp<ViewStyle>
}

export default function KidAvatarArt({ avatarId, size = 96, active = false, style, imageStyle }: Props) {
  const avatar = getKidAvatar(avatarId)
  const motion = useRef(new Animated.Value(0)).current

  useEffect(() => {
    motion.stopAnimation()
    if (!active) {
      motion.setValue(0)
      return
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(motion, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [active, motion])

  const transform = useMemo(() => {
    if (!avatar) return []
    if (avatar.animation === 'pulse') {
      return [{ scale: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }]
    }
    if (avatar.animation === 'float') {
      return [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [2, -7] }) }]
    }
    if (avatar.animation === 'wiggle') {
      // The elephant's curved trunk and the animal heads visibly sway here.
      return [{ rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] }) }]
    }
    return [
      { translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [1, -4] }) },
      { scale: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) },
    ]
  }, [avatar, motion])

  if (!avatar) return null

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View
        style={[
          { width: size, height: size, transform },
          imageStyle,
        ]}
      >
        <KidFaceFilterArt avatarId={avatar.id} size={size} />
      </Animated.View>
    </View>
  )
}
