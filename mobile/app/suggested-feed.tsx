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
import { useAdMob } from '@/hooks/useAdMob'
import FeedSeekBar from '@/components/FeedSeekBar'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
const KIDTOK_ORIGIN = 'https://kidtok.vercel.app'

interface SuggestedVideo {
  id:            string
  title:         string | null
  thumbnail_url: string | null
  channel_name:  string | null
  youtube_id:    string | null
  like_count:    number | null
  view_count:    number | null
  category:      string | null
  tags:          string[] | null
}

/**
 * SuggestedFeed — vertical reel view of suggested videos that matches a
 * specific interest/age filter. Reached from the Search tab when the user
 * taps a video card. Same swipe-to-next + interstitial-on-N-swipes
 * behaviour as the main feed, AND the same JS-bridge YouTube player +
 * custom FeedSeekBar so seeking actually works (controls=1 inside a
 * WebView is blocked by our tap overlay; this is the play.tsx pattern).
 */
export default function SuggestedFeed() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ videoId?: string; interestId?: string; ageId?: string }>()

  const interestId = params.interestId ? parseInt(params.interestId, 10) : null
  const ageId      = params.ageId      ? parseInt(params.ageId, 10)      : null
  const startId    = params.videoId || null

  const [activeIndex, setActiveIndex]       = useState(0)
  const [muted, setMuted]                   = useState(false)
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT)

  // Interstitial ads on swipe — identical wiring to the main feed and
  // the playlist player. Hook gates by has_ads internally.
  const { onVideoSwiped, isInterstitialShowing } = useAdMob()
  const lastSwipedIndexRef = useRef(0)
  const onVideoSwipedRef = useRef(onVideoSwiped)
  useEffect(() => { onVideoSwipedRef.current = onVideoSwiped }, [onVideoSwiped])

  const { data: rawVideos = [], isLoading } = useQuery({
    queryKey: ['suggested-feed', interestId, ageId, startId],
    queryFn: async (): Promise<SuggestedVideo[]> => {
      let startVideo: SuggestedVideo | null = null
      if (startId) {
        const { data: picked } = await supabase
          .from('videos')
          .select('id, title, thumbnail_url, channel_name, youtube_id, like_count, view_count, category, tags')
          .eq('id', startId)
          .eq('is_active', true)
          .maybeSingle()
        startVideo = picked as SuggestedVideo | null
      }

      const { data, error } = await supabase.rpc('get_random_suggested_videos', {
        p_interest_id: interestId,
        p_age_id:      ageId,
        p_limit:       startVideo ? 59 : 60,
        p_exclude_ids: startVideo ? [startVideo.id] : [],
      })
      if (error) throw error
      const randomVideos = (data || []) as SuggestedVideo[]
      return startVideo ? [startVideo, ...randomVideos] : randomVideos
    },
  })

  // Reorder so:
  //   1) the tapped video plays first
  //   2) scrolling down moves through the catalog's natural order from
  //      that point — user expectation: "play this one, then continue
  //      with the next ones I haven't seen yet"
  //   3) once we exhaust the rest, wrap to the items that were BEFORE
  //      the tapped one, so there's always something next
  const videos = useMemo(() => {
    if (!startId) return rawVideos
    const idx = rawVideos.findIndex(v => v.id === startId)
    if (idx <= 0) return rawVideos
    return [...rawVideos.slice(idx), ...rawVideos.slice(0, idx)]
  }, [rawVideos, startId])

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const next = viewableItems[0].index || 0
      setActiveIndex(next)
      if (next !== lastSwipedIndexRef.current) {
        lastSwipedIndexRef.current = next
        onVideoSwipedRef.current?.()
      }
    }
  }).current
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.white} size="large" />
      </View>
    )
  }
  if (videos.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Ionicons name="film-outline" size={64} color={colors.grey400} />
        <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: spacing.md }}>
          {ar ? 'لا توجد فيديوهات' : 'No videos'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: 999, backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.white, fontWeight: '800' }}>{ar ? 'رجوع' : 'Back'}</Text>
        </Pressable>
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
        data={videos}
        keyExtractor={(v, i) => `${v.id}-${i}`}
        renderItem={({ item, index }) => (
          <VideoItem
            item={item}
            isActive={index === activeIndex && !isInterstitialShowing}
            index={index}
            total={videos.length}
            height={containerHeight}
            muted={muted}
          />
        )}
        pagingEnabled
        snapToInterval={containerHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={2}
        windowSize={3}
        maxToRenderPerBatch={2}
      />

      {/* Top bar — close + mute toggle */}
      <View
        style={{
          position: 'absolute', top: insets.top + spacing.sm, left: 0, right: 0,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
        }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={ar ? 'chevron-forward' : 'chevron-back'} size={26} color={colors.white} />
        </Pressable>
        <Pressable
          onPress={() => setMuted(m => !m)}
          hitSlop={12}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={colors.white} />
        </Pressable>
      </View>
    </View>
  )
}

// ─── VideoItem ────────────────────────────────────────────────────────
function VideoItem({ item, isActive, index, total, height, muted }: {
  item: SuggestedVideo
  isActive: boolean
  index: number
  total: number
  height: number
  muted: boolean
}) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'

  // Atomic view tracking — same pattern as feed.tsx so the count
  // behaves identically whether the user watches in the main feed,
  // the suggested-feed, or a playlist. Fires exactly once per mount
  // when the video first becomes active; the per-component ref means
  // scrolling past a video twice in the same session still counts as
  // one view.
  const viewedRef = useRef(false)
  useEffect(() => {
    if (!isActive || viewedRef.current) return
    viewedRef.current = true
    supabase.rpc('increment_video_view', { p_video_id: item.id }).then(() => {})
    supabase.rpc('award_watch_xp', { p_video_id: item.id }).then(() => {}, () => {})
  }, [isActive, item.id])

  // Progress + seek bridge — same shape the playlist player uses so we
  // can reuse FeedSeekBar exactly. Progress messages come from the
  // WebView via postMessage every 250ms.
  const [progress, setProgress] = useState({ current: 0, duration: 0 })
  const seekRef = useRef<((seconds: number) => void) | null>(null)
  const handleProgress = useCallback((current: number, duration: number) => {
    setProgress({ current, duration })
  }, [])
  const handleSeek = useCallback((seconds: number) => {
    seekRef.current?.(seconds)
  }, [])

  // Caption fade — matches feed/playlist behaviour. Auto-hides at 3s,
  // re-shows on tap so the user can re-read.
  const captionAnim = useRef(new Animated.Value(1)).current
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
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
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [isActive, item.id])

  const isYouTube = !!item.youtube_id
  const poster    = item.thumbnail_url || (item.youtube_id ? getYouTubeThumbnail(item.youtube_id, 'max') : '')
  const tags      = Array.isArray(item.tags) ? item.tags
                  : typeof item.tags === 'string'
                    ? (item.tags as string).split(/[,\s]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean)
                    : []

  return (
    <View style={{ width: SCREEN_WIDTH, height, backgroundColor: colors.black }}>
      {isYouTube && (
        <SuggestedReelVideo
          videoId={item.youtube_id!}
          isActive={isActive}
          muted={muted}
          poster={poster}
          onProgress={handleProgress}
          seekRef={seekRef}
        />
      )}

      {/* Tap layer — the captioned area only. Leaves the bottom strip for
          the custom FeedSeekBar so dragging the bar isn't intercepted. */}
      <Pressable
        onPress={() => { showCaption(); startHideTimer() }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 60 }}
      />

      <Animated.View
        pointerEvents="box-none"
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: captionAnim }}
      >
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.9)']}
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop:    spacing.xl + spacing.lg,
            paddingBottom: spacing.xl + 20,    // extra room for the seek bar
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, marginBottom: 6 }}>
            {index + 1} / {total}
          </Text>

          {/* KidTok Picks chip — all videos here are suggested by definition */}
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

          {/* Channel + YouTube badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>
              {item.channel_name || 'YouTube'}
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              backgroundColor: '#FF0000',
              paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
            }}>
              <Ionicons name="logo-youtube" size={10} color={colors.white} />
              <Text style={{ color: colors.white, fontSize: 9, fontWeight: '800' }}>YouTube</Text>
            </View>
          </View>

          <Text
            style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: 4 }}
            numberOfLines={2}
          >
            {item.title || ''}
          </Text>

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

      {/* Custom seek bar — only mounted for the active video to spare
          re-renders. Always above the caption gradient so it's reachable. */}
      {isActive && (
        <FeedSeekBar
          current={progress.current}
          duration={progress.duration}
          onSeek={handleSeek}
          bottom={6}
        />
      )}
    </View>
  )
}

// ─── SuggestedReelVideo: YouTube WebView with JS bridge ─────────────
// Mirrors playlist/[id]/play.tsx's PlaylistReelVideo: controls=0 inside
// the iframe, custom progress + seek over postMessage, so the visible
// seek bar is React-side (FeedSeekBar). This is the only way to make
// scrubbing work reliably under our tap overlay.
function SuggestedReelVideo({ videoId, isActive, muted, poster, onProgress, seekRef }: {
  videoId: string
  isActive: boolean
  muted:    boolean
  poster:   string
  onProgress?: (current: number, duration: number) => void
  seekRef?:    { current: ((seconds: number) => void) | null }
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
    const current  = parseFloat(parts[1])
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

// ─── YouTube embed bridge helpers (mirror playlist/[id]/play.tsx) ────
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
