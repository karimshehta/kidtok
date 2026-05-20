import BannerAd from '@/components/BannerAd'
import { View, Text, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { setLanguage } from '@/lib/i18n'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function SettingsScreen() {
  const { t, i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const signOut = useAuth((s) => s.signOut)
  const user = useAuth((s) => s.user)

  const { data: mySub } = useQuery({
    queryKey: ['my-subscription', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc('my_active_subscription')
      return data
    },
  })

  const confirmLogout = () => {
    Alert.alert(ar ? 'تسجيل الخروج' : 'Logout', '', [
      { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel' },
      { text: ar ? 'خروج' : 'Logout', style: 'destructive', onPress: async () => { await signOut(); router.replace('/landing') } },
    ])
  }

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

      <View style={{ padding: spacing.lg, gap: spacing.xs }}>
        <SettingRow icon="person-outline"   label={ar ? 'تعديل الحساب'  : 'Edit Profile'}   onPress={() => router.push('/profile/edit')} />
        <SettingRow icon="keypad-outline"   label={ar ? 'رمز وضع الطفل' : 'Child Mode PIN'} onPress={() => router.push('/profile/set-pin')} />
        <SettingRow icon="language-outline" label={ar ? 'اللغة'          : 'Language'}        value={ar ? 'العربية' : 'English'} onPress={async () => setLanguage(ar ? 'en' : 'ar')} />
        <SettingRow icon="diamond-outline"  label={ar ? 'الاشتراك'       : 'Subscription'}    value={mySub ? (ar ? 'نشط ✓' : 'Active ✓') : (ar ? 'ترقية' : 'Upgrade')} color={mySub ? colors.primary : colors.secondary} onPress={() => router.push('/subscription')} />
        <SettingRow icon="log-out-outline"  label={ar ? 'تسجيل الخروج'  : 'Logout'}          onPress={confirmLogout} color={colors.secondary} />
      </View>
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
