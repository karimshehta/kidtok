import { useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, Alert } from 'react-native'
import KeyboardScreen from '@/components/KeyboardScreen'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import Toast from 'react-native-toast-message'

import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useHasPin } from '@/hooks/usePinAuth'
import { usePlanLimits, parsePlanLimitError } from '@/hooks/usePlanLimits'
import { useAuth } from '@/stores/auth'
import ChildAvatar from '@/components/ChildAvatar'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Playlist {
  id: string
  name: string
  description: string | null
  video_count: number
  created_at: string
}

export default function ChildDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const userId = useAuth((s) => s.user?.id)
  const { data: planLimits } = usePlanLimits()
  const hasPin = useHasPin()

  // Refetch playlists every time this screen comes into focus
  // so the video count updates when returning from the add-video screen
  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['playlists', id] })
    }, [id])
  )

  const [addOpen, setAddOpen] = useState(false)
  const [playlistName, setPlaylistName] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: child } = useQuery({
    queryKey: ['child', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('children')
        .select('id, name, gender, image_url, age:ages(name_ar, name_en)')
        .eq('id', id)
        .single()
      return data
    },
  })

  const { data: playlists = [], isLoading } = useQuery({
    queryKey: ['playlists', id],
    staleTime: 0,  // always refetch when screen is focused
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Playlist[]> => {
      const { data, error } = await supabase
        .from('playlists')
        .select('id, name, description, created_at, playlist_videos(count)')
        .eq('child_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((p: any) => ({
        ...p,
        video_count: p.playlist_videos?.[0]?.count || 0,
      }))
    },
  })
  const childAge = Array.isArray(child?.age) ? child.age[0] : child?.age

  const handleCreatePlaylist = async () => {
    if (!playlistName.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('playlists').insert({
        child_id: id,
        parent_id: userId,
        name: playlistName.trim(),
      })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['playlists', id] })
      Toast.show({ type: 'success', text1: 'تم إنشاء قائمة التشغيل' })
      setPlaylistName('')
      setAddOpen(false)
    } catch (err: any) {
      const limitType = parsePlanLimitError(err)
      if (limitType === 'playlists') {
        Toast.show({
          type: 'error',
          text1: `وصلت للحد الأقصى (${planLimits?.max_playlists} قوائم)`,
          text2: 'يرجى ترقية خطتك للإضافة المزيد',
        })
      } else {
        Toast.show({ type: 'error', text1: (err as Error).message })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <KeyboardScreen variant="simple" style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <ChildAvatar name={child?.name || 'KidTok'} imageUrl={child?.image_url} gender={child?.gender} size="md" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>
            {child?.name || '...'}
          </Text>
          {childAge?.name_ar && (
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>
              {childAge.name_ar}
            </Text>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md }}>
        <ActionPill
          icon="play-circle"
          label="وضع الطفل"
          color={colors.primary}
          onPress={() => {
            if (hasPin === false) {
              Alert.alert(
                'رمز الأمان مطلوب',
                'يجب تعيين رمز PIN أولاً حتى يتمكن الطفل من اللعب بأمان ولا يستطيع الخروج بدون إذنك',
                [
                  {
                    text: 'تعيين الرمز الآن',
                    onPress: () => router.push({ pathname: '/profile/set-pin', params: { returnTo: `/children/${id}/kid-mode` } }),
                  },
                  { text: 'إلغاء', style: 'cancel' },
                ]
              )
              return
            }
            if (hasPin === null) return  // still loading
            router.push(`/children/${id}/kid-mode`)
          }}
        />
        <ActionPill
          icon="stats-chart"
          label="إحصائيات"
          color={colors.secondary}
          onPress={() => router.push(`/children/${id}/statistics`)}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.grey900 }}>
            قوائم التشغيل
          </Text>
          <Pressable
            onPress={() => setAddOpen(true)}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={22} color={colors.white} />
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : playlists.length === 0 ? (
          <View style={{ alignItems: 'center', padding: spacing.xl }}>
            <Ionicons name="list-outline" size={48} color={colors.grey200} />
            <Text style={{ color: colors.grey600, marginTop: spacing.sm }}>
              لا توجد قوائم تشغيل بعد
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {playlists.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/playlist/${p.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: spacing.md,
                  backgroundColor: colors.grey50,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.grey100,
                  opacity: pressed ? 0.7 : 1,
                  gap: spacing.md,
                })}
              >
                <View
                  style={{
                    width: 48, height: 48, borderRadius: radius.md,
                    backgroundColor: `${colors.primary}15`,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons name="list" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>
                    {p.name}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }}>
                    {p.video_count} فيديو
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.grey400} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add playlist modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 32, borderTopRightRadius: 32,
              padding: spacing.lg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.grey900 }}>
                قائمة تشغيل جديدة
              </Text>
              <Pressable onPress={() => setAddOpen(false)}>
                <Ionicons name="close" size={28} color={colors.grey600} />
              </Pressable>
            </View>

            <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
              الاسم
            </Text>
            <TextInput
              value={playlistName}
              onChangeText={setPlaylistName}
              placeholder="مثل: فيديوهات تعليمية"
              placeholderTextColor={colors.grey400}
              autoFocus
              style={{
                backgroundColor: colors.grey50,
                borderRadius: radius.lg,
                padding: spacing.md,
                fontSize: fontSize.base,
                color: colors.grey900,
                borderWidth: 1,
                borderColor: colors.grey100,
                marginBottom: spacing.lg,
              }}
            />

            <Pressable
              onPress={handleCreatePlaylist}
              disabled={saving || !playlistName.trim()}
              style={{
                backgroundColor: !playlistName.trim() ? colors.grey200 : colors.primary,
                paddingVertical: spacing.md + 2,
                borderRadius: radius.pill,
                alignItems: 'center',
                marginBottom: spacing.lg,
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800' }}>
                  إنشاء
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardScreen>
  )
}

function ActionPill({ icon, label, color, onPress }: { icon: any; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: `${color}15`,
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${color}30`,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ color, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  )
}
