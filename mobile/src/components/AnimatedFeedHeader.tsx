import { View, Text, Pressable, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, fontSize } from '@/lib/theme'
import { useTranslation } from 'react-i18next'

type Props = {
  scrollY: Animated.Value
}

const HEADER_HEIGHT = 56

export default function AnimatedFeedHeader({ scrollY }: Props) {
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'

  // Hide header when scrolling down
  const translateY = scrollY.interpolate({
    inputRange: [0, HEADER_HEIGHT],
    outputRange: [0, -HEADER_HEIGHT],
    extrapolate: 'clamp',
  })

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_HEIGHT,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.grey200,
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        zIndex: 100,
        transform: [{ translateY }],
      }}
    >
      {/* Logo + Title */}
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: spacing.sm }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 20, color: colors.white, fontWeight: '800' }}>K</Text>
        </View>
        <Text
          style={{
            fontSize: fontSize.xl,
            fontWeight: '800',
            color: colors.grey900,
            fontFamily: 'Cairo',
          }}
        >
          KidTok
        </Text>
      </View>

      {/* Right icons */}
      <View
        style={{
          marginLeft: 'auto',
          marginRight: isRTL ? 'auto' : 0,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          gap: spacing.md,
        }}
      >
        {/* Notifications */}
        <Pressable
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: pressed ? colors.grey100 : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.grey700} />
        </Pressable>
      </View>
    </Animated.View>
  )
}

export { HEADER_HEIGHT }
