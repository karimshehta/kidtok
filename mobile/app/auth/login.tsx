import { useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { colors, spacing, radius, fontSize } from '@/lib/theme'
import { useAuth } from '@/stores/auth'

export default function Login() {
  const { t } = useTranslation()
  const router = useRouter()
  const signIn = useAuth((s) => s.signIn)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!email || !password) return
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      Toast.show({ type: 'success', text1: t('auth.loginSuccess') })
      router.replace('/(tabs)/feed')
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message || t('auth.invalidCredentials') })
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>

        <Text style={{ fontSize: fontSize['3xl'], fontWeight: '900', color: colors.grey900, marginBottom: spacing.xs }}>
          {t('auth.login')}
        </Text>
        <Text style={{ fontSize: fontSize.base, color: colors.grey600, marginBottom: spacing.xl }}>
          {t('landing.subtitle')}
        </Text>

        {/* Email */}
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          icon="mail"
        />

        {/* Password */}
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

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={loading || !email || !password}
          style={({ pressed }) => ({
            backgroundColor: !email || !password ? colors.grey200 : colors.primary,
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
              {t('auth.loginCta')}
            </Text>
          )}
        </Pressable>

        {/* Forgot password */}
        <Link href="/auth/forgot-password" asChild>
          <Pressable style={{ marginTop: spacing.md, alignItems: 'center' }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('auth.forgotPassword')}</Text>
          </Pressable>
        </Link>

        {/* Bottom link */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, gap: spacing.xs }}>
          <Text style={{ color: colors.grey600 }}>{t('auth.noAccount')}</Text>
          <Link href="/auth/signup">
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('auth.signup')}</Text>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
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
