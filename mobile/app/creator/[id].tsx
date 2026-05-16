import { View, Text, ScrollView, Pressable, Image, ActivityIndicator, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useIsFollowing, useToggleFollow } from '@/hooks/useSocial'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GRID_ITEM_W = (SCREEN_WIDTH - spacing.lg * 2 - spacing.xs * 2) / 3

export default function CreatorProfileScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const myId = useAuth((s) => s.user?.id)
  const isOwnProfile = myId === id

  const { data: profile, isLoading } = useQuery({
    queryKey: ['creator-profile', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, bio, avatar_url, role')
        .eq('id', id)
        .single()
      return data
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['creator-stats', id],
    queryFn: async () => {
      // followers count
      const { count: followers } = await supabase
        .from('creator_follows')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', id)
      // videos count + total likes
      const { data: videos } = await supabase
        .from('videos')
        .select('id, like_count')
        .eq('uploaded_by', id)
        .eq('is_active', true)
      const videoCount = videos?.length || 0
      const totalLikes = (videos || []).reduce((a, v: any) => a + (v.like_count || 0), 0)
      return { followers: followers || 0, videoCount, totalLikes }
    },
  })

  const { data: videos = [] } = useQuery({
    queryKey: ['creator-videos', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, title, thumbnail_url, like_count, view_count')
        .eq('uploaded_by', id)
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
            <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '900', marginTop: spacing.sm }}>
              {profile?.name || 'منشئ المحتوى'}
            </Text>
            {profile?.bio && (
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: fontSize.sm, marginTop: 4, textAlign: 'center', paddingHorizontal: spacing.lg }}>
                {profile.bio}
              </Text>
            )}
          </View>

          {/* Stats */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
            <Stat label="فيديوهات" value={stats?.videoCount ?? 0} />
            <Stat label="متابعون" value={stats?.followers ?? 0} />
            <Stat label="إعجابات" value={stats?.totalLikes ?? 0} />
          </View>

          {/* Follow/Unfollow button */}
          {!isOwnProfile && (
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
              <Pressable
                onPress={() => toggleFollow.mutate(id!)}
                style={({ pressed }) => ({
                  backgroundColor: isFollowing ? 'rgba(255,255,255,0.25)' : colors.white,
                  paddingVertical: spacing.sm + 4,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  borderWidth: isFollowing ? 1 : 0,
                  borderColor: 'rgba(255,255,255,0.4)',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: isFollowing ? colors.white : colors.primary, fontWeight: '900' }}>
                  {isFollowing ? 'تتابع ✓' : '+ متابعة'}
                </Text>
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
