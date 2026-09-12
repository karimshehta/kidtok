import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, Pressable, FlatList, ActivityIndicator,
  Modal, Animated, Dimensions, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import { HEADER_BAR_HEIGHT } from '@/lib/headerScroll'
import { getNotificationTargetPath } from '@/lib/notificationNavigation'

const PAGE = 3
const { width: SCREEN_W } = Dimensions.get('window')
const PANEL_W = Math.min(SCREEN_W - 32, 360)

type NotifItem = {
  id: string
  type?: string
  title_ar: string; title_en: string | null
  body_ar:  string; body_en:  string | null
  image_url?: string | null
  data?: any
  is_read?: boolean
  created_at: string
  deep_link: string | null
}

interface Props {
  visible: boolean
  onClose: () => void
}

export default function NotificationsPanel({ visible, onClose }: Props) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [items, setItems]         = useState<NotifItem[]>([])
  const [loading, setLoading]     = useState(false)
  const [loadingMore, setLM]      = useState(false)
  const [hasMore, setHasMore]     = useState(true)
  const offsetRef                 = useRef(0)

  const panelY = useRef(new Animated.Value(-20)).current
  const panelOpacity = useRef(new Animated.Value(0)).current

  // ── Fetch page ─────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (offset: number, replace = false) => {
    if (offset === 0) setLoading(true); else setLM(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title_ar, title_en, body_ar, body_en, image_url, deep_link, data, is_read, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1)

    const rows = (data || []) as NotifItem[]
    setItems(prev => replace ? rows : [...prev, ...rows])
    setHasMore(rows.length === PAGE)
    offsetRef.current = offset + rows.length
    setLoading(false)
    setLM(false)
  }, [])

  // ── Open / close animation ────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      offsetRef.current = 0
      setItems([])
      setHasMore(true)
      fetchPage(0, true)
      if (userId) {
        qc.setQueryData(['unread-count', userId], 0)
        qc.setQueryData(['notifications', userId], (old: any) => {
          if (!Array.isArray(old)) return old
          return old.map((x: any) => x.is_read ? x : { ...x, is_read: true })
        })
        ;(async () => {
          try { await supabase.rpc('mark_all_notifications_read') }
          catch { qc.invalidateQueries({ queryKey: ['unread-count', userId] }) }
        })()
      }
      Animated.parallel([
        Animated.spring(panelY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }),
        Animated.timing(panelOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(panelY, { toValue: -12, duration: 150, useNativeDriver: true }),
        Animated.timing(panelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start()
    }
  }, [fetchPage, panelOpacity, panelY, qc, userId, visible])

  const formatTime = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return ar ? 'الآن' : 'now'
    if (diff < 3600) return ar ? `${Math.floor(diff/60)}د` : `${Math.floor(diff/60)}m`
    if (diff < 86400) return ar ? `${Math.floor(diff/3600)}س` : `${Math.floor(diff/3600)}h`
    return ar ? `${Math.floor(diff/86400)}ي` : `${Math.floor(diff/86400)}d`
  }

  const iconFor = (type?: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'comment': return 'chatbubble-ellipses'
      case 'like': return 'heart'
      case 'follow': return 'person-add'
      case 'gift': return 'gift'
      case 'broadcast': return 'megaphone'
      default: return 'notifications'
    }
  }

  // panel top = insets.top + HEADER_BAR_HEIGHT + 6px gap
  const panelTop = insets.top + HEADER_BAR_HEIGHT + 6

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap to close */}
      <Pressable style={{ flex: 1 }} onPress={onClose}>
        {/* Panel — stop propagation so taps inside don't close */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={{
              position: 'absolute',
              top: panelTop,
              right: 12,
              width: PANEL_W,
              maxHeight: 380,
              backgroundColor: colors.white,
              borderRadius: radius.xl,
              // Card shadow
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 24,
              elevation: 16,
              overflow: 'hidden',
              opacity: panelOpacity,
              transform: [{ translateY: panelY }],
            }}
          >
            {/* Header row */}
            <View style={{
              flexDirection: ar ? 'row-reverse' : 'row',
              alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: spacing.md, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: colors.grey100,
            }}>
              <Text style={{ fontWeight: '900', fontSize: fontSize.base, color: colors.grey900 }}>
                {ar ? 'الإشعارات' : 'Notifications'}
              </Text>
              <Pressable onPress={onClose}>
                <Ionicons name="close" size={20} color={colors.grey500} />
              </Pressable>
            </View>

            {/* List */}
            {loading ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : items.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
                <Ionicons name="notifications-off-outline" size={36} color={colors.grey300} />
                <Text style={{ color: colors.grey400, fontSize: fontSize.sm }}>
                  {ar ? 'لا توجد إشعارات' : 'No notifications yet'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(n) => n.id}
                style={{ maxHeight: 340 }}
                showsVerticalScrollIndicator={false}
                onEndReached={() => {
                  if (!loadingMore && hasMore) fetchPage(offsetRef.current)
                }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                  loadingMore
                    ? <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    : hasMore
                    ? null
                    : items.length > PAGE
                    ? <Text style={{ textAlign: 'center', color: colors.grey400, fontSize: 11, paddingVertical: 10 }}>
                        {ar ? 'لا يوجد المزيد' : 'No more'}
                      </Text>
                    : null
                }
                renderItem={({ item, index }) => (
                  <Pressable
                    onPress={() => {
                      onClose()
                      router.push(getNotificationTargetPath(item) as any)
                    }}
                    style={({ pressed }) => ({
                      flexDirection: ar ? 'row-reverse' : 'row',
                      alignItems: 'flex-start', gap: 10,
                      paddingHorizontal: spacing.md, paddingVertical: 12,
                      backgroundColor: pressed ? colors.grey50 : colors.white,
                      borderBottomWidth: index < items.length - 1 ? 1 : 0,
                      borderBottomColor: colors.grey50,
                    })}
                  >
                    {/* Icon */}
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: `${colors.primary}15`,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Ionicons name={iconFor(item.type)} size={18} color={item.type === 'gift' ? colors.secondary : colors.primary} />
                    </View>

                    {/* Text */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: fontSize.sm, color: colors.grey900 }} numberOfLines={1}>
                        {ar ? item.title_ar : (item.title_en || item.title_ar)}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.grey600, marginTop: 2 }} numberOfLines={2}>
                        {ar ? item.body_ar : (item.body_en || item.body_ar)}
                      </Text>
                    </View>

                    {/* Time */}
                    <Text style={{ fontSize: 10, color: colors.grey400, flexShrink: 0, marginTop: 2 }}>
                      {formatTime(item.created_at)}
                    </Text>
                  </Pressable>
                )}
              />
            )}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
