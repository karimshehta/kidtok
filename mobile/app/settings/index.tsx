import BannerAd from '@/components/BannerAd'
import { View, Text, Pressable, Alert, Linking, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { setLanguage } from '@/lib/i18n'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

function useSocialLinks() {
  return useQuery({
    queryKey: ['social-links'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['social_facebook', 'social_instagram', 'social_email'])
        .eq('is_public', true)
      const m: Record<string, string> = {}
      for (const row of data || []) m[row.key] = row.value || ''
      return m
    },
  })
}

export default function SettingsScreen() {
  const { t, i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const signOut = useAuth((s) => s.signOut)
  const { data: social = {} } = useSocialLinks()


  // The RPC returns a TABLE → an empty array [] when there's no subscription,
  // which is truthy in JS. We must check it has rows AND the plan is actually
  // paid + active before showing the "Active ✓" badge.

  const confirmLogout = () => {
    Alert.alert(ar ? 'تسجيل الخروج' : 'Logout', '', [
      { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel' },
      { text: ar ? 'خروج' : 'Logout', style: 'destructive', onPress: async () => { await signOut(); router.replace('/landing') } },
    ])
  }

  const confirmDeleteAccount = () => {
    Alert.alert(
      ar ? 'حذف الحساب' : 'Delete account',
      ar
        ? 'هل أنت متأكد من حذف حسابك نهائياً؟ سيتم حذف جميع بياناتك من قواعد بياناتنا (الأطفال، قوائم التشغيل، الفيديوهات، والمكافآت) ولن يمكن استرجاعها.'
        : 'Are you sure you want to permanently delete your account? All your data (children, playlists, videos, and rewards) will be removed from our databases and cannot be recovered.',
      [
        { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: ar ? 'حذف نهائي' : 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            try {
              // Direct fetch so we can read the actual JSON body on non-2xx.
              // supabase.functions.invoke wraps the response in a generic
              // "Edge Function returned a non-2xx status code" error and
              // doesn't always surface the detail field — useless for
              // debugging a destructive op like delete-account.
              const session = await supabase.auth.getSession()
              const token   = session.data.session?.access_token
              if (!token) throw new Error('not authenticated')

              const resp = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
                method:  'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'apikey':         SUPABASE_ANON_KEY,
                  'Content-Type':   'application/json',
                },
                body: JSON.stringify({}),
              })
              const body = await resp.json().catch(() => ({} as any))
              if (!resp.ok) {
                throw new Error(body.detail || body.error || `HTTP ${resp.status}`)
              }
              Toast.show({
                type:  'success',
                text1: ar ? 'تم حذف الحساب' : 'Account deleted',
              })
              await signOut()
              router.replace('/landing')
            } catch (err: any) {
              Toast.show({
                type:  'error',
                text1: ar ? 'فشل حذف الحساب' : 'Failed to delete account',
                text2: String(err?.message || err).slice(0, 140),
              })
            }
          },
        },
      ]
    )
  }

  const openLink = (url: string) => {
    if (!url) return
    const href = url.includes('@') && !url.startsWith('http') ? `mailto:${url}` : url
    Linking.openURL(href).catch(() => {})
  }

  const socialItems = [
    {
      key: 'social_facebook',
      label: 'Facebook',
      icon: 'logo-facebook' as const,
      color: '#1877F2',
      bg: '#EBF5FF',
      url: social.social_facebook || '',
    },
    {
      key: 'social_instagram',
      label: 'Instagram',
      icon: 'logo-instagram' as const,
      color: '#E1306C',
      bg: '#FFF0F5',
      url: social.social_instagram || '',
    },
    {
      key: 'social_email',
      label: ar ? 'تواصل مع الدعم' : 'Contact support',
      icon: 'headset-outline' as const,
      color: '#0EA5E9',
      bg: '#F0F9FF',
      url: social.social_email || '',
    },
  ].filter((s) => !!s.url)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          {ar ? 'الإعدادات' : 'Settings'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, gap: spacing.xs }}>
        <SettingRow icon="person-outline"   label={ar ? 'تعديل الحساب'  : 'Edit Profile'}   onPress={() => router.push('/profile/edit')} />
        <SettingRow icon="keypad-outline"   label={ar ? 'رمز وضع الطفل' : 'Child Mode PIN'} onPress={() => router.push('/profile/set-pin')} />
        <SettingRow icon="language-outline" label={ar ? 'اللغة'          : 'Language'}        value={ar ? 'العربية' : 'English'} onPress={async () => setLanguage(ar ? 'en' : 'ar')} />
        <SettingRow icon="log-out-outline"  label={ar ? 'تسجيل الخروج'  : 'Logout'}          onPress={confirmLogout} color={colors.secondary} />
        <SettingRow icon="trash-outline"    label={ar ? 'حذف الحساب'    : 'Delete account'}  onPress={confirmDeleteAccount} color="#DC2626" />

        {/* Contact Us section */}
        {socialItems.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={{ fontSize: fontSize.xs, fontWeight: '800', color: colors.grey500, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 1 }}>
              {ar ? 'تواصل معنا' : 'Contact Us'}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, justifyContent: 'center' }}>
              {socialItems.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => openLink(item.url)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    gap: spacing.xs,
                    opacity: pressed ? 0.7 : 1,
                    flex: 1,
                  })}
                >
                  <View style={{
                    width: 60, height: 60, borderRadius: 18,
                    backgroundColor: item.bg,
                    borderWidth: 1.5, borderColor: `${item.color}30`,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={item.icon} size={28} color={item.color} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.grey700 }}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
      
      <BannerAd variant="sticky" />
    </SafeAreaView>
  )
}

function SettingRow({ icon, label, value, onPress, color }: { icon: string; label: string; value?: string; onPress?: () => void; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        paddingVertical: spacing.md + 2, paddingHorizontal: spacing.md,
        backgroundColor: pressed ? colors.grey50 : colors.white,
        borderRadius: radius.lg, borderWidth: 1, borderColor: colors.grey100, marginBottom: 6,
      })}
    >
      <Ionicons name={icon as any} size={22} color={color || colors.grey700} />
      <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '600', color: color || colors.grey900 }}>{label}</Text>
      {value && <Text style={{ fontSize: fontSize.sm, color: color || colors.grey400 }}>{value}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.grey300} />}
    </Pressable>
  )
}
