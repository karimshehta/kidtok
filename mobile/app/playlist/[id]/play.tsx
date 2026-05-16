import { useRef, useState } from 'react'
import {
  View, Text, Dimensions, FlatList, Pressable, ActivityIndicator, Image,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { WebView } from 'react-native-webview'

import { supabase } from '@/lib/supabase'
import { getYouTubeThumbnail } from '@/lib/youtube'
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
  const [muted, setMuted] = useState(false)

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
          <VideoItem item={item} isActive={index === activeIndex} index={index} total={videos.length} muted={muted} />
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
      <Pressable
        onPress={() => setMuted((value) => !value)}
        style={{
          position: 'absolute',
          top: 50, right: spacing.md,
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={colors.white} />
      </Pressable>
    </View>
  )
}

function PlaylistReelVideo({
  videoId,
  isActive,
  muted,
  poster,
}: {
  videoId: string
  isActive: boolean
  muted: boolean
  poster: string
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.black, overflow: 'hidden' }}>
      <Image
        source={{ uri: poster }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: isActive ? 0.35 : 1 }}
        resizeMode="cover"
        blurRadius={isActive ? 18 : 0}
      />
      {isActive ? (
        <WebView
          originWhitelist={['*']}
          source={{ html: getYouTubeEmbedHtml(videoId, muted) }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          containerStyle={{ position: 'absolute', inset: 0, backgroundColor: 'transparent' }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo={false}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.toLowerCase()
            return !url.includes('/watch') && !url.includes('youtube.com/redirect')
          }}
        />
      ) : (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={34} color={colors.white} style={{ marginLeft: 4 }} />
          </View>
        </View>
      )}
    </View>
  )
}

function getYouTubeEmbedHtml(videoId: string, muted: boolean) {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${videoId}`
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}
iframe{position:absolute;left:50%;top:50%;width:177.78vh;height:100vh;min-width:100vw;min-height:56.25vw;transform:translate(-50%,-50%);border:0}
</style>
</head>
<body>
<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`
}

function VideoItem({ item, isActive, index, total, muted }: { item: FeedItem; isActive: boolean; index: number; total: number; muted: boolean }) {
  const video = item.videos

  if (!video) return <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }} />

  return (
    <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: colors.black }}>
      {video.youtube_id && (
        <PlaylistReelVideo
          videoId={video.youtube_id}
          isActive={isActive}
          muted={muted}
          poster={video.thumbnail_url || getYouTubeThumbnail(video.youtube_id, 'max')}
        />
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
