import { useRef } from 'react'
import { Animated, Pressable, PressableProps } from 'react-native'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable) as any

type Props = PressableProps & {
  hoverScale?: number
  pressedScale?: number
}

export default function MotionPressable({
  hoverScale = 1.015,
  pressedScale = 0.975,
  onHoverIn,
  onHoverOut,
  onPressIn,
  onPressOut,
  style,
  ...props
}: Props) {
  const scale = useRef(new Animated.Value(1)).current

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      speed: 34,
      bounciness: 4,
      useNativeDriver: true,
    }).start()
  }

  return (
    <AnimatedPressable
      {...props}
      onHoverIn={(event: any) => {
        animateTo(hoverScale)
        onHoverIn?.(event)
      }}
      onHoverOut={(event: any) => {
        animateTo(1)
        onHoverOut?.(event)
      }}
      onPressIn={(event: any) => {
        animateTo(pressedScale)
        onPressIn?.(event)
      }}
      onPressOut={(event: any) => {
        animateTo(1)
        onPressOut?.(event)
      }}
      style={(state: any) => [
        typeof style === 'function' ? style(state) : style,
        { transform: [{ scale }] },
      ]}
    />
  )
}
