import { View, Text, ScrollView, Pressable, Image, ActivityIndicator, Dimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useIsFollowing, useToggleFollow } from '@/hooks/useSocial'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import VerifiedBadge, { KidTokBadge } from '@/components/VerifiedBadge'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GRID_ITEM_W = (SCREEN_WIDTH - spacing.lg * 2 - spacing.xs * 2) / 3

export default function CreatorProfileScreen() {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const { id } = useLocalSearchParams<{ id: string }>()
  const myId = useAuth((s) => s.user?.id)
  const isOwnProfile = myId === id

  const { data: profile, isLoading } = useQuery({
    queryKey: ['creator-profile', id],
    staleTime: 0,  // Always fresh — shows latest avatar + followers
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, bio, avatar_url, role, username, followers_count, following_count, is_verified')
        .eq('id', id)
        .single()
      return data
    },
  })

  // Videos count for stats bar
  const { data: videosMeta } = useQuery({
    queryKey: ['creator-videos-meta', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, like_count')
        .eq('creator_id', id)
        .eq('source', 'creator')
        .eq('is_active', true)
      const videoCount = data?.length || 0
      const totalLikes = (data || []).reduce((a: number, v: any) => a + (v.like_count || 0), 0)
      return { videoCount, totalLikes }
    },
  })

  const { data: videos = [] } = useQuery({
    queryKey: ['creator-videos', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, title, thumbnail_url, like_count, view_count')
        .eq('creator_id', id)
        .eq('source', 'creator')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30)
      return data || []
    },
  })

  const { data: isFollowing } = useIsFollowing(id || '')
  const toggleFollow = useToggleFollow()

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      {/* Hero gradient header */}
      <LinearGradient colors={[colors.primary, '#0891b2']} style={{ paddingBottom: spacing.lg }}>
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md }}>
            <Pressable onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={28} color={colors.white} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', color: colors.white, fontWeight: '800', fontSize: fontSize.base }}>
              {profile?.name || 'منشئ المحتوى'}
            </Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Avatar + name */}
          <View style={{ alignItems: 'center', paddingTop: spacing.md }}>
            <View
              style={{
                width: 96, height: 96, borderRadius: 48,
                borderWidth: 4, borderColor: colors.white,
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <Ionicons name="person" size={56} color={colors.white} />
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm }}>
              <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '900' }}>
                {profile?.name || 'منشئ المحتوى'}
              </Text>
              {profile?.is_verified && <VerifiedBadge size="lg" />}
            </View>
            {profile?.username && (
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: fontSize.sm, fontWeight: '700', marginTop: 2 }}>
                @{profile.username}
              </Text>
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
            <Stat label={i18n.language === 'ar' ? 'متابعون' : 'Followers'} value={profile?.followers_count ?? 0} />
            <Stat label={i18n.language === 'ar' ? 'إعجابات' : 'Likes'} value={videosMeta?.totalLikes ?? 0} />
          </View>

          {/* Follow/Unfollow button */}
          {!isOwnProfile && (
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <Pressable
                onPress={() => toggleFollow.mutate(id!)}
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
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {videos.length === 0 ? (
          <View style={{ alignItems: 'center', padding: spacing.xxl }}>
            <Ionicons name="film-outline" size={64} color={colors.grey200} />
            <Text style={{ color: colors.grey700, marginTop: spacing.sm, fontWeight: '700' }}>
              لا فيديوهات بعد
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {videos.map((v: any) => (
              <View
                key={v.id}
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
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
