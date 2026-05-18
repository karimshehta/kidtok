import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Dimensions,
  Pressable,
  ActivityIndicator,
  Modal,
  Image,
  ScrollView,
  PanResponder,
  Animated,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'
import { WebView } from 'react-native-webview'
import { useTranslation } from 'react-i18next'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useMyVideoInteraction, useToggleVideoInteraction } from '@/hooks/useSocial'
import CommentsSheet from '@/components/CommentsSheet'
import ChildAvatar from '@/components/ChildAvatar'
import { getYouTubeThumbnail } from '@/lib/youtube'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import { onHeaderPageChange, headerAnimHeight, HEADER_BAR_HEIGHT } from '@/lib/headerScroll'
import { usePlanLimits } from '@/hooks/usePlanLimits'
import { useIsFollowing, useToggleFollow } from '@/hooks/useSocial'
import { useAdMob } from '@/hooks/useAdMob'
import DailyRewardModal from '@/components/DailyRewardModal'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
const KIDTOK_ORIGIN = 'https://kidtok.vercel.app'

type FeedTab = 'foryou' | 'following'

interface FeedVideo {
  id: string
  title: string | null
  source: string
  youtube_id: string | null
  thumbnail_url: string | null
  channel_name: string | null
  channel_id: string | null
  creator_id: string | null
  creator_video_id: string | null
  like_count: number
  dislike_count: number
  view_count: number
  comment_count: number
  is_story: boolean | null
}

const FEED_SELECT =
  'id, title, source, youtube_id, thumbnail_url, channel_name, channel_id, creator_id, creator_video_id, like_count, dislike_count, view_count, comment_count, is_story, tags, category'

// ─── FeedScreen ───────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const [tab, setTab] = useState<FeedTab>('foryou')
  const [activeIndex, setActiveIndex] = useState(0)

  const { i18n } = useTranslation()
  const [muted, setMuted] = useState(true)
  const { data: planLimits } = usePlanLimits()
  const showAds = planLimits?.has_ads ?? true
  const { onVideoSwiped } = useAdMob()
  const [commentsForVideo, setCommentsForVideo] = useState<string | null>(null)
  const [playlistVideo, setPlaylistVideo] = useState<FeedVideo | null>(null)
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT)
  const userId = useAuth((s) => s.user?.id)
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const { data: videos = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['feed', tab, userId],
    queryFn: async (): Promise<FeedVideo[]> => {
      if (tab === 'following') {
        const { data: follows, error: followsError } = await supabase
          .from('creator_follows')
          .select('following_id')
          .eq('follower_id', userId)
        if (followsError) throw followsError
        const ids = (follows || []).map((f: any) => f.following_id)
        if (ids.length === 0) return []
        const { data, error } = await supabase
          .from('videos')
          .select(FEED_SELECT)
          .in('creator_id', ids)
          .eq('source', 'creator')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) throw error
        return (data || []) as FeedVideo[]
      }
      const { data, error } = await supabase
        .from('videos')
        .select(FEED_SELECT)
        .eq('is_active', true)
        .or('is_suggested.eq.true,source.eq.creator')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data || []) as FeedVideo[]
    },
  })

  const handleOpenComments = useCallback((id: string) => setCommentsForVideo(id), [])
  const handleOpenPlaylist = useCallback((v: FeedVideo) => setPlaylistVideo(v), [])
  const handleToggleMuted = useCallback(() => setMuted((v) => !v), [])
  const handleTabForYou = useCallback(() => { setTab('foryou'); setActiveIndex(0) }, [])
  const handleTabFollowing = useCallback(() => { setTab('following'); setActiveIndex(0) }, [])

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.black }}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {/* لك / أتابع — ثابتة دايماً، بتنزل مع GlobalHeader */}
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          zIndex: 99,
          alignItems: 'center',
          top: headerAnimHeight.interpolate({
            inputRange: [0, HEADER_BAR_HEIGHT],
            outputRange: [insets.top + 6, insets.top + HEADER_BAR_HEIGHT + 6],
          }),
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.xs, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.pill, padding: 3 }}>
          <TabBtn label={i18n.language === 'ar' ? 'لك' : 'For You'} active={tab === 'foryou'} onPress={handleTabForYou} />
          <TabBtn label={i18n.language === 'ar' ? 'أتابع' : 'Following'} active={tab === 'following'} onPress={handleTabFollowing} />
        </View>
      </Animated.View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : videos.length === 0 ? (
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          {tab === 'following' ? (
            <DiscoverUsers />
          ) : (
            <>
              <Ionicons name="film-outline" size={80} color={colors.grey400} />
              <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '700', marginTop: spacing.md }}>
                {i18n.language === 'ar' ? 'لا توجد فيديوهات بعد' : 'No videos yet'}
              </Text>
              <Pressable
                onPress={() => refetch()}
                style={{ marginTop: spacing.lg, backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, borderRadius: radius.pill }}
              >
                <Text style={{ color: colors.white, fontWeight: '700' }}>{i18n.language === 'ar' ? 'تحديث' : 'Refresh'}</Text>
              </Pressable>
            </>
          )}
        </SafeAreaView>
      ) : (
        <SwipeFeed
          key={tab}
          videos={videos}
          containerHeight={containerHeight}
          muted={muted}
          activeIndex={activeIndex}
          onIndexChange={(i) => { setActiveIndex(i); onHeaderPageChange(i) }}
          onOpenComments={handleOpenComments}
          onAddToPlaylist={handleOpenPlaylist}
          onToggleMute={handleToggleMuted}
          onVideoSwiped={onVideoSwiped}
        />
      )}

      {/* Daily reward popup */}
      <DailyRewardModal />

      {/* Record FAB moved to center tab bar */

      {commentsForVideo && (
        <CommentsSheet videoId={commentsForVideo} visible={!!commentsForVideo} onClose={() => setCommentsForVideo(null)} />
      )}
      <AddToPlaylistModal video={playlistVideo} visible={!!playlistVideo} onClose={() => setPlaylistVideo(null)} />
    </View>
  )
}

// ─── SwipeFeed ────────────────────────────────────────────────────────────────
// بدل FlatList: بنحرك Animated.Value واحدة والـ items كلها مثبتة بـ position:absolute
// ده بيمنع أي WebView من إنه يظهر في الـ item اللي فوقه أو تحته
function SwipeFeed({
  videos, containerHeight, muted, activeIndex, onIndexChange, onOpenComments, onAddToPlaylist, onToggleMute, onVideoSwiped,
}: {
  videos: FeedVideo[]
  containerHeight: number
  muted: boolean
  activeIndex: number
  onIndexChange: (i: number) => void
  onOpenComments: (id: string) => void
  onAddToPlaylist: (v: FeedVideo) => void
  onToggleMute: () => void
  onVideoSwiped: () => void
}) {
  const translateY = useRef(new Animated.Value(0)).current
  const currentIndexRef = useRef(0)
  const isAnimating = useRef(false)
  const totalRef = useRef(videos.length)
  totalRef.current = videos.length

  useEffect(() => {
    // reset لما الـ videos تتغير (مثلاً tab switch — SwipeFeed بيتعمل remount بـ key={tab})
    currentIndexRef.current = 0
    translateY.setValue(0)
  }, [])

  const snapTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, totalRef.current - 1))
    isAnimating.current = true
    Animated.timing(translateY, {
      toValue: -clamped * containerHeight,
      duration: 260,
      useNativeDriver: true,
    }).start(() => {
      isAnimating.current = false
      currentIndexRef.current = clamped
      onIndexChange(clamped)
    })
  }, [containerHeight, onIndexChange])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) =>
        !isAnimating.current && Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onMoveShouldSetPanResponderCapture: (_e, gs) =>
        !isAnimating.current && Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onPanResponderMove: (_e, gs) => {
        const base = -currentIndexRef.current * containerHeight
        const atStart = currentIndexRef.current === 0 && gs.dy > 0
        const atEnd = currentIndexRef.current === totalRef.current - 1 && gs.dy < 0
        const delta = (atStart || atEnd) ? gs.dy * 0.2 : gs.dy
        translateY.setValue(base + delta)
      },
      onPanResponderRelease: (_e, gs) => {
        const threshold = containerHeight * 0.18
        if (gs.dy < -threshold || gs.vy < -0.4) {
          snapTo(currentIndexRef.current + 1)
        } else if (gs.dy > threshold || gs.vy > 0.4) {
          snapTo(currentIndexRef.current - 1)
        } else {
          isAnimating.current = true
          Animated.spring(translateY, {
            toValue: -currentIndexRef.current * containerHeight,
            useNativeDriver: true,
            tension: 140,
            friction: 16,
          }).start(() => { isAnimating.current = false })
        }
      },
    })
  ).current

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} {...panResponder.panHandlers}>
      {videos.map((video, index) => {
        // نعمل render بس للـ item الحالي + السابق + التالي
        // Pre-cache 3 upcoming + 1 previous for smooth swipe
        const isNearby = index >= activeIndex - 1 && index <= activeIndex + 3
        return (
          <Animated.View
            key={video.id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: SCREEN_WIDTH,
              height: containerHeight,
              // كل item بيتحرك مع نفس الـ translateY ولكن بـ offset ثابت حسب index
              transform: [{
                translateY: translateY.interpolate({
                  inputRange: [-containerHeight * videos.length, containerHeight],
                  outputRange: [-containerHeight * videos.length + index * containerHeight, containerHeight + index * containerHeight],
                  extrapolate: 'extend',
                }),
              }],
              overflow: 'hidden',
            }}
          >
            {isNearby ? (
              <VideoItem
                video={video}
                isActive={index === activeIndex}
                height={containerHeight}
                muted={muted}
                onOpenComments={onOpenComments}
                onAddToPlaylist={onAddToPlaylist}
                onToggleMute={onToggleMute}
              />
            ) : (
              // placeholder خفيف للـ items البعيدة
              <View style={{ flex: 1, backgroundColor: '#000' }}>
                {video.thumbnail_url ? (
                  <Image source={{ uri: video.thumbnail_url }} style={{ width: '100%', height: '100%', opacity: 0.4 }} resizeMode="cover" blurRadius={10} />
                ) : null}
              </View>
            )}
          </Animated.View>
        )
      })}
    </View>
  )
}

// ─── TabBtn ───────────────────────────────────────────────────────────────────
const TabBtn = memo(function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: spacing.sm + 2, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: active ? colors.white : 'transparent' }}>
      <Text style={{ color: active ? colors.grey900 : 'rgba(255,255,255,0.75)', fontSize: fontSize.xs, fontWeight: active ? '900' : '600' }}>
        {label}
      </Text>
    </Pressable>
  )
})

// ─── VideoItem ────────────────────────────────────────────────────────────────
const VideoItem = memo(function VideoItem({
  video, isActive, height, muted, onOpenComments, onAddToPlaylist, onToggleMute,
}: {
  video: FeedVideo
  isActive: boolean
  height: number
  muted: boolean
  onOpenComments: (id: string) => void
  onAddToPlaylist: (v: FeedVideo) => void
  onToggleMute: () => void
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { data: myInteraction } = useMyVideoInteraction(video.id)
  const toggleMut = useToggleVideoInteraction()
  const isStory = !!video.is_story

  const cloudflareUid = video.source === 'creator'
    ? video.thumbnail_url?.match(/cloudflarestream\.com\/([^/]+)/)?.[1] || null
    : null
  const poster = video.thumbnail_url || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id, 'max') : null)

  const openCreator = useCallback(() => {
    const id = video.creator_id || video.channel_id
    if (id) router.push(`/creator/${id}`)
  }, [video.creator_id, video.channel_id])

  const handleLike = useCallback(() => toggleMut.mutate({ videoId: video.id, type: 'like' }), [video.id])
  const handleDislike = useCallback(() => toggleMut.mutate({ videoId: video.id, type: 'dislike' }), [video.id])
  const handleComments = useCallback(() => onOpenComments(video.id), [video.id, onOpenComments])
  const handlePlaylist = useCallback(() => onAddToPlaylist(video), [video, onAddToPlaylist])
  const handleGift = useCallback(() => Toast.show({ type: 'info', text1: 'الهدايا قريبا' }), [])

  const videoContent = video.source === 'youtube' && video.youtube_id ? (
    <ReelWebVideo isActive={isActive} poster={poster} html={getYouTubeEmbedHtml(video.youtube_id)} muted={muted} />
  ) : cloudflareUid ? (
    <ReelWebVideo
      isActive={isActive}
      poster={poster}
      uri={`https://iframe.cloudflarestream.com/${cloudflareUid}?autoplay=true&muted=${muted ? 'true' : 'false'}&controls=false&loop=true`}
      muted={muted}
    />
  ) : (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
      <Ionicons name="play-circle" size={80} color={colors.grey400} />
    </View>
  )

  // ── Story layout ────────────────────────────────────────────────────────────
  if (isStory) {
    return (
      <View style={{ width: SCREEN_WIDTH, height, backgroundColor: '#000', overflow: 'hidden' }}>
        {videoContent}

        {/* Gradient أعلى للـ channel info */}
        <LinearGradient
          colors={['rgba(0,0,0,0.72)', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 52, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        >
          {/* شريط التقدم */}
          <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: spacing.md, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: isActive ? '100%' : '0%', backgroundColor: colors.white, borderRadius: 2 }} />
          </View>
          {/* اسم الـ channel */}
          <Pressable onPress={openCreator} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white }}>
              <Ionicons name="person" size={18} color={colors.white} />
            </View>
            <View>
              <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.sm }}>@{video.channel_name || 'KidTok'}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>ستوري</Text>
            </View>
          </Pressable>
        </LinearGradient>

        {/* Gradient أسفل للعنوان والأزرار */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.82)']}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: insets.bottom + spacing.lg, paddingTop: spacing.xl * 2, paddingHorizontal: spacing.lg }}
        >
          {video.title ? (
            <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '700', marginBottom: spacing.md }} numberOfLines={3}>
              {video.title}
            </Text>
          ) : null}
          {/* أزرار أفقية زي IG Stories */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <StoryActionBtn icon={myInteraction === 'like' ? 'heart' : 'heart-outline'} count={video.like_count} active={myInteraction === 'like'} activeColor={colors.secondary} onPress={handleLike} />
            <StoryActionBtn icon="chatbubble-outline" count={video.comment_count} onPress={handleComments} />
            <StoryActionBtn icon="add-circle-outline" count={0} onPress={handlePlaylist} />
            <StoryActionBtn icon="gift-outline" count={0} onPress={handleGift} />
          </View>
        </LinearGradient>
      </View>
    )
  }

  // ── Normal video layout (TikTok-style) ──────────────────────────────────────
  return (
    <View style={{ width: SCREEN_WIDTH, height, backgroundColor: '#000', overflow: 'hidden' }}>
      {videoContent}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 16 + insets.bottom }}
      >
        {video.category === 'parent_pick' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, backgroundColor: 'rgba(3,187,229,0.2)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(3,187,229,0.4)' }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }}>
              <Ionicons name="star" size={7} color="#fff" style={{ transform: [{ rotate: '-45deg' }] }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>KidTok Picks</Text>
          </View>
        )}
        <Pressable onPress={openCreator}>
          <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>
            {video.category === 'parent_pick' ? '🌟 KidTok' : `@${video.channel_name || 'KidTok'}`}
          </Text>
        </Pressable>
        <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>
          {video.title || 'KidTok video'}
        </Text>
        {/* Hashtags */}
        {video.tags && video.tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {video.tags.slice(0, 5).map((tag) => (
              <Text key={tag} style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' }}>
                #{tag}
              </Text>
            ))}
          </View>
        )}
      </LinearGradient>

      <View style={{ position: 'absolute', right: spacing.md, bottom: 90 + insets.bottom, gap: spacing.lg, alignItems: 'center' }}>
        <ActionButton icon={myInteraction === 'like' ? 'heart' : 'heart-outline'} count={video.like_count} active={myInteraction === 'like'} activeColor={colors.secondary} onPress={handleLike} />
        <ActionButton icon={myInteraction === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'} count={video.dislike_count} active={myInteraction === 'dislike'} onPress={handleDislike} />
        <ActionButton icon="chatbubble" count={video.comment_count} onPress={handleComments} />
        <ActionButton icon="add" count={0} onPress={handlePlaylist} />
        <ActionButton icon="gift" count={0} onPress={handleGift} />
        <ActionButton icon={muted ? 'volume-mute' : 'volume-high'} count={0} onPress={onToggleMute} />
      </View>
    </View>
  )
})

// ─── ReelWebVideo ─────────────────────────────────────────────────────────────
const ReelWebVideo = memo(function ReelWebVideo({
  isActive, poster, html, uri, muted,
}: {
  isActive: boolean
  poster: string | null
  html?: string
  uri?: string
  muted: boolean
}) {
  const webViewRef = useRef<any>(null)

  const syncYouTubeAudio = useCallback(() => {
    if (!html) return
    webViewRef.current?.injectJavaScript(getYouTubeAudioCommand(muted))
  }, [html, muted])

  useEffect(() => {
    if (isActive && html) syncYouTubeAudio()
  }, [muted, isActive, html, syncYouTubeAudio])

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {poster && (
        <Image
          source={{ uri: poster }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: isActive ? 0.3 : 0.9 }}
          resizeMode="cover"
          blurRadius={isActive ? 20 : 2}
        />
      )}

      {/* WebView يتعمل mount بس لما isActive = true — ده الحل الجذري للـ bleeding */}
      {isActive && (html || uri) && (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={html ? { html, baseUrl: KIDTOK_ORIGIN } : { uri: uri! }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo={false}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          cacheEnabled
          thirdPartyCookiesEnabled
          userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onLoadEnd={syncYouTubeAudio}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.toLowerCase()
            if (url.includes('youtube.com/watch') || url.includes('youtube.com/redirect')) return false
            return true
          }}
        />
      )}

      {!isActive && (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={34} color={colors.white} style={{ marginLeft: 4 }} />
          </View>
        </View>
      )}
    </View>
  )
})

// ─── helpers ──────────────────────────────────────────────────────────────────
function getYouTubeAudioCommand(muted: boolean) {
  const command = muted ? 'mute' : 'unMute'
  return `
(function(){
  function sendAudioCommand(){
    var player = document.getElementById('kidtok-player');
    if (player && player.contentWindow) {
      player.contentWindow.postMessage(JSON.stringify({event:'command',func:'${command}',args:[]}), '*');
    }
  }
  sendAudioCommand();
  setTimeout(sendAudioCommand, 250);
  setTimeout(sendAudioCommand, 800);
})();
true;
`
}

function getYouTubeEmbedHtml(videoId: string) {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${videoId}&enablejsapi=1&origin=${encodeURIComponent(KIDTOK_ORIGIN)}`
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{position:absolute;left:50%;top:50%;width:177.78vh;height:100vh;min-width:100vw;min-height:56.25vw;transform:translate(-50%,-50%);border:0}
</style>
</head>
<body>
<iframe id="kidtok-player" src="${src}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="origin-when-cross-origin" allowfullscreen></iframe>
</body>
</html>`
}

// ─── ActionButton (عمودي — للـ normal video) ──────────────────────────────────
const ActionButton = memo(function ActionButton({
  icon, count, active, activeColor, onPress,
}: { icon: any; count: number; active?: boolean; activeColor?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={26} color={active ? (activeColor || colors.primary) : colors.white} />
      </View>
      {count > 0 && (
        <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '600' }}>
          {count > 999 ? `${Math.floor(count / 1000)}K` : count}
        </Text>
      )}
    </Pressable>
  )
})

// ─── StoryActionBtn (أفقي — للـ story) ───────────────────────────────────────
const StoryActionBtn = memo(function StoryActionBtn({
  icon, count, active, activeColor, onPress,
}: { icon: any; count: number; active?: boolean; activeColor?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill }}>
      <Ionicons name={icon} size={20} color={active ? (activeColor || colors.primary) : colors.white} />
      {count > 0 && (
        <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '700' }}>
          {count > 999 ? `${Math.floor(count / 1000)}K` : count}
        </Text>
      )}
    </Pressable>
  )
})

// ─── AddToPlaylistModal ───────────────────────────────────────────────────────
function AddToPlaylistModal({ video, visible, onClose }: { video: FeedVideo | null; visible: boolean; onClose: () => void }) {
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const { data: children = [] } = useQuery({
    queryKey: ['children-for-add-video', userId],
    enabled: visible && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('children').select('id, name, gender, image_url, age:ages(name_ar, name_en)')
        .eq('parent_id', userId).order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const { data: playlists = [], isLoading: playlistsLoading } = useQuery({
    queryKey: ['playlists-for-add-video', selectedChildId],
    enabled: visible && !!selectedChildId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlists').select('id, name, playlist_videos(id)')
        .eq('child_id', selectedChildId).order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((p: any) => ({ id: p.id, name: p.name, video_count: p.playlist_videos?.length || 0 }))
    },
  })

  const handleClose = () => { setSelectedChildId(null); setAddingId(null); setAddedIds(new Set()); onClose() }

  const addToPlaylist = async (playlistId: string) => {
    if (!video || addedIds.has(playlistId)) return
    setAddingId(playlistId)
    try {
      const { data: existing } = await supabase.from('playlist_videos').select('id').eq('playlist_id', playlistId).eq('video_id', video.id).maybeSingle()
      if (existing) { setAddedIds((p) => new Set([...p, playlistId])); Toast.show({ type: 'info', text1: 'الفيديو موجود بالفعل في القائمة' }); return }
      const { data: last } = await supabase.from('playlist_videos').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle()
      const { error } = await supabase.from('playlist_videos').insert({ playlist_id: playlistId, video_id: video.id, position: ((last?.position ?? -1) as number) + 1 })
      if (error) throw error
      setAddedIds((p) => new Set([...p, playlistId]))
      await qc.invalidateQueries({ queryKey: ['playlist-videos', playlistId] })
      await qc.invalidateQueries({ queryKey: ['playlists'] })
      Toast.show({ type: 'success', text1: 'تمت إضافة الفيديو للقائمة' })
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally { setAddingId(null) }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>إضافة إلى قائمة</Text>
            <Pressable onPress={handleClose}><Ionicons name="close" size={28} color={colors.grey900} /></Pressable>
          </View>
          {video && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.grey50 }}>
              {video.thumbnail_url
                ? <Image source={{ uri: video.thumbnail_url }} style={{ width: 72, height: 42, borderRadius: radius.sm, backgroundColor: colors.grey200 }} />
                : <View style={{ width: 72, height: 42, borderRadius: radius.sm, backgroundColor: colors.grey200, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="film-outline" size={22} color={colors.grey400} /></View>}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontWeight: '800', color: colors.grey900 }}>{video.title || 'Video'}</Text>
                <Text numberOfLines={1} style={{ color: colors.grey600, fontSize: fontSize.xs }}>{video.channel_name || 'KidTok'}</Text>
              </View>
            </View>
          )}
          <ScrollView contentContainerStyle={{ padding: spacing.md }}>
            {!selectedChildId ? (
              <>
                <Text style={{ color: colors.grey600, fontWeight: '700', marginBottom: spacing.sm }}>اختار الطفل</Text>
                {children.length === 0
                  ? <Text style={{ color: colors.grey600, textAlign: 'center', padding: spacing.lg }}>لا يوجد أطفال بعد</Text>
                  : children.map((child: any) => (
                    <Pressable key={child.id} onPress={() => setSelectedChildId(child.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.grey50, marginBottom: spacing.sm }}>
                      <ChildAvatar name={child.name || 'KidTok'} imageUrl={child.image_url} gender={child.gender} size="sm" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '800', color: colors.grey900 }}>{child.name}</Text>
                        {!!child.age?.name_ar && <Text style={{ color: colors.grey600, fontSize: fontSize.xs }}>{child.age.name_ar}</Text>}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.grey400} />
                    </Pressable>
                  ))}
              </>
            ) : (
              <>
                <Pressable onPress={() => setSelectedChildId(null)} style={{ marginBottom: spacing.md }}>
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>رجوع للأطفال</Text>
                </Pressable>
                {playlistsLoading ? <ActivityIndicator color={colors.primary} /> : playlists.length === 0
                  ? <Text style={{ color: colors.grey600, textAlign: 'center', padding: spacing.lg }}>لا توجد قوائم تشغيل لهذا الطفل</Text>
                  : playlists.map((playlist: any) => {
                    const added = addedIds.has(playlist.id)
                    return (
                      <Pressable key={playlist.id} onPress={() => addToPlaylist(playlist.id)} disabled={added || addingId === playlist.id}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: added ? `${colors.primary}15` : colors.grey50, marginBottom: spacing.sm }}>
                        <Ionicons name={added ? 'checkmark-circle' : 'list'} size={26} color={added ? colors.primary : colors.grey700} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '800', color: colors.grey900 }}>{playlist.name}</Text>
                          <Text style={{ color: colors.grey600, fontSize: fontSize.xs }}>{playlist.video_count} فيديو</Text>
                        </View>
                        {addingId === playlist.id ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="add" size={22} color={colors.primary} />}
                      </Pressable>
                    )
                  })}
              </>
            )}
          </ScrollView>
          <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.grey100 }}>
            <Pressable onPress={handleClose} style={{ backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radius.pill, alignItems: 'center' }}>
              <Text style={{ color: colors.white, fontWeight: '900' }}>تم</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Discover Users — shown when "أتابع" tab is empty ─────────────────────────
function DiscoverUsers() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const myId = useAuth((s) => s.user?.id)

  const { data: myFollowingIds = [] } = useQuery({
    queryKey: ['my-following-ids', myId],
    enabled: !!myId,
    queryFn: async () => {
      const { data } = await supabase
        .from('creator_follows')
        .select('following_id')
        .eq('follower_id', myId!)
      return (data || []).map((f: any) => f.following_id)
    },
  })

  const { data: topUsers = [] } = useQuery({
    queryKey: ['top-creators', myId],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, followers_count')
        .order('followers_count', { ascending: false })
        .limit(20)  // fetch more, then filter client-side
      return data || []
    },
    select: (data) => data.filter((u: any) => u.id !== myId && !myFollowingIds.includes(u.id)).slice(0, 5),
  })

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <Ionicons name="people-outline" size={64} color={colors.grey400} />
      <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: spacing.md }}>
        {ar ? 'لا تتابع أحداً بعد' : 'Not following anyone yet'}
      </Text>
      <Text style={{ color: colors.grey400, fontSize: fontSize.sm, marginTop: 6, textAlign: 'center' }}>
        {ar ? 'اتبع منشئي محتوى لتظهر فيديوهاتهم هنا' : 'Follow creators to see their videos here'}
      </Text>

      {/* Search button */}
      <Pressable
        onPress={() => router.push('/(tabs)/search' as any)}
        style={{ marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.secondary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, elevation: 4, shadowColor: colors.secondary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
      >
        <Ionicons name="search" size={16} color={colors.white} />
        <Text style={{ color: colors.white, fontWeight: '900', fontSize: fontSize.sm }}>{ar ? 'ابحث عن مستخدمين' : 'Find Users'}</Text>
      </Pressable>

      {/* Top creators */}
      {topUsers.length > 0 && (
        <View style={{ width: '100%', marginTop: spacing.xl }}>
          <Text style={{ color: colors.grey300, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.md, textAlign: 'center' }}>
            🌟 {ar ? 'الأكثر متابعة' : 'Most Followed'}
          </Text>
          {topUsers.map((u: any) => (
            <TopCreatorRow key={u.id} user={u} />
          ))}
        </View>
      )}
    </View>
  )
}

function TopCreatorRow({ user }: { user: any }) {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const myId = useAuth((s) => s.user?.id)
  const { data: isFollowing } = useIsFollowing(user.id)
  const toggleFollow = useToggleFollow()
  if (user.id === myId) return null

  return (
    <Pressable
      onPress={() => router.push(`/creator/${user.id}` as any)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md,
        backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent',
        borderRadius: radius.lg, marginBottom: 4,
      })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {user.avatar_url
          ? <Image source={{ uri: user.avatar_url }} style={{ width: '100%', height: '100%' }} />
          : <Ionicons name="person" size={26} color={colors.white} />
        }
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.white, fontWeight: '800' }}>{user.name || (ar ? 'مستخدم' : 'User')}</Text>
        {user.username && <Text style={{ color: colors.primary, fontSize: fontSize.xs }}>@{user.username}</Text>}
        <Text style={{ color: colors.grey400, fontSize: fontSize.xs }}>
          {user.followers_count > 999 ? `${(user.followers_count/1000).toFixed(1)}k` : user.followers_count} {ar ? 'متابع' : 'followers'}
        </Text>
      </View>
      <Pressable
        onPress={(e) => { e.stopPropagation(); toggleFollow.mutate(user.id) }}
        style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: isFollowing ? 'rgba(255,255,255,0.15)' : colors.primary }}
      >
        <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.sm }}>
          {isFollowing ? (ar ? 'تتابع ✓' : 'Following ✓') : (ar ? '+ متابعة' : '+ Follow')}
        </Text>
      </Pressable>
    </Pressable>
  )
}
