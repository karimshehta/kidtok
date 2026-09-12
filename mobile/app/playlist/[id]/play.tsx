import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, Dimensions, FlatList, Pressable, ActivityIndicator, Image, Animated,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { supabase } from '@/lib/supabase'
import { getYouTubeThumbnail } from '@/lib/youtube'
import { colors, spacing, fontSize } from '@/lib/theme'
import ReelNativeVideo from '@/components/ReelNativeVideo'
import FeedSeekBar from '@/components/FeedSeekBar'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Toast from 'react-native-toast-message'
import { useAdMob } from '@/hooks/useAdMob'
import { getChildSessionEndStorageKey, parseChildSessionTimer } from '@/lib/screenTime'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
const KIDTOK_ORIGIN = 'https://kidtok.vercel.app'

interface FeedItem {
  id: string
  position: number
  videos: {
    id: string
    title: string | null
    source: string | null
    youtube_id: string | null
    hls_url: string | null
    cloudflare_uid: string | null
    thumbnail_url: string | null
    channel_name: string | null
    // Extra fields so we can render the same badges as the feed
    is_suggested: boolean | null
    category: string | null
    tags: string[] | null
    // Set on videos that mirror a creator_videos row — needed to update
    // the creator_videos counter in addition to videos.view_count.
    creator_video_id: string | null
  } | null
}

export default function PlaylistFeed() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { id: playlistId, kid, childId } = useLocalSearchParams<{ id: string; kid?: string; childId?: string }>()
  const isKidMode = kid === '1' && !!childId
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT)

  // ─── Interstitial ads on swipe ────────────────────────────────────────
  // Same hook + same threshold as the feed (5 swipes by default). The hook
  // gates by has_ads internally, so premium users see nothing.
  const { onVideoSwiped, isInterstitialShowing } = useAdMob()
  // Hold a ref to the previous active index so we only fire on *new* swipes,
  // not on the initial mount (where setActiveIndex(0) happens for free).
  const lastSwipedIndexRef = useRef(0)
  // FlatList requires onViewableItemsChanged to be stable across renders.
  // We capture it in useRef, but useAdMob's onVideoSwiped is recreated when
  // its deps change (settings load, plan flips). A ref-to-callback indirection
  // keeps the inner caller using the latest version without breaking FlatList.
  const onVideoSwipedRef = useRef(onVideoSwiped)
  useEffect(() => { onVideoSwipedRef.current = onVideoSwiped }, [onVideoSwiped])

  // ─── Kid-mode time watchdog ──────────────────────────────────────────────
  // The kid-mode countdown lives on the children/[id]/kid-mode screen, but
  // that screen is in the background while the child is watching a video.
  // We poll the shared AsyncStorage key once a second so the moment the
  // parent-set time runs out we pop back to kid-mode (which then shows the
  // "Time is up" screen with the renew-PIN flow). This works for force-quit
  // too — the storage key is the source of truth, not in-memory state.
  useEffect(() => {
    if (!isKidMode || !childId) return
    let cancelled = false
    const check = async () => {
      try {
        const stored = await AsyncStorage.getItem(getChildSessionEndStorageKey(childId))
        const timer = parseChildSessionTimer(stored)
        if (timer?.endTs && timer.endTs <= Date.now()) {
          if (cancelled) return
          cancelled = true
          Toast.show({
            type:  'info',
            text1: i18n.language === 'ar' ? 'انتهى الوقت' : 'Time is up',
            text2: i18n.language === 'ar' ? 'اطلب من ولي الأمر التجديد' : 'Ask the parent to renew',
          })
          router.back()
        }
      } catch { /* AsyncStorage failures are non-fatal — try again next tick */ }
    }
    check()
    const id = setInterval(check, 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [isKidMode, childId, router, i18n.language])

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['playlist-feed', playlistId],
    queryFn: async (): Promise<FeedItem[]> => {
      const { data, error } = await supabase
        .from('playlist_videos')
        .select('id, position, videos(id, title, source, youtube_id, hls_url, cloudflare_uid, thumbnail_url, channel_name, is_suggested, category, tags, creator_video_id)')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true })
      if (error) throw error
      return (data || []) as any
    },
  })

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const next = viewableItems[0].index || 0
      setActiveIndex(next)
      // Count this as a swipe only when the index actually changed — avoids
      // counting the initial mount as a "swipe".
      if (next !== lastSwipedIndexRef.current) {
        lastSwipedIndexRef.current = next
        onVideoSwipedRef.current?.()
      }
    }
  }).current

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current

  // ── Endless loop: when the kid reaches the last video and keeps scrolling,
  // the list wraps back to the beginning. We duplicate the videos N times so
  // the practical maximum scroll is huge — kids never hit a dead end.
  // NOTE: this useMemo MUST sit above the isLoading early-return — Rules of
  // Hooks require the same hooks to fire in the same order on every render.
  const LOOP_COUNT = 100
  const loopedVideos = useMemo(
    () => (videos.length > 0 ? Array.from({ length: LOOP_COUNT }, () => videos).flat() : []),
    [videos]
  )

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.black }}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <StatusBar style="light" />
      <FlatList
        data={loopedVideos}
        keyExtractor={(v, i) => `${i}-${v.id}`}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={containerHeight}
        decelerationRate="fast"
        renderItem={({ item, index }) => (
          <VideoItem
            item={item}
            isActive={index === activeIndex && !isInterstitialShowing}
            index={index}
            total={videos.length}
            height={containerHeight}
            muted={muted}
            isKidMode={isKidMode}
            childId={childId}
            playlistId={playlistId}
          />
        )}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
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

function useKidVideoWatchSession({
  enabled,
  childId,
  playlistId,
  videoId,
}: {
  enabled: boolean
  childId?: string
  playlistId?: string
  videoId?: string
}) {
  useEffect(() => {
    if (!enabled || !childId || !videoId) return

    let closed = false
    let sessionId: string | null = null
    const startedAt = Date.now()

    const flush = async (minimumSeconds = 0) => {
      if (!sessionId) return
      const elapsed = Math.max(minimumSeconds, Math.round((Date.now() - startedAt) / 1000))
      try {
        const { error } = await supabase.rpc('update_watch_session', {
          p_session_id: sessionId,
          p_watched_seconds: elapsed,
        })
        if (error) throw error
      } catch {
        await supabase
          .from('watch_sessions')
          .update({
            watched_seconds: elapsed,
            ended_at: new Date().toISOString(),
          })
          .eq('id', sessionId)
      }
    }

    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('start_watch_session', {
          p_child_id: childId,
          p_video_id: videoId,
          p_playlist_id: playlistId ?? null,
        })
        if (error) throw error
        sessionId = (data as string) || null
        await flush(1)
        if (closed) await flush(1)
      } catch {
        const { data } = await supabase
          .from('watch_sessions')
          .insert({
            child_id: childId,
            video_id: videoId,
            playlist_id: playlistId ?? null,
            watched_seconds: 1,
            ended_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        sessionId = (data as any)?.id || null
        if (closed) await flush(1)
      }
    })()

    const heartbeat = setInterval(() => { flush(1) }, 5000)
    return () => {
      closed = true
      clearInterval(heartbeat)
      flush(1)
    }
  }, [enabled, childId, playlistId, videoId])
}

function PlaylistReelVideo({
  videoId,
  isActive,
  muted,
  poster,
  onProgress,
  seekRef,
}: {
  videoId: string
  isActive: boolean
  muted: boolean
  poster: string
  onProgress?: (current: number, duration: number) => void
  seekRef?: { current: ((seconds: number) => void) | null }
}) {
  const webViewRef = useRef<any>(null)

  useEffect(() => {
    if (!seekRef) return
    seekRef.current = (seconds: number) => {
      webViewRef.current?.injectJavaScript(getYouTubeSeekCommand(seconds))
    }
    return () => { if (seekRef) seekRef.current = null }
  }, [seekRef])

  const handleWebViewMessage = useCallback((e: any) => {
    const raw = e?.nativeEvent?.data
    if (typeof raw !== 'string' || !raw.startsWith('p:')) return
    const parts = raw.split(':')
    const current = parseFloat(parts[1])
    const duration = parseFloat(parts[2])
    if (isFinite(current) && isFinite(duration) && duration > 0) {
      onProgress?.(current, duration)
    }
  }, [onProgress])

  const syncYouTubeAudio = useCallback(() => {
    webViewRef.current?.injectJavaScript(getYouTubeAudioCommand(muted))
  }, [muted])

  useEffect(() => {
    if (isActive) syncYouTubeAudio()
  }, [isActive, syncYouTubeAudio])

  return (
    <View style={{ flex: 1, backgroundColor: colors.black, overflow: 'hidden' }}>
      <Image
        source={{ uri: poster }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', opacity: isActive ? 0.35 : 1 }}
        resizeMode="cover"
        blurRadius={isActive ? 18 : 0}
      />
      {isActive ? (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: getYouTubeEmbedHtml(videoId), baseUrl: KIDTOK_ORIGIN }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          containerStyle={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent' }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo={false}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          cacheEnabled
          thirdPartyCookiesEnabled={false}
          userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onLoadEnd={syncYouTubeAudio}
          onMessage={handleWebViewMessage}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.toLowerCase()
            return !url.includes('/watch') && !url.includes('youtube.com/redirect')
          }}
        />
      ) : (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={34} color={colors.white} style={{ marginLeft: 4 }} />
          </View>
        </View>
      )}
    </View>
  )
}

function getYouTubeAudioCommand(muted: boolean) {
  return `window.kidtokSetMuted && window.kidtokSetMuted(${muted}); true;`
}

function getYouTubeSeekCommand(seconds: number) {
  const safeSeconds = Math.max(0, seconds)
  return `window.kidtokSeek && window.kidtokSeek(${safeSeconds}); true;`
}

function getYouTubeEmbedHtml(videoId: string) {
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
#kidtok-player{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
</style>
</head>
<body>
<div id="kidtok-player"></div>
<script>
  var ytPlayer = null, ytReady = false;

  window.kidtokSeek = function(sec){
    if (ytPlayer && ytReady) { try { ytPlayer.seekTo(sec, true); ytPlayer.playVideo(); } catch(e){} }
  };
  window.kidtokSetMuted = function(m){
    if (ytPlayer && ytReady) { try { m ? ytPlayer.mute() : ytPlayer.unMute(); } catch(e){} }
  };
  function postRN(msg){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg); }

  function onYouTubeIframeAPIReady(){
    ytPlayer = new YT.Player('kidtok-player', {
      width: '100%', height: '100%',
      videoId: '${videoId}',
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1, mute: 1, controls: 0, modestbranding: 1,
        playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3,
        cc_load_policy: 0, disablekb: 1, origin: '${KIDTOK_ORIGIN}'
      },
      events: {
        onReady: function(e){
          ytReady = true;
          try { e.target.unMute(); e.target.playVideo(); } catch(_){}
          setInterval(function(){
            if (!ytPlayer) return;
            try {
              var current = ytPlayer.getCurrentTime();
              var duration = ytPlayer.getDuration();
              if (duration > 0) postRN('p:' + current + ':' + duration);
            } catch(_){}
          }, 250);
        },
        onStateChange: function(e){
          if (e.data === 0) {
            var current = 0, duration = 0;
            try { current = ytPlayer.getCurrentTime(); duration = ytPlayer.getDuration(); } catch(_){}
            if (duration > 0 && current >= duration - 1.5) {
              try { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); } catch(_){}
            }
          }
        }
      }
    });
  }

  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.body.appendChild(tag);
</script>
</body>
</html>`
}

function VideoItem({
  item,
  isActive,
  index,
  total,
  height,
  muted,
  isKidMode,
  childId,
  playlistId,
}: {
  item: FeedItem
  isActive: boolean
  index: number
  total: number
  height: number
  muted: boolean
  isKidMode: boolean
  childId?: string
  playlistId: string
}) {
  const video = item.videos
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const insets = useSafeAreaInsets()
  const [progress, setProgress] = useState({ current: 0, duration: 0 })
  const seekRef = useRef<((seconds: number) => void) | null>(null)
  const seekingRef = useRef(false)
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Atomic view tracking — fires exactly once per mount when the video
  // first becomes active. Mirrors the feed.tsx pattern so view counts
  // behave identically regardless of which player surface the user
  // watched on. Both RPCs are best-effort; a failure on the network
  // side must never block playback.
  const viewedRef = useRef(false)
  useEffect(() => {
    if (!isActive || viewedRef.current || !video?.id) return
    viewedRef.current = true
    supabase.rpc('increment_video_view', { p_video_id: video.id }).then(() => {})
    supabase.rpc('award_watch_xp', { p_video_id: video.id }).then(() => {}, () => {})
    if (video.creator_video_id) {
      supabase.rpc('increment_creator_video_view', { p_creator_video_id: video.creator_video_id }).then(() => {})
    }
  }, [isActive, video?.id, video?.creator_video_id])

  const handleProgress = useCallback((current: number, duration: number) => {
    if (seekingRef.current) return
    setProgress((previous) => (
      previous.current === current && previous.duration === duration
        ? previous
        : { current, duration }
    ))
  }, [])

  const handleSeek = useCallback((seconds: number) => {
    seekRef.current?.(seconds)
    setProgress((previous) => ({ ...previous, current: seconds }))
    seekingRef.current = true
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    seekTimerRef.current = setTimeout(() => { seekingRef.current = false }, 700)
  }, [])

  useEffect(() => {
    if (!isActive) setProgress({ current: 0, duration: 0 })
    return () => {
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    }
  }, [isActive])

  useKidVideoWatchSession({
    enabled: isKidMode && isActive && !!video?.id,
    childId,
    playlistId,
    videoId: video?.id,
  })

  // ── 3-second auto-fade for the caption (matches the feed behaviour).
  //   Any tap re-shows for another 3s so the user can re-read.
  const captionAnim = useRef(new Animated.Value(1)).current
  const captionHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startHideTimer = () => {
    if (captionHideTimer.current) clearTimeout(captionHideTimer.current)
    captionHideTimer.current = setTimeout(() => {
      Animated.timing(captionAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start()
    }, 3000)
  }
  const showCaption = () => {
    Animated.timing(captionAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }
  useEffect(() => {
    if (!isActive) return
    showCaption()
    startHideTimer()
    return () => { if (captionHideTimer.current) clearTimeout(captionHideTimer.current) }
  }, [isActive, item.id])

  if (!video) return <View style={{ width: SCREEN_WIDTH, height }} />

  const isYouTube     = !!video.youtube_id
  const isKidTokPicks = video.is_suggested === true || video.category === 'parent_pick'
  // Tags can come as text[], a stringified JSON, or a comma-separated string.
  const tags = Array.isArray(video.tags)
    ? video.tags
    : typeof video.tags === 'string'
      ? (video.tags as string).split(/[,\s]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean)
      : []

  return (
    <View style={{ width: SCREEN_WIDTH, height, backgroundColor: colors.black, overflow: 'hidden' }}>
      {/* YouTube video */}
      {isYouTube && (
        <PlaylistReelVideo
          videoId={video.youtube_id!}
          isActive={isActive}
          muted={muted}
          poster={video.thumbnail_url || getYouTubeThumbnail(video.youtube_id!, 'max')}
          onProgress={handleProgress}
          seekRef={seekRef}
        />
      )}

      {/* Creator-uploaded video (HLS via Cloudflare Stream) */}
      {!isYouTube && (video.hls_url || video.cloudflare_uid) && (
        <ReelNativeVideo
          isActive={isActive}
          paused={false}
          nativeControls={false}
          hlsUrl={
            video.hls_url ||
            `https://videodelivery.net/${video.cloudflare_uid}/manifest/video.m3u8`
          }
          poster={video.thumbnail_url ?? null}
          onProgress={handleProgress}
          seekRef={seekRef}
        />
      )}

      {/* Tap layer — leave the bottom strip to the shared seek bar. */}
      <Pressable
        onPress={() => { showCaption(); startHideTimer() }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: insets.bottom + 34 }}
      />

      {/* Bottom overlay — feed-style: KidTok Picks chip, channel, title, tags */}
      <Animated.View
        pointerEvents="box-none"
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: captionAnim }}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.9)']}
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop:    spacing.xl + spacing.lg,
            paddingBottom: spacing.xl + insets.bottom + 24,
          }}
        >
          {/* Position counter */}
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, marginBottom: 6 }}>
            {(total > 0 ? (index % total) + 1 : 1)} / {total}
          </Text>

          {/* KidTok Picks chip — same as feed */}
          {isKidTokPicks && (
            <View style={{
              alignSelf: 'flex-start',
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: 'rgba(3,187,229,0.85)',
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
              marginBottom: 6,
            }}>
              <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '800' }}>
                🌟 KidTok Picks
              </Text>
            </View>
          )}

          {/* Channel row — feed shows YouTube red badge for youtube source */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>
              {isYouTube
                ? (video.channel_name || 'YouTube')
                : `@${video.channel_name || 'KidTok'}`}
            </Text>
            {isYouTube && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                backgroundColor: '#FF0000',
                paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
              }}>
                <Ionicons name="logo-youtube" size={10} color={colors.white} />
                <Text style={{ color: colors.white, fontSize: 9, fontWeight: '800' }}>YouTube</Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text
            style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: 4 }}
            numberOfLines={2}
          >
            {video.title || (ar ? 'فيديو KidTok' : 'KidTok video')}
          </Text>

          {/* Hashtags */}
          {tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {tags.slice(0, 6).map((tag, i) => (
                <Text
                  key={`${tag}-${i}`}
                  style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.xs, fontWeight: '600' }}
                >
                  #{tag.replace(/^#/, '')}
                </Text>
              ))}
            </View>
          )}
        </LinearGradient>
      </Animated.View>

      {isActive && (
        <FeedSeekBar
          current={progress.current}
          duration={progress.duration}
          onSeek={handleSeek}
          bottom={insets.bottom + 6}
        />
      )}
    </View>
  )
}
