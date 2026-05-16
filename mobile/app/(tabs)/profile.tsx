import { View, Text, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { setLanguage } from '@/lib/i18n'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  const { data: coinBalance = 0 } = useQuery({
    queryKey: ['coins', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const { data } = await supabase.rpc('my_coin_balance')
      return (data as number) ?? 0
    },
  })

  const { data: mySub } = useQuery({
    queryKey: ['my-subscription', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc('my_active_subscription')
      return data
    },
  })

  const toggleLang = async () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar'
    await setLanguage(newLang)
  }

  const confirmLogout = () => {
    Alert.alert(
      t('profile.logout'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.logout'),
          style: 'destructive',
          onPress: async () => {
            await signOut()
            router.replace('/landing')
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <View
            style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: spacing.md,
            }}
          >
            <Ionicons name="person" size={56} color={colors.white} />
          </View>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
            {user?.user_metadata?.name || user?.user_metadata?.full_name || 'User'}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>{user?.email}</Text>
        </View>

        {/* Subscription card */}
        <View
          style={{
            backgroundColor: mySub ? colors.primary : colors.grey50,
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
          }}
        >
          <Ionicons name="diamond" size={28} color={mySub ? colors.white : colors.grey400} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.sm, color: mySub ? 'rgba(255,255,255,0.85)' : colors.grey600 }}>
              {t('profile.subscription')}
            </Text>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: mySub ? colors.white : colors.grey900 }}>
              {mySub ? t('profile.active') : t('profile.free')}
            </Text>
          </View>
        </View>

        {/* Coin balance */}
        <View
          style={{
            backgroundColor: '#FEF3C7',
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            borderWidth: 1,
            borderColor: '#FCD34D',
          }}
        >
          <View
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: colors.amber400,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 20 }}>🪙</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.sm, color: '#92400E' }}>{t('coins.myCoins')}</Text>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: '#78350F' }}>
              {coinBalance.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Menu items */}
        <View style={{ gap: spacing.xs }}>
          <MenuItem
            icon="diamond-outline"
            label={t('profile.subscription')}
            value={mySub ? t('profile.active') : t('profile.free')}
            onPress={() => router.push(mySub ? '/subscription/manage' : '/subscription')}
          />
          <MenuItem icon="person-outline" label={t('profile.editProfile')} onPress={() => router.push('/profile/edit')} />
          <MenuItem
            icon="language-outline"
            label={t('profile.language')}
            value={i18n.language === 'ar' ? 'العربية' : 'English'}
            onPress={toggleLang}
          />
          <MenuItem icon="log-out-outline" label={t('profile.logout')} onPress={confirmLogout} danger />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function MenuItem({
  icon, label, value, onPress, danger,
}: {
  icon: any; label: string; value?: string; onPress: () => void; danger?: boolean
}) {
  const color = danger ? colors.red : colors.grey900
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        backgroundColor: pressed ? colors.grey50 : colors.white,
        borderRadius: radius.md,
        gap: spacing.md,
      })}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '600', color }}>{label}</Text>
      {value && <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>{value}</Text>}
      <Ionicons name="chevron-forward" size={20} color={colors.grey400} />
    </Pressable>
  )
}
