import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { getAuthRedirectUrl } from '@/lib/links'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function ForgotPassword() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl('reset-password'),
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: spacing.lg, alignSelf: 'flex-start' }}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>

        {sent ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
            <View
              style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: `${colors.green}20`,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="mail" size={48} color={colors.green} />
            </View>
            <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900, textAlign: 'center' }}>
              تحقق من بريدك
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: spacing.sm, textAlign: 'center' }}>
              أرسلنا رابط إعادة تعيين كلمة المرور إلى {email}
            </Text>
            <Pressable
              onPress={() => router.replace('/auth/login')}
              style={{
                marginTop: spacing.xl,
                backgroundColor: colors.primary,
                paddingHorizontal: spacing.xl,
                paddingVertical: spacing.md,
                borderRadius: radius.pill,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: '800' }}>العودة للدخول</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: fontSize['3xl'], fontWeight: '900', color: colors.grey900, marginBottom: spacing.xs }}>
              نسيت كلمة المرور؟
            </Text>
            <Text style={{ fontSize: fontSize.base, color: colors.grey600, marginBottom: spacing.xl }}>
              أدخل بريدك وسنرسل لك رابط إعادة التعيين
            </Text>

            <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: colors.grey700, marginBottom: 6 }}>
              البريد الإلكتروني
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.grey50,
                borderRadius: radius.lg,
                paddingHorizontal: spacing.md,
                borderWidth: 1, borderColor: colors.grey100,
                marginBottom: spacing.lg,
              }}
            >
              <Ionicons name="mail" size={20} color={colors.grey400} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="example@email.com"
                placeholderTextColor={colors.grey400}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  flex: 1,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.sm,
                  fontSize: fontSize.base,
                  color: colors.grey900,
                }}
              />
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={loading || !email.trim()}
              style={{
                backgroundColor: !email.trim() ? colors.grey200 : colors.primary,
                paddingVertical: spacing.md + 2,
                borderRadius: radius.pill,
                alignItems: 'center',
              }}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800' }}>
                  إرسال رابط الإعادة
                </Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
