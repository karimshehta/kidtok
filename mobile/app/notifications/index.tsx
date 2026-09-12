import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize } from '@/lib/theme'
import { getNotificationTargetPath } from '@/lib/notificationNavigation'

type NotifItem = {
  id: string
  type: string
  title_ar: string
  title_en: string | null
  body_ar:  string
  body_en:  string | null
  image_url: string | null
  deep_link: string | null
  data: any
  is_read: boolean
  created_at: string
}

export default function NotificationsScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  // Read from the per-user inbox (RLS limits rows to auth.uid())
  const { data: notifications = [], isLoading } = useQuery<NotifItem[]>({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title_ar, title_en, body_ar, body_en, image_url, deep_link, data, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data as NotifItem[]) || []
    },
  })

  // Mark every unread row as read the instant the inbox is opened. This is
  // the behaviour the user expects from a modern inbox — opening *is* the
  // ack, not tapping each row individually.
  useEffect(() => {
    if (!userId) return
    // Optimistic flip: clear the bell badge and local highlights immediately
    qc.setQueryData(['notifications', userId], (old: any) => {
      if (!Array.isArray(old)) return old
      return old.map((x: any) => x.is_read ? x : { ...x, is_read: true })
    })
    qc.setQueryData(['unread-count', userId], 0)
    // Server sync — wrapped in an async IIFE because supabase.rpc returns a
    // PostgrestBuilder (thenable) not a real Promise, so .catch() is undefined.
    ;(async () => {
      try { await supabase.rpc('mark_all_notifications_read') }
      catch { /* if it fails, the next refetch will re-establish truth */ }
    })()
  }, [userId, qc])

  const handleTap = async (n: NotifItem) => {
    // Optimistic update — flip the row to read in the cache BEFORE waiting for
    // the RPC. The unread highlight disappears the moment the user taps.
    if (!n.is_read) {
      qc.setQueryData(['notifications', userId], (old: any) => {
        if (!Array.isArray(old)) return old
        return old.map((x: any) => x.id === n.id ? { ...x, is_read: true } : x)
      })
      qc.setQueryData(['unread-count', userId], (old: any) => Math.max(0, Number(old || 0) - 1))
    }
    try {
      await supabase.rpc('mark_notification_read', { p_notification_id: n.id })
    } catch {
      // If the RPC fails, roll back via a fresh fetch
      qc.invalidateQueries({ queryKey: ['notifications', userId] })
      qc.invalidateQueries({ queryKey: ['unread-count', userId] })
    }
    try { router.push(getNotificationTargetPath(n) as any) } catch {}
  }

  const iconFor = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'comment':   return 'chatbubble-ellipses'
      case 'like':      return 'heart'
      case 'follow':    return 'person-add'
      case 'gift':      return 'gift'
      case 'broadcast': return 'megaphone'
      default:          return 'notifications'
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diff < 60)    return ar ? 'الآن'                       : 'now'
    if (diff < 3600)  return ar ? `${Math.floor(diff/60)} د`   : `${Math.floor(diff/60)}m`
    if (diff < 86400) return ar ? `${Math.floor(diff/3600)} س` : `${Math.floor(diff/3600)}h`
    return                ar ? `${Math.floor(diff/86400)} ي`   : `${Math.floor(diff/86400)}d`
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
              onPress={() => handleTap(item)}
              style={({ pressed }) => ({
                flexDirection: 'row', gap: spacing.md, padding: spacing.lg,
                borderBottomWidth: 1, borderBottomColor: colors.grey50,
                backgroundColor: pressed
                  ? colors.grey50
                  : item.is_read ? colors.white : `${colors.primary}08`,
              })}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name={iconFor(item.type)} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: item.is_read ? '700' : '900', fontSize: fontSize.base, color: colors.grey900 }}>
                  {ar ? item.title_ar : (item.title_en || item.title_ar)}
                </Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: 3 }} numberOfLines={2}>
                  {ar ? item.body_ar : (item.body_en || item.body_ar)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <Text style={{ fontSize: 11, color: colors.grey400 }}>
                  {formatTime(item.created_at)}
                </Text>
                {!item.is_read && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}
