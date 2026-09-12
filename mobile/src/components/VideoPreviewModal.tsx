import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, FlatList, Modal, Pressable, ScrollView, View, Text, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import CommentsSheet from '@/components/CommentsSheet'
import { useMyVideoInteraction, useToggleVideoInteraction } from '@/hooks/useSocial'
import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize } from '@/lib/theme'
import { useAuth } from '@/stores/auth'
import { getYouTubeThumbnail } from '@/lib/youtube'

const KIDTOK_ORIGIN = 'https://kidtok.vercel.app'
const { height: SCREEN_H } = Dimensions.get('window')

const REPORT_REASONS: { key: string; ar: string; en: string }[] = [
  { key: 'inappropriate_content', ar: 'محتوى غير لائق', en: 'Inappropriate content' },
  { key: 'violence', ar: 'عنف', en: 'Violence' },
  { key: 'sexual_content', ar: 'محتوى غير مناسب', en: 'Unsafe content' },
  { key: 'hate_speech', ar: 'خطاب كراهية', en: 'Hate speech' },
  { key: 'misinformation', ar: 'معلومات مضللة', en: 'Misinformation' },
  { key: 'spam', ar: 'سبام', en: 'Spam' },
  { key: 'copyright', ar: 'حقوق نشر', en: 'Copyright' },
  { key: 'other', ar: 'سبب آخر', en: 'Other' },
]

export interface PreviewVideo {
  id: string
  mirror_id?: string | null
  title?: string | null
  source?: string | null
  youtube_id?: string | null
  thumbnail_url?: string | null
  hls_url?: string | null
  cloudflare_uid?: string | null
  channel_name?: string | null
  creator_id?: string | null
  creator_video_id?: string | null
  like_count?: number | null
  dislike_count?: number | null
  comment_count?: number | null
  view_count?: number | null
}

function getHlsUrl(video: PreviewVideo) {
  if (video.hls_url) return video.hls_url
  if (video.cloudflare_uid) return `https://videodelivery.net/${video.cloudflare_uid}/manifest/video.m3u8`
  const uid = video.thumbnail_url?.match(/cloudflarestream\.com\/([^/]+)/)?.[1]
  return uid ? `https://videodelivery.net/${uid}/manifest/video.m3u8` : null
}

function getYouTubeEmbedHtml(videoId: string, nativeControls = true) {
  const controls = nativeControls ? 1 : 0
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0&controls=${controls}&modestbranding=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(KIDTOK_ORIGIN)}`
  // iframe fills container fully — YouTube handles native aspect ratio internally
  // 9:16 videos fill the screen, 16:9 videos get pillarboxed (black bars) — no cropping
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
</style>
</head>
<body>
<iframe id="kidtok-player" src="${src}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="origin-when-cross-origin" allowfullscreen></iframe>
</body>
</html>`
}

function NativePreview({
  hlsUrl,
  poster,
  active = true,
  contentFit = 'contain',
  loop = true,
  nativeControls = true,
}: {
  hlsUrl: string
  poster: string | null
  active?: boolean
  contentFit?: 'contain' | 'cover'
  loop?: boolean
  nativeControls?: boolean
}) {
  const player = useVideoPlayer({ uri: hlsUrl }, (p) => {
    p.loop = loop
    p.muted = false
    p.volume = 1
  })

  useEffect(() => {
    try {
      if (active) player.play()
      else player.pause()
    } catch {}
    return () => { try { player.pause() } catch {} }
  }, [active, player])

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {poster ? (
        <Image source={{ uri: poster }} resizeMode="contain" style={{ position: 'absolute', inset: 0, opacity: 0.35 }} />
      ) : null}
      <VideoView player={player} style={{ position: 'absolute', inset: 0 }} contentFit={contentFit} nativeControls={nativeControls} />
    </View>
  )
}

export default memo(function VideoPreviewModal({
  video,
  visible,
  onClose,
}: {
  video: PreviewVideo | null
  visible: boolean
  onClose: () => void
}) {
  const webViewRef = useRef<WebView>(null)
  const hlsUrl = video ? getHlsUrl(video) : null
  const poster = video?.thumbnail_url || (video?.youtube_id ? getYouTubeThumbnail(video.youtube_id, 'max') : null)

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {video?.youtube_id ? (
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: getYouTubeEmbedHtml(video.youtube_id), baseUrl: KIDTOK_ORIGIN }}
            style={{ flex: 1, backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            setSupportMultipleWindows={false}
          />
        ) : hlsUrl ? (
          <NativePreview hlsUrl={hlsUrl} poster={poster} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
            <Ionicons name="film-outline" size={64} color={colors.grey400} />
            <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800', marginTop: spacing.md }}>
              Video is not ready yet
            </Text>
          </View>
        )}

        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
            <Pressable
              onPress={onClose}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
})

export function ProfileVideoPagerModal({
  videos,
  initialIndex,
  visible,
  onClose,
}: {
  videos: PreviewVideo[]
  initialIndex: number
  visible: boolean
  onClose: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [commentsForVideo, setCommentsForVideo] = useState<string | null>(null)
  const commentDeltaRef = useRef<((delta?: number) => void) | null>(null)
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, Math.max(0, videos.length - 1)))

  useEffect(() => {
    if (visible) setCurrentIndex(safeInitialIndex)
  }, [safeInitialIndex, visible])

  const openComments = useCallback((videoId: string, onCommentDelta?: (delta?: number) => void) => {
    commentDeltaRef.current = onCommentDelta || null
    setCommentsForVideo(videoId)
  }, [])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialScrollIndex={safeInitialIndex}
          getItemLayout={(_, index) => ({ length: SCREEN_H, offset: SCREEN_H * index, index })}
          onScrollToIndexFailed={() => {}}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.y / SCREEN_H)
            setCurrentIndex(Math.max(0, Math.min(next, videos.length - 1)))
          }}
          renderItem={({ item, index }) => (
            <ProfileVideoPage video={item} active={index === currentIndex} onOpenComments={openComments} />
          )}
        />

        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}>
            <Pressable
              onPress={onClose}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '900' }}>
                {videos.length ? `${currentIndex + 1}/${videos.length}` : '0/0'}
              </Text>
            </View>
          </View>
        </SafeAreaView>
        {commentsForVideo && (
          <CommentsSheet
            videoId={commentsForVideo}
            visible={!!commentsForVideo}
            onClose={() => {
              setCommentsForVideo(null)
              commentDeltaRef.current = null
            }}
            onCommentAdded={() => commentDeltaRef.current?.(1)}
            onCommentDeleted={() => commentDeltaRef.current?.(-1)}
          />
        )}
      </View>
    </Modal>
  )
}

function ProfileVideoPage({
  video,
  active,
  onOpenComments,
}: {
  video: PreviewVideo
  active: boolean
  onOpenComments: (videoId: string, onCommentDelta?: (delta?: number) => void) => void
}) {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const myId = useAuth((s) => s.user?.id)
  const hlsUrl = getHlsUrl(video)
  const poster = video.thumbnail_url || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id, 'max') : null)
  const actionVideoId = video.mirror_id || video.id
  const reportCreatorVideoId = video.creator_video_id || (video.mirror_id ? video.id : null)
  const { data: myInteraction } = useMyVideoInteraction(actionVideoId)
  const toggleMut = useToggleVideoInteraction()
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)
  const [likeCount, setLikeCount] = useState(video.like_count ?? 0)
  const [dislikeCount, setDislikeCount] = useState(video.dislike_count ?? 0)
  const [commentCount, setCommentCount] = useState(video.comment_count ?? 0)
  const [reportOpen, setReportOpen] = useState(false)
  const tapCountRef = useRef(0)
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [tapPos, setTapPos] = useState({ x: Dimensions.get('window').width / 2, y: SCREEN_H * 0.42 })
  const heartOpacity = useRef(new Animated.Value(0)).current
  const heartScale = useRef(new Animated.Value(0.45)).current
  const thumbOpacity = useRef(new Animated.Value(0)).current
  const thumbScale = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    setLiked(myInteraction === 'like')
    setDisliked(myInteraction === 'dislike')
  }, [myInteraction])

  useEffect(() => {
    setLikeCount(video.like_count ?? 0)
    setDislikeCount(video.dislike_count ?? 0)
    setCommentCount(video.comment_count ?? 0)
  }, [video.id, video.like_count, video.dislike_count, video.comment_count])

  const handleLike = useCallback(() => {
    if (!actionVideoId || toggleMut.isPending) return
    if (liked) {
      setLiked(false)
      setLikeCount((count) => Math.max(0, count - 1))
    } else {
      setLiked(true)
      setLikeCount((count) => count + 1)
      if (disliked) {
        setDisliked(false)
        setDislikeCount((count) => Math.max(0, count - 1))
      }
    }
    toggleMut.mutate({ videoId: actionVideoId, type: 'like' })
  }, [actionVideoId, disliked, liked, toggleMut])

  const handleDislike = useCallback(() => {
    if (!actionVideoId || toggleMut.isPending) return
    if (disliked) {
      setDisliked(false)
      setDislikeCount((count) => Math.max(0, count - 1))
    } else {
      setDisliked(true)
      setDislikeCount((count) => count + 1)
      if (liked) {
        setLiked(false)
        setLikeCount((count) => Math.max(0, count - 1))
      }
    }
    toggleMut.mutate({ videoId: actionVideoId, type: 'dislike' })
  }, [actionVideoId, disliked, liked, toggleMut])

  const animateHeart = useCallback(() => {
    heartOpacity.setValue(1)
    heartScale.setValue(0.45)
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1.45, useNativeDriver: true, friction: 4, tension: 150 }),
      Animated.sequence([
        Animated.delay(360),
        Animated.timing(heartOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start()
  }, [heartOpacity, heartScale])

  const animateDislike = useCallback(() => {
    thumbOpacity.setValue(1)
    thumbScale.setValue(0.45)
    Animated.parallel([
      Animated.spring(thumbScale, { toValue: 1.35, useNativeDriver: true, friction: 5, tension: 145 }),
      Animated.sequence([
        Animated.delay(340),
        Animated.timing(thumbOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    ]).start()
  }, [thumbOpacity, thumbScale])

  useEffect(() => () => {
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
  }, [])

  const handleVideoTap = useCallback((event: any) => {
    setTapPos({
      x: Number(event?.nativeEvent?.locationX || Dimensions.get('window').width / 2),
      y: Number(event?.nativeEvent?.locationY || SCREEN_H * 0.42),
    })
    tapCountRef.current += 1
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapTimerRef.current = setTimeout(() => {
      const taps = tapCountRef.current
      tapCountRef.current = 0
      tapTimerRef.current = null
      if (taps >= 3) {
        handleDislike()
        animateDislike()
      } else if (taps === 2) {
        handleLike()
        animateHeart()
      }
    }, 280)
  }, [animateDislike, animateHeart, handleDislike, handleLike])

  const handleComments = useCallback(() => {
    if (!actionVideoId) return
    onOpenComments(actionVideoId, (delta = 1) => setCommentCount((count) => Math.max(0, count + delta)))
  }, [actionVideoId, onOpenComments])

  const handleGift = useCallback(() => {
    if (!video.creator_id || video.creator_id === myId) {
      Toast.show({ type: 'info', text1: ar ? 'لا يمكن إرسال هدية لهذا الفيديو' : 'Gift is not available for this video' })
      return
    }
    router.push(`/gift/${video.creator_id}?videoId=${actionVideoId}` as any)
  }, [actionVideoId, ar, myId, router, video.creator_id])

  const submitReport = useCallback(async (reason: string) => {
    try {
      const { error } = await supabase.rpc('report_video', {
        p_video_id: actionVideoId,
        p_creator_video_id: reportCreatorVideoId,
        p_reason: reason,
      })
      if (error) throw error
      Toast.show({
        type: 'success',
        text1: ar ? 'تم إرسال البلاغ' : 'Report submitted',
        text2: ar ? 'شكرًا لمساعدتنا في الحفاظ على KidTok آمنًا.' : 'Thanks for helping keep KidTok safe.',
      })
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: ar ? 'فشل إرسال البلاغ' : 'Report failed',
        text2: String(error?.message || error).slice(0, 120),
      })
    } finally {
      setReportOpen(false)
    }
  }, [actionVideoId, ar, reportCreatorVideoId])

  return (
    <View style={{ height: SCREEN_H, backgroundColor: '#000' }}>
      {video.youtube_id ? (
        active ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: getYouTubeEmbedHtml(video.youtube_id, false), baseUrl: KIDTOK_ORIGIN }}
            style={{ flex: 1, backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            setSupportMultipleWindows={false}
          />
        ) : null
      ) : hlsUrl ? (
        <NativePreview hlsUrl={hlsUrl} poster={poster} active={active} contentFit="cover" loop={false} nativeControls={false} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <Ionicons name="film-outline" size={64} color={colors.grey400} />
          <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800', marginTop: spacing.md }}>
            Video is not ready yet
          </Text>
        </View>
      )}

      {!!video.title && (
        <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View style={{ paddingLeft: spacing.lg, paddingRight: 92, paddingBottom: spacing.xl + 18 }}>
            <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '900' }} numberOfLines={2}>
              {video.title}
            </Text>
          </View>
        </SafeAreaView>
      )}

      <Pressable
        onPress={handleVideoTap}
        style={{ position: 'absolute', inset: 0, right: 88, top: 86, bottom: 84 }}
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: tapPos.x - 46,
          top: tapPos.y - 46,
          opacity: heartOpacity,
          transform: [{ scale: heartScale }, { rotate: '-10deg' }],
        }}
      >
        <Ionicons name="heart" size={92} color={colors.secondary} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: tapPos.x - 38,
          top: tapPos.y - 38,
          opacity: thumbOpacity,
          transform: [{ scale: thumbScale }, { rotate: '8deg' }],
        }}
      >
        <Ionicons name="thumbs-down" size={76} color="#38BDF8" />
      </Animated.View>

      <View style={{ position: 'absolute', right: spacing.md, bottom: 92, gap: spacing.md, alignItems: 'center' }}>
        <ProfileActionButton icon={liked ? 'heart' : 'heart-outline'} count={likeCount} active={liked} activeColor={colors.secondary} onPress={handleLike} />
        <ProfileActionButton icon={disliked ? 'thumbs-down' : 'thumbs-down-outline'} count={dislikeCount} active={disliked} onPress={handleDislike} />
        <ProfileActionButton icon="chatbubble" count={commentCount} onPress={handleComments} />
        {!!video.creator_id && video.creator_id !== myId && (
          <ProfileActionButton icon="gift" count={0} onPress={handleGift} />
        )}
        <ProfileActionButton icon="alert-circle-outline" count={0} onPress={() => setReportOpen(true)} />
      </View>

      <ProfileReportSheet visible={reportOpen} ar={ar} onClose={() => setReportOpen(false)} onReport={submitReport} />
    </View>
  )
}

function ProfileActionButton({
  icon,
  count,
  active,
  activeColor = colors.primary,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  count: number
  active?: boolean
  activeColor?: string
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.72 : 1 })}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}>
        <Ionicons name={icon} size={22} color={active ? activeColor : colors.white} />
      </View>
      <Text style={{ color: colors.white, fontSize: 11, fontWeight: '900', marginTop: 4, textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 4 }}>
        {count > 0 ? formatCount(count) : ''}
      </Text>
    </Pressable>
  )
}

function ProfileReportSheet({
  visible,
  ar,
  onClose,
  onReport,
}: {
  visible: boolean
  ar: boolean
  onClose: () => void
  onReport: (reason: string) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(event) => event.stopPropagation()} style={{ backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xl }}>
          <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: colors.grey200, marginBottom: spacing.md }} />
          <Text style={{ color: colors.grey900, fontSize: fontSize.lg, fontWeight: '900' }}>
            {ar ? 'الإبلاغ عن الفيديو' : 'Report video'}
          </Text>
          <Text style={{ color: colors.grey500, fontSize: fontSize.sm, marginTop: 4, marginBottom: spacing.sm }}>
            {ar ? 'اختار السبب وفريق المراجعة هيفحصه.' : 'Pick a reason and our review team will check it.'}
          </Text>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {REPORT_REASONS.map((reason) => (
              <Pressable
                key={reason.key}
                onPress={() => onReport(reason.key)}
                style={({ pressed }) => ({
                  paddingVertical: 14,
                  paddingHorizontal: spacing.sm,
                  borderRadius: 12,
                  backgroundColor: pressed ? colors.grey100 : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                })}
              >
                <Text style={{ color: colors.grey900, fontSize: fontSize.base, fontWeight: '700' }}>
                  {ar ? reason.ar : reason.en}
                </Text>
                <Ionicons name={ar ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.grey400} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
