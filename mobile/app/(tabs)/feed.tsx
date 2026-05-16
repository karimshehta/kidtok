import { useRef, useState } from 'react'
import {
  View,
  Text,
  Dimensions,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'
import { WebView } from 'react-native-webview'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useMyVideoInteraction, useToggleVideoInteraction } from '@/hooks/useSocial'
import { useIsCreator } from '@/hooks/useMyRole'
import CommentsSheet from '@/components/CommentsSheet'
import ChildAvatar from '@/components/ChildAvatar'
import { getYouTubeThumbnail } from '@/lib/youtube'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')

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
}

const FEED_SELECT = 'id, title, source, youtube_id, thumbnail_url, channel_name, channel_id, creator_id, creator_video_id, like_count, dislike_count, view_count, comment_count'

export default function FeedScreen() {
  const [tab, setTab] = useState<FeedTab>('foryou')
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [commentsForVideo, setCommentsForVideo] = useState<string | null>(null)
  const [playlistVideo, setPlaylistVideo] = useState<FeedVideo | null>(null)
  const userId = useAuth((s) => s.user?.id)
  const isCreator = useIsCreator()
  const router = useRouter()
  const itemHeight = SCREEN_HEIGHT

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

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index || 0)
  }).current

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 70 }).current

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source={require('../../assets/images/logo.png')} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.white }} />
            <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4 }}>
              KidTok
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill, padding: 3 }}>
          <TabBtn label="لك" active={tab === 'foryou'} onPress={() => setTab('foryou')} />
          <TabBtn label="أتابع" active={tab === 'following'} onPress={() => setTab('following')} />
          </View>
          <Pressable
            onPress={() => setMuted((value) => !value)}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={colors.white} />
          </Pressable>
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
            {tab === 'following' ? 'لا تتابع أحدا بعد' : 'لا توجد فيديوهات بعد'}
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
              muted={muted}
              onOpenComments={() => setCommentsForVideo(item.id)}
              onAddToPlaylist={() => setPlaylistVideo(item)}
            />
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={<RefreshControl tintColor={colors.white} refreshing={isFetching} onRefresh={refetch} />}
        />
      )}

      {isCreator && (
        <Pressable
          onPress={() => router.push('/creator/record')}
          style={({ pressed }) => ({
            position: 'absolute',
            right: spacing.lg,
            bottom: 100,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.secondary,
            alignItems: 'center',
            justifyContent: 'center',
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

      <AddToPlaylistModal
        video={playlistVideo}
        visible={!!playlistVideo}
        onClose={() => setPlaylistVideo(null)}
      />
    </View>
  )
}

function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: spacing.sm + 2, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: active ? colors.white : 'transparent' }}>
      <Text
        style={{
          color: active ? colors.grey900 : 'rgba(255,255,255,0.75)',
          fontSize: fontSize.xs,
          fontWeight: active ? '900' : '600',
          textShadowColor: 'rgba(0,0,0,0.5)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function VideoItem({
  video,
  isActive,
  height,
  muted,
  onOpenComments,
  onAddToPlaylist,
}: {
  video: FeedVideo
  isActive: boolean
  height: number
  muted: boolean
  onOpenComments: () => void
  onAddToPlaylist: () => void
}) {
  const router = useRouter()
  const { data: myInteraction } = useMyVideoInteraction(video.id)
  const toggleMut = useToggleVideoInteraction()
  const cloudflareUid = video.source === 'creator'
    ? video.thumbnail_url?.match(/cloudflarestream\.com\/([^/]+)/)?.[1] || null
    : null
  const poster = video.thumbnail_url || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id, 'max') : null)

  const openCreator = () => {
    const creatorId = video.creator_id || video.channel_id
    if (creatorId) router.push(`/creator/${creatorId}`)
  }

  return (
    <View style={{ width: SCREEN_WIDTH, height, backgroundColor: colors.black }}>
      {video.source === 'youtube' && video.youtube_id ? (
        <ReelWebVideo
          isActive={isActive}
          poster={poster}
          html={getYouTubeEmbedHtml(video.youtube_id, muted)}
        />
      ) : cloudflareUid ? (
        <ReelWebVideo
          isActive={isActive}
          poster={poster}
          uri={`https://iframe.cloudflarestream.com/${cloudflareUid}?autoplay=true&muted=${muted ? 'true' : 'false'}&controls=false&loop=true`}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="play-circle" size={80} color={colors.grey400} />
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 90 }}
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

      <View style={{ position: 'absolute', right: spacing.md, bottom: 130, gap: spacing.lg, alignItems: 'center' }}>
        <ActionButton
          icon={myInteraction === 'like' ? 'heart' : 'heart-outline'}
          count={video.like_count}
          active={myInteraction === 'like'}
          activeColor={colors.secondary}
          onPress={() => toggleMut.mutate({ videoId: video.id, type: 'like' })}
        />
        <ActionButton
          icon={myInteraction === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'}
          count={video.dislike_count}
          active={myInteraction === 'dislike'}
          onPress={() => toggleMut.mutate({ videoId: video.id, type: 'dislike' })}
        />
        <ActionButton icon="chatbubble" count={video.comment_count} onPress={onOpenComments} />
        <ActionButton icon="add" count={0} onPress={onAddToPlaylist} />
        <ActionButton icon="gift" count={0} onPress={() => Toast.show({ type: 'info', text1: 'الهدايا قريبا' })} />
      </View>
    </View>
  )
}

function ReelWebVideo({
  isActive,
  poster,
  html,
  uri,
}: {
  isActive: boolean
  poster: string | null
  html?: string
  uri?: string
}) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.black, overflow: 'hidden' }}>
      {poster && (
        <Image
          source={{ uri: poster }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: isActive ? 0.35 : 1 }}
          resizeMode="cover"
          blurRadius={isActive ? 18 : 0}
        />
      )}
      {isActive && (html || uri) ? (
        <WebView
          originWhitelist={['*']}
          source={html ? { html } : { uri: uri! }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          containerStyle={{ position: 'absolute', inset: 0, backgroundColor: 'transparent' }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo={false}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          cacheEnabled
          thirdPartyCookiesEnabled
          userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          onShouldStartLoadWithRequest={(request) => {
            const url = request.url.toLowerCase()
            return !url.includes('/watch') && !url.includes('youtube.com/redirect')
          }}
        />
      ) : (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={38} color={colors.white} style={{ marginLeft: 4 }} />
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

function ActionButton({
  icon,
  count,
  active,
  activeColor,
  onPress,
}: { icon: any; count: number; active?: boolean; activeColor?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center',
          justifyContent: 'center',
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

function AddToPlaylistModal({
  video,
  visible,
  onClose,
}: { video: FeedVideo | null; visible: boolean; onClose: () => void }) {
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
        .from('children')
        .select('id, name, gender, image_url, age:ages(name_ar, name_en)')
        .eq('parent_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const { data: playlists = [], isLoading: playlistsLoading } = useQuery({
    queryKey: ['playlists-for-add-video', selectedChildId],
    enabled: visible && !!selectedChildId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlists')
        .select('id, name, playlist_videos(id)')
        .eq('child_id', selectedChildId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        video_count: p.playlist_videos?.length || 0,
      }))
    },
  })

  const handleClose = () => {
    setSelectedChildId(null)
    setAddingId(null)
    setAddedIds(new Set())
    onClose()
  }

  const addToPlaylist = async (playlistId: string) => {
    if (!video || addedIds.has(playlistId)) return
    setAddingId(playlistId)
    try {
      const { data: existing } = await supabase
        .from('playlist_videos')
        .select('id')
        .eq('playlist_id', playlistId)
        .eq('video_id', video.id)
        .maybeSingle()
      if (existing) {
        setAddedIds((prev) => new Set([...prev, playlistId]))
        Toast.show({ type: 'info', text1: 'الفيديو موجود بالفعل في القائمة' })
        return
      }

      const { data: last } = await supabase
        .from('playlist_videos')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error } = await supabase.from('playlist_videos').insert({
        playlist_id: playlistId,
        video_id: video.id,
        position: ((last?.position ?? -1) as number) + 1,
      })
      if (error) throw error

      setAddedIds((prev) => new Set([...prev, playlistId]))
      await qc.invalidateQueries({ queryKey: ['playlist-videos', playlistId] })
      await qc.invalidateQueries({ queryKey: ['playlists'] })
      Toast.show({ type: 'success', text1: 'تمت إضافة الفيديو للقائمة' })
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setAddingId(null)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>إضافة إلى قائمة</Text>
            <Pressable onPress={handleClose}>
              <Ionicons name="close" size={28} color={colors.grey900} />
            </Pressable>
          </View>

          {video && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.grey50 }}>
              {video.thumbnail_url ? (
                <Image source={{ uri: video.thumbnail_url }} style={{ width: 72, height: 42, borderRadius: radius.sm, backgroundColor: colors.grey200 }} />
              ) : (
                <View style={{ width: 72, height: 42, borderRadius: radius.sm, backgroundColor: colors.grey200, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="film-outline" size={22} color={colors.grey400} />
                </View>
              )}
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
                {children.length === 0 ? (
                  <Text style={{ color: colors.grey600, textAlign: 'center', padding: spacing.lg }}>لا يوجد أطفال بعد</Text>
                ) : children.map((child: any) => (
                  <Pressable
                    key={child.id}
                    onPress={() => setSelectedChildId(child.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.grey50, marginBottom: spacing.sm }}
                  >
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
                {playlistsLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : playlists.length === 0 ? (
                  <Text style={{ color: colors.grey600, textAlign: 'center', padding: spacing.lg }}>لا توجد قوائم تشغيل لهذا الطفل</Text>
                ) : playlists.map((playlist: any) => {
                  const added = addedIds.has(playlist.id)
                  return (
                    <Pressable
                      key={playlist.id}
                      onPress={() => addToPlaylist(playlist.id)}
                      disabled={added || addingId === playlist.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: added ? `${colors.primary}15` : colors.grey50, marginBottom: spacing.sm }}
                    >
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
