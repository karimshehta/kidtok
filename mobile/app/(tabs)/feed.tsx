import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react'
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
  Alert,
  TextInput,
  Platform,
  Keyboard,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'
import { WebView } from 'react-native-webview'
import { useTranslation } from 'react-i18next'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useMyVideoInteraction, useToggleVideoInteraction } from '@/hooks/useSocial'
import CommentsSheet from '@/components/CommentsSheet'
import ChildAvatar from '@/components/ChildAvatar'
import { getYouTubeThumbnail } from '@/lib/youtube'
import YouTubeAttributionSheet from '@/components/YouTubeAttributionSheet'
import KidTokRichestLeaderboard from '@/components/KidTokRichestLeaderboard'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import { onHeaderPageChange, headerAnimHeight, HEADER_BAR_HEIGHT, showHeader } from '@/lib/headerScroll'
import { useIsFollowing, useToggleFollow } from '@/hooks/useSocial'
import { useAdMob } from '@/hooks/useAdMob'
import DailyRewardModal from '@/components/DailyRewardModal'
import FeedSeekBar from '@/components/FeedSeekBar'
import { useRewardedAdTimer } from '@/hooks/useRewardedAdTimer'
import { useRewardedAdSwipes } from '@/hooks/useRewardedAdSwipes'
import RewardedAdPrompt from '@/components/RewardedAdPrompt'
import ReelNativeVideo from '@/components/ReelNativeVideo'
import KidAvatarVideoOverlay from '@/components/KidAvatarVideoOverlay'
import KidReplayFaceMask from '@/components/KidReplayFaceMask'
import { useAdminBlockedUserIds } from '@/hooks/useAdminBlockedUsers'
import { decodeAvatarTrack } from '@/lib/avatarTrack'
import type { VideoPlayer } from 'expo-video'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
const KIDTOK_ORIGIN = 'https://kidtok.vercel.app'

type FeedTab = 'foryou' | 'following' | 'suggested' | 'richest'

interface FeedVideo {
  id: string
  title: string | null
  source: string
  youtube_id: string | null
  thumbnail_url: string | null
  cloudflare_uid: string | null
  hls_url: string | null
  channel_name: string | null
  channel_id: string | null
  creator_id: string | null
  creator_video_id: string | null
  kid_avatar_id: string | null
  kid_avatar_sound_key: string | null
  like_count: number
  dislike_count: number
  view_count: number
  comment_count: number
  is_story: boolean | null
  tags?: string[] | null
  category?: string | null
  is_suggested?: boolean | null
}

const FEED_SELECT =
  'id, title, source, youtube_id, thumbnail_url, cloudflare_uid, hls_url, channel_name, channel_id, creator_id, creator_video_id, kid_avatar_id, kid_avatar_sound_key, like_count, dislike_count, view_count, comment_count, is_story, tags, category, is_suggested'

const CREATOR_FEED_PAGE_SIZE = 30

/**
 * Mask layer over avatar videos. When the clip carries a recorded face-track
 * it is replayed in sync with playback so the mask sticks to the child's face
 * (TikTok-style). Older clips without a track keep the floating overlay. The
 * lookups tolerate a backend that doesn't have the column yet — any error
 * just means "no track".
 */
function AvatarMaskLayer({ video, isActive, playerRef, width, height }: {
  video: FeedVideo
  isActive: boolean
  playerRef: { current: VideoPlayer | null }
  width: number
  height: number
}) {
  // Legacy KidTok WebAR overlays are disabled. The recorded video should play
  // normally until Snap Camera Kit owns the capture/effect pipeline.
  void video
  void isActive
  void playerRef
  void width
  void height
  return null
}

// ─── FeedScreen ───────────────────────────────────────────────────────────────
function spreadCreators(list: FeedVideo[]) {
  const groups = new Map<string, FeedVideo[]>()
  for (const video of list) {
    const key = video.creator_id || video.channel_name || video.id
    const group = groups.get(key)
    if (group) group.push(video)
    else groups.set(key, [video])
  }

  const buckets = Array.from(groups.entries())
    .map(([key, items]) => ({ key, items }))
    .sort(() => Math.random() - 0.5)
  const out: FeedVideo[] = []
  let previousKey = ''

  while (buckets.length > 0) {
    let moved = false
    for (let index = 0; index < buckets.length; index += 1) {
      const bucket = buckets[index]
      if (bucket.key === previousKey && buckets.length > 1) continue

      const next = bucket.items.shift()
      if (next) {
        out.push(next)
        previousKey = bucket.key
        moved = true
      }
      if (bucket.items.length === 0) {
        buckets.splice(index, 1)
        index -= 1
      }
    }
    if (!moved && buckets.length === 1) previousKey = ''
  }

  return out
}

export default function FeedScreen() {
  const params = useLocalSearchParams<{ videoId?: string; tab?: string; openComments?: string }>()
  const initialTab = (params.tab === 'foryou' || params.tab === 'following' || params.tab === 'suggested' || params.tab === 'richest')
    ? params.tab as FeedTab
    : 'foryou'
  const [tab, setTab] = useState<FeedTab>(initialTab)
  const [activeIndex, setActiveIndex] = useState(0)

  const { i18n } = useTranslation()
  const {
    onVideoSwiped: onInterstitialVideoSwiped,
    isInterstitialShowing,
  } = useAdMob()

  // Pause videos when navigating away (audio bleeding fix)
  // Uses state flag, NOT setActiveIndex(-1) to avoid breaking interstitial flow
  const [screenFocused, setScreenFocused] = useState(true)
  useFocusEffect(useCallback(() => {
    setScreenFocused(true)
    return () => setScreenFocused(false)
  }, []))
  const { shouldShow: showTimedRewardedPrompt, dismiss: dismissTimedRewardedPrompt } = useRewardedAdTimer()
  const {
    shouldShow: showSwipeRewardedPrompt,
    dismiss: dismissSwipeRewardedPrompt,
    onVideoSwiped: onRewardedVideoSwiped,
  } = useRewardedAdSwipes()
  const [commentsForVideo, setCommentsForVideo] = useState<string | null>(null)
  const commentDeltaRef = useRef<((delta?: number) => void) | null>(null)
  const [playlistVideo, setPlaylistVideo] = useState<FeedVideo | null>(null)
  const [containerHeight, setContainerHeight] = useState(SCREEN_HEIGHT)
  const userId = useAuth((s) => s.user?.id)
  const queryClient = useQueryClient()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const jumpedToParamRef = useRef<string | null>(null)
  const openedCommentsParamRef = useRef<string | null>(null)
  const [suggestedSessionKey, setSuggestedSessionKey] = useState(() => `${Date.now()}-${Math.random()}`)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)

  const fetchSuggestedVideos = useCallback(async (excludeIds: string[] = []) => {
    const { data, error } = await supabase.rpc('get_random_suggested_videos', {
      p_interest_id: null,
      p_age_id: null,
      p_limit: 30,
      p_exclude_ids: excludeIds,
    })
    if (error) throw error
    return ((data || []) as any[]).map((v) => ({
      ...v,
      source: 'youtube' as const,
      is_suggested: true,
    })) as FeedVideo[]
  }, [])

  // Infinite scroll for suggested (655+ videos in production — paginate 30 at a time)
  const suggestedQuery = useInfiniteQuery({
    queryKey: ['feed-suggested', userId, suggestedSessionKey],
    enabled: tab === 'suggested',
    queryFn: async ({ pageParam = [] }) => fetchSuggestedVideos(pageParam as string[]),
    initialPageParam: [] as string[],
    getNextPageParam: (last, all) => {
      if (last.length < 30) return undefined
      return all.flatMap((page) => page.map((video) => video.id))
    },
  })

  const { data: linkedVideo } = useQuery({
    queryKey: ['feed-linked-video', params.videoId],
    enabled: !!params.videoId,
    queryFn: async (): Promise<FeedVideo | null> => {
      const { data, error } = await supabase
        .from('videos')
        .select(FEED_SELECT)
        .eq('id', params.videoId)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data as FeedVideo | null
    },
  })

  const forYouQuery = useInfiniteQuery({
    queryKey: ['feed-foryou', userId],
    enabled: tab === 'foryou',
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }): Promise<FeedVideo[]> => {
      const page = pageParam as number
      const from = page * CREATOR_FEED_PAGE_SIZE
      const to = from + CREATOR_FEED_PAGE_SIZE - 1

      // For You now shows only child/creator videos. We fetch it in pages,
      // then reshuffle each page by creator so the same child is not repeated
      // back-to-back when there are videos from other creators available.
      //
      // Safety filter (`not('creator_id','is',null)` + `not('creator_video_id','is',null)`):
      // even after we changed the mirror FK to cascade, defend against any
      // stragglers — if a video has no surviving creator or source row, it
      // would 404 on playback. Hiding it is correct.
      const { data, error } = await supabase
        .from('videos')
        .select(FEED_SELECT)
        .eq('source', 'creator')
        .eq('is_active', true)
        .not('creator_id', 'is', null)
        .not('creator_video_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (error) throw error
      return spreadCreators((data || []) as FeedVideo[])
    },
    getNextPageParam: (last, all) => (
      last.length < CREATOR_FEED_PAGE_SIZE ? undefined : all.length
    ),
  })

  const followingQuery = useInfiniteQuery({
    queryKey: ['feed-following', userId],
    enabled: tab === 'following',
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }): Promise<FeedVideo[]> => {
      if (!userId) return []

      const { data: follows, error: followsError } = await supabase
        .from('creator_follows')
        .select('following_id')
        .eq('follower_id', userId)
      if (followsError) throw followsError

      const ids = (follows || []).map((f: any) => f.following_id)
      if (ids.length === 0) return []

      const page = pageParam as number
      const from = page * CREATOR_FEED_PAGE_SIZE
      const to = from + CREATOR_FEED_PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('videos')
        .select(FEED_SELECT)
        .in('creator_id', ids)
        .eq('source', 'creator')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (error) throw error
      return spreadCreators((data || []) as FeedVideo[])
    },
    getNextPageParam: (last, all) => (
      last.length < CREATOR_FEED_PAGE_SIZE ? undefined : all.length
    ),
  })

  const videos: FeedVideo[] = useMemo(() => {
    if (tab === 'foryou') return forYouQuery.data?.pages.flat() || []
    if (tab === 'following') return followingQuery.data?.pages.flat() || []
    return []
  }, [forYouQuery.data, followingQuery.data, tab])

  const handleOpenComments = useCallback((id: string, onDelta?: (delta?: number) => void) => {
    setCommentsForVideo(id)
    commentDeltaRef.current = onDelta ?? null
  }, [])
  const handleOpenPlaylist = useCallback((v: FeedVideo) => setPlaylistVideo(v), [])
  const handleTabForYou = useCallback(() => { setTab('foryou'); setActiveIndex(0) }, [])
  const handleTabFollowing = useCallback(() => { setTab('following'); setActiveIndex(0) }, [])
  const handleTabSuggested = useCallback(() => { setTab('suggested'); setActiveIndex(0) }, [])
  const handleTabRichest = useCallback(() => {
    setTab('richest')
    setActiveIndex(0)
    showHeader()
  }, [])
  const handleVideoSwipedForAds = useCallback(() => {
    onInterstitialVideoSwiped()
    onRewardedVideoSwiped()
  }, [onInterstitialVideoSwiped, onRewardedVideoSwiped])
  const showRewardedPrompt = showTimedRewardedPrompt || showSwipeRewardedPrompt
  const dismissRewardedPrompt = useCallback(() => {
    dismissTimedRewardedPrompt()
    dismissSwipeRewardedPrompt()
  }, [dismissSwipeRewardedPrompt, dismissTimedRewardedPrompt])

  const handleRefreshFeed = useCallback(async () => {
    if (isManualRefreshing) return

    setIsManualRefreshing(true)
    setActiveIndex(0)
    onHeaderPageChange(0)

    try {
      if (tab === 'suggested') {
        const nextSessionKey = `${Date.now()}-${Math.random()}`
        const freshVideos = await fetchSuggestedVideos([])
        setSuggestedSessionKey(nextSessionKey)
        queryClient.setQueryData(['feed-suggested', userId, nextSessionKey], {
          pages: [freshVideos],
          pageParams: [[]],
        })
      } else if (tab === 'following') {
        await followingQuery.refetch()
      } else {
        await forYouQuery.refetch()
      }
    } catch (err: any) {
      console.warn('[feed-refresh] failed:', err)
      Toast.show({
        type: 'error',
        text1: i18n.language === 'ar' ? 'فشل تحديث الفيد' : 'Feed refresh failed',
        text2: String(err?.message || err).slice(0, 120),
      })
    } finally {
      setIsManualRefreshing(false)
    }
  }, [fetchSuggestedVideos, followingQuery, forYouQuery, i18n.language, isManualRefreshing, queryClient, tab, userId])

  // Merged list: infinite-paginated for suggested, single page for others
  // Block-list filter — when the user blocks a creator from the report
  // sheet, we add the creator_id here so their videos disappear from the
  // current feed without waiting for a refetch. The DB write happened via
  // block_user RPC; this is the local-state mirror.
  const [blockedCreators, setBlockedCreators] = useState<Set<string>>(new Set())
  const { data: adminBlockedCreatorIds = [] } = useAdminBlockedUserIds()
  const adminBlockedCreatorSet = useMemo(() => new Set(adminBlockedCreatorIds), [adminBlockedCreatorIds])
  const handleBlockedCreator = useCallback((creatorId: string) => {
    setBlockedCreators((prev) => {
      const next = new Set(prev)
      next.add(creatorId)
      return next
    })
  }, [])

  const allVideos: FeedVideo[] = useMemo(() => {
    const list = tab === 'suggested' ? (suggestedQuery.data?.pages.flat() || []) : videos
    const filtered = list.filter((v) => {
      if (!v.creator_id) return true
      return !blockedCreators.has(v.creator_id) && !adminBlockedCreatorSet.has(v.creator_id)
    })
    const linkedVideoVisible = !linkedVideo?.creator_id
      || (!blockedCreators.has(linkedVideo.creator_id) && !adminBlockedCreatorSet.has(linkedVideo.creator_id))
    if (linkedVideo && linkedVideoVisible && !filtered.some((v) => v.id === linkedVideo.id)) return [linkedVideo, ...filtered]
    return filtered
  }, [tab, suggestedQuery.data, videos, linkedVideo, blockedCreators, adminBlockedCreatorSet])

  const isLoadingActive = tab === 'suggested'
    ? suggestedQuery.isLoading
    : tab === 'following'
      ? followingQuery.isLoading
      : forYouQuery.isLoading
  const isRefreshingActive = isManualRefreshing
    || (tab === 'suggested'
      ? (suggestedQuery.isFetching && !suggestedQuery.isFetchingNextPage)
      : tab === 'following'
        ? (followingQuery.isFetching && !followingQuery.isFetchingNextPage)
        : (forYouQuery.isFetching && !forYouQuery.isFetchingNextPage))

  // Deep-link: if search passed videoId, jump to it once when list arrives
  useEffect(() => {
    if (!params.videoId || allVideos.length === 0) return
    if (jumpedToParamRef.current === params.videoId) return
    const idx = allVideos.findIndex(v => v.id === params.videoId)
    if (idx >= 0) {
      setActiveIndex(idx)
      jumpedToParamRef.current = params.videoId
    }
  }, [params.videoId, allVideos])

  useEffect(() => {
    if (!params.videoId || params.openComments !== '1') return
    if (openedCommentsParamRef.current === params.videoId) return
    if (!allVideos.some(v => v.id === params.videoId)) return
    openedCommentsParamRef.current = params.videoId
    setCommentsForVideo(params.videoId)
    commentDeltaRef.current = null
  }, [allVideos, params.openComments, params.videoId])

  // Auto-fetch next page when user is within 5 videos of the end.
  useEffect(() => {
    if (tab === 'suggested') {
      if (!suggestedQuery.hasNextPage || suggestedQuery.isFetchingNextPage) return
      if (activeIndex >= allVideos.length - 5) suggestedQuery.fetchNextPage()
      return
    }

    if (tab === 'following') {
      if (!followingQuery.hasNextPage || followingQuery.isFetchingNextPage) return
      if (activeIndex >= allVideos.length - 5) followingQuery.fetchNextPage()
      return
    }

    if (tab !== 'foryou') return
    if (!forYouQuery.hasNextPage || forYouQuery.isFetchingNextPage) return
    if (activeIndex >= allVideos.length - 5) forYouQuery.fetchNextPage()
  }, [
    activeIndex,
    allVideos.length,
    tab,
    suggestedQuery.hasNextPage,
    suggestedQuery.isFetchingNextPage,
    suggestedQuery.fetchNextPage,
    followingQuery.hasNextPage,
    followingQuery.isFetchingNextPage,
    followingQuery.fetchNextPage,
    forYouQuery.hasNextPage,
    forYouQuery.isFetchingNextPage,
    forYouQuery.fetchNextPage,
  ])

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
          <TabBtn label={i18n.language === 'ar' ? 'أبطال كيدتوك' : 'KidTok Hero'} active={tab === 'foryou'} onPress={handleTabForYou} />
          <TabBtn label={i18n.language === 'ar' ? 'مقترح' : 'Suggested'} active={tab === 'suggested'} onPress={handleTabSuggested} />
          <TabBtn label={i18n.language === 'ar' ? 'أتابع' : 'Following'} active={tab === 'following'} onPress={handleTabFollowing} />
          <TabBtn label={i18n.language === 'ar' ? 'الأغنياء' : 'Richest'} active={tab === 'richest'} onPress={handleTabRichest} />
        </View>
      </Animated.View>

      {tab === 'richest' ? (
        <KidTokRichestLeaderboard
          ar={i18n.language === 'ar'}
          topInset={insets.top + HEADER_BAR_HEIGHT + 60}
        />
      ) : isLoadingActive ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : allVideos.length === 0 ? (
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
                onPress={() => { void handleRefreshFeed() }}
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
          videos={allVideos}
          containerHeight={containerHeight}
          activeIndex={activeIndex}
          screenFocused={screenFocused && !isInterstitialShowing}
          onIndexChange={(i) => { setActiveIndex(i); onHeaderPageChange(i) }}
          onOpenComments={handleOpenComments}
          onAddToPlaylist={handleOpenPlaylist}
          onVideoSwiped={handleVideoSwipedForAds}
          isSuggestedTab={tab === 'suggested'}
          onBlockedCreator={handleBlockedCreator}
          refreshing={isRefreshingActive}
          onRefresh={handleRefreshFeed}
        />
      )}

      {/* Daily reward popup */}
      <DailyRewardModal />

      {/* Rewarded ad prompt — shows after X minutes for free users */}
      <RewardedAdPrompt
        visible={showRewardedPrompt}
        onDismiss={dismissRewardedPrompt}
        mode={showSwipeRewardedPrompt ? 'gate' : 'nudge'}
      />

      {/* Record FAB moved to center tab bar */}

      {commentsForVideo && (
        <CommentsSheet
          videoId={commentsForVideo}
          visible={!!commentsForVideo}
          onClose={() => setCommentsForVideo(null)}
          onCommentAdded={() => commentDeltaRef.current?.(1)}
          onCommentDeleted={() => commentDeltaRef.current?.(-1)}
        />
      )}
      <AddToPlaylistModal video={playlistVideo} visible={!!playlistVideo} onClose={() => setPlaylistVideo(null)} />
    </View>
  )
}

// ─── SwipeFeed ────────────────────────────────────────────────────────────────
// بدل FlatList: بنحرك Animated.Value واحدة والـ items كلها مثبتة بـ position:absolute
// ده بيمنع أي WebView من إنه يظهر في الـ item اللي فوقه أو تحته
function SwipeFeed({
  videos, containerHeight, activeIndex, onIndexChange, onOpenComments, onAddToPlaylist, onVideoSwiped, isSuggestedTab, screenFocused, onBlockedCreator, refreshing, onRefresh,
}: {
  videos: FeedVideo[]
  containerHeight: number
  activeIndex: number
  onIndexChange: (i: number) => void
  onOpenComments: (id: string, onCommentDelta?: (delta?: number) => void) => void
  onAddToPlaylist: (v: FeedVideo) => void
  onVideoSwiped: () => void
  isSuggestedTab: boolean
  screenFocused: boolean
  onBlockedCreator?: (creatorId: string) => void
  refreshing: boolean
  onRefresh: () => Promise<void> | void
}) {
  const translateY = useRef(new Animated.Value(0)).current
  const pullRefreshY = useRef(new Animated.Value(0)).current
  const currentIndexRef = useRef(0)
  const isAnimating = useRef(false)
  const totalRef = useRef(videos.length)
  const containerHeightRef = useRef(containerHeight)
  const refreshingRef = useRef(refreshing)
  const onRefreshRef = useRef(onRefresh)
  const snapToRef = useRef<(index: number) => void>(() => {})
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  totalRef.current = videos.length
  containerHeightRef.current = containerHeight
  refreshingRef.current = refreshing
  onRefreshRef.current = onRefresh

  useEffect(() => {
    // reset لما الـ videos تتغير (مثلاً tab switch — SwipeFeed بيتعمل remount بـ key={tab})
    currentIndexRef.current = activeIndex
    translateY.setValue(-activeIndex * containerHeight)
  }, [])

  useEffect(() => {
    if (isAnimating.current || currentIndexRef.current === activeIndex) return
    currentIndexRef.current = activeIndex
    translateY.setValue(-activeIndex * containerHeight)
  }, [activeIndex, containerHeight, translateY])

  useEffect(() => {
    if (refreshing) return
    Animated.timing(pullRefreshY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [pullRefreshY, refreshing])

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
      onVideoSwiped()
    })
  }, [containerHeight, onIndexChange, onVideoSwiped, translateY])

  useEffect(() => {
    snapToRef.current = snapTo
  }, [snapTo])

  const springBackToCurrent = useCallback(() => {
    isAnimating.current = true
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: -currentIndexRef.current * containerHeightRef.current,
        useNativeDriver: true,
        tension: 140,
        friction: 16,
      }),
      Animated.timing(pullRefreshY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => { isAnimating.current = false })
  }, [pullRefreshY, translateY])

  const triggerPullRefresh = useCallback(() => {
    if (refreshingRef.current) {
      springBackToCurrent()
      return
    }

    isAnimating.current = true
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 140,
        friction: 16,
      }),
      Animated.spring(pullRefreshY, {
        toValue: 58,
        useNativeDriver: true,
        tension: 140,
        friction: 14,
      }),
    ]).start(() => {
      isAnimating.current = false
      Promise.resolve(onRefreshRef.current()).finally(() => {
        Animated.timing(pullRefreshY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start()
      })
    })
  }, [pullRefreshY, springBackToCurrent, translateY])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) =>
        !isAnimating.current && Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onMoveShouldSetPanResponderCapture: (_e, gs) =>
        !isAnimating.current && Math.abs(gs.dy) > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onPanResponderMove: (_e, gs) => {
        const height = containerHeightRef.current
        const base = -currentIndexRef.current * height
        const atStart = currentIndexRef.current === 0 && gs.dy > 0
        const atEnd = currentIndexRef.current === totalRef.current - 1 && gs.dy < 0
        const delta = (atStart || atEnd) ? gs.dy * 0.2 : gs.dy
        pullRefreshY.setValue(atStart ? Math.min(90, Math.max(0, gs.dy * 0.5)) : 0)
        translateY.setValue(base + delta)
      },
      onPanResponderRelease: (_e, gs) => {
        const height = containerHeightRef.current
        const refreshThreshold = Math.min(110, Math.max(72, height * 0.11))
        if (currentIndexRef.current === 0 && gs.dy > refreshThreshold) {
          triggerPullRefresh()
          return
        }

        const threshold = height * 0.18
        if (gs.dy < -threshold || gs.vy < -0.4) {
          snapToRef.current(currentIndexRef.current + 1)
        } else if (gs.dy > threshold || gs.vy > 0.4) {
          if (currentIndexRef.current > 0) snapToRef.current(currentIndexRef.current - 1)
          else springBackToCurrent()
        } else {
          springBackToCurrent()
        }
      },
    })
  ).current

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} {...panResponder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 112,
          alignSelf: 'center',
          zIndex: 30,
          opacity: pullRefreshY.interpolate({
            inputRange: [0, 24, 58],
            outputRange: [0, 0.7, 1],
            extrapolate: 'clamp',
          }),
          transform: [{
            translateY: pullRefreshY.interpolate({
              inputRange: [0, 90],
              outputRange: [-18, 8],
              extrapolate: 'clamp',
            }),
          }],
        }}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: 38,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          backgroundColor: 'rgba(15, 23, 42, 0.88)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.16)',
        }}>
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="refresh" size={17} color={colors.white} />
          )}
          <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '800' }}>
            {refreshing ? (ar ? 'جار التحديث' : 'Refreshing') : (ar ? 'تحديث الفيد' : 'Refresh feed')}
          </Text>
        </View>
      </Animated.View>

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
                isActive={index === activeIndex && screenFocused}
                height={containerHeight}
                onOpenComments={onOpenComments}
                onAddToPlaylist={onAddToPlaylist}
                isSuggestedTab={isSuggestedTab}
                onBlockedCreator={onBlockedCreator}
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
    <Pressable onPress={onPress} style={{ paddingHorizontal: 7, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: active ? colors.white : 'transparent' }}>
      <Text style={{ color: active ? colors.grey900 : 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: active ? '900' : '600' }}>
        {label}
      </Text>
    </Pressable>
  )
})

// ─── Report / Block bottom sheet ──────────────────────────────────────
// Slide-up Modal that exposes the 7 standard report reasons plus a
// "Block this user" action. Required for App Store §1.2 + Play UGC.
const REPORT_REASONS: { key: string; ar: string; en: string }[] = [
  { key: 'inappropriate_content', ar: 'محتوى غير لائق',     en: 'Inappropriate content' },
  { key: 'violence',              ar: 'عنف',                 en: 'Violence' },
  { key: 'sexual_content',        ar: 'محتوى جنسي',          en: 'Sexual content' },
  { key: 'hate_speech',           ar: 'خطاب كراهية',         en: 'Hate speech' },
  { key: 'misinformation',        ar: 'معلومات مضللة',       en: 'Misinformation' },
  { key: 'spam',                  ar: 'سبام',                en: 'Spam' },
  { key: 'copyright',             ar: 'انتهاك حقوق نشر',     en: 'Copyright infringement' },
  { key: 'other',                 ar: 'سبب آخر',             en: 'Other' },
]

function ReportSheet({
  visible, onClose, onReport, onBlock, canBlock, ar,
}: {
  visible: boolean
  onClose: () => void
  onReport: (reason: string) => void
  onBlock: () => void
  canBlock: boolean
  ar: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.white,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: spacing.md, paddingHorizontal: spacing.lg,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          {/* Grab handle */}
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.grey200, marginBottom: spacing.md }} />

          <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900, marginBottom: spacing.xs }}>
            {ar ? 'الإبلاغ عن الفيديو' : 'Report video'}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.grey500, marginBottom: spacing.md }}>
            {ar ? 'اختر السبب لإرسال البلاغ لفريق المراجعة' : 'Pick a reason — our review team will check it'}
          </Text>

          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => onReport(r.key)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 14, paddingHorizontal: spacing.md,
                  borderRadius: 12,
                  backgroundColor: pressed ? colors.grey100 : 'transparent',
                })}
              >
                <Text style={{ fontSize: fontSize.base, color: colors.grey900, fontWeight: '600' }}>
                  {ar ? r.ar : r.en}
                </Text>
                <Ionicons name={ar ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.grey400} />
              </Pressable>
            ))}
          </ScrollView>

          {/* Divider + Block action */}
          {canBlock && (
            <>
              <View style={{ height: 1, backgroundColor: colors.grey100, marginVertical: spacing.sm }} />
              <Pressable
                onPress={onBlock}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                  paddingVertical: 14, paddingHorizontal: spacing.md,
                  borderRadius: 12,
                  backgroundColor: pressed ? '#FEE2E2' : '#FEF2F2',
                })}
              >
                <Ionicons name="ban" size={22} color="#DC2626" />
                <Text style={{ fontSize: fontSize.base, color: '#DC2626', fontWeight: '700' }}>
                  {ar ? 'حظر هذا الحساب' : 'Block this account'}
                </Text>
              </Pressable>
            </>
          )}

          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              marginTop: spacing.md, paddingVertical: 14, alignItems: 'center',
              backgroundColor: pressed ? colors.grey100 : colors.grey50, borderRadius: 12,
            })}
          >
            <Text style={{ fontSize: fontSize.base, color: colors.grey700, fontWeight: '700' }}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── VideoItem ────────────────────────────────────────────────────────────────
const VideoItem = memo(function VideoItem({
  video, isActive, height, onOpenComments, onAddToPlaylist, isSuggestedTab, onBlockedCreator,
}: {
  video: FeedVideo
  isActive: boolean
  height: number
  onOpenComments: (id: string, onCommentDelta?: (delta?: number) => void) => void
  onAddToPlaylist: (v: FeedVideo) => void
  isSuggestedTab?: boolean
  /** Notify parent that the user just blocked this creator, so the feed
   *  can drop their videos immediately. */
  onBlockedCreator?: (creatorId: string) => void
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const myId = useAuth((s) => s.user?.id)
  const { data: myInteraction } = useMyVideoInteraction(video.id)
  const toggleMut = useToggleVideoInteraction()

  // Local interaction + counts — optimistic & instant, and (crucially) re-seeded
  // ONLY when switching to a different video. Keying on video.like_count would
  // wipe the optimistic +1 on every feed re-fetch, because videos.like_count
  // isn't trigger-updated → that was why the counter "never showed".
  const [liked,       setLiked]       = useState(false)
  const [disliked,    setDisliked]    = useState(false)
  const [likeCount,    setLikeCount]    = useState(video.like_count    ?? 0)
  const [dislikeCount, setDislikeCount] = useState(video.dislike_count ?? 0)
  const [commentCount, setCommentCount] = useState(video.comment_count ?? 0)

  // Sync my like/dislike state from the server query when it loads
  useEffect(() => {
    setLiked(myInteraction === 'like')
    setDisliked(myInteraction === 'dislike')
  }, [myInteraction])

  // Re-seed counts only on a genuinely different video
  useEffect(() => {
    setLikeCount(video.like_count ?? 0)
    setDislikeCount(video.dislike_count ?? 0)
    setCommentCount(video.comment_count ?? 0)
  }, [video.id])

  const isStory = !!video.is_story

  // Atomic view count — counts each video once per session.
  // Errors are LOGGED explicitly (not swallowed) so we can diagnose
  // tracking issues from Metro/Xcode console without having to rebuild.
  const viewedRef = useRef(false)
  useEffect(() => {
    if (!isActive || viewedRef.current) return
    if (!video?.id) {
      console.warn('[view-track] skipping — missing video.id', { video })
      return
    }
    viewedRef.current = true
    console.log('[view-track] firing for', video.id, 'creator_video_id:', video.creator_video_id)

    supabase.rpc('increment_video_view', { p_video_id: video.id })
      .then(({ error }) => {
        if (error) console.warn('[view-track] increment_video_view failed:', error)
        else       console.log('[view-track] increment_video_view OK for', video.id)
      })
    supabase.rpc('award_watch_xp', { p_video_id: video.id }).then(() => {}, () => {})

    if (video.creator_video_id) {
      supabase.rpc('increment_creator_video_view', { p_creator_video_id: video.creator_video_id })
        .then(({ error }) => {
          if (error) console.warn('[view-track] increment_creator_video_view failed:', error)
          else       console.log('[view-track] increment_creator_video_view OK for', video.creator_video_id)
        })
    }
  }, [isActive, video?.id, video?.creator_video_id])

  // Cloudflare playback: prefer hls_url from DB, derive uid for fallback
  const cloudflareUid = video.cloudflare_uid
    || (video.source === 'creator' && video.thumbnail_url?.match(/cloudflarestream\.com\/([^/]+)/)?.[1])
    || null
  // Build HLS URL — prefer hls_url from DB, fallback to videodelivery.net (universal)
  const hlsUrl = video.hls_url
    || (cloudflareUid ? `https://videodelivery.net/${cloudflareUid}/manifest/video.m3u8` : null)
  const poster = video.thumbnail_url || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id, 'max') : null)

  // ── Source-aware tap: native creator → profile, YouTube channel → attribution sheet
  const [ytSheetOpen, setYtSheetOpen] = useState(false)
  const isYouTube = video.source === 'youtube'
  const { data: creatorProfile } = useQuery({
    queryKey: ['feed-creator-profile', video.creator_id],
    enabled: !!video.creator_id && !isYouTube,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .eq('id', video.creator_id!)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; name: string | null; username: string | null; avatar_url: string | null } | null
    },
  })
  const displayChannelName = (video.category === 'parent_pick' || video.is_suggested)
    ? 'KidTok'
    : isYouTube
      ? (video.channel_name || 'YouTube')
      : `@${creatorProfile?.username || creatorProfile?.name || video.channel_name || 'KidTok'}`
  const creatorAvatarUrl = !isYouTube ? creatorProfile?.avatar_url : null
  const openCreator = useCallback(() => {
    if (isYouTube) {
      // Never open fake KidTok profile for external YouTube channels
      setYtSheetOpen(true)
      return
    }
    const id = video.creator_id
    if (id) router.push(`/creator/${id}`)
  }, [isYouTube, video.creator_id])

  const handleLike = useCallback(() => {
    if (liked) {
      setLiked(false); setLikeCount(c => Math.max(0, c - 1))
    } else {
      setLiked(true);  setLikeCount(c => c + 1)
      if (disliked) { setDisliked(false); setDislikeCount(c => Math.max(0, c - 1)) }
    }
    toggleMut.mutate({ videoId: video.id, type: 'like' })
  }, [liked, disliked, video.id, toggleMut])

  const handleDislike = useCallback(() => {
    if (disliked) {
      setDisliked(false); setDislikeCount(c => Math.max(0, c - 1))
    } else {
      setDisliked(true);  setDislikeCount(c => c + 1)
      if (liked) { setLiked(false); setLikeCount(c => Math.max(0, c - 1)) }
    }
    toggleMut.mutate({ videoId: video.id, type: 'dislike' })
  }, [liked, disliked, video.id, toggleMut])
  const handleComments = useCallback(() => {
    onOpenComments(video.id, (delta = 1) => setCommentCount(c => Math.max(0, c + delta)))
  }, [video.id, onOpenComments])
  const handlePlaylist = useCallback(() => onAddToPlaylist(video), [video, onAddToPlaylist])
  const showCreatorInfo = !isSuggestedTab && !isYouTube && !!video.creator_id
  const canGiftCreator = !!video.creator_id && !isYouTube && video.creator_id !== myId
  const canQuickFollowCreator = showCreatorInfo && !!video.creator_id && video.creator_id !== myId
  const { data: serverFollowing = false } = useIsFollowing(video.creator_id || '')
  const followMut = useToggleFollow()
  const [localFollowing, setLocalFollowing] = useState<boolean | null>(null)
  useEffect(() => {
    setLocalFollowing(serverFollowing)
  }, [serverFollowing, video.creator_id])
  const isFollowingCreator = localFollowing ?? serverFollowing
  const handleQuickFollow = useCallback((event?: any) => {
    event?.stopPropagation?.()
    if (!canQuickFollowCreator || !video.creator_id || followMut.isPending) return

    const previous = isFollowingCreator
    const next = !previous
    setLocalFollowing(next)

    followMut.mutate(video.creator_id, {
      onSuccess: (followed) => {
        setLocalFollowing(followed)
        Toast.show({
          type: 'kidReward',
          text1: followed
            ? (ar ? 'تابعته بنجاح!' : 'Now following!')
            : (ar ? 'تم إلغاء المتابعة' : 'Unfollowed'),
          text2: followed
            ? (ar ? 'هتشوف فيديوهاته أكتر في المتابعة ✨' : 'You will see more from this creator ✨')
            : undefined,
          props: { icon: followed ? '⭐' : '👋', accent: 'blue' },
        })
      },
      onError: (err: any) => {
        setLocalFollowing(previous)
        Toast.show({
          type: 'error',
          text1: ar ? 'متابعة الحساب فشلت' : 'Follow failed',
          text2: String(err?.message || err).slice(0, 120),
        })
      },
    })
  }, [ar, canQuickFollowCreator, followMut, isFollowingCreator, video.creator_id])
  const handleGift = useCallback(() => {
    if (!video.creator_id || isYouTube || isSuggestedTab) {
      Toast.show({ type: 'info', text1: ar ? 'الهدايا متاحة لفيديوهات كيدتوك فقط' : 'Gifts are available for KidTok videos only' })
      return
    }
    if (video.creator_id === myId) {
      Toast.show({ type: 'info', text1: ar ? 'لا يمكن إرسال هدية لنفسك' : "You can't gift yourself" })
      return
    }
    router.push(`/gift/${video.creator_id}?videoId=${video.id}` as any)
  }, [ar, isSuggestedTab, isYouTube, myId, router, video.creator_id, video.id])

  // ── Report / Block menu ──────────────────────────────────────────────
  // Required for App Store §1.2 and Play UGC policy — every UGC app must
  // expose in-product report-content and block-user actions.
  const [moreOpen, setMoreOpen] = useState(false)
  const handleMore = useCallback(() => setMoreOpen(true), [])
  const closeMore  = useCallback(() => setMoreOpen(false), [])

  const submitReport = useCallback(async (reason: string) => {
    try {
      const { error } = await supabase.rpc('report_video', {
        p_video_id: video.id,
        p_creator_video_id: video.creator_video_id,
        p_reason: reason,
      })
      if (error) throw error
      Toast.show({
        type: 'success',
        text1: ar ? 'تم إرسال البلاغ' : 'Report submitted',
        text2: ar ? 'شكراً لمساعدتنا في إبقاء المحتوى آمناً' : 'Thanks for helping keep content safe',
      })
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: ar ? 'فشل إرسال البلاغ' : 'Report failed',
        text2: String(err?.message || err).slice(0, 120),
      })
    } finally {
      closeMore()
    }
  }, [video.id, video.creator_video_id, ar, closeMore])

  const handleBlock = useCallback(() => {
    if (!video.creator_id) {
      closeMore()
      Toast.show({ type: 'info', text1: ar ? 'لا يمكن حظر هذا المنشئ' : "Can't block this creator" })
      return
    }
    const creatorId = video.creator_id
    closeMore()
    Alert.alert(
      ar ? `حظر @${video.channel_name || ''}` : `Block @${video.channel_name || ''}`,
      ar
        ? 'لن ترى منشورات هذا الحساب بعد الآن، وسيتم إلغاء أي متابعة بينكما.'
        : "You won't see posts from this account anymore, and any mutual follows will be removed.",
      [
        { text: ar ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text:  ar ? 'حظر' : 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('block_user', { p_target_id: creatorId })
              if (error) throw error
              Toast.show({ type: 'success', text1: ar ? 'تم الحظر' : 'Blocked' })
              // Tell the parent feed to drop this video and any others by
              // the same creator. We use a React Query invalidate via a
              // global blocked-set ref instead of imperative removal.
              try { onBlockedCreator?.(creatorId) } catch {}
            } catch (err: any) {
              Toast.show({
                type: 'error',
                text1: ar ? 'فشل الحظر' : 'Block failed',
                text2: String(err?.message || err).slice(0, 120),
              })
            }
          },
        },
      ]
    )
  }, [video.creator_id, video.channel_name, ar, closeMore])

  // ── Single-tap pause / play (TikTok style) ─────────────────────────────────
  // الـ PanResponder الخاص بـ SwipeFeed بيمسك الجستشر بس لو dy > 10،
  // فالـ tap البسيط ما بيتعارضش معه — الـ Pressable بيستلمه نظيف.
  const [paused, setPaused] = useState(false)
  const [ended, setEnded] = useState(false)
  const togglePause = useCallback(() => setPaused((p) => !p), [])

  // ── Seek bar state (shared custom scrubber for YouTube + local) ─────────────
  const [progress, setProgress] = useState({ current: 0, duration: 0 })
  const seekRef = useRef<((seconds: number) => void) | null>(null)
  const maskPlayerRef = useRef<VideoPlayer | null>(null)
  const seekingRef    = useRef(false)
  const seekTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleProgress = useCallback((current: number, duration: number) => {
    if (seekingRef.current) return   // ignore stale poll values right after a seek
    setProgress((prev) => (prev.current === current && prev.duration === duration ? prev : { current, duration }))
    if (!isActive || duration <= 0) return
    if (current >= Math.max(0.2, duration - 0.35)) {
      setEnded(true)
      setPaused(true)
    } else if (current < Math.max(0, duration - 1.2)) {
      setEnded(false)
    }
  }, [isActive])
  const handleSeek = useCallback((seconds: number) => {
    setEnded(false)
    seekRef.current?.(seconds)
    setProgress((p) => ({ ...p, current: seconds }))
    seekingRef.current = true
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current)
    seekTimerRef.current = setTimeout(() => { seekingRef.current = false }, 700)
  }, [])
  useEffect(() => { if (!isActive) setProgress({ current: 0, duration: 0 }) }, [isActive])

  // ── Caption auto-hide ─────────────────────────────────────────────────────
  // Caption shows when video starts, then fades after 3s so the YouTube
  // seek bar (controls=1, bottom of iframe) is accessible. Any tap resets the
  // 3s timer. Caption stays visible when video is paused.
  const captionAnim     = useRef(new Animated.Value(1)).current
  const captionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [captionVisible, setCaptionVisible] = useState(true)

  const showCaption = useCallback(() => {
    if (captionTimerRef.current) clearTimeout(captionTimerRef.current)
    setCaptionVisible(true)
    Animated.timing(captionAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }, [captionAnim])

  const startHideTimer = useCallback(() => {
    if (captionTimerRef.current) clearTimeout(captionTimerRef.current)
    captionTimerRef.current = setTimeout(() => {
      Animated.timing(captionAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(
        ({ finished }) => { if (finished) setCaptionVisible(false) }
      )
    }, 3000)
  }, [captionAnim])

  useEffect(() => {
    if (!isActive) { showCaption(); return }
    if (paused) { showCaption() } else { startHideTimer() }
    return () => { if (captionTimerRef.current) clearTimeout(captionTimerRef.current) }
  }, [isActive, paused, showCaption, startHideTimer])

  // لما المستخدم يسحب لفيدو تاني (isActive=false)، نرجع paused لـ false
  // عشان لما يرجع للفيدو ده تاني يبدأ تلقائي.
  useEffect(() => {
    if (!isActive) {
      setPaused(false)
      setEnded(false)
    }
  }, [isActive])

  const replayEndedVideo = useCallback(() => {
    setEnded(false)
    seekRef.current?.(0)
    setProgress((p) => ({ ...p, current: 0 }))
    setPaused(false)
    showCaption()
    startHideTimer()
  }, [showCaption, startHideTimer])

  const handleVideoEnded = useCallback(() => {
    if (!isActive) return
    setEnded(true)
    setPaused(true)
    setProgress((p) => ({ current: p.duration || p.current, duration: p.duration || p.current }))
    showCaption()
  }, [isActive, showCaption])

  // ── Tap gesture detection — counts taps within 280ms window ────────────────
  //   • 1 tap  → pause/play
  //   • 2 taps → like + heart burst animation
  //   • 3+ taps → dislike + thumb-down burst animation
  // PanResponder only claims gestures with dy > 10 px, so taps never get
  // intercepted by the swipe handler — no gesture conflict.
  const tapCountRef  = useRef(0)
  const tapTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartOpacity = useRef(new Animated.Value(0)).current
  const heartScale   = useRef(new Animated.Value(0)).current
  const thumbOpacity = useRef(new Animated.Value(0)).current
  const thumbScale   = useRef(new Animated.Value(0)).current
  const [tapPos, setTapPos] = useState({ x: SCREEN_WIDTH / 2, y: height * 0.4 })

  useEffect(() => () => { if (tapTimerRef.current) clearTimeout(tapTimerRef.current) }, [])

  const animateHeart = useCallback(() => {
    heartScale.setValue(0); heartOpacity.setValue(1)
    Animated.sequence([
      Animated.spring(heartScale,   { toValue: 1.3, useNativeDriver: true, tension: 180, friction: 7 }),
      Animated.spring(heartScale,   { toValue: 1.0, useNativeDriver: true, tension: 180, friction: 7 }),
      Animated.delay(350),
      Animated.timing(heartOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start()
  }, [heartOpacity, heartScale])

  const animateDislike = useCallback(() => {
    thumbScale.setValue(0); thumbOpacity.setValue(1)
    Animated.sequence([
      Animated.spring(thumbScale,   { toValue: 1.2, useNativeDriver: true, tension: 180, friction: 7 }),
      Animated.spring(thumbScale,   { toValue: 1.0, useNativeDriver: true, tension: 180, friction: 7 }),
      Animated.delay(300),
      Animated.timing(thumbOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start()
  }, [thumbOpacity, thumbScale])

  const handleVideoPress = useCallback((e: any) => {
    if (ended) {
      replayEndedVideo()
      return
    }
    // Any tap → show caption for 3 more seconds (gives user time to reach seek bar)
    showCaption()
    startHideTimer()
    const { locationX, locationY } = e.nativeEvent
    tapCountRef.current += 1
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
    tapTimerRef.current = setTimeout(() => {
      const n = tapCountRef.current
      tapCountRef.current = 0
      if (n === 1) {
        togglePause()
      } else if (n === 2) {
        setTapPos({ x: locationX, y: locationY })
        handleLike()
        animateHeart()
      } else if (n >= 3) {
        setTapPos({ x: locationX, y: locationY })
        handleDislike()
        animateDislike()
      }
    }, 280)
  }, [ended, replayEndedVideo, togglePause, handleLike, handleDislike, animateHeart, animateDislike, showCaption, startHideTimer])

  // ── YouTube aspect detection ────────────────────────────────────────────────
  // The in-WebView oEmbed fetch was blocked by CORS in some WebView configs,
  // so the `.is-vertical` class never got added → Shorts rendered tiny in the
  // landscape iframe. Fetch from React Native (no CORS) and cache via React
  // Query (aspect never changes, so staleTime: Infinity is safe).
  const { data: ytAspect } = useQuery({
    queryKey: ['yt-aspect', video.youtube_id],
    queryFn: async () => {
      if (!video.youtube_id) return { isVertical: false }
      try {
        const url = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + video.youtube_id)}&format=json`
        const r = await fetch(url)
        if (!r.ok) return { isVertical: false }
        const d = await r.json() as { width?: number; height?: number }
        if (!d.width || !d.height) return { isVertical: false }
        return { isVertical: d.height / d.width > 1.05 }
      } catch {
        return { isVertical: false }
      }
    },
    enabled: video.source === 'youtube' && !!video.youtube_id,
    staleTime: Infinity,
    gcTime:    Infinity,
    retry: 1,
  })
  const isYouTubeVertical = ytAspect?.isVertical ?? false

  const videoContent = video.source === 'youtube' && video.youtube_id ? (
    <ReelWebVideo isActive={isActive} paused={paused} poster={poster} html={getYouTubeEmbedHtml(video.youtube_id, isYouTubeVertical)} onProgress={handleProgress} seekRef={seekRef} />
  ) : hlsUrl ? (
    <ReelNativeVideo
      isActive={isActive}
      paused={paused}
      hlsUrl={hlsUrl}
      poster={poster}
      onProgress={handleProgress}
      onEnded={handleVideoEnded}
      seekRef={seekRef}
      playerRef={maskPlayerRef}
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
        <AvatarMaskLayer video={video} isActive={isActive && !paused} playerRef={maskPlayerRef} width={SCREEN_WIDTH} height={height} />

        {/* طبقة الـ tap — tap واحد/2/3+، بنسيب آخر 56px لـ bar اليوتيوب */}
        <Pressable
          onPress={handleVideoPress}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 34 }}
        />

        {/* مؤشر الـ pause */}
        {paused && isActive && !ended && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="play" size={42} color="#fff" style={{ marginLeft: 5 }} />
            </View>
          </View>
        )}
        {ended && isActive && <EndedVideoHint ar={ar} onReplay={replayEndedVideo} />}

        {/* ❤️ Heart burst — double-tap like */}
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: tapPos.x - 44, top: tapPos.y - 44, opacity: heartOpacity, transform: [{ scale: heartScale }] }}
        >
          <Ionicons name="heart" size={88} color="#FF4458" />
        </Animated.View>

        {/* 👎 Dislike burst — triple-tap */}
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', left: tapPos.x - 36, top: tapPos.y - 36, opacity: thumbOpacity, transform: [{ scale: thumbScale }] }}
        >
          <Ionicons name="thumbs-down" size={72} color="rgba(255,255,255,0.9)" />
        </Animated.View>

        {/* Gradient أعلى للـ channel info */}
        <LinearGradient
          pointerEvents="box-none"
          colors={['rgba(0,0,0,0.72)', 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 52, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
        >
          {/* شريط التقدم */}
          <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: spacing.md, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: isActive ? '100%' : '0%', backgroundColor: colors.white, borderRadius: 2 }} />
          </View>
          {/* اسم الـ channel */}
          <Pressable onPress={openCreator} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isYouTube ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isYouTube ? '#DC2626' : colors.white }}>
              <Ionicons name={isYouTube ? 'logo-youtube' : 'person'} size={18} color={colors.white} />
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.sm }}>
                  {isYouTube ? (video.channel_name || 'YouTube') : `@${video.channel_name || 'KidTok'}`}
                </Text>
                {isYouTube && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(220,38,38,0.92)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 100 }}>
                    <Ionicons name="logo-youtube" size={8} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>YouTube</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
                {isYouTube ? 'محتوى خارجي' : 'ستوري'}
              </Text>
            </View>
          </Pressable>
        </LinearGradient>

        {/* Gradient أسفل للعنوان والأزرار — يختفي بصرياً بعد 3 ثواني
            لكن الـ Pressable للـ creator/like/comment يفضل hit-testable */}
        <Animated.View
          pointerEvents="box-none"
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: captionAnim }}
        >
          <LinearGradient
            pointerEvents="box-none"
            colors={['transparent', 'rgba(0,0,0,0.82)']}
            style={{ paddingBottom: insets.bottom + spacing.lg + 24, paddingTop: spacing.xl * 2, paddingHorizontal: spacing.lg }}
          >
            {video.title ? (
              <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '700', marginBottom: spacing.md }} numberOfLines={3}>
                {video.title}
              </Text>
            ) : null}
            {/* أزرار أفقية زي IG Stories */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <StoryActionBtn icon={liked ? 'heart' : 'heart-outline'} count={likeCount} active={liked} activeColor={colors.secondary} onPress={handleLike} />
              <StoryActionBtn icon="chatbubble-outline" count={commentCount} onPress={handleComments} />
              <StoryActionBtn icon="add-circle-outline" count={0} onPress={handlePlaylist} />
              {canGiftCreator && <StoryActionBtn icon="gift-outline" count={0} onPress={handleGift} />}
            </View>
          </LinearGradient>
        </Animated.View>
        <YouTubeAttributionSheet
          visible={ytSheetOpen}
          onClose={() => setYtSheetOpen(false)}
          channelName={video.channel_name}
          channelId={video.channel_id}
          videoThumbnail={video.thumbnail_url || (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg` : null)}
        />

        {isActive && (
          <FeedSeekBar current={progress.current} duration={progress.duration} onSeek={handleSeek} bottom={6} />
        )}
      </View>
    )
  }

  // ── Normal video layout (TikTok-style) ──────────────────────────────────────
  return (
    <View style={{ width: SCREEN_WIDTH, height, backgroundColor: '#000', overflow: 'hidden' }}>
      {videoContent}
      <AvatarMaskLayer video={video} isActive={isActive && !paused} playerRef={maskPlayerRef} width={SCREEN_WIDTH} height={height} />

      {/* طبقة الـ tap الشفافه — تيك توك ستايل:
          • tap واحد → pause/play
          • tap اتنين → like + قلب يطير ❤️
          • tap 3+ → dislike + 👎
          بنسيب آخر 56px فاضيين عشان bar اليوتيوب (seek) يفضل قابل للسحب،
          لأن مشغل اليوتيوب بيرسم الـ controls بتاعته في أسفل الـ iframe. */}
      <Pressable
        onPress={handleVideoPress}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 34 }}
      />

      {/* مؤشر الـ pause — backdrop كامل عشان يخفي مؤشر يوتيوب اللي بيظهر تلقائي
          لما الفيديو يتوقف (pointerEvents none فمايمنعش سحب الـ bar) */}
      {paused && isActive && !ended && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={42} color="#fff" style={{ marginLeft: 5 }} />
          </View>
        </View>
      )}
      {ended && isActive && <EndedVideoHint ar={ar} onReplay={replayEndedVideo} />}

      {/* ❤️ Heart burst — double-tap like */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: tapPos.x - 44, top: tapPos.y - 44, opacity: heartOpacity, transform: [{ scale: heartScale }] }}
      >
        <Ionicons name="heart" size={88} color="#FF4458" />
      </Animated.View>

      {/* 👎 Dislike burst — triple-tap */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: tapPos.x - 36, top: tapPos.y - 36, opacity: thumbOpacity, transform: [{ scale: thumbScale }] }}
      >
        <Ionicons name="thumbs-down" size={72} color="rgba(255,255,255,0.9)" />
      </Animated.View>

      {/* Caption — gradient/text auto-fade after 3s so YouTube's seek bar
          (controls=1) is accessible. The username Pressable stays
          hit-testable always (pointerEvents="box-none" doesn't change with
          captionVisible), so tapping the creator name routes to their
          profile even after the caption fades. */}
      <Animated.View
        pointerEvents="box-none"
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: captionAnim }}
      >
        <LinearGradient
          pointerEvents="box-none"
          colors={['transparent', 'rgba(0,0,0,0.88)']}
          style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: (showCreatorInfo ? 84 : 16) + insets.bottom + 24 }}
        >
        {(video.category === 'parent_pick' || video.is_suggested) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4, backgroundColor: 'rgba(3,187,229,0.2)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(3,187,229,0.4)' }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] }}>
              <Ionicons name="star" size={7} color="#fff" style={{ transform: [{ rotate: '-45deg' }] }} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>KidTok Picks</Text>
          </View>
        )}
        {video.title ? (
          <Text
            style={{
              color: colors.white,
              fontSize: fontSize.base,
              fontWeight: '800',
              marginTop: showCreatorInfo ? 8 : 26,
              marginBottom: showCreatorInfo ? 10 : 0,
              maxWidth: SCREEN_WIDTH - 132,
              textShadowColor: 'rgba(0,0,0,0.9)',
              textShadowRadius: 6,
            }}
            numberOfLines={2}
          >
            {video.title}
          </Text>
        ) : null}

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
      </Animated.View>

      {showCreatorInfo && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: spacing.lg,
            bottom: insets.bottom + 48,
            width: SCREEN_WIDTH - 132,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            zIndex: 16,
          }}
        >
          <View style={{ width: 42, height: 42, position: 'relative' }}>
            <Pressable
              onPress={openCreator}
              style={({ pressed }) => ({
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 2,
                borderColor: colors.white,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.86 : 1,
              })}
            >
              {creatorAvatarUrl ? (
                <Image source={{ uri: creatorAvatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Ionicons name="person" size={21} color={colors.white} />
              )}
            </Pressable>

            {canQuickFollowCreator && (
              <Pressable
                onPress={handleQuickFollow}
                disabled={followMut.isPending}
                hitSlop={8}
                style={({ pressed }) => ({
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isFollowingCreator ? '#22C55E' : colors.secondary,
                  borderWidth: 1.5,
                  borderColor: colors.white,
                  shadowColor: colors.black,
                  shadowOpacity: 0.25,
                  shadowRadius: 4,
                  elevation: 4,
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                  opacity: followMut.isPending ? 0.7 : 1,
                })}
              >
                {followMut.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={isFollowingCreator ? 'checkmark' : 'add'} size={12} color="#fff" />
                )}
              </Pressable>
            )}
          </View>

          <Pressable onPress={openCreator} style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 }} numberOfLines={1}>
              {displayChannelName}
            </Text>
            {creatorProfile?.name && creatorProfile.username && (
              <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 5 }} numberOfLines={1}>
                {creatorProfile.name}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <View style={{ position: 'absolute', right: spacing.md, bottom: 90 + insets.bottom, gap: spacing.md, alignItems: 'center' }}>
        <ActionButton icon={liked ? 'heart' : 'heart-outline'} count={likeCount} active={liked} activeColor={colors.secondary} onPress={handleLike} size={20} />
        <ActionButton icon={disliked ? 'thumbs-down' : 'thumbs-down-outline'} count={dislikeCount} active={disliked} onPress={handleDislike} size={20} />
        <ActionButton icon="chatbubble" count={commentCount} onPress={handleComments} size={20} />
        <ActionButton
          icon="add"
          count={0}
          onPress={handlePlaylist}
          active={isSuggestedTab}
          activeColor={colors.secondary}
          size={20}
        />
        {canGiftCreator && <ActionButton icon="gift" count={0} onPress={handleGift} size={20} />}
        <ActionButton icon="alert-circle-outline" count={0} onPress={handleMore} size={20} />
      </View>

      {/* YouTube attribution sheet — replaces fake creator profile */}
      <YouTubeAttributionSheet
        visible={ytSheetOpen}
        onClose={() => setYtSheetOpen(false)}
        channelName={video.channel_name}
        channelId={video.channel_id}
        videoThumbnail={video.thumbnail_url || (video.youtube_id ? `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg` : null)}
      />

      {/* Report / Block bottom sheet — required for App Store + Play UGC compliance */}
      <ReportSheet
        visible={moreOpen}
        onClose={closeMore}
        onReport={submitReport}
        onBlock={handleBlock}
        canBlock={!!video.creator_id}
        ar={ar}
      />

      {isActive && (
        <FeedSeekBar current={progress.current} duration={progress.duration} onSeek={handleSeek} bottom={6} />
      )}
    </View>
  )
})

// ─── ReelWebVideo ─────────────────────────────────────────────────────────────
const ReelWebVideo = memo(function ReelWebVideo({
  isActive, paused, poster, html, uri, onProgress, seekRef,
}: {
  isActive: boolean
  paused?: boolean
  poster: string | null
  html?: string
  uri?: string
  onProgress?: (current: number, duration: number) => void
  seekRef?: { current: ((seconds: number) => void) | null }
}) {
  const webViewRef = useRef<any>(null)

  // Expose seek to the parent's FeedSeekBar — calls YT.Player API directly.
  useEffect(() => {
    if (!seekRef) return
    seekRef.current = (seconds: number) => {
      webViewRef.current?.injectJavaScript(getYouTubeSeekCommand(seconds))
    }
    return () => { if (seekRef) seekRef.current = null }
  }, [seekRef])

  // Progress "p:<current>:<duration>" from the player's 250ms poll.
  const handleWebViewMessage = useCallback((e: any) => {
    const raw = e?.nativeEvent?.data
    if (typeof raw !== 'string' || !raw.startsWith('p:')) return
    const parts = raw.split(':')
    const c = parseFloat(parts[1]); const d = parseFloat(parts[2])
    if (isFinite(c) && isFinite(d) && d > 0) onProgress?.(c, d)
  }, [onProgress])

  const syncYouTubeAudio = useCallback(() => {
    if (!html) return
    webViewRef.current?.injectJavaScript(getYouTubeAudioCommand(false))
  }, [html])

  const sendPlayPause = useCallback((shouldPause: boolean) => {
    if (!html) return
    webViewRef.current?.injectJavaScript(getYouTubePlayPauseCommand(shouldPause))
  }, [html])

  useEffect(() => {
    if (isActive && html) syncYouTubeAudio()
  }, [isActive, html, syncYouTubeAudio])

  // React to paused changes — send play/pause command to the iframe.
  useEffect(() => {
    if (isActive) sendPlayPause(!!paused)
  }, [paused, isActive, sendPlayPause])

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
          thirdPartyCookiesEnabled={false}
          userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onLoadEnd={syncYouTubeAudio}
          onMessage={handleWebViewMessage}
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.toLowerCase()
            if (url.includes('youtube.com/watch') || url.includes('youtube.com/redirect')) return false
            return true
          }}
        />
      )}

      {/* Tap layer — provides play/pause control since YT controls are hidden (compliance + UX) */}
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
  return `window.kidtokSetMuted && window.kidtokSetMuted(${muted}); true;`
}

// Seek directly via the YT.Player API (reliable — no postMessage origin issues).
function getYouTubeSeekCommand(seconds: number) {
  const sec = Math.max(0, seconds)
  return `window.kidtokSeek && window.kidtokSeek(${sec}); true;`
}

// Play / pause via the YT.Player API.
function getYouTubePlayPauseCommand(shouldPause: boolean) {
  return `window.kidtokPlayPause && window.kidtokPlayPause(${shouldPause}); true;`
}

function getYouTubeEmbedHtml(videoId: string, isVertical = false) {
  // Uses the official YouTube IFrame Player API (YT.Player) instead of a raw
  // iframe + postMessage protocol. This gives DIRECT, reliable JS methods:
  //   ytPlayer.seekTo(sec, true)  ytPlayer.playVideo()  ytPlayer.getCurrentTime()
  // exposed to React Native via window.kidtok* functions (injectJavaScript).
  // controls:0 hides YouTube's native UI — our custom FeedSeekBar drives seeking.
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden}
.wrap{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden}
#kidtok-player{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
</style>
</head>
<body>
<div class="wrap"><div id="kidtok-player"></div></div>
<script>
  var ytPlayer = null, ytReady = false;

  // ── Controls exposed to React Native (called via injectJavaScript) ──
  window.kidtokSeek = function(sec){
    if (ytPlayer && ytReady) { try { ytPlayer.seekTo(sec, true); ytPlayer.playVideo(); } catch(e){} }
  };
  window.kidtokSetMuted = function(m){
    if (ytPlayer && ytReady) { try { m ? ytPlayer.mute() : ytPlayer.unMute(); } catch(e){} }
  };
  window.kidtokPlayPause = function(pause){
    if (ytPlayer && ytReady) { try { pause ? ytPlayer.pauseVideo() : ytPlayer.playVideo(); } catch(e){} }
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
          // Progress poll → drives the custom FeedSeekBar
          setInterval(function(){
            if (!ytPlayer) return;
            try {
              var ct = ytPlayer.getCurrentTime();
              var dur = ytPlayer.getDuration();
              if (dur > 0) postRN('p:' + ct + ':' + dur);
            } catch(_){}
          }, 250);
        },
        onStateChange: function(e){
          // 0 = ENDED → loop, BUT only if genuinely at the end. seekTo() can fire
          // a transient state-0 mid-video; without this guard that would snap the
          // video back to the beginning every time the user scrubs.
          if (e.data === 0) {
            var ct = 0, dur = 0;
            try { ct = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); } catch(_){}
            if (dur > 0 && ct >= dur - 1.5) { postRN('p:' + dur + ':' + dur); }
          }
          if (e.data === 1) { postRN('playing'); } // PLAYING
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

// ─── ActionButton (عمودي — للـ normal video) ──────────────────────────────────
function EndedVideoHint({ ar, onReplay }: { ar: boolean; onReplay: () => void }) {
  return (
    <Pressable
      onPress={onReplay}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 18,
        backgroundColor: 'rgba(0,0,0,0.28)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ alignItems: 'center', gap: 10 }}>
        <View style={{ width: 138, height: 138, borderRadius: 69, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-down" size={90} color="rgba(255,255,255,0.78)" />
          <Ionicons name="chevron-down" size={64} color="rgba(255,255,255,0.32)" style={{ marginTop: -42 }} />
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm, fontWeight: '900', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 8 }}>
          {ar ? 'اسحب للفيديو التالي' : 'Swipe for the next video'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: '700' }}>
          {ar ? 'أو اضغط لإعادة التشغيل' : 'or tap to replay'}
        </Text>
      </View>
    </Pressable>
  )
}

const ActionButton = memo(function ActionButton({
  icon, count, active, activeColor, onPress, size = 22,
}: { icon: any; count: number; active?: boolean; activeColor?: string; onPress: () => void; size?: number }) {
  const circleSize = size + 14   // tighter circle than before
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 3 }}>
      <View style={{ width: circleSize, height: circleSize, borderRadius: circleSize / 2, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={size} color={active ? (activeColor || colors.primary) : colors.white} />
      </View>
      {count > 0 && (
        <Text style={{ color: colors.white, fontSize: 10, fontWeight: '600' }}>
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
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const { data: children = [] } = useQuery({
    queryKey: ['children-for-add-video', userId],
    enabled: visible && !!userId,
    staleTime: 0,
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
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlists').select('id, name, playlist_videos(id)')
        .eq('child_id', selectedChildId).order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((p: any) => ({ id: p.id, name: p.name, video_count: p.playlist_videos?.length || 0 }))
    },
  })

  // Every time the modal opens, invalidate caches so newly-created
  // children/playlists from /children/new or /children/[id] show up immediately.
  useEffect(() => {
    if (visible && userId) {
      qc.invalidateQueries({ queryKey: ['children-for-add-video', userId] })
    }
  }, [visible, userId, qc])
  useEffect(() => {
    if (visible && selectedChildId) {
      qc.invalidateQueries({ queryKey: ['playlists-for-add-video', selectedChildId] })
    }
  }, [visible, selectedChildId, qc])

  const handleClose = () => { setSelectedChildId(null); setAddingId(null); setAddedIds(new Set()); onClose() }

  const addToPlaylist = async (playlistId: string) => {
    if (!video || addedIds.has(playlistId)) return
    setAddingId(playlistId)
    try {
      const { data: existing } = await supabase.from('playlist_videos').select('id').eq('playlist_id', playlistId).eq('video_id', video.id).maybeSingle()
      if (existing) { setAddedIds((p) => new Set([...p, playlistId])); Toast.show({ type: 'info', text1: ar ? 'الفيديو موجود بالفعل في القائمة' : 'Already in this playlist' }); return }
      const { data: last } = await supabase.from('playlist_videos').select('position').eq('playlist_id', playlistId).order('position', { ascending: false }).limit(1).maybeSingle()
      const { error } = await supabase.from('playlist_videos').insert({ playlist_id: playlistId, video_id: video.id, position: ((last?.position ?? -1) as number) + 1 })
      if (error) throw error
      setAddedIds((p) => new Set([...p, playlistId]))
      await qc.invalidateQueries({ queryKey: ['playlist-videos', playlistId] })
      await qc.invalidateQueries({ queryKey: ['playlists'] })
      Toast.show({ type: 'success', text1: ar ? 'تمت إضافة الفيديو للقائمة' : 'Added to playlist' })
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally { setAddingId(null) }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>{ar ? 'إضافة إلى قائمة' : 'Add to playlist'}</Text>
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
                <Text style={{ color: colors.grey600, fontWeight: '700', marginBottom: spacing.sm }}>{ar ? 'اختار الطفل' : 'Choose child'}</Text>
                {children.length === 0
                  ? (
                    <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.md }}>
                      <Ionicons name="person-add-outline" size={48} color={colors.grey300} />
                      <Text style={{ color: colors.grey600, textAlign: 'center' }}>
                        {ar ? 'لا يوجد أطفال بعد' : 'No children yet'}
                      </Text>
                      <Pressable
                        onPress={() => { handleClose(); router.push('/children/new') }}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? '#029ac2' : colors.primary,
                          paddingVertical: spacing.sm + 4,
                          paddingHorizontal: spacing.lg,
                          borderRadius: radius.pill,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        })}
                      >
                        <Ionicons name="add" size={20} color={colors.white} />
                        <Text style={{ color: colors.white, fontWeight: '800' }}>
                          {ar ? 'إضافة طفل' : 'Add a child'}
                        </Text>
                      </Pressable>
                    </View>
                  )
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
                  <Text style={{ color: colors.primary, fontWeight: '800' }}>{ar ? 'رجوع للأطفال' : 'Back to children'}</Text>
                </Pressable>
                {playlistsLoading ? <ActivityIndicator color={colors.primary} /> : playlists.length === 0
                  ? (
                    <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.md }}>
                      <Ionicons name="list-outline" size={48} color={colors.grey300} />
                      <Text style={{ color: colors.grey600, textAlign: 'center' }}>
                        {ar ? 'لا توجد قوائم تشغيل لهذا الطفل' : 'No playlists for this child'}
                      </Text>
                      <Pressable
                        onPress={() => { handleClose(); router.push(`/children/${selectedChildId}` as any) }}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? '#029ac2' : colors.primary,
                          paddingVertical: spacing.sm + 4,
                          paddingHorizontal: spacing.lg,
                          borderRadius: radius.pill,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                        })}
                      >
                        <Ionicons name="add" size={20} color={colors.white} />
                        <Text style={{ color: colors.white, fontWeight: '800' }}>
                          {ar ? 'إنشاء قائمة' : 'Create playlist'}
                        </Text>
                      </Pressable>
                    </View>
                  )
                  : playlists.map((playlist: any) => {
                    const added = addedIds.has(playlist.id)
                    return (
                      <Pressable key={playlist.id} onPress={() => addToPlaylist(playlist.id)} disabled={added || addingId === playlist.id}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: added ? `${colors.primary}15` : colors.grey50, marginBottom: spacing.sm }}>
                        <Ionicons name={added ? 'checkmark-circle' : 'list'} size={26} color={added ? colors.primary : colors.grey700} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '800', color: colors.grey900 }}>{playlist.name}</Text>
                          <Text style={{ color: colors.grey600, fontSize: fontSize.xs }}>{playlist.video_count} {ar ? 'فيديو' : 'videos'}</Text>
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
              <Text style={{ color: colors.white, fontWeight: '900' }}>{ar ? 'تم' : 'Done'}</Text>
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
  const { data: adminBlockedUserIds = [] } = useAdminBlockedUserIds()
  const adminBlockedUserSet = useMemo(() => new Set(adminBlockedUserIds), [adminBlockedUserIds])

  // ─── Inline Find-Users sheet ────────────────────────────────────────
  // Tapping "Find Users" opens this sheet instead of jumping to the Search
  // tab. Same search_users RPC, same row layout, same /creator/[id] tap
  // behavior — just hosted inside the feed so the user doesn't lose their
  // place when they're done browsing.
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findResults, setFindResults] = useState<any[]>([])
  const [findLoading, setFindLoading] = useState(false)
  const findDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runFindSearch = useCallback(async (q: string) => {
    const trimmed = q.replace(/^@/, '').trim()
    if (!trimmed) { setFindResults([]); setFindLoading(false); return }
    setFindLoading(true)
    try {
      const { data } = await supabase.rpc('search_users', { p_query: trimmed, p_limit: 20 })
      setFindResults((data || []).filter((u: any) => !adminBlockedUserSet.has(u.id)))
    } catch { setFindResults([]) }
    finally { setFindLoading(false) }
  }, [adminBlockedUserSet])
  const onFindQueryChange = useCallback((q: string) => {
    setFindQuery(q)
    if (findDebounceRef.current) clearTimeout(findDebounceRef.current)
    findDebounceRef.current = setTimeout(() => runFindSearch(q), 350)
  }, [runFindSearch])
  // Track keyboard height so the bottom-sheet sits above the keys
  const [findKbHeight, setFindKbHeight] = useState(0)
  useEffect(() => {
    if (!findOpen) return
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const showSub = Keyboard.addListener(showEvt, (e: any) => setFindKbHeight(e?.endCoordinates?.height ?? 0))
    const hideSub = Keyboard.addListener(hideEvt, () => setFindKbHeight(0))
    return () => { showSub.remove(); hideSub.remove() }
  }, [findOpen])
  const closeFind = useCallback(() => {
    setFindOpen(false)
    setFindQuery('')
    setFindResults([])
    setFindKbHeight(0)
  }, [])

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

  // Fetch a wider pool than we'll show — gives variety to reshuffle from.
  // Each refresh tap just re-permutes this pool client-side; only when the
  // 2-minute staleTime expires do we hit the network again.
  const { data: rawTopUsers = [], refetch: refetchTopUsers } = useQuery({
    queryKey: ['top-creators-pool', myId],
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url, followers_count')
        .order('followers_count', { ascending: false })
        .limit(30)
      return data || []
    },
  })

  // Locally hidden creators — set when a row finishes its fade-out
  // animation so the gap collapses immediately, before the my-following-ids
  // invalidation roundtrip catches up.
  const [hiddenTopIds, setHiddenTopIds] = useState<Set<string>>(new Set())
  // Bumped on refresh-tap to force a fresh shuffle.
  const [topShuffleNonce, setTopShuffleNonce] = useState(0)

  const refreshTopUsers = useCallback(() => {
    setTopShuffleNonce(n => n + 1)
    setHiddenTopIds(new Set())
    refetchTopUsers()
  }, [refetchTopUsers])

  const onTopCreatorHide = useCallback((id: string) => {
    setHiddenTopIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // Visible 5 — filter by self + followed + locally-hidden, shuffle, slice.
  // We *intentionally* re-roll Math.random inside the memo: it only runs
  // when one of the deps changes, so the order is stable across re-renders
  // but new every refresh / follow.
  const topUsers = useMemo(() => {
    // referenced just to register the shuffle-nonce as a memo dep
    void topShuffleNonce
    return [...rawTopUsers]
      .filter((u: any) => u.id !== myId && !myFollowingIds.includes(u.id) && !hiddenTopIds.has(u.id) && !adminBlockedUserSet.has(u.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 5)
  }, [rawTopUsers, myFollowingIds, myId, hiddenTopIds, topShuffleNonce, adminBlockedUserSet])

  return (
    <View style={{ alignItems: 'center', width: '100%' }}>
      <Ionicons name="people-outline" size={64} color={colors.grey400} />
      <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: spacing.md }}>
        {ar ? 'لا تتابع أحداً بعد' : 'Not following anyone yet'}
      </Text>
      <Text style={{ color: colors.grey400, fontSize: fontSize.sm, marginTop: 6, textAlign: 'center' }}>
        {ar ? 'اتبع منشئي محتوى لتظهر فيديوهاتهم هنا' : 'Follow creators to see their videos here'}
      </Text>

      {/* Search button — opens an inline sheet so the user stays on the feed */}
      <Pressable
        onPress={() => setFindOpen(true)}
        style={{ marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.secondary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, elevation: 4, shadowColor: colors.secondary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
      >
        <Ionicons name="search" size={16} color={colors.white} />
        <Text style={{ color: colors.white, fontWeight: '900', fontSize: fontSize.sm }}>{ar ? 'ابحث عن مستخدمين' : 'Find Users'}</Text>
      </Pressable>

      {/* Top creators */}
      {topUsers.length > 0 && (
        <View style={{ width: '100%', marginTop: spacing.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: spacing.md }}>
            <Text style={{ color: colors.grey300, fontSize: fontSize.sm, fontWeight: '700' }}>
              🌟 {ar ? 'الأكثر متابعة' : 'Most Followed'}
            </Text>
            <Pressable
              onPress={refreshTopUsers}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                alignItems: 'center', justifyContent: 'center',
              })}
            >
              <Ionicons name="refresh" size={15} color={colors.white} />
            </Pressable>
          </View>
          {topUsers.map((u: any) => (
            <TopCreatorRow key={u.id} user={u} onHide={onTopCreatorHide} />
          ))}
        </View>
      )}

      {/* Inline Find Users sheet */}
      <Modal visible={findOpen} animationType="slide" transparent onRequestClose={closeFind}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', paddingBottom: findKbHeight }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>
                {ar ? 'ابحث عن مستخدمين' : 'Find Users'}
              </Text>
              <Pressable onPress={closeFind}>
                <Ionicons name="close" size={28} color={colors.grey700} />
              </Pressable>
            </View>

            {/* Search input */}
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.grey50, borderRadius: radius.pill, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.grey100 }}>
                <Ionicons name="search" size={18} color={colors.grey500} />
                <TextInput
                  value={findQuery}
                  onChangeText={onFindQueryChange}
                  placeholder={ar ? 'اسم أو @يوزرنيم' : 'Name or @username'}
                  placeholderTextColor={colors.grey400}
                  autoFocus
                  style={{ flex: 1, paddingVertical: spacing.md, fontSize: fontSize.base, color: colors.grey900 }}
                />
                {findLoading && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
            </View>

            {/* Results */}
            <ScrollView
              style={{ maxHeight: 500 }}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
              keyboardShouldPersistTaps="handled"
            >
              {findQuery.trim() === '' ? (
                <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 20 }}>
                  <Ionicons name="people-outline" size={48} color={colors.grey200} />
                  <Text style={{ color: colors.grey400, marginTop: spacing.sm }}>
                    {ar ? 'ابدأ الكتابة للبحث...' : 'Start typing to search…'}
                  </Text>
                </View>
              ) : findResults.length === 0 && !findLoading ? (
                <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 20 }}>
                  <Text style={{ color: colors.grey400 }}>
                    {ar ? 'لا توجد نتائج' : 'No results'}
                  </Text>
                </View>
              ) : (
                findResults.map((u: any) => (
                  <Pressable
                    key={u.id}
                    onPress={() => {
                      closeFind()
                      // Same destination the standalone Search tab uses —
                      // the creator profile, where the user can follow + see videos.
                      router.push(`/creator/${u.id}` as any)
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      paddingVertical: spacing.md,
                      borderBottomWidth: 1, borderBottomColor: colors.grey100,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                      {u.avatar_url
                        ? <Image source={{ uri: u.avatar_url }} style={{ width: '100%', height: '100%' }} />
                        : <Ionicons name="person" size={26} color={colors.white} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: fontSize.base, color: colors.grey900 }}>
                        {u.name || (ar ? 'مستخدم' : 'User')}
                      </Text>
                      {u.username && (
                        <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' }}>@{u.username}</Text>
                      )}
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>
                        {(u.followers_count ?? 0) > 999 ? `${((u.followers_count ?? 0)/1000).toFixed(1)}k` : (u.followers_count ?? 0)} {ar ? 'متابع' : 'followers'}
                      </Text>
                    </View>
                    <Ionicons name={ar ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.grey400} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function TopCreatorRow({ user, onHide }: { user: any; onHide?: (id: string) => void }) {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const myId = useAuth((s) => s.user?.id)
  const { data: isFollowing } = useIsFollowing(user.id)
  const toggleFollow = useToggleFollow()

  // Fade IN on mount so when a follower disappears and the next row
  // slides into its slot, the new face appears smoothly instead of
  // popping in. Starts at 0, animates to 1 in 350ms.
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start()
  }, [opacity])

  // Lock further taps once the row is fading away.
  const [fading, setFading] = useState(false)

  const handleFollow = (e: any) => {
    e.stopPropagation()
    if (fading || isFollowing) {
      // Already following, or already animating away — ignore.
      if (!isFollowing) toggleFollow.mutate(user.id)
      return
    }
    setFading(true)
    toggleFollow.mutate(user.id)
    Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
      onHide?.(user.id)
    })
  }

  if (user.id === myId) return null

  return (
    <Animated.View style={{ opacity }}>
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
          onPress={handleFollow}
          disabled={fading}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: isFollowing ? 'rgba(255,255,255,0.15)' : colors.primary }}
        >
          <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.sm }}>
            {isFollowing ? (ar ? 'تتابع ✓' : 'Following ✓') : (ar ? '+ متابعة' : '+ Follow')}
          </Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  )
}
