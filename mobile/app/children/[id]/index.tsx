import { useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import KeyboardScreen from '@/components/KeyboardScreen'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import Toast from 'react-native-toast-message'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useHasPin } from '@/hooks/usePinAuth'
import { useLockedPlaylistsIds, usePlanLimits, parsePlanLimitError } from '@/hooks/usePlanLimits'
import { useAuth } from '@/stores/auth'
import ChildAvatar from '@/components/ChildAvatar'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import { getChildSessionEndStorageKey } from '@/lib/screenTime'

interface Playlist {
  id: string
  name: string
  description: string | null
  video_count: number
  created_at: string
}

export default function ChildDetailScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()
  const { t, i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const userId = useAuth((s) => s.user?.id)
  const { data: planLimits } = usePlanLimits()
  const { data: lockedPlaylistIds = new Set<string>() } = useLockedPlaylistsIds(id as string)
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
  const [timeOpen, setTimeOpen] = useState(false)
  const [timeMinutes, setTimeMinutes] = useState(60)
  const [savingTime, setSavingTime] = useState(false)
  // Max daily minutes currently configured for this child session.
  const maxTimeMinutes = planLimits?.daily_time_minutes ?? 60

  const handleSaveTimeLimit = async () => {
    const minutes = Math.min(maxTimeMinutes, Math.max(5, timeMinutes))
    setSavingTime(true)
    try {
      const { error } = await supabase.rpc('set_child_time_limit', {
        p_child_id: id,
        p_daily_minutes: minutes,
      })
      if (error) throw error
      // CRITICAL: invalidate the child query so kid-mode picks up the new
      // limit on next open. Without this, the cached child row (with the
      // old daily_time_minutes value) is what kid-mode reads, and it falls
      // back to the 30-min default — making the "save" look like a no-op.
      await AsyncStorage.removeItem(getChildSessionEndStorageKey(id as string))
      qc.setQueryData(['child-kid-mode', id], (old: any) => (
        old ? { ...old, session_time_minutes: minutes, daily_time_minutes: minutes } : old
      ))
      await qc.invalidateQueries({ queryKey: ['child', id] })
      await qc.invalidateQueries({ queryKey: ['child-kid-mode', id] })
      Toast.show({ type: 'success', text1: ar ? 'تم حفظ وقت الجلسة' : 'Session time saved' })
      setTimeOpen(false)
    } catch (err: any) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setSavingTime(false)
    }
  }

  const { data: child } = useQuery({
    queryKey: ['child', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('children')
        .select('id, name, gender, image_url, daily_time_minutes, age:ages(name_ar, name_en)')
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
      Toast.show({ type: 'success', text1: ar ? 'تم إنشاء قائمة التشغيل' : 'Playlist created' })
      setPlaylistName('')
      setAddOpen(false)
    } catch (err: any) {
      const limitType = parsePlanLimitError(err)
      if (limitType === 'playlists') {
        Toast.show({
          type: 'error',
          text1: ar ? `وصلت للحد الأقصى (${planLimits?.max_playlists} قوائم)` : `Reached the limit (${planLimits?.max_playlists} playlists)`,
          text2: ar ? 'وصلت للحد الحالي. يمكنك إدارة الحدود من لوحة التحكم.' : 'You reached the current limit. Manage limits from the dashboard.',
        })
      } else {
        Toast.show({ type: 'error', text1: (err as Error).message })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePlaylist = (pid: string, pname: string) => {
    Alert.alert(
      ar ? 'حذف قائمة التشغيل' : 'Delete playlist',
      ar
        ? `هل أنت متأكد من حذف "${pname}"؟ سيتم حذف كل الفيديوهات الموجودة بها.`
        : `Delete "${pname}"? All videos in this playlist will be removed.`,
      [
        { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: ar ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('playlists').delete().eq('id', pid)
              if (error) throw error
              await qc.invalidateQueries({ queryKey: ['playlists', id] })
              Toast.show({ type: 'success', text1: ar ? 'تم حذف قائمة التشغيل' : 'Playlist deleted' })
            } catch (err: any) {
              Toast.show({ type: 'error', text1: (err as Error).message })
            }
          },
        },
      ]
    )
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
          {(() => {
            const label = childAge && (ar ? (childAge.name_ar || childAge.name_en) : (childAge.name_en || childAge.name_ar))
            return label ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <Ionicons name="calendar-outline" size={13} color={colors.grey600} />
                <Text style={{ fontSize: fontSize.sm, color: colors.grey600, fontWeight: '600' }}>
                  {label}
                </Text>
              </View>
            ) : null
          })()}
        </View>
      </View>

      {/* ── Kid mode hero button ─────────────────────────── */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
        <Pressable
          onPress={() => {
            if (hasPin === false) {
              Alert.alert(
                ar ? 'رمز الأمان مطلوب' : 'Security PIN required',
                ar ? 'يجب تعيين رمز PIN أولاً حتى يتمكن الطفل من اللعب بأمان ولا يستطيع الخروج بدون إذنك' : 'You must set a PIN first so your child can play safely and cannot exit without your permission',
                [
                  { text: ar ? 'تعيين الرمز الآن' : 'Set PIN now', onPress: () => router.push({ pathname: '/profile/set-pin', params: { returnTo: `/children/${id}/kid-mode` } }) },
                  { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel' },
                ]
              )
              return
            }
            if (hasPin === null) return
            router.push({
              pathname: '/children/[id]/kid-mode',
              params: {
                id: String(id),
                // Pre-seed the header so it renders the correct avatar
                // *immediately* — no skeleton flash while the kid-mode
                // query is in flight.
                name:     child?.name || '',
                gender:   (child as any)?.gender || '',
                imageUrl: (child as any)?.image_url || '',
              },
            })
          }}
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#029ac2' : colors.primary,
            borderRadius: radius.xl,
            paddingVertical: spacing.lg + 6,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
          })}
        >
          <Ionicons name="play-circle" size={40} color={colors.white} />
          <Text style={{ color: colors.white, fontWeight: '900', fontSize: fontSize.xl, letterSpacing: 0.5 }}>
            {ar ? 'وضع الطفل' : 'Kid mode'}
          </Text>
        </Pressable>
      </View>

      {/* ── Secondary actions row ─────────────────────────── */}
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md }}>
        <ActionPill
          icon="stats-chart"
          label={ar ? 'إحصائيات' : 'Statistics'}
          color={colors.secondary}
          onPress={() => router.push(`/children/${id}/statistics`)}
        />
        <ActionPill
          icon="time"
          label={ar ? 'تحديد الوقت' : 'Set time'}
          color="#7C3AED"
          onPress={() => {
            const savedMinutes = Number((child as any)?.daily_time_minutes || 0)
            setTimeMinutes(Math.min(savedMinutes > 0 ? savedMinutes : 60, maxTimeMinutes))
            setTimeOpen(true)
          }}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.grey900 }}>
            {ar ? 'قوائم تشغيل آمنة' : 'Safe playlists'}
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
              {ar ? 'لا توجد قوائم تشغيل بعد' : 'No playlists yet'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {playlists.map((p) => {
              const isLocked = lockedPlaylistIds.has(p.id)
              return (
              <Pressable
                key={p.id}
                onPress={() => {
                  if (isLocked) {
                    Alert.alert(
                      ar ? '🔒 مقفول' : '🔒 Locked',
                      ar ? `الحد الحالي يسمح بـ ${planLimits?.max_playlists || 1} قوائم تشغيل فقط.` : `The current limit allows only ${planLimits?.max_playlists || 1} playlists.`,
                      [
                        { text: ar ? 'حسناً' : 'OK', style: 'cancel' },
                      ]
                    )
                    return
                  }
                  router.push(`/playlist/${p.id}`)
                }}
                style={({ pressed }) => ({
                  position: 'relative',
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: spacing.md,
                  backgroundColor: isLocked ? '#FFF7ED' : colors.grey50,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: isLocked ? '#FED7AA' : colors.grey100,
                  opacity: pressed ? 0.7 : (isLocked ? 0.85 : 1),
                  gap: spacing.md,
                })}
              >
                {isLocked && (
                  <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F97316', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100, zIndex: 1 }}>
                    <Ionicons name="lock-closed" size={9} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{ar ? 'مقفول' : 'Locked'}</Text>
                  </View>
                )}
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
                    {p.video_count} {ar ? 'فيديو' : 'videos'}
                  </Text>
                </View>
                <Pressable
                  onPress={(e: any) => {
                    e?.stopPropagation?.()
                    handleDeletePlaylist(p.id, p.name)
                  }}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    width: 36, height: 36, borderRadius: 18,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: pressed ? '#FEE2E2' : 'transparent',
                  })}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.secondary} />
                </Pressable>
              </Pressable>
            )
                        })}
          </View>
        )}
      </ScrollView>

      {/* Add playlist modal */}
      <Modal visible={addOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <View
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 32, borderTopRightRadius: 32,
              padding: spacing.lg,
              paddingBottom: spacing.lg + insets.bottom,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.grey900 }}>
                {ar ? 'قائمة تشغيل جديدة' : 'New playlist'}
              </Text>
              <Pressable onPress={() => setAddOpen(false)}>
                <Ionicons name="close" size={28} color={colors.grey600} />
              </Pressable>
            </View>

            <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
              {ar ? 'الاسم' : 'Name'}
            </Text>
            <TextInput
              value={playlistName}
              onChangeText={setPlaylistName}
              placeholder={ar ? 'مثل: فيديوهات تعليمية' : 'e.g. Educational videos'}
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
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800' }}>
                  {ar ? 'إنشاء' : 'Create'}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Time limit modal */}
      <Modal visible={timeOpen} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setTimeOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <View
            style={{
              backgroundColor: colors.white,
              borderTopLeftRadius: 32, borderTopRightRadius: 32,
              padding: spacing.lg,
              paddingBottom: spacing.lg + insets.bottom,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: colors.grey900 }}>
                {ar ? 'وقت الجلسة المسموح' : 'Allowed session time'}
              </Text>
              <Pressable onPress={() => setTimeOpen(false)}>
                <Ionicons name="close" size={28} color={colors.grey600} />
              </Pressable>
            </View>

            {/* Plan max hint */}
            <Text style={{ fontSize: fontSize.xs, color: colors.grey500, marginBottom: spacing.md }}>
              {ar ? `الحد الحالي ${maxTimeMinutes} دقيقة لكل جلسة` : `Current limit: up to ${maxTimeMinutes} minutes per session`}
            </Text>

            {/* Presets — only those allowed by the current limit */}
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {[30, 45, 60, 90, 120].filter((p) => p <= maxTimeMinutes).map((p) => {
                const active = timeMinutes === p
                return (
                  <Pressable
                    key={p}
                    onPress={() => setTimeMinutes(p)}
                    style={{
                      paddingHorizontal: spacing.md + 2,
                      paddingVertical: spacing.sm + 2,
                      borderRadius: radius.pill,
                      borderWidth: 1.5,
                      borderColor: active ? colors.primary : colors.grey200,
                      backgroundColor: active ? colors.primary : colors.white,
                    }}
                  >
                    <Text style={{ fontWeight: '800', color: active ? colors.white : colors.grey700 }}>
                      {p} {ar ? 'دقيقة' : 'min'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
              {ar ? 'أو أدخل قيمة مخصصة (دقيقة)' : 'Or enter a custom value (minutes)'}
            </Text>
            <TextInput
              value={String(timeMinutes)}
              onChangeText={(v) => setTimeMinutes(Math.max(0, Math.min(maxTimeMinutes, Number(v.replace(/[^0-9]/g, '')) || 0)))}
              keyboardType="number-pad"
              placeholder={String(Math.min(60, maxTimeMinutes))}
              placeholderTextColor={colors.grey400}
              style={{
                backgroundColor: colors.grey50,
                borderRadius: radius.lg,
                padding: spacing.md,
                fontSize: fontSize.base,
                color: colors.grey900,
                borderWidth: 1,
                borderColor: colors.grey100,
                marginBottom: spacing.lg,
                textAlign: 'right',
              }}
            />

            <Pressable
              onPress={handleSaveTimeLimit}
              disabled={savingTime || timeMinutes < 5}
              style={{
                backgroundColor: timeMinutes < 5 ? colors.grey200 : colors.primary,
                paddingVertical: spacing.md + 2,
                borderRadius: radius.pill,
                alignItems: 'center',
              }}
            >
              {savingTime ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800' }}>
                  {ar ? 'حفظ' : 'Save'}
                </Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
