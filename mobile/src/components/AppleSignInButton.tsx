import { View } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { useAppleSignIn } from '@/hooks/useAppleSignIn'
import { spacing, radius } from '@/lib/theme'

interface Props {
  onSuccess?: () => void
  mode?: 'login' | 'signup'
}

/**
 * Apple Sign In button.
 *
 * Uses Apple's official AppleAuthenticationButton component — Apple
 * requires this exact button style + sizing for App Review approval.
 * Don't replace with a custom Pressable + icon: HIG section 4.8 says
 * the button must be Apple's own.
 *
 * Hidden entirely on non-iOS (returns null). The login screen also
 * gates this with a Platform.OS === 'ios' check as a belt-and-braces.
 */
export default function AppleSignInButton({ onSuccess, mode = 'login' }: Props) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { signIn, loading, isAvailable } = useAppleSignIn()

  if (!isAvailable) return null

  const handlePress = async () => {
    if (loading) return
    const result = await signIn()
    if (result === 'success') {
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'أهلًا برجوعك يا بطل! 🌟' : 'Welcome back, hero! 🌟',
        text2: ar ? 'تم تسجيل الدخول بآبل.' : 'Signed in with Apple.',
        props: { icon: '🌟', accent: 'blue' },
      })
      onSuccess?.()
    } else if (result === 'error') {
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'الدخول بآبل ماكملش' : 'Apple sign-in failed',
        text2: ar ? 'جرّب مرة ثانية بعد لحظات.' : 'Please try again in a moment.',
        props: { icon: '🔐', accent: 'purple' },
      })
    }
    // 'cancelled' → user dismissed the native sheet, no toast
  }

  // Force black-on-white button — matches the pill-shaped Google button
  // visually and keeps the design uniform regardless of system theme.
  return (
    <View style={{ width: '100%' }}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          mode === 'signup'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radius.pill}
        style={{ width: '100%', height: 50 }}
        onPress={handlePress}
      />
    </View>
  )
}
