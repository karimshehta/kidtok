import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { useGoogleSignIn } from '@/hooks/useGoogleSignIn'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

interface Props {
  onSuccess?: () => void
  mode?: 'login' | 'signup'
}

export default function GoogleSignInButton({ onSuccess, mode = 'login' }: Props) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { signIn, loading } = useGoogleSignIn()

  const handlePress = async () => {
    const result = await signIn()
    if (result === 'success') {
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'أهلًا برجوعك يا بطل! 🌟' : 'Welcome back, hero! 🌟',
        text2: ar ? 'تم تسجيل الدخول بجوجل.' : 'Signed in with Google.',
        props: { icon: '🌟', accent: 'blue' },
      })
      onSuccess?.()
    } else if (result === 'error') {
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'الدخول بجوجل ماكملش' : 'Google sign-in failed',
        text2: ar ? 'جرّب مرة ثانية بعد لحظات.' : 'Please try again in a moment.',
        props: { icon: '🔐', accent: 'purple' },
      })
    }
    // 'cancelled' → do nothing (user closed the browser)
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.white,
        borderWidth: 1.5,
        borderColor: colors.grey200,
        borderRadius: radius.pill,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        opacity: pressed || loading ? 0.7 : 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.grey600} />
      ) : (
        <GoogleSvgIcon />
      )}
      <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>
        {loading
          ? (ar ? 'جارٍ التحويل...' : 'Redirecting...')
          : mode === 'signup'
          ? (ar ? 'التسجيل بـ Google' : 'Sign up with Google')
          : (ar ? 'الدخول بـ Google' : 'Sign in with Google')}
      </Text>
    </Pressable>
  )
}

/** Google G icon in its brand colors */
function GoogleSvgIcon() {
  const { Svg, Path } = require('react-native-svg')
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0124 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </Svg>
  )
}
