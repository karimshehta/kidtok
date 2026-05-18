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
  const params = useLocalSearchParams<{
    access_token?: string; refresh_token?: string
    code?: string; error?: string; error_description?: string
  }>()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        // ── 1. Check if session already exists (set by useGoogleSignIn hook) ──
        // This happens when WebBrowser OAuth completes and the hook already
        // exchanged the code — the deep link also triggers this screen but
        // the work is already done.
        const { data: existing } = await supabase.auth.getSession()
        if (existing?.session) {
          // Already signed in — skip everything and go to feed
          setStatus('success')
          setTimeout(() => router.replace('/(tabs)/feed'), 500)
          return
        }

        // ── 2. Handle OAuth errors ─────────────────────────────────────────
        if (params.error) {
          setStatus('error')
          setMessage(
            params.error === 'access_denied'
              ? 'تم إلغاء تسجيل الدخول'
              : String(params.error_description || params.error)
          )
          return
        }

        // ── 3. PKCE code (Google OAuth / email magic link) ─────────────────
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(String(params.code))
          if (error) {
            // Code already used by the hook — check session again
            if (error.message?.includes('code') || error.message?.includes('expired')) {
              const { data: retry } = await supabase.auth.getSession()
              if (retry?.session) {
                setStatus('success')
                setTimeout(() => router.replace('/(tabs)/feed'), 500)
                return
              }
            }
            throw error
          }
          setStatus('success')
          setTimeout(() => router.replace('/(tabs)/feed'), 800)
          return
        }

        // ── 4. Implicit tokens (email confirmation) ────────────────────────
        if (params.access_token && params.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: String(params.access_token),
            refresh_token: String(params.refresh_token),
          })
          if (error) throw error
          setStatus('success')
          setTimeout(() => router.replace('/(tabs)/feed'), 800)
          return
        }

        // ── 5. Nothing to process — wait for auth state change ─────────────
        // This can happen when the hook handled everything — subscribe briefly
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            subscription.unsubscribe()
            setStatus('success')
            setTimeout(() => router.replace('/(tabs)/feed'), 500)
          }
        })

        // Timeout fallback
        setTimeout(() => {
          subscription.unsubscribe()
          supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
              router.replace('/(tabs)/feed')
            } else {
              setStatus('error')
              setMessage('انتهت صلاحية الرابط')
            }
          })
        }, 4000)

      } catch (err: any) {
        setStatus('error')
        setMessage(err.message || 'حدث خطأ غير متوقع')
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
            <View style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
            }}>
              <Ionicons name="checkmark" size={56} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900' }}>
              تم بنجاح ✓
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.base, marginTop: 4 }}>
              جارٍ تحويلك للتطبيق...
            </Text>
          </>
        )}

        {status === 'error' && (
          <>
            <View style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
            }}>
              <Ionicons name="alert" size={56} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900' }}>
              فشل التسجيل
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, marginTop: 4, textAlign: 'center' }}>
              {message}
            </Text>
            <Pressable
              onPress={() => router.replace('/auth/login')}
              style={{
                marginTop: spacing.xl, backgroundColor: colors.white,
                paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
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
