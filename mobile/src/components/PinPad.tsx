/**
 * PinPad — reusable 4-digit PIN entry component
 * Used in:
 *   - PIN setup (set for the first time)
 *   - Child mode exit (verify)
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Props {
  title: string
  subtitle?: string
  onComplete: (pin: string) => void
  onBiometric?: () => void       // show if available
  error?: string | null
  loading?: boolean
}

const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function PinPad({ title, subtitle, onComplete, onBiometric, error, loading }: Props) {
  const [pin, setPin] = useState('')
  const shakeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (error) {
      // Shake animation on error
      setPin('')
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,  duration: 60, useNativeDriver: true }),
      ]).start()
    }
  }, [error])

  const pressDigit = (d: string) => {
    if (loading) return
    if (d === '⌫') {
      setPin(p => p.slice(0, -1))
      return
    }
    if (d === '' || pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      setTimeout(() => onComplete(next), 100)
    }
  }

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
      {/* Title */}
      <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900, marginBottom: 6 }}>
        {title}
      </Text>
      {subtitle && (
        <Text style={{ fontSize: fontSize.sm, color: colors.grey500, marginBottom: spacing.xl, textAlign: 'center' }}>
          {subtitle}
        </Text>
      )}

      {/* PIN dots */}
      <Animated.View style={{ flexDirection: 'row', gap: 16, marginBottom: spacing.xl, transform: [{ translateX: shakeAnim }] }}>
        {[0,1,2,3].map(i => (
          <View
            key={i}
            style={{
              width: 18, height: 18, borderRadius: 9,
              backgroundColor: i < pin.length ? colors.primary : 'transparent',
              borderWidth: 2,
              borderColor: error ? colors.secondary : i < pin.length ? colors.primary : colors.grey300,
              transform: [{ scale: i < pin.length ? 1.1 : 1 }],
            }}
          />
        ))}
      </Animated.View>

      {/* Error */}
      {error && (
        <Text style={{ fontSize: fontSize.sm, color: colors.secondary, marginBottom: spacing.md, fontWeight: '700' }}>
          {error}
        </Text>
      )}

      {/* Keypad */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12, justifyContent: 'center' }}>
        {DIGITS.map((d, i) => (
          <Pressable
            key={i}
            onPress={() => pressDigit(d)}
            disabled={!d && d !== '0'}
            style={({ pressed }) => ({
              width: 68, height: 68, borderRadius: 34,
              backgroundColor: d === '' ? 'transparent' : pressed ? colors.grey200 : colors.grey100,
              alignItems: 'center', justifyContent: 'center',
            })}
          >
            {d === '⌫' ? (
              <Ionicons name="backspace-outline" size={26} color={colors.grey700} />
            ) : d !== '' ? (
              <Text style={{ fontSize: 26, fontWeight: '600', color: colors.grey900 }}>{d}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* Biometric option */}
      {onBiometric && (
        <Pressable
          onPress={onBiometric}
          style={({ pressed }) => ({
            marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="finger-print" size={28} color={colors.primary} />
          <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' }}>
            استخدم بصمة الإصبع
          </Text>
        </Pressable>
      )}
    </View>
  )
}
