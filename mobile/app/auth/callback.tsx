import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, Pressable } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function AuthCallback() {
  const router = useRouter()
  const params = useLocalSearchParams<{ access_token?: string; refresh_token?: string; code?: string; error?: string; error_description?: string }>()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        if (params.error) {
          setStatus('error')
          setMessage(String(params.error))
          return
        }

        // Supabase puts tokens in URL params for the magic-link/confirmation flow.
        // expo-router exposes them via useLocalSearchParams.
        // ── PKCE code exchange (Google OAuth + email magic link) ─────
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(String(params.code))
          if (error) throw error
          setStatus('success')
          setTimeout(() => router.replace('/(tabs)/feed'), 1200)
          return
        }

        // ── Implicit tokens (email confirmation) ───────────────────────
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: String(params.access_token),
            refresh_token: String(params.refresh_token),
          })
          if (error) throw error
          setStatus('success')
          setTimeout(() => router.replace('/(tabs)/feed'), 1200)
          return
        }

        setStatus('error')
        setMessage(params.error_description || params.error || 'الرابط منتهي أو غير صالح')
      } catch (err) {
        setStatus('error')
        setMessage((err as Error).message)
      }
    })()
  }, [])

  return (
    <LinearGradient colors={[colors.primary, '#0891b2']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.md }}>
              جارٍ تأكيد الحساب...
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View
              style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: spacing.lg,
              }}
            >
              <Ionicons name="checkmark" size={56} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900' }}>
              تم تأكيد حسابك ✓
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.base, marginTop: 4 }}>
              جارٍ تحويلك للتطبيق...
            </Text>
          </>
        )}

        {status === 'error' && (
          <>
            <View
              style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: spacing.lg,
              }}
            >
              <Ionicons name="alert" size={56} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900' }}>
              فشل التأكيد
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, marginTop: 4, textAlign: 'center' }}>
              {message}
            </Text>
            <Pressable
              onPress={() => router.replace('/auth/login')}
              style={{
                marginTop: spacing.xl,
                backgroundColor: colors.white,
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.md,
                borderRadius: radius.pill,
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: '800' }}>تسجيل الدخول</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </LinearGradient>
  )
}
