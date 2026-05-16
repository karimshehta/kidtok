import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, Dimensions, FlatList, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import YoutubePlayer from 'react-native-youtube-iframe'
import { useQuery } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useMyVideoInteraction, useToggleVideoInteraction } from '@/hooks/useSocial'
import { useIsCreator } from '@/hooks/useMyRole'
import CommentsSheet from '@/components/CommentsSheet'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
const TAB_BAR_HEIGHT = 60

type FeedTab = 'foryou' | 'following'

interface FeedVideo {
  id: string
  title: string | null
  source: string
  youtube_id: string | null
  cloudflare_uid: string | null
  thumbnail_url: string | null
  channel_name: string | null
  channel_id: string | null
  like_count: number
  view_count: number
  comment_count: number
}

export default function FeedScreen() {
  const [tab, setTab] = useState<FeedTab>('foryou')
  const [activeIndex, setActiveIndex] = useState(0)
  const [commentsForVideo, setCommentsForVideo] = useState<string | null>(null)
  const userId = useAuth((s) => s.user?.id)
  const isCreator = useIsCreator()
  const router = useRouter()
  const itemHeight = SCREEN_HEIGHT - TAB_BAR_HEIGHT

  const { data: videos = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['feed', tab, userId],
    queryFn: async (): Promise<FeedVideo[]> => {
      if (tab === 'following') {
        // get followed creator ids first
        const { data: follows } = await supabase
          .from('creator_follows')
          .select('creator_id')
          .eq('follower_id', userId)
        const ids = (follows || []).map((f) => f.creator_id)
        if (ids.length === 0) return []
        const { data } = await supabase
          .from('videos')
          .select('id, title, source, youtube_id, cloudflare_uid, thumbnail_url, channel_name, channel_id, like_count, view_count, comment_count')
          .in('uploaded_by', ids)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(20)
        return (data || []) as FeedVideo[]
      }
      const { data } = await supabase
        .from('videos')
        .select('id, title, source, youtube_id, cloudflare_uid, thumbnail_url, channel_name, channel_id, like_count, view_count, comment_count')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20)
      return (data || []) as FeedVideo[]
    },
  })

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index || 0)
  }).current

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      {/* Top tabs (For You / Following) */}
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.sm }}>
          <TabBtn label="لك" active={tab === 'foryou'} onPress={() => setTab('foryou')} />
          <TabBtn label="أتابع" active={tab === 'following'} onPress={() => setTab('following')} />
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : videos.length === 0 ? (
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <Ionicons name="film-outline" size={80} color={colors.grey400} />
          <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.md }}>
            {tab === 'following' ? 'لا تتابع أحداً بعد' : 'لا فيديوهات بعد'}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={{ marginTop: spacing.lg, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radius.pill }}
          >
            <Text style={{ color: colors.white, fontWeight: '700' }}>تحديث</Text>
          </Pressable>
        </SafeAreaView>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(v) => v.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={itemHeight}
          decelerationRate="fast"
          renderItem={({ item, index }) => (
            <VideoItem
              video={item}
              isActive={index === activeIndex}
              height={itemHeight}
              onOpenComments={() => setCommentsForVideo(item.id)}
            />
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={<RefreshControl tintColor={colors.white} refreshing={isFetching} onRefresh={refetch} />}
        />
      )}

      {/* Record FAB — only visible for creators / admins */}
      {isCreator && (
        <Pressable
          onPress={() => router.push('/creator/record')}
          style={({ pressed }) => ({
            position: 'absolute',
            right: spacing.lg,
            bottom: 100,
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: colors.secondary,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          <Ionicons name="videocam" size={28} color={colors.white} />
        </Pressable>
      )}

      {commentsForVideo && (
        <CommentsSheet
          videoId={commentsForVideo}
          visible={!!commentsForVideo}
          onClose={() => setCommentsForVideo(null)}
        />
      )}
    </View>
  )
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Text
        style={{
          color: active ? colors.white : 'rgba(255,255,255,0.6)',
          fontSize: fontSize.base,
          fontWeight: active ? '900' : '600',
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        }}
      >
        {label}
      </Text>
      {active && (
        <View
          style={{
            height: 3, width: 32,
            backgroundColor: colors.white,
            borderRadius: 2,
            marginTop: 4,
            alignSelf: 'center',
          }}
        />
      )}
    </Pressable>
  )
}

function VideoItem({
  video, isActive, height, onOpenComments,
}: { video: FeedVideo; isActive: boolean; height: number; onOpenComments: () => void }) {
  const router = useRouter()
  const [playing, setPlaying] = useState(false)
  const { data: myInteraction } = useMyVideoInteraction(video.id)
  const toggleMut = useToggleVideoInteraction()

  useEffect(() => { setPlaying(isActive) }, [isActive])

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false)
  }, [])

  const handleLike = () => {
    toggleMut.mutate({ videoId: video.id, type: 'like' })
  }

  const handleDislike = () => {
    toggleMut.mutate({ videoId: video.id, type: 'dislike' })
  }

  const openCreator = () => {
    if (video.channel_id) router.push(`/creator/${video.channel_id}`)
  }

  return (
    <View style={{ width: SCREEN_WIDTH, height, backgroundColor: colors.black }}>
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
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg }}
      >
        <Pressable onPress={openCreator}>
          <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>
            @{video.channel_name || 'KidTok'}
          </Text>
        </Pressable>
        <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>
          {video.title || 'KidTok video'}
        </Text>
      </LinearGradient>

      {/* Right side actions */}
      <View style={{ position: 'absolute', right: spacing.md, bottom: 110, gap: spacing.lg, alignItems: 'center' }}>
        <ActionButton
          icon={myInteraction === 'like' ? 'heart' : 'heart-outline'}
          count={video.like_count}
          active={myInteraction === 'like'}
          activeColor={colors.secondary}
          onPress={handleLike}
        />
        <ActionButton
          icon={myInteraction === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'}
          count={0}
          active={myInteraction === 'dislike'}
          onPress={handleDislike}
        />
        <ActionButton
          icon="chatbubble"
          count={video.comment_count}
          onPress={onOpenComments}
        />
        <ActionButton icon="gift" count={0} onPress={() => Toast.show({ type: 'info', text1: 'الهدايا - قريباً' })} />
      </View>
    </View>
  )
}

function ActionButton({
  icon, count, active, activeColor, onPress,
}: { icon: any; count: number; active?: boolean; activeColor?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 48, height: 48, borderRadius: 24,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={26} color={active ? (activeColor || colors.primary) : colors.white} />
      </View>
      {count > 0 && (
        <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '600' }}>
          {count > 999 ? `${Math.floor(count / 1000)}K` : count}
        </Text>
      )}
    </Pressable>
  )
}
