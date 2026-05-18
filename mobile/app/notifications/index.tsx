import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

type NotifItem = {
  id: string
  title_ar: string; title_en: string
  body_ar: string;  body_en: string
  created_at: string
  deep_link: string | null
}

export default function NotificationsScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery<NotifItem[]>({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_history')
        .select('id, title_ar, title_en, body_ar, body_en, created_at, deep_link')
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(50)
      return data || []
    },
  })

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diff < 60) return ar ? 'الآن' : 'now'
    if (diff < 3600) return ar ? `${Math.floor(diff/60)} د` : `${Math.floor(diff/60)}m`
    if (diff < 86400) return ar ? `${Math.floor(diff/3600)} س` : `${Math.floor(diff/3600)}h`
    return ar ? `${Math.floor(diff/86400)} ي` : `${Math.floor(diff/86400)}d`
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          {ar ? 'الإشعارات' : 'Notifications'}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : notifications.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-off-outline" size={64} color={colors.grey200} />
          <Text style={{ color: colors.grey400, marginTop: spacing.md, fontWeight: '600' }}>
            {ar ? 'لا توجد إشعارات' : 'No notifications yet'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                if (item.deep_link) router.push(item.deep_link as any)
              }}
              style={({ pressed }) => ({
                flexDirection: 'row', gap: spacing.md, padding: spacing.lg,
                borderBottomWidth: 1, borderBottomColor: colors.grey50,
                backgroundColor: pressed ? colors.grey50 : colors.white,
              })}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name="notifications" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', fontSize: fontSize.base, color: colors.grey900 }}>
                  {ar ? item.title_ar : (item.title_en || item.title_ar)}
                </Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: 3 }} numberOfLines={2}>
                  {ar ? item.body_ar : (item.body_en || item.body_ar)}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.grey400, flexShrink: 0 }}>
                {formatTime(item.created_at)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}
