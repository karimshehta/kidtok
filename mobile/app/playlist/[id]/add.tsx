import { useState, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

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
}

export default function AddVideoScreen() {
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const { id: playlistId } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YTResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

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

  const handleAdd = async (video: YTResult) => {
    const videoKey = video.youtube_id || video.video_id || ""
    if (addedIds.has(videoKey)) return   // already added — prevent double
    setAdding(videoKey)
    try {
      // Upsert video into videos table
      const { data: existingVideo } = await supabase
        .from('videos')
        .select('id')
        .eq('youtube_id', video.youtube_id || video.video_id || "")
        .maybeSingle()

      let videoId = existingVideo?.id
      if (!videoId) {
        const { data: inserted, error } = await supabase
          .from('videos')
          .insert({
            source: 'youtube',
            youtube_id: video.youtube_id || video.video_id || "",
            added_by: userId,
            title: video.title,
            thumbnail_url: video.thumbnail_url || video.thumbnail || "",
            channel_name: video.channel_name || video.channel || "",
            channel_id: video.channel_id,
            duration_seconds: video.duration_seconds,
            is_active: true,
          })
          .select('id')
          .single()
        if (error) throw error
        videoId = inserted.id
      }

      // Get max position
      const { data: lastPv } = await supabase
        .from('playlist_videos')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextPos = (lastPv?.position ?? -1) + 1

      const { error: pvError } = await supabase.from('playlist_videos').insert({
        playlist_id: playlistId,
        video_id: videoId,
        position: nextPos,
      })
      if (pvError && !pvError.message.includes('duplicate')) throw pvError

      setAddedIds(prev => { const s = new Set(prev); s.add(videoKey); return s })
      // Fix 2: invalidate playlist count on parent screen
      await qc.invalidateQueries({ queryKey: ['playlist-videos', playlistId] })
      await qc.invalidateQueries({ queryKey: ['playlists'] })
      Toast.show({ type: 'success', text1: 'تم إضافة الفيديو ✓' })
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setAdding(null)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          إضافة فيديو
        </Text>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.grey50,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            borderWidth: 1,
            borderColor: colors.grey100,
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

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
        {searching ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : results.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: spacing.xxl }}>
            <Ionicons name="logo-youtube" size={64} color={colors.grey200} />
            <Text style={{ color: colors.grey700, marginTop: spacing.md, fontWeight: '700' }}>
              ابحث عن فيديو لإضافته
            </Text>
            <Text style={{ color: colors.grey600, fontSize: fontSize.sm, marginTop: 4, textAlign: 'center' }}>
              النتائج آمنة ومناسبة للأطفال فقط
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {results.map((v) => (
              <View
                key={v.youtube_id || v.video_id}
                style={{
                  flexDirection: 'row',
                  backgroundColor: colors.grey50,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: colors.grey100,
                }}
              >
                {/* Thumbnail */}
                <View style={{ width: 120, height: 90, backgroundColor: colors.black }}>
                  <Image
                    source={{ uri: v.thumbnail_url || v.thumbnail }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>

                {/* Info + Add button */}
                <View style={{ flex: 1, padding: spacing.sm, gap: 4, justifyContent: 'space-between' }}>
                  <Text
                    style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900 }}
                    numberOfLines={2}
                  >
                    {v.title}
                  </Text>

                  <Text
                    style={{ fontSize: fontSize.xs, color: colors.grey600 }}
                    numberOfLines={1}
                  >
                    {v.channel_name || v.channel}
                  </Text>

                  {(() => {
                    const vKey = v.youtube_id || v.video_id || ''
                    const isAdded = addedIds.has(vKey)
                    const isAdding = adding === vKey
                    return (
                      <Pressable
                        onPress={() => handleAdd(v)}
                        disabled={isAdding || isAdded}
                        style={{
                          backgroundColor: isAdded ? colors.green : colors.primary,
                          paddingHorizontal: spacing.sm,
                          paddingVertical: 5,
                          borderRadius: radius.pill,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          alignSelf: 'flex-start',
                          opacity: isAdded ? 0.9 : 1,
                        }}
                      >
                        {isAdding ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : isAdded ? (
                          <>
                            <Ionicons name="checkmark" size={14} color={colors.white} />
                            <Text style={{ color: colors.white, fontSize: 12, fontWeight: '700' }}>تمت الإضافة</Text>
                          </>
                        ) : (
                          <>
                            <Ionicons name="add" size={14} color={colors.white} />
                            <Text style={{ color: colors.white, fontSize: 12, fontWeight: '700' }}>إضافة</Text>
                          </>
                        )}
                      </Pressable>
                    )
                  })()}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
