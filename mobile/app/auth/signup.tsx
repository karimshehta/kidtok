import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, Image } from 'react-native'
import KeyboardScreen from '@/components/KeyboardScreen'
import { Link, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { colors, spacing, radius, fontSize } from '@/lib/theme'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import AppleSignInButton from '@/components/AppleSignInButton'
import { useAuth } from '@/stores/auth'
import { getAuthRedirectUrl } from '@/lib/links'

export default function Signup() {
  const { t, i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const signUp = useAuth((s) => s.signUp)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!name || !email || !password) return
    setLoading(true)
    try {
      await signUp(email.trim(), password, name.trim(), getAuthRedirectUrl('callback'))
      Toast.show({ type: 'success', text1: t('auth.signupSuccess') })
      router.replace('/(tabs)/feed')
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardScreen variant="form" backgroundColor={colors.white} contentStyle={{ padding: 24 }}>
      
        <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>

        <Text style={{ fontSize: fontSize['3xl'], fontWeight: '900', color: colors.grey900, marginBottom: spacing.xs }}>
          {t('auth.signup')}
        </Text>
        <Text style={{ fontSize: fontSize.base, color: colors.grey600, marginBottom: spacing.xl }}>
          {t('landing.subtitle')}
        </Text>

        <Field label={t('auth.name')} value={name} onChangeText={setName} placeholder="" icon="person" />
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          icon="mail"
        />
        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          secureTextEntry={!showPw}
          icon="lock-closed"
          rightAction={
            <Pressable onPress={() => setShowPw((v) => !v)}>
              <Ionicons name={showPw ? 'eye-off' : 'eye'} size={22} color={colors.grey600} />
            </Pressable>
          }
        />

        <Pressable
          onPress={handleSubmit}
          disabled={loading || !name || !email || !password}
          style={({ pressed }) => ({
            backgroundColor: !name || !email || !password ? colors.grey200 : colors.primary,
            paddingVertical: spacing.md + 2,
            borderRadius: radius.pill,
            alignItems: 'center',
            opacity: pressed ? 0.9 : 1,
            marginTop: spacing.md,
          })}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800' }}>
              {t('auth.signupCta')}
            </Text>
          )}
        </Pressable>

        {/* Divider */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, gap: spacing.sm }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.grey100 }} />
          <Text style={{ color: colors.grey400, fontSize: fontSize.xs, fontWeight: '600' }}>{ar ? 'أو' : 'or'}</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.grey100 }} />
        </View>

        <GoogleSignInButton mode="signup" onSuccess={() => router.replace('/(tabs)/feed')} />

        <View style={{ height: spacing.sm }} />
        <AppleSignInButton mode="signup" onSuccess={() => router.replace('/(tabs)/feed')} />

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.xs }}>
          <Text style={{ color: colors.grey600 }}>{t('auth.haveAccount')}</Text>
          <Link href="/auth/login">
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.login')}</Text>
          </Link>
        </View>
          </KeyboardScreen>
  )
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, secureTextEntry, icon, rightAction,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; secureTextEntry?: boolean;
  icon: any; rightAction?: React.ReactNode
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.grey700, marginBottom: 6 }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.grey50,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          borderWidth: 1,
          borderColor: colors.grey100,
        }}
      >
        <Ionicons name={icon} size={20} color={colors.grey400} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.grey400}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.sm,
            fontSize: fontSize.base,
            color: colors.grey900,
          }}
        />
        {rightAction}
      </View>
    </View>
  )
}
