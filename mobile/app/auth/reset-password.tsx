import { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import KeyboardScreen from '@/components/KeyboardScreen'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function ResetPassword() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const params = useLocalSearchParams<{ access_token?: string; refresh_token?: string }>()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: String(params.access_token),
            refresh_token: String(params.refresh_token),
          })
          if (error) throw error
        }
        setSessionReady(true)
      } catch (err) {
        Toast.show({ type: 'error', text1: (err as Error).message })
        router.replace('/auth/forgot-password')
      }
    })()
  }, [])

  const handleSubmit = async () => {
    if (password.length < 6) {
      Toast.show({ type: 'error', text1: ar ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters' })
      return
    }
    if (password !== confirm) {
      Toast.show({ type: 'error', text1: ar ? 'كلمات المرور غير متطابقة' : 'Passwords do not match' })
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      Toast.show({ type: 'success', text1: ar ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully' })
      router.replace('/(tabs)/feed')
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  if (!sessionReady) {
    return (
      <KeyboardScreen variant="form" backgroundColor={colors.white} contentStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </KeyboardScreen>
    )
  }

  return (
    <KeyboardScreen variant="form" style={{ flex: 1, backgroundColor: colors.white  }}>
      
        <Pressable onPress={() => router.replace('/auth/login')} style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>

        <Text style={{ fontSize: fontSize['3xl'], fontWeight: '900', color: colors.grey900, marginBottom: spacing.xs }}>
          {ar ? 'كلمة مرور جديدة' : 'New password'}
        </Text>
        <Text style={{ fontSize: fontSize.base, color: colors.grey600, marginBottom: spacing.xl }}>
          {ar ? 'أدخل كلمة المرور الجديدة لحسابك' : 'Enter the new password for your account'}
        </Text>

        {/* Password */}
        <Field
          label={ar ? 'كلمة المرور الجديدة' : 'New password'}
          value={password}
          onChangeText={setPassword}
          secure={!showPw}
          icon="lock-closed"
          right={
            <Pressable onPress={() => setShowPw((v) => !v)}>
              <Ionicons name={showPw ? 'eye-off' : 'eye'} size={22} color={colors.grey600} />
            </Pressable>
          }
        />

        {/* Confirm */}
        <Field
          label={ar ? 'تأكيد كلمة المرور' : 'Confirm password'}
          value={confirm}
          onChangeText={setConfirm}
          secure={!showPw}
          icon="lock-closed"
        />

        <Pressable
          onPress={handleSubmit}
          disabled={loading || !password || !confirm}
          style={{
            backgroundColor: !password || !confirm ? colors.grey200 : colors.primary,
            paddingVertical: spacing.md + 2,
            borderRadius: radius.pill,
            alignItems: 'center',
            marginTop: spacing.md,
          }}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800' }}>
              {ar ? 'تغيير كلمة المرور' : 'Change password'}
            </Text>
          )}
        </Pressable>
      
    </KeyboardScreen>
  )
}

function Field({ label, value, onChangeText, secure, icon, right }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.grey700, marginBottom: 6 }}>
        {label}
      </Text>
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
          secureTextEntry={secure}
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
        {right}
      </View>
    </View>
  )
}
