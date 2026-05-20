import BannerAd from '@/components/BannerAd'
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface PlaylistVideo {
  id: string
  position: number
  videos: {
    id: string
    title: string | null
    youtube_id: string | null
    thumbnail_url: string | null
    channel_name: string | null
    duration_seconds: number | null
  } | null
}

export default function PlaylistDetailScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const qc = useQueryClient()

  const { data: playlist } = useQuery({
    queryKey: ['playlist', id],
    queryFn: async () => {
      const { data } = await supabase.from('playlists').select('*').eq('id', id).single()
      return data
    },
  })

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['playlist-videos', id],
    queryFn: async (): Promise<PlaylistVideo[]> => {
      const { data, error } = await supabase
        .from('playlist_videos')
        .select('id, position, videos(id, title, youtube_id, thumbnail_url, channel_name, duration_seconds)')
        .eq('playlist_id', id)
        .order('position', { ascending: true })
      if (error) throw error
      return (data || []) as any
    },
  })

  const handleRemove = (pvId: string) => {
    Alert.alert(
      'حذف الفيديو',
      'هل أنت متأكد؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('playlist_videos').delete().eq('id', pvId)
              await qc.invalidateQueries({ queryKey: ['playlist-videos', id] })
              Toast.show({ type: 'success', text1: 'تم الحذف' })
            } catch (err) {
              Toast.show({ type: 'error', text1: (err as Error).message })
            }
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }} numberOfLines={1}>
            {playlist?.name || '...'}
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }}>
            {videos.length} فيديو
          </Text>
        </View>
      </View>

      {/* Play all + Add */}
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.md }}>
        <Pressable
          onPress={() => {
            if (videos.length === 0) {
              Toast.show({ type: 'info', text1: 'لا توجد فيديوهات بعد' })
              return
            }
            router.push(`/playlist/${id}/play`)
          }}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: colors.primary,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="play" size={20} color={colors.white} />
          <Text style={{ color: colors.white, fontWeight: '800' }}>تشغيل</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/playlist/${id}/add`)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: `${colors.primary}15`,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.pill,
            borderWidth: 1, borderColor: `${colors.primary}30`,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '800' }}>إضافة</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : videos.length === 0 ? (
          <View style={{ alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl }}>
            <Ionicons name="videocam-outline" size={64} color={colors.grey200} />
            <Text style={{ color: colors.grey700, marginTop: spacing.md, fontSize: fontSize.base, fontWeight: '700' }}>
              قائمة التشغيل فاضية
            </Text>
            <Text style={{ color: colors.grey600, fontSize: fontSize.sm, marginTop: 4, textAlign: 'center' }}>
              اضغط "إضافة" لتضيف فيديوهات من YouTube
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {videos.map((pv, idx) => {
              const video = pv.videos
              if (!video) return null
              return (
                <View
                  key={pv.id}
                  style={{
                    flexDirection: 'row',
                    backgroundColor: colors.grey50,
                    borderRadius: radius.lg,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: colors.grey100,
                  }}
                >
                  <View style={{ width: 120, height: 80, backgroundColor: colors.black }}>
                    {video.thumbnail_url && (
                      <Image
                        source={{ uri: video.thumbnail_url }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    )}
                    <View
                      style={{
                        position: 'absolute', top: 4, left: 4,
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                      }}
                    >
                      <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>
                        #{idx + 1}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, padding: spacing.sm, justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900 }} numberOfLines={2}>
                      {video.title || 'فيديو بدون عنوان'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }} numberOfLines={1}>
                        {video.channel_name || 'YouTube'}
                      </Text>
                      <Pressable
                        onPress={() => handleRemove(pv.id)}
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.red} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
          <BannerAd variant="sticky" />
      </SafeAreaView>
  )
}
