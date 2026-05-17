import { useState, useCallback } from 'react'
import {
  View, Text, TextInput, ScrollView, Pressable, ActivityIndicator,
  Image, Modal, FlatList, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import ChildAvatar from '@/components/ChildAvatar'

interface YTResult {
  youtube_id: string
  video_id?: string
  title: string
  thumbnail_url: string
  thumbnail?: string
  channel_name: string
  channel?: string
  channel_id: string
  duration_seconds: number
  blocked?: boolean
}

interface Child { id: string; name: string; gender: string | null; image_url: string | null }
interface Playlist { id: string; name: string; video_count: number }

export default function SearchScreen() {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YTResult[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [searching, setSearching] = useState(false)

  // Add-to-playlist flow state
  const [selectedVideo, setSelectedVideo] = useState<YTResult | null>(null)
  const [step, setStep] = useState<'child' | 'playlist' | null>(null)
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [addingVideo, setAddingVideo] = useState(false)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  // ── Fetch children ────────────────────────────────────────
  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ['children-picker', userId],
    enabled: !!userId,
    placeholderData: (prev: any) => prev,
    staleTime: 60_000,  // Cache for 1 min
    queryFn: async (): Promise<Child[]> => {
      const { data } = await supabase
        .from('children')
        .select('id, name, gender, image_url')
        .order('created_at', { ascending: false })
      return (data || []) as Child[]
    },
  })

  // ── Fetch playlists for selected child ────────────────────
  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists', selectedChild?.id],
    enabled: !!selectedChild && step === 'playlist',
    queryFn: async (): Promise<Playlist[]> => {
      const { data } = await supabase
        .from('playlists')
        .select('id, name, playlist_videos(count)')
        .eq('child_id', selectedChild!.id)
        .order('created_at', { ascending: false })
      return (data || []).map((p: any) => ({
        ...p,
        video_count: p.playlist_videos?.[0]?.count || 0,
      })) as Playlist[]
    },
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await qc.refetchQueries({ queryKey: ['children', userId] })
    if (query.trim()) await search()
    setRefreshing(false)
  }, [userId, query])

  // ── YouTube search ─────────────────────────────────────────
  const search = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: query.trim() },
      })
      if (error) throw error
      setResults((data?.results || data?.videos || []) as YTResult[])
    } catch (err) {
      Toast.show({ type: 'error', text1: 'فشل البحث', text2: (err as Error).message })
    } finally {
      setSearching(false)
    }
  }, [query])

  // ── Add video to playlist ──────────────────────────────────
  const addVideoToPlaylist = async (playlist: Playlist) => {
    if (!selectedVideo || !userId) return
    setAddingVideo(true)
    try {
      const ytId = selectedVideo.youtube_id || selectedVideo.video_id || ''

      // Upsert video
      const { data: existing } = await supabase
        .from('videos')
        .select('id')
        .eq('youtube_id', ytId)
        .maybeSingle()

      let videoId = existing?.id
      if (!videoId) {
        const { data: inserted, error } = await supabase
          .from('videos')
          .insert({
            source: 'youtube',
            youtube_id: ytId,
            added_by: userId,
            title: selectedVideo.title,
            thumbnail_url: selectedVideo.thumbnail_url || selectedVideo.thumbnail || '',
            channel_name: selectedVideo.channel_name || selectedVideo.channel || '',
            channel_id: selectedVideo.channel_id,
            duration_seconds: selectedVideo.duration_seconds,
            is_active: true,
          })
          .select('id')
          .single()
        if (error) throw error
        videoId = inserted.id
      }

      // Get next position
      const { data: lastPv } = await supabase
        .from('playlist_videos')
        .select('position')
        .eq('playlist_id', playlist.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error: pvErr } = await supabase.from('playlist_videos').insert({
        playlist_id: playlist.id,
        video_id: videoId,
        position: (lastPv?.position ?? -1) + 1,
      })
      if (pvErr && !pvErr.message.includes('duplicate')) throw pvErr

      // Mark as added + update counts
      setAddedIds(prev => { const s = new Set(prev); s.add(ytId); return s })
      await qc.invalidateQueries({ queryKey: ['playlist-videos', playlist.id] })
      await qc.invalidateQueries({ queryKey: ['playlists'] })

      Toast.show({ type: 'success', text1: `✓ أُضيف إلى "${playlist.name}"` })
      setStep(null)
      setSelectedVideo(null)
      setSelectedChild(null)
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setAddingVideo(false)
    }
  }

  const openAddFlow = (video: YTResult) => {
    setSelectedVideo(video)
    setStep('child')
  }

  const closeModal = () => {
    setStep(null)
    setSelectedVideo(null)
    setSelectedChild(null)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Header */}
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
        <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900, marginBottom: spacing.md }}>
          {t('tabs.search')}
        </Text>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: colors.grey50,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            borderWidth: 1, borderColor: colors.grey100,
          }}
        >
          <Ionicons name="logo-youtube" size={22} color="#FF0000" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث في YouTube..."
            placeholderTextColor={colors.grey400}
            returnKeyType="search"
            onSubmitEditing={search}
            style={{
              flex: 1,
              paddingVertical: spacing.sm + 4,
              paddingHorizontal: spacing.sm,
              fontSize: fontSize.base,
              color: colors.grey900,
            }}
          />
          <Pressable onPress={search} disabled={!query.trim()}>
            <Ionicons name="search" size={22} color={query.trim() ? colors.primary : colors.grey400} />
          </Pressable>
        </View>
      </View>

      {/* Results */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {searching ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : results.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: spacing.xxl }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
              <Ionicons name="search-outline" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900, textAlign: 'center' }}>
              ابحث عن محتوى للأطفال
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: 4, textAlign: 'center' }}>
              اضغط + لإضافة الفيديو مباشرة لقائمة تشغيل طفلك
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {results.map((v) => {
              const vKey = v.youtube_id || v.video_id || ''
              const isAdded = addedIds.has(vKey)
              return (
                <View
                  key={vKey}
                  style={{
                    flexDirection: 'row',
                    backgroundColor: colors.grey50,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                    borderWidth: 1, borderColor: isAdded ? `${colors.green}40` : colors.grey100,
                  }}
                >
                  <View style={{ width: 120, height: 80, backgroundColor: colors.black }}>
                    <Image
                      source={{ uri: v.thumbnail_url || v.thumbnail }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={{ flex: 1, padding: spacing.sm, justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900 }} numberOfLines={2}>
                      {v.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey600, flex: 1 }} numberOfLines={1}>
                        {v.channel_name || v.channel}
                      </Text>
                      <Pressable
                        onPress={() => !isAdded && openAddFlow(v)}
                        disabled={isAdded}
                        style={{
                          width: 32, height: 32, borderRadius: 16,
                          backgroundColor: isAdded ? colors.green : colors.primary,
                          alignItems: 'center', justifyContent: 'center',
                          marginLeft: spacing.xs,
                        }}
                      >
                        <Ionicons name={isAdded ? 'checkmark' : 'add'} size={20} color={colors.white} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Step 1: Pick child ──────────────────────────────── */}
      <Modal visible={step === 'child'} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900' }}>اختر طفلاً</Text>
              <Pressable onPress={closeModal}>
                <Ionicons name="close" size={28} color={colors.grey600} />
              </Pressable>
            </View>
            {/* Video preview */}
            {selectedVideo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                <Image source={{ uri: selectedVideo.thumbnail_url || selectedVideo.thumbnail }} style={{ width: 64, height: 44, borderRadius: radius.sm }} resizeMode="cover" />
                <Text style={{ flex: 1, fontSize: fontSize.xs, fontWeight: '600', color: colors.grey700 }} numberOfLines={2}>
                  {selectedVideo.title}
                </Text>
              </View>
            )}
            <FlatList
              data={children}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xl }}
              ListEmptyComponent={
                childrenLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
                ) : (
                  <View style={{ alignItems: 'center', padding: spacing.xl }}>
                    <Ionicons name="people-outline" size={48} color={colors.grey200} />
                    <Text style={{ color: colors.grey600, marginTop: spacing.sm }}>لا يوجد أطفال</Text>
                    <Text style={{ color: colors.grey400, fontSize: fontSize.xs, marginTop: 4, textAlign: 'center' }}>
                      أضف طفلاً من تبويب الأطفال أولاً
                    </Text>
                  </View>
                )
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setSelectedChild(item); setStep('playlist') }}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    padding: spacing.md,
                    backgroundColor: colors.grey50,
                    borderRadius: radius.lg,
                    marginBottom: spacing.sm,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <ChildAvatar
                    name={item.name}
                    imageUrl={item.image_url}
                    gender={item.gender as 'boy' | 'girl' | null}
                    size="md"
                  />
                  <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.grey400} style={{ marginLeft: 'auto' }} />
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Step 2: Pick playlist ───────────────────────────── */}
      <Modal visible={step === 'playlist'} animationType="slide" transparent onRequestClose={() => setStep('child')}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg }}>
              <Pressable onPress={() => setStep('child')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="arrow-back" size={22} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{selectedChild?.name}</Text>
              </Pressable>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900' }}>اختر قائمة</Text>
              <Pressable onPress={closeModal}>
                <Ionicons name="close" size={28} color={colors.grey600} />
              </Pressable>
            </View>
            <FlatList
              data={playlists}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xl }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: spacing.xl }}>
                  <Ionicons name="list-outline" size={48} color={colors.grey200} />
                  <Text style={{ color: colors.grey600, marginTop: spacing.sm }}>لا توجد قوائم تشغيل</Text>
                  <Text style={{ color: colors.grey400, fontSize: fontSize.xs, marginTop: 4 }}>أنشئ قائمة من صفحة الطفل أولاً</Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => addVideoToPlaylist(item)}
                  disabled={addingVideo}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                    padding: spacing.md,
                    backgroundColor: colors.grey50,
                    borderRadius: radius.lg,
                    marginBottom: spacing.sm,
                    opacity: pressed || addingVideo ? 0.7 : 1,
                  })}
                >
                  <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                    {addingVideo ? <ActivityIndicator color={colors.primary} size="small" /> : <Ionicons name="list" size={24} color={colors.primary} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>{item.name}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }}>{item.video_count} فيديو</Text>
                  </View>
                  <Ionicons name="add-circle" size={28} color={colors.primary} />
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
