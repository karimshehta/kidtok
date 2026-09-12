import { View, Text, ScrollView, Pressable, Image, ActivityIndicator, Dimensions } from 'react-native'
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useIsFollowing, useToggleFollow } from '@/hooks/useSocial'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import VerifiedBadge, { KidTokBadge } from '@/components/VerifiedBadge'
import { ProfileVideoPagerModal } from '@/components/VideoPreviewModal'
import CreatorAchievementMedals, { useCreatorAchievements } from '@/components/CreatorAchievementMedals'
import { ProfileThemeDecor } from '@/components/ProfileThemeDecor'
import { useIsAdminBlockedUser } from '@/hooks/useAdminBlockedUsers'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GRID_ITEM_W = (SCREEN_WIDTH - spacing.lg * 2 - spacing.xs * 2) / 3

export default function CreatorProfileScreen() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { id } = useLocalSearchParams<{ id: string }>()
  const myId = useAuth((s) => s.user?.id)
  const isOwnProfile = myId === id
  const [profileViewerIndex, setProfileViewerIndex] = useState<number | null>(null)
  const { data: isAdminBlocked = false, isLoading: isAdminBlockLoading } = useIsAdminBlockedUser(id, !!id && !isOwnProfile)

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ['creator-profile', id],
    staleTime: 0,  // Always fresh — shows latest avatar + followers
    queryFn: async () => {
      // Try full query, fall back to basic columns if migrations not applied
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, bio, avatar_url, role, username, followers_count, following_count, is_verified')
        .eq('id', id!)
        .maybeSingle()
      if (error || !data) {
        const { data: basic } = await supabase
          .from('profiles')
          .select('id, name, bio, avatar_url, role')
          .eq('id', id!)
          .maybeSingle()
        return basic
      }
      return data
    },
  })

  const { data: creatorStyle } = useQuery<any | null>({
    queryKey: ['creator-style', id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_creator_style', { p_user_id: id })
      if (error) return null
      return data || null
    },
  })

  const activeFrame = creatorStyle?.frame
  const activeTheme = creatorStyle?.theme
  const profileHeaderGradient = (activeTheme?.gradient?.length ? activeTheme.gradient : [colors.primary, '#0891b2']) as any
  const {
    data: creatorAchievements,
    refetch: refetchAchievements,
  } = useCreatorAchievements(id)

  // Videos count for stats bar
  const { data: videosMeta } = useQuery({
    queryKey: ['creator-videos-meta', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, like_count, creator_video:creator_videos!videos_creator_video_id_fkey(like_count)')
        .eq('creator_id', id)
        .eq('source', 'creator')
        .eq('is_active', true)
      const videoCount = data?.length || 0
      const totalLikes = (data || []).reduce((a: number, v: any) => {
        const mirrorLikeCount = Array.isArray(v.creator_video)
          ? v.creator_video[0]?.like_count
          : v.creator_video?.like_count
        return a + Math.max(Number(v.like_count || 0), Number(mirrorLikeCount || 0))
      }, 0)
      return { videoCount, totalLikes }
    },
  })

  const { data: videos = [], refetch: refetchVideos } = useQuery({
    queryKey: ['creator-videos', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, title, source, youtube_id, thumbnail_url, cloudflare_uid, hls_url, channel_name, creator_id, creator_video_id, like_count, dislike_count, comment_count, view_count')
        .eq('creator_id', id)
        .eq('source', 'creator')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30)
      return data || []
    },
  })

  // Refetch every time the screen regains focus — expo-router keeps the
  // creator profile mounted while the user navigates to feed and back,
  // so without this the cached "0 views" sticks and looks like the
  // tracking is broken. Cheap: 30 rows max, 1 query, no animations.
  useFocusEffect(
    useCallback(() => {
      refetchVideos()
      refetchAchievements()
    }, [refetchAchievements, refetchVideos])
  )

  const { data: isFollowing } = useIsFollowing(id || '')
  const toggleFollow = useToggleFollow()

  if (isLoading || isAdminBlockLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    )
  }

  if (!isOwnProfile && isAdminBlocked) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <View style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: `${colors.primary}14`, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
          <Ionicons name="shield-checkmark-outline" size={40} color={colors.primary} />
        </View>
        <Text style={{ color: colors.grey900, fontSize: fontSize.lg, fontWeight: '900', textAlign: 'center' }}>
          {ar ? 'الحساب غير متاح' : 'This profile is unavailable'}
        </Text>
        <Text style={{ color: colors.grey500, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 }}>
          {ar ? 'تم إخفاء هذا الحساب للحفاظ على أمان الأطفال داخل KidTok.' : 'This account is hidden to keep KidTok safe for children.'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            marginTop: spacing.lg,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            backgroundColor: colors.primary,
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: colors.white, fontWeight: '900' }}>{ar ? 'رجوع' : 'Go back'}</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.lg }} showsVerticalScrollIndicator={false}>
      {/* Hero gradient header */}
      <LinearGradient colors={profileHeaderGradient} style={{ paddingBottom: spacing.lg, overflow: 'hidden' }}>
        <ProfileThemeDecor theme={activeTheme} variant="header" />
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md }}>
            <Pressable onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={28} color={colors.white} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', color: colors.white, fontWeight: '800', fontSize: fontSize.base }}>
              {profile?.name || (ar ? 'منشئ المحتوى' : 'Creator')}
            </Text>
            {!isOwnProfile ? (
              <Pressable
                onPress={() => router.push(`/gift/${id}` as any)}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="gift" size={20} color={colors.white} />
              </Pressable>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          {/* Avatar + name */}
          <View style={{ alignItems: 'center', paddingTop: spacing.md }}>
            <LinearGradient
              colors={(activeFrame?.gradient?.length ? activeFrame.gradient : [colors.white, colors.white]) as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 104, height: 104, borderRadius: 52, padding: activeFrame ? 7 : 4, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 88, height: 88, borderRadius: 44,
                  borderWidth: 3, borderColor: colors.white,
                  overflow: 'hidden',
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Ionicons name="person" size={52} color={colors.white} />
                )}
              </View>
              {activeFrame?.icon && (
                <View style={{ position: 'absolute', right: 0, bottom: 2, width: 29, height: 29, borderRadius: 15, backgroundColor: '#fff', borderWidth: 2, borderColor: '#FDE68A', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>{activeFrame.icon}</Text>
                </View>
              )}
            </LinearGradient>
            <CreatorAchievementMedals badges={creatorAchievements?.badges} ar={ar} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm }}>
              <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '900' }}>
                {profile?.name || (ar ? 'منشئ المحتوى' : 'Creator')}
              </Text>
              {profile?.is_verified && <VerifiedBadge size="lg" />}
            </View>
            {profile?.username && (
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm, fontWeight: '700', marginTop: 2 }}>
                @{profile.username}
              </Text>
            )}
            {creatorStyle?.level && (
              <View style={{ marginTop: 7, paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 13 }}>{Number(creatorStyle.level) >= 7 ? '👑' : '⭐'}</Text>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
                  {`Level ${creatorStyle.level} · ${ar ? creatorStyle.level_title_ar : creatorStyle.level_title_en}`}
                </Text>
              </View>
            )}
            {activeTheme?.name_en && (
              <View style={{ marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 12 }}>{activeTheme.emoji || '🎨'}</Text>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
                  {ar ? activeTheme.name_ar : activeTheme.name_en}
                </Text>
              </View>
            )}
            {profile?.bio && (
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm, marginTop: 4, textAlign: 'center', paddingHorizontal: spacing.lg }}>
                {profile.bio}
              </Text>
            )}
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
            <Stat label={i18n.language === 'ar' ? 'فيديوهات' : 'Videos'} value={videosMeta?.videoCount ?? 0} />
            <Stat
              label={i18n.language === 'ar' ? 'متابعون' : 'Followers'}
              value={creatorAchievements?.success ? creatorAchievements.metrics.followers : (profile?.followers_count ?? 0)}
            />
            <Stat
              label={i18n.language === 'ar' ? 'إعجابات' : 'Likes'}
              value={creatorAchievements?.success ? Math.max(Number(creatorAchievements.metrics.total_likes || 0), Number(videosMeta?.totalLikes || 0)) : (videosMeta?.totalLikes ?? 0)}
            />
          </View>

          {/* Follow/Unfollow button */}
          {!isOwnProfile && (
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <Pressable
                onPress={() => toggleFollow.mutate(id!, { onSuccess: () => refetchAchievements() })}
                disabled={toggleFollow.isPending}
                style={({ pressed }) => ({
                  backgroundColor: isFollowing ? 'rgba(255,255,255,0.15)' : colors.white,
                  paddingVertical: spacing.sm + 6,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  borderWidth: 2,
                  borderColor: isFollowing ? 'rgba(255,255,255,0.6)' : colors.white,
                  opacity: (pressed || toggleFollow.isPending) ? 0.8 : 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                })}
              >
                {toggleFollow.isPending ? (
                  <ActivityIndicator size="small" color={isFollowing ? colors.white : colors.primary} />
                ) : (
                  <>
                    <Ionicons
                      name={isFollowing ? 'checkmark-circle' : 'person-add'}
                      size={18}
                      color={isFollowing ? colors.white : colors.primary}
                    />
                    <Text style={{ color: isFollowing ? colors.white : colors.primary, fontWeight: '900', fontSize: fontSize.base }}>
                      {isFollowing
                        ? (i18n.language === 'ar' ? 'تتابع' : 'Following')
                        : (i18n.language === 'ar' ? 'متابعة' : 'Follow')}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>

      {/* Video grid */}
      <View style={{ padding: spacing.lg }}>
        {videos.length === 0 ? (
          <View style={{ alignItems: 'center', padding: spacing.xxl }}>
            <Ionicons name="film-outline" size={64} color={colors.grey200} />
            <Text style={{ color: colors.grey700, marginTop: spacing.sm, fontWeight: '700' }}>
              {ar ? 'لا فيديوهات بعد' : 'No videos yet'}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {videos.map((v: any) => (
              <Pressable
                key={v.id}
                onPress={() => {
                  const openIndex = videos.findIndex((video: any) => video.id === v.id)
                  if (openIndex >= 0) setProfileViewerIndex(openIndex)
                }}
                style={{
                  width: GRID_ITEM_W,
                  height: GRID_ITEM_W * 1.5,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  backgroundColor: colors.grey200,
                }}
              >
                {v.thumbnail_url && (
                  <Image source={{ uri: v.thumbnail_url }} style={{ width: '100%', height: '100%' }} />
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.85)']}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    padding: 6,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="play" size={10} color={colors.white} />
                    <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>
                      {formatCount(v.view_count || 0)}
                    </Text>
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      </ScrollView>
      <ProfileVideoPagerModal
        visible={profileViewerIndex !== null}
        videos={videos as any}
        initialIndex={profileViewerIndex ?? 0}
        onClose={() => setProfileViewerIndex(null)}
      />
    </View>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '900' }}>
        {formatCount(value)}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.xs }}>
        {label}
      </Text>
    </View>
  )
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
