import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/lib/theme'

type Size = 'sm' | 'md' | 'lg'

const CONFIG = {
  sm: { outer: 14, icon: 8,  star: 5,  text: false },
  md: { outer: 18, icon: 11, star: 6,  text: false },
  lg: { outer: 22, icon: 14, star: 7,  text: true  },
} as const

export default function VerifiedBadge({ size = 'md' }: { size?: Size }) {
  const c = CONFIG[size]
  return (
    <View
      style={{
        width: c.outer,
        height: c.outer,
        borderRadius: c.outer / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        // Multi-layer glow effect
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.5,
        shadowRadius: 3,
        elevation: 3,
      }}
    >
      <Ionicons name="checkmark" size={c.icon} color="#fff" style={{ fontWeight: '900' }} />
    </View>
  )
}

/** Official KidTok badge — شارة المنصة الرسمية */
export function KidTokBadge({ size = 'md' }: { size?: Size }) {
  const c = CONFIG[size]
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: `${colors.primary}18`,
        paddingHorizontal: size === 'lg' ? 8 : 5,
        paddingVertical: size === 'lg' ? 3 : 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: `${colors.primary}40`,
      }}
    >
      {/* Hexagon-style badge */}
      <View
        style={{
          width: c.outer,
          height: c.outer,
          borderRadius: 4,  // square-ish, not round — more unique
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '45deg' }],
        }}
      >
        <Ionicons
          name="star"
          size={c.star}
          color="#fff"
          style={{ transform: [{ rotate: '-45deg' }] }}
        />
      </View>
      {size === 'lg' && (
        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
          KidTok
        </Text>
      )}
    </View>
  )
}
