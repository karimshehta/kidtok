import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'expo-router'
import {
  View, Text, TextInput, ScrollView, Pressable, ActivityIndicator,
  Image, Modal, FlatList, RefreshControl, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useIsFollowing, useToggleFollow } from '@/hooks/useSocial'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import ChildAvatar from '@/components/ChildAvatar'
import VerifiedBadge from '@/components/VerifiedBadge'

// ── Types ──────────────────────────────────────────────────
type SearchTab = 'suggested' | 'youtube' | 'users'
interface YTResult {
  youtube_id: string
  video_id?: string
  title: string
  thumbnail_url: string
  thumbnail?: string
  channel_name: string
  channel?: string
  channel_id?: string
  duration_seconds?: number
}
interface Child { id: string; name: string; gender: string | null; image_url: string | null }
interface Playlist { id: string; name: string; video_count: number }
interface UserResult { id: string; name: string; username: string | null; avatar_url: string | null; bio: string | null; followers_count: number; is_verified: boolean }
interface SuggestedVideo { id: string; title: string; thumbnail_url: string | null; channel_name: string | null; youtube_id: string; like_count: number; view_count: number; interest_id: number | null; age_id: number | null }
interface Interest { id: number; name_ar: string; name_en: string; icon: string | null; image_url: string | null }
interface Age { id: number; name_ar: string; name_en: string; min_age: number; max_age: number }

// ── Main Component ─────────────────────────────────────────
export default function SearchScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [tab, setTab] = useState<SearchTab>('suggested')

  // ── YouTube search ───────────────────────
  const [ytQuery, setYtQuery] = useState('')
  const [ytResults, setYtResults] = useState<YTResult[]>([])
  const [ytSearching, setYtSearching] = useState(false)

  // ── User search ──────────────────────────
  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState<UserResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Suggested filters ────────────────────
  const [selectedInterest, setSelectedInterest] = useState<Interest | null>(null)
  const [selectedAge, setSelectedAge] = useState<Age | null>(null)
  const [showInterestPicker, setShowInterestPicker] = useState(false)
  const [showAgePicker, setShowAgePicker] = useState(false)

  // ── Add to playlist flow ─────────────────
  const [selectedVideo, setSelectedVideo] = useState<{ id: string; ytId?: string; title: string; thumbnail?: string; channelTitle?: string } | null>(null)
  const [step, setStep] = useState<'child' | 'playlist' | null>(null)
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [addingVideo, setAddingVideo] = useState(false)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  // ── Data queries ─────────────────────────
  const { data: interests = [] } = useQuery<Interest[]>({
    queryKey: ['interests'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from('interests').select('id, name_ar, name_en, icon, image_url').eq('is_active', true).order('sort_order')
      return data || []
    },
  })

  const { data: ages = [] } = useQuery<Age[]>({
    queryKey: ['ages'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase.from('ages').select('id, name_ar, name_en, min_age, max_age').order('min_age')
      return data || []
    },
  })

  const { data: suggestedVideos = [], isLoading: suggestedLoading } = useQuery<SuggestedVideo[]>({
    queryKey: ['suggested-videos', selectedInterest?.id, selectedAge?.id],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_suggested_videos', {
        p_interest_id: selectedInterest?.id ?? null,
        p_age_id: selectedAge?.id ?? null,
        p_limit: 30,
        p_offset: 0,
      })
      return data || []
    },
  })

  const { data: children = [] } = useQuery({
    queryKey: ['children', userId],
    enabled: !!userId,
    placeholderData: (prev: any) => prev,
    staleTime: 60_000,
    queryFn: async (): Promise<Child[]> => {
      const { data } = await supabase.from('children').select('id, name, gender, image_url').order('created_at', { ascending: false })
      return (data || []) as Child[]
    },
  })

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists', selectedChild?.id],
    enabled: !!selectedChild && step === 'playlist',
    queryFn: async (): Promise<Playlist[]> => {
      const { data } = await supabase.from('playlists').select('id, name, playlist_videos(count)').eq('child_id', selectedChild!.id).order('created_at', { ascending: false })
      return (data || []).map((p: any) => ({ ...p, video_count: p.playlist_videos?.[0]?.count || 0 })) as Playlist[]
    },
  })

  // ── Handlers ─────────────────────────────
  const ytSearch = useCallback(async () => {
    if (!ytQuery.trim()) return
    setYtSearching(true)
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', { body: { query: ytQuery.trim() } })
      if (error) throw error
      setYtResults(data?.results || data?.videos || data?.items || [])
    } catch { setYtResults([]) }
    finally { setYtSearching(false) }
  }, [ytQuery])

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setUserResults([]); return }
    const { data } = await supabase.rpc('search_users', { p_query: q.replace(/^@/, '').trim(), p_limit: 20 })
    setUserResults(data || [])
  }, [])

  const handleUserQueryChange = useCallback((q: string) => {
    setUserQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchUsers(q), 500)
  }, [searchUsers])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await qc.refetchQueries({ queryKey: ['children', userId] })
    await qc.invalidateQueries({ queryKey: ['suggested-videos'] })
    setRefreshing(false)
  }, [userId])

  const openAddFlow = (v: typeof selectedVideo) => { setSelectedVideo(v); setStep('child') }
  const closeModal = () => { setStep(null); setSelectedVideo(null); setSelectedChild(null) }

  const addToPlaylist = async (playlist: Playlist) => {
    if (!selectedVideo || !userId || !selectedChild) return
    setAddingVideo(true)
    try {
      let videoId: string

      if (selectedVideo.ytId) {
        // ── YouTube video — same logic as playlist/add.tsx ──
        const ytId = selectedVideo.ytId

        // Check if already in videos table
        const { data: existing } = await supabase
          .from('videos').select('id').eq('youtube_id', ytId).maybeSingle()

        if (existing?.id) {
          videoId = existing.id
        } else {
          // Insert new
          const { data: inserted, error: insErr } = await supabase
            .from('videos')
            .insert({
              source: 'youtube',
              youtube_id: ytId,
              added_by: userId,
              title: selectedVideo.title || '',
              thumbnail_url: selectedVideo.thumbnail || '',
              channel_name: selectedVideo.channelTitle || '',
              channel_id: '',
              duration_seconds: 0,
              is_active: true,
            })
            .select('id').single()
          if (insErr) throw insErr
          videoId = inserted!.id
        }
      } else {
        // Suggested video — already in videos table
        videoId = selectedVideo.id
      }

      // Get next position (same as playlist/[id]/add.tsx)
      const { data: lastPv } = await supabase
        .from('playlist_videos')
        .select('position')
        .eq('playlist_id', playlist.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextPos = (lastPv?.position ?? -1) + 1

      // Add to playlist — NO added_by column, use position
      const { error: pvErr } = await supabase
        .from('playlist_videos')
        .insert({ playlist_id: playlist.id, video_id: videoId, position: nextPos })
      if (pvErr && !pvErr.message.includes('duplicate')) throw pvErr

      // Mark as parent pick (best effort - ignore if column doesn't exist yet)
      try {
        await supabase.rpc('mark_as_parent_pick', { p_video_id: videoId })
      } catch {}

      setAddedIds((prev) => new Set([...prev, `${playlist.id}:${videoId}`]))
      qc.invalidateQueries({ queryKey: ['playlist-videos', playlist.id] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
      Toast.show({ type: 'success', text1: 'تم إضافة الفيديو ✓' })
      closeModal()
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'فشل الإضافة', text2: e.message })
      console.error(e)
    } finally {
      setAddingVideo(false)
    }
  }

  const isAdded = (playlistId: string, videoId: string) => addedIds.has(`${playlistId}:${videoId}`)

  // ── Render ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FB' }}>

      {/* ── Search Mode Cards ── */}
      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {([
            ['suggested', ar ? 'مقترح' : 'For You',  colors.primary,   'sparkles-outline'],
            ['youtube',   'YouTube',                   colors.secondary,  'logo-youtube'],
            ['users',     ar ? 'مستخدمين' : 'Users',  colors.primary,   'people-outline'],
          ] as [SearchTab, string, string, string][]).map(([key, label, color, icon]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 12, borderRadius: radius.xl,
                backgroundColor: tab === key ? color : '#F9FAFB',
                alignItems: 'center', gap: 4,
                borderWidth: tab === key ? 0 : 1, borderColor: '#E5E7EB',
                elevation: tab === key ? 4 : 0,
                shadowColor: tab === key ? color : 'transparent',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25, shadowRadius: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name={icon as any} size={18} color={tab === key ? '#fff' : '#9CA3AF'} />
              <Text style={{ fontWeight: '800', fontSize: 11, color: tab === key ? '#fff' : '#9CA3AF' }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ════════════════ SUGGESTED TAB ════════════════ */}
      {tab === 'suggested' && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          {/* Filter row */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.md }}>
            {/* Interest filter */}
            <Pressable
              onPress={() => setShowInterestPicker(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, borderWidth: 1.5, borderColor: selectedInterest ? colors.primary : colors.grey100, gap: 8 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {selectedInterest?.image_url ? (
                  <Image source={{ uri: selectedInterest.image_url }} style={{ width: 28, height: 28, borderRadius: 8 }} />
                ) : (
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14 }}>{selectedInterest?.icon || '✨'}</Text>
                  </View>
                )}
                <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: selectedInterest ? colors.grey900 : colors.grey400 }} numberOfLines={1}>
                  {selectedInterest ? (ar ? selectedInterest.name_ar : selectedInterest.name_en) : (ar ? 'الاهتمامات' : 'Interests')}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={selectedInterest ? colors.primary : colors.grey400} />
            </Pressable>

            {/* Age filter */}
            <Pressable
              onPress={() => setShowAgePicker(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, borderWidth: 1.5, borderColor: selectedAge ? colors.secondary : colors.grey100 }}
            >
              <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: selectedAge ? colors.grey900 : colors.grey400 }}>
                {selectedAge ? (ar ? selectedAge.name_ar : selectedAge.name_en) : (ar ? 'العمر' : 'Age')}
              </Text>
              <Ionicons name="chevron-down" size={16} color={selectedAge ? colors.secondary : colors.grey400} />
            </Pressable>
          </View>

          {/* Active filters chips */}
          {(selectedInterest || selectedAge) && (
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
              {selectedInterest && (
                <Pressable onPress={() => setSelectedInterest(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${colors.primary}15`, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.primary }}>{ar ? selectedInterest.name_ar : selectedInterest.name_en}</Text>
                  <Ionicons name="close" size={12} color={colors.primary} />
                </Pressable>
              )}
              {selectedAge && (
                <Pressable onPress={() => setSelectedAge(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${colors.secondary}15`, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.secondary }}>{ar ? selectedAge.name_ar : selectedAge.name_en}</Text>
                  <Ionicons name="close" size={12} color={colors.secondary} />
                </Pressable>
              )}
            </View>
          )}

          {/* Video cards */}
          {suggestedLoading ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : suggestedVideos.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="film-outline" size={60} color={colors.grey200} />
              <Text style={{ color: colors.grey400, marginTop: spacing.md, fontWeight: '600' }}>
                {ar ? 'لا توجد فيديوهات بعد' : 'No videos yet'}
              </Text>
            </View>
          ) : (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              {suggestedVideos.map((v) => {
                const alreadyAdded = addedIds.has(v.id)
                return (
                  <View
                    key={v.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      backgroundColor: colors.white, borderRadius: radius.xl,
                      padding: spacing.md, shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
                    }}
                  >
                    {/* Thumbnail */}
                    <View style={{ width: 88, height: 60, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.grey100 }}>
                      {v.thumbnail_url ? (
                        <Image source={{ uri: v.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="play-circle-outline" size={28} color={colors.grey300} />
                        </View>
                      )}
                      {/* Play overlay */}
                      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="play" size={14} color={colors.white} />
                        </View>
                      </View>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900, lineHeight: 18 }} numberOfLines={2}>
                        {v.title}
                      </Text>
                      {v.channel_name && (
                        <Text style={{ fontSize: 11, color: colors.grey400, marginTop: 3 }} numberOfLines={1}>
                          {v.channel_name}
                        </Text>
                      )}
                    </View>

                    {/* Add button */}
                    <Pressable
                      onPress={() => !alreadyAdded && openAddFlow({ id: v.id, title: v.title, thumbnail: v.thumbnail_url || undefined })}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 12, paddingVertical: 7,
                        borderRadius: 999,
                        backgroundColor: alreadyAdded ? '#16a34a' : colors.secondary,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Ionicons name={alreadyAdded ? 'checkmark' : 'add'} size={14} color={colors.white} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.white }}>
                        {alreadyAdded ? (ar ? 'تمت' : 'Added') : (ar ? 'إضافة' : 'Add')}
                      </Text>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* ════════════════ YOUTUBE TAB ════════════════ */}
      {tab === 'youtube' && (
        <View style={{ flex: 1 }}>
          <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.grey100 }}>
              <Ionicons name="logo-youtube" size={22} color="#FF0000" />
              <TextInput
                value={ytQuery} onChangeText={setYtQuery}
                placeholder={ar ? 'ابحث في YouTube...' : 'Search YouTube...'}
                placeholderTextColor={colors.grey400}
                returnKeyType="search" onSubmitEditing={ytSearch}
                style={{ flex: 1, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.sm, fontSize: fontSize.base, color: colors.grey900 }}
              />
              <Pressable onPress={ytSearch} disabled={!ytQuery.trim()}>
                {ytSearching ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="search" size={22} color={ytQuery.trim() ? colors.primary : colors.grey400} />}
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}>
            {ytResults.length === 0 && !ytSearching ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <Ionicons name="logo-youtube" size={60} color="#FF000030" />
                <Text style={{ color: colors.grey400, marginTop: spacing.md }}>{ar ? 'ابحث عن فيديو...' : 'Search for a video...'}</Text>
              </View>
            ) : (
              ytResults.map((v, _idx) => {
                const alreadyAdded = addedIds.has(v.id)
                return (
                  <View key={v.youtube_id || v.video_id || String(_idx)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.md, elevation: 1 }}>
                    <Image source={{ uri: v.thumbnail_url || v.thumbnail }} style={{ width: 88, height: 60, borderRadius: radius.md }} resizeMode="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900 }} numberOfLines={2}>{v.title}</Text>
                      <Text style={{ fontSize: 11, color: colors.grey400, marginTop: 3 }}>{v.channel_name || v.channel}</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                      const ytId = v.youtube_id || v.video_id || ''
                      if (!alreadyAdded) openAddFlow({ id: ytId, ytId, title: v.title, thumbnail: v.thumbnail_url || v.thumbnail, channelTitle: v.channel_name || v.channel || '' })
                    }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: alreadyAdded ? '#16a34a' : colors.secondary }}
                    >
                      <Ionicons name={alreadyAdded ? 'checkmark' : 'add'} size={14} color={colors.white} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.white }}>
                        {alreadyAdded ? (ar ? 'تمت' : 'Added') : (ar ? 'إضافة' : 'Add')}
                      </Text>
                    </Pressable>
                  </View>
                )
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* ════════════════ USERS TAB ════════════════ */}
      {tab === 'users' && (
        <View style={{ flex: 1 }}>
          <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.pill, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.grey100 }}>
              <Ionicons name="person-outline" size={20} color={colors.primary} />
              <Text style={{ fontSize: fontSize.base, color: colors.grey400, paddingLeft: 4 }}>@</Text>
              <TextInput
                value={userQuery} onChangeText={handleUserQueryChange}
                placeholder={ar ? 'ابحث بالاسم أو @username' : 'Search by name or @username'}
                placeholderTextColor={colors.grey400}
                autoCapitalize="none"
                style={{ flex: 1, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.sm, fontSize: fontSize.base, color: colors.grey900 }}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}>
            {userResults.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <Ionicons name="people-outline" size={60} color={colors.grey200} />
                <Text style={{ color: colors.grey400, marginTop: spacing.md }}>{ar ? 'ابحث عن مستخدم...' : 'Search for a user...'}</Text>
              </View>
            ) : (
              userResults.map((u) => (
                <Pressable key={u.id} onPress={() => router.push(`/creator/${u.id}` as any)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={{ width: '100%', height: '100%' }} /> : <Ionicons name="person" size={28} color={colors.white} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontWeight: '800', fontSize: fontSize.base, color: colors.grey900 }}>{u.name || (ar ? 'مستخدم' : 'User')}</Text>
                      {u.is_verified && <VerifiedBadge size="sm" />}
                    </View>
                    {u.username && <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' }}>@{u.username}</Text>}
                    <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>
                      {u.followers_count > 999 ? `${(u.followers_count/1000).toFixed(1)}k` : u.followers_count} {ar ? 'متابع' : 'followers'}
                    </Text>
                  </View>
                  <FollowButton creatorId={u.id} ar={ar} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Interest picker modal ── */}
      <Modal visible={showInterestPicker} animationType="slide" transparent onRequestClose={() => setShowInterestPicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>{ar ? 'اختر الاهتمام' : 'Choose Interest'}</Text>
              <Pressable onPress={() => setShowInterestPicker(false)}><Ionicons name="close" size={24} color={colors.grey700} /></Pressable>
            </View>
            <FlatList
              data={[null, ...interests] as any[]}
              keyExtractor={(item) => item?.id?.toString() || 'all'}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSelectedInterest(item); setShowInterestPicker(false) }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md,
                    backgroundColor: pressed ? colors.grey50 : colors.white, borderRadius: radius.lg,
                    borderBottomWidth: 1, borderBottomColor: colors.grey50,
                  })}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                    {item?.image_url
                      ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
                      : <Text style={{ fontSize: 22 }}>{item?.icon || '🌟'}</Text>
                    }
                  </View>
                  <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>
                    {item ? (ar ? item.name_ar : item.name_en) : (ar ? 'كل الاهتمامات' : 'All Interests')}
                  </Text>
                  {selectedInterest?.id === item?.id && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Age picker modal ── */}
      <Modal visible={showAgePicker} animationType="slide" transparent onRequestClose={() => setShowAgePicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '60%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>{ar ? 'اختر الفئة العمرية' : 'Choose Age Group'}</Text>
              <Pressable onPress={() => setShowAgePicker(false)}><Ionicons name="close" size={24} color={colors.grey700} /></Pressable>
            </View>
            <FlatList
              data={[null, ...ages] as any[]}
              keyExtractor={(item) => item?.id?.toString() || 'all'}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSelectedAge(item); setShowAgePicker(false) }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingVertical: spacing.md, backgroundColor: pressed ? colors.grey50 : colors.white,
                    borderRadius: radius.lg, borderBottomWidth: 1, borderBottomColor: colors.grey50,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.secondary}15`, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 20 }}>👶</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>
                        {item ? (ar ? item.name_ar : item.name_en) : (ar ? 'كل الأعمار' : 'All Ages')}
                      </Text>
                      {item && <Text style={{ fontSize: fontSize.xs, color: colors.grey400 }}>{item.min_age} - {item.max_age} {ar ? 'سنة' : 'years'}</Text>}
                    </View>
                  </View>
                  {selectedAge?.id === item?.id && <Ionicons name="checkmark-circle" size={22} color={colors.secondary} />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Pick child modal ── */}
      <Modal visible={step === 'child'} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900' }}>{ar ? 'اختر طفلاً' : 'Choose a child'}</Text>
              <Pressable onPress={closeModal}><Ionicons name="close" size={24} color={colors.grey700} /></Pressable>
            </View>
            <FlatList
              data={children} keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSelectedChild(item); setStep('playlist') }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: pressed ? colors.grey50 : colors.white })}
                >
                  <ChildAvatar name={item.name} imageUrl={item.image_url} gender={item.gender as any} size="md" />
                  <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.grey400} />
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Pick playlist modal ── */}
      <Modal visible={step === 'playlist'} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }}>
              <Pressable onPress={() => setStep('child')}><Ionicons name="arrow-back" size={24} color={colors.grey700} /></Pressable>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900' }}>{ar ? 'اختر قائمة' : 'Choose playlist'}</Text>
              <Pressable onPress={closeModal}><Ionicons name="close" size={24} color={colors.grey700} /></Pressable>
            </View>
            <FlatList
              data={playlists} keyExtractor={(p) => p.id}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}
              renderItem={({ item }) => {
                const added = selectedVideo ? isAdded(item.id, selectedVideo.id) : false
                return (
                  <Pressable
                    onPress={() => !added && !addingVideo && addToPlaylist(item)}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: pressed ? colors.grey50 : colors.white, opacity: added ? 0.6 : 1 })}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.secondaryContainer, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="list" size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>{item.name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>{item.video_count} {ar ? 'فيديو' : 'videos'}</Text>
                    </View>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: added ? '#16a34a' : colors.secondary, alignItems: 'center', justifyContent: 'center' }}>
                      {addingVideo ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name={added ? 'checkmark' : 'add'} size={20} color={colors.white} />}
                    </View>
                  </Pressable>
                )
              }}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  )
}

// ── Follow Button ────────────────────────────────────────────
function FollowButton({ creatorId, ar }: { creatorId: string; ar: boolean }) {
  const myId = useAuth((s) => s.user?.id)
  const { data: isFollowing } = useIsFollowing(creatorId)
  const toggleFollow = useToggleFollow()
  if (myId === creatorId) return null
  return (
    <Pressable
      onPress={(e) => { e.stopPropagation(); toggleFollow.mutate(creatorId) }}
      style={({ pressed }) => ({
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
        backgroundColor: isFollowing ? colors.grey100 : colors.primary,
        borderWidth: isFollowing ? 1 : 0, borderColor: colors.grey200,
        opacity: (pressed || toggleFollow.isPending) ? 0.75 : 1,
      })}
    >
      {toggleFollow.isPending
        ? <ActivityIndicator size="small" color={isFollowing ? colors.grey500 : colors.white} />
        : <Text style={{ fontWeight: '800', fontSize: fontSize.sm, color: isFollowing ? colors.grey700 : colors.white }}>
            {isFollowing ? (ar ? 'تتابع ✓' : 'Following ✓') : (ar ? '+ متابعة' : '+ Follow')}
          </Text>
      }
    </Pressable>
  )
}
