/**
 * Discover (Search tab) — Mobile
 *
 * 2-tab kid-friendly discovery UI:
 *   - Suggested for you — admin-curated, filtered by interests + age
 *   - Your content      — videos in user's playlists
 *
 * Mirrors the web /discover page UX with mobile-optimized chips,
 * horizontal-scroll filters, and big tap targets.
 */
import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  Image, FlatList, RefreshControl,
} from 'react-native'
import KeyboardScreen from '@/components/KeyboardScreen'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Interest { id: number; name_ar: string; name_en: string; icon: string | null }
interface Age      { id: number; name_ar: string; name_en: string }
interface DVideo {
  id: string
  title: string
  thumbnail_url: string | null
  channel_name: string | null
  source: 'youtube' | 'creator'
  youtube_id: string | null
  duration_seconds: number | null
  age_id: number | null
  interest_id: number | null
}

type Tab = 'suggested' | 'yours'
const CARD_GAP = 8

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
export default function DiscoverScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const userId = useAuth(s => s.user?.id)
  const qc = useQueryClient()
  const router = useRouter()

  const [tab, setTab]               = useState<Tab>('suggested')
  const [interestId, setInterestId] = useState<number | null>(null)
  const [ageId, setAgeId]           = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [addedIds, setAddedIds]     = useState<Set<string>>(new Set())
  const [pickerVideo, setPickerVideo] = useState<DVideo | null>(null)

  const { data: interests = [] } = useQuery<Interest[]>({
    queryKey: ['interests'],
    queryFn: async () => {
      const { data } = await supabase.from('interests')
        .select('id, name_ar, name_en, icon')
        .eq('is_active', true).order('sort_order')
      return (data || []) as Interest[]
    },
    staleTime: 3600_000,
  })

  const { data: ages = [] } = useQuery<Age[]>({
    queryKey: ['ages'],
    queryFn: async () => {
      const { data } = await supabase.from('ages')
        .select('id, name_ar, name_en')
        .order('min_age')
      return (data || []) as Age[]
    },
    staleTime: 3600_000,
  })

  const { data: suggested = [], isLoading: suggLoading, refetch: refetchSuggested } = useQuery<DVideo[]>({
    queryKey: ['discover-suggested', interestId, ageId],
    enabled: tab === 'suggested',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_suggested_videos', {
        p_interest_id: interestId,
        p_age_id: ageId,
        p_limit: 50,
        p_offset: 0,
      })
      if (error) throw error
      return (data || []) as DVideo[]
    },
  })

  const { data: yours = [], isLoading: yoursLoading, refetch: refetchYours } = useQuery<DVideo[]>({
    queryKey: ['discover-yours', userId, interestId, ageId],
    enabled: tab === 'yours' && !!userId,
    queryFn: async () => {
      const { data: pls } = await supabase.from('playlists').select('id').eq('user_id', userId!)
      const ids = (pls || []).map((p: any) => p.id)
      if (ids.length === 0) return []
      const { data, error } = await supabase
        .from('playlist_videos')
        .select('video:videos(id, title, thumbnail_url, channel_name, source, youtube_id, duration_seconds, age_id, interest_id)')
        .in('playlist_id', ids)
        .limit(100)
      if (error) throw error
      const videos = (data || []).map((row: any) => row.video).filter(Boolean) as DVideo[]
      return videos.filter(v =>
        (!interestId || v.interest_id === interestId) &&
        (!ageId      || v.age_id === ageId)
      )
    },
  })

  const addMut = useMutation({
    mutationFn: async (vars: { videoId: string; playlistId: string }) => {
      const { data: existing } = await supabase
        .from('playlist_videos')
        .select('position')
        .eq('playlist_id', vars.playlistId)
        .order('position', { ascending: false })
        .limit(1)
      const nextPos = (existing?.[0]?.position ?? -1) + 1
      const { error } = await supabase.from('playlist_videos').insert({
        playlist_id: vars.playlistId, video_id: vars.videoId, position: nextPos,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      setAddedIds(prev => new Set(prev).add(vars.videoId))
      qc.invalidateQueries({ queryKey: ['discover-yours'] })
      Toast.show({ type: 'success', text1: ar ? '✅ تمت الإضافة' : '✅ Added' })
    },
    onError: (err: any) => {
      const msg = err?.message || ''
      if (msg.includes('duplicate')) {
        Toast.show({ type: 'info', text1: ar ? 'موجود بالفعل' : 'Already added' })
      } else {
        Toast.show({ type: 'error', text1: ar ? 'فشلت الإضافة' : 'Add failed', text2: msg })
      }
    },
  })

  const handleAdd = async (video: DVideo) => {
    if (!userId) {
      Toast.show({ type: 'error', text1: ar ? 'سجّل دخولك أولاً' : 'Sign in first' })
      return
    }
    const { data: pls } = await supabase
      .from('playlists').select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    const playlists = pls || []

    if (playlists.length === 0) {
      const { data: newPl, error } = await supabase
        .from('playlists')
        .insert({ user_id: userId, name: ar ? 'المفضلة' : 'Favorites' })
        .select().single()
      if (error) { Toast.show({ type: 'error', text1: error.message }); return }
      addMut.mutate({ videoId: video.id, playlistId: newPl.id })
      return
    }
    if (playlists.length === 1) {
      addMut.mutate({ videoId: video.id, playlistId: playlists[0].id })
      return
    }
    setPickerVideo(video)
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await (tab === 'suggested' ? refetchSuggested() : refetchYours()) } catch {}
    setRefreshing(false)
  }, [tab, refetchSuggested, refetchYours])

  const videos      = tab === 'suggested' ? suggested : yours
  const isLoading   = tab === 'suggested' ? suggLoading : yoursLoading
  const hasFilters  = interestId !== null || ageId !== null

  return (
    <KeyboardScreen variant="simple" style={{ flex: 1, backgroundColor: '#F8F9FB' }}>
      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
      }}>
        <TabButton
          active={tab === 'suggested'} onPress={() => setTab('suggested')}
          icon="sparkles" label={ar ? 'مقترح لك' : 'Suggested for you'}
        />
        <TabButton
          active={tab === 'yours'} onPress={() => setTab('yours')}
          icon="heart" label={ar ? 'محتواك' : 'Your content'}
          color={colors.secondary}
        />
      </View>

      {/* ── Filter Chips ──────────────────────────────────────────── */}
      <View style={{ backgroundColor: '#fff', paddingTop: 12, paddingBottom: 14,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
        <FilterRow
          label={ar ? 'الاهتمامات' : 'Interests'}
          items={[
            { id: null, label: ar ? 'الكل' : 'All' },
            ...interests.map(i => ({ id: i.id, label: ar ? i.name_ar : i.name_en, icon: i.icon })),
          ]}
          selectedId={interestId}
          onSelect={(id) => setInterestId(interestId === id ? null : id)}
          color={colors.primary}
        />
        <FilterRow
          label={ar ? 'العمر' : 'Age'}
          items={[
            { id: null, label: ar ? 'الكل' : 'All' },
            ...ages.map(a => ({ id: a.id, label: ar ? a.name_ar : a.name_en })),
          ]}
          selectedId={ageId}
          onSelect={(id) => setAgeId(ageId === id ? null : id)}
          color={colors.secondary}
        />
      </View>

      {/* ── Filter summary ────────────────────────────────────────── */}
      {hasFilters && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: spacing.lg, paddingVertical: 8, backgroundColor: '#fff',
          borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>
            {ar ? `${videos.length} نتيجة` : `${videos.length} results`}
          </Text>
          <Pressable onPress={() => { setInterestId(null); setAgeId(null) }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="close-circle" size={14} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
              {ar ? 'مسح الفلاتر' : 'Clear filters'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Grid ──────────────────────────────────────────────────── */}
      {isLoading && videos.length === 0 ? (
        <SkeletonGrid />
      ) : videos.length === 0 ? (
        <EmptyState tab={tab} hasFilters={hasFilters} ar={ar} onChangeTab={() => setTab('suggested')} />
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          numColumns={2}
          columnWrapperStyle={{ gap: CARD_GAP, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 100, gap: CARD_GAP }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <VideoCard
              video={item}
              ar={ar}
              added={addedIds.has(item.id)}
              adding={addMut.isPending && addMut.variables?.videoId === item.id}
              onAdd={() => handleAdd(item)}
              onPress={() => router.push({ pathname: '/feed', params: { videoId: item.id } })}
            />
          )}
        />
      )}

      {pickerVideo && userId && (
        <PlaylistPicker
          userId={userId}
          ar={ar}
          onClose={() => setPickerVideo(null)}
          onPick={(plId) => {
            addMut.mutate({ videoId: pickerVideo.id, playlistId: plId })
            setPickerVideo(null)
          }}
        />
      )}
    </KeyboardScreen>
  )
}

// ════════════════════════════════════════════════════════════════════════════
function TabButton({ active, onPress, icon, label, color = colors.primary }: {
  active: boolean; onPress: () => void; icon: string; label: string; color?: string
}) {
  return (
    <Pressable onPress={onPress}
      style={{ flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3,
        borderBottomColor: active ? color : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon as any} size={16} color={active ? color : '#9CA3AF'} />
        <Text style={{ fontWeight: '800', fontSize: 14, color: active ? color : '#9CA3AF' }}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

function FilterRow({ label, items, selectedId, onSelect, color }: {
  label: string
  items: { id: number | null; label: string; icon?: string | null }[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  color: string
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: '#9CA3AF',
        letterSpacing: 1, paddingHorizontal: spacing.lg, marginBottom: 6 }}>
        {label.toUpperCase()}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 8 }}>
        {items.map((it) => {
          const active = selectedId === it.id
          return (
            <Pressable
              key={String(it.id)}
              onPress={() => onSelect(it.id)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
                backgroundColor: active ? color : '#fff',
                borderWidth: 2, borderColor: active ? color : '#E5E7EB',
                opacity: pressed ? 0.7 : 1,
                ...(active ? { elevation: 3, shadowColor: color, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 } : {}),
              })}
            >
              {it.icon && <Text style={{ fontSize: 14 }}>{it.icon}</Text>}
              <Text style={{
                fontWeight: '700', fontSize: 13,
                color: active ? '#fff' : '#374151',
              }}>{it.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

function VideoCard({ video, ar, added, adding, onAdd, onPress }: {
  video: DVideo; ar: boolean; added: boolean; adding: boolean
  onAdd: () => void; onPress: () => void
}) {
  const thumb = video.thumbnail_url
    || (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg` : null)

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: radius.lg, overflow: 'hidden',
      borderWidth: 1, borderColor: '#E5E7EB' }}>
      <Pressable onPress={onPress}>
        <View style={{ aspectRatio: 16/9, backgroundColor: '#F3F4F6' }}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="videocam" size={28} color="#D1D5DB" />
            </View>
          )}
          {video.duration_seconds != null && video.duration_seconds > 0 && (
            <View style={{ position: 'absolute', bottom: 6, right: 6,
              backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
                {Math.floor(video.duration_seconds / 60)}:{String(video.duration_seconds % 60).padStart(2,'0')}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      <View style={{ padding: 10, gap: 8 }}>
        <Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 13, lineHeight: 17, color: '#111827' }}>
          {video.title}
        </Text>
        {video.channel_name && (
          <Text numberOfLines={1} style={{ fontSize: 11, color: '#6B7280' }}>
            {video.channel_name}
          </Text>
        )}
        <Pressable
          onPress={onAdd}
          disabled={added || adding}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
            paddingVertical: 8, borderRadius: radius.md,
            backgroundColor: added ? '#DCFCE7' : colors.primary,
            opacity: pressed ? 0.85 : 1,
            borderWidth: added ? 1 : 0,
            borderColor: added ? '#86EFAC' : 'transparent',
          })}
        >
          {adding ? <ActivityIndicator size="small" color="#fff" />
            : added ? <><Ionicons name="checkmark" size={14} color="#15803D" />
                <Text style={{ color: '#15803D', fontWeight: '800', fontSize: 12 }}>
                  {ar ? 'تمت الإضافة' : 'Added'}
                </Text></>
            : <><Ionicons name="add" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                  {ar ? 'إضافة' : 'Add'}
                </Text></>
          }
        </Pressable>
      </View>
    </View>
  )
}

function SkeletonGrid() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: spacing.lg, gap: CARD_GAP }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{
          width: '48%', backgroundColor: '#F3F4F6', borderRadius: radius.lg,
          aspectRatio: 0.75, opacity: 0.6,
        }} />
      ))}
    </View>
  )
}

function EmptyState({ tab, hasFilters, ar, onChangeTab }: {
  tab: Tab; hasFilters: boolean; ar: boolean; onChangeTab: () => void
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingTop: 60 }}>
      <Text style={{ fontSize: 64, marginBottom: 12 }}>{tab === 'suggested' ? '🎬' : '⭐'}</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 4 }}>
        {tab === 'suggested'
          ? (ar ? 'مفيش فيديوهات' : 'No videos')
          : (ar ? 'مفيش محتوى محفوظ' : 'Nothing saved yet')}
      </Text>
      <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', maxWidth: 280, lineHeight: 19 }}>
        {tab === 'suggested'
          ? (hasFilters
              ? (ar ? 'جرّب تغيير الفلتر' : 'Try changing the filters')
              : (ar ? 'هتظهر لما يتم إضافتها' : 'Will appear once content is added'))
          : (ar ? 'ضيف فيديوهات من تبويب "مقترح لك"' : 'Add videos from the Suggested tab')}
      </Text>
      {tab === 'yours' && (
        <Pressable onPress={onChangeTab}
          style={({ pressed }) => ({
            marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100,
            backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1,
          })}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>
            {ar ? 'اكتشف المحتوى' : 'Discover content'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

function PlaylistPicker({ userId, ar, onClose, onPick }: {
  userId: string; ar: boolean
  onClose: () => void; onPick: (id: string) => void
}) {
  const { data: pls = [] } = useQuery({
    queryKey: ['user-playlists-picker', userId],
    queryFn: async () => {
      const { data } = await supabase.from('playlists')
        .select('id, name')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 50 }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: spacing.lg, paddingBottom: 30, maxHeight: '70%' }}>
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <View style={{ width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2 }} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 12 }}>
          {ar ? 'إضافة إلى قائمة' : 'Add to playlist'}
        </Text>
        <ScrollView>
          {pls.map((p: any) => (
            <Pressable key={p.id} onPress={() => onPick(p.id)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderRadius: radius.lg,
                borderWidth: 2, borderColor: '#E5E7EB', marginBottom: 8,
                opacity: pressed ? 0.7 : 1,
                backgroundColor: pressed ? '#FAFAFA' : '#fff',
              })}>
              <View style={{ width: 44, height: 44, borderRadius: 12,
                backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 22 }}>🎵</Text>
              </View>
              <Text style={{ flex: 1, fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{p.name}</Text>
              <Ionicons name="add-circle" size={26} color={colors.primary} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  )
}
