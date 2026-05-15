import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  Dimensions,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import YoutubePlayer from 'react-native-youtube-iframe'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

interface FeedVideo {
  id: string
  title: string | null
  source: 'youtube' | 'cloudflare'
  youtube_id: string | null
  cloudflare_uid: string | null
  thumbnail_url: string | null
  channel_name: string | null
  like_count: number
  view_count: number
}

export default function FeedScreen() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [tabBarHeight] = useState(60)

  const itemHeight = SCREEN_HEIGHT - tabBarHeight

  const { data: videos = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['feed', 'for-you'],
    queryFn: async (): Promise<FeedVideo[]> => {
      const { data, error } = await supabase
        .from('videos')
        .select('id, title, source, youtube_id, cloudflare_uid, thumbnail_url, channel_name, like_count, view_count')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data || []) as FeedVideo[]
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

  if (videos.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Ionicons name="film-outline" size={80} color={colors.grey400} />
        <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '700', marginTop: spacing.md }}>
          لا توجد فيديوهات بعد
        </Text>
        <Text style={{ color: colors.grey400, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.sm }}>
          سيتم إضافة محتوى قريباً
        </Text>
        <Pressable
          onPress={() => refetch()}
          style={{
            marginTop: spacing.lg,
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm + 2,
            borderRadius: radius.pill,
          }}
        >
          <Text style={{ color: colors.white, fontWeight: '700' }}>تحديث</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <FlatList
        data={videos}
        keyExtractor={(v) => v.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        renderItem={({ item, index }) => (
          <VideoItem video={item} isActive={index === activeIndex} height={itemHeight} />
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl tintColor={colors.white} refreshing={isFetching} onRefresh={refetch} />
        }
      />
    </View>
  )
}

function VideoItem({ video, isActive, height }: { video: FeedVideo; isActive: boolean; height: number }) {
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setPlaying(isActive)
  }, [isActive])

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false)
  }, [])

  return (
    <View style={{ width: SCREEN_WIDTH, height, backgroundColor: colors.black }}>
      {/* Video */}
      {video.source === 'youtube' && video.youtube_id ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <YoutubePlayer
            height={height * 0.6}
            width={SCREEN_WIDTH}
            play={playing}
            videoId={video.youtube_id}
            onChangeState={onStateChange}
            webViewProps={{ allowsInlineMediaPlayback: true }}
          />
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="play-circle" size={80} color={colors.grey400} />
        </View>
      )}

      {/* Bottom overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xl,
          paddingBottom: spacing.lg,
        }}
      >
        <Text style={{ color: colors.white, fontSize: fontSize.xs, opacity: 0.8 }}>
          @{video.channel_name || 'KidTok'}
        </Text>
        <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>
          {video.title || 'KidTok video'}
        </Text>
      </LinearGradient>

      {/* Right side actions */}
      <View style={{ position: 'absolute', right: spacing.md, bottom: 100, gap: spacing.lg, alignItems: 'center' }}>
        <ActionButton icon="heart" count={video.like_count} />
        <ActionButton icon="chatbubble" count={0} />
        <ActionButton icon="share-social" count={0} />
        <ActionButton icon="bookmark" count={0} />
      </View>
    </View>
  )
}

function ActionButton({ icon, count }: { icon: any; count: number }) {
  return (
    <Pressable style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 48, height: 48,
          borderRadius: 24,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={26} color={colors.white} />
      </View>
      {count > 0 && (
        <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '600' }}>
          {count > 999 ? `${Math.floor(count / 1000)}K` : count}
        </Text>
      )}
    </Pressable>
  )
}
