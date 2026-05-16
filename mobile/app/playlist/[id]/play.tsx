import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, Dimensions, FlatList, Pressable, ActivityIndicator,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import YoutubePlayer from 'react-native-youtube-iframe'
import { useQuery } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize } from '@/lib/theme'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

interface FeedItem {
  id: string
  position: number
  videos: {
    id: string
    title: string | null
    youtube_id: string | null
    thumbnail_url: string | null
    channel_name: string | null
  } | null
}

export default function PlaylistFeed() {
  const router = useRouter()
  const { id: playlistId } = useLocalSearchParams<{ id: string }>()
  const [activeIndex, setActiveIndex] = useState(0)

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['playlist-feed', playlistId],
    queryFn: async (): Promise<FeedItem[]> => {
      const { data, error } = await supabase
        .from('playlist_videos')
        .select('id, position, videos(id, title, youtube_id, thumbnail_url, channel_name)')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data || []) as any
    },
  })

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index || 0)
    }
  }).current

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <StatusBar style="light" />
      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        renderItem={({ item, index }) => (
          <VideoItem item={item} isActive={index === activeIndex} index={index} total={videos.length} />
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Top close button */}
      <Pressable
        onPress={() => router.back()}
        style={{
          position: 'absolute',
          top: 50, left: spacing.md,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={24} color={colors.white} />
      </Pressable>
    </View>
  )
}

function VideoItem({ item, isActive, index, total }: { item: FeedItem; isActive: boolean; index: number; total: number }) {
  const [playing, setPlaying] = useState(false)
  const video = item.videos

  useEffect(() => {
    setPlaying(isActive)
  }, [isActive])

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false)
  }, [])

  if (!video) return <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }} />

  return (
    <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: colors.black }}>
      {video.youtube_id && (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <YoutubePlayer
            height={SCREEN_HEIGHT * 0.55}
            width={SCREEN_WIDTH}
            play={playing}
            videoId={video.youtube_id}
            onChangeState={onStateChange}
            webViewProps={{ allowsInlineMediaPlayback: true }}
          />
        </View>
      )}

      {/* Bottom overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xl + spacing.lg,
          paddingBottom: spacing.xl,
        }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, marginBottom: 6 }}>
          {index + 1} / {total}
        </Text>
        <Text style={{ color: colors.white, fontSize: fontSize.xs, opacity: 0.85 }}>
          @{video.channel_name || 'YouTube'}
        </Text>
        <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: 4 }} numberOfLines={2}>
          {video.title || 'فيديو KidTok'}
        </Text>
      </LinearGradient>
    </View>
  )
}
