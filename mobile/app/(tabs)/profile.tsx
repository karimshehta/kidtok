import { View, Text, ScrollView, Pressable, Image, RefreshControl, Dimensions } from 'react-native'
import { useCallback, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { width: SCREEN_W } = Dimensions.get('window')
const GRID_SIZE = (SCREEN_W - spacing.lg * 2 - 4) / 3

export default function ProfileScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    placeholderData: (prev: any) => prev,  // keep showing old data while refetching
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, avatar_url, username, bio, followers_count, following_count, is_verified')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) {
        const { data: basic } = await supabase
          .from('profiles').select('name, avatar_url, username, bio')
          .eq('id', user!.id).maybeSingle()
        return basic
      }
      return data
    },
  })

  const { data: myVideos = [] } = useQuery({
    queryKey: ['my-videos', user?.id],
    enabled: !!user?.id,
    placeholderData: (prev: any) => prev,
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, thumbnail_url, view_count')
        .eq('creator_id', user!.id)
        .eq('source', 'creator')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30)
      return data || []
    },
  })

  const onRefresh = useCallback(async () => {
    if (!user?.id) return
    setRefreshing(true)
    await qc.refetchQueries({ queryKey: ['profile', user.id] })
    await qc.refetchQueries({ queryKey: ['my-videos', user.id] })
    setRefreshing(false)
  }, [user?.id])

  useFocusEffect(useCallback(() => {
    if (!user?.id) return
    // Invalidate → React Query will refetch in background while showing old data
    qc.invalidateQueries({ queryKey: ['profile', user.id] })
    qc.invalidateQueries({ queryKey: ['my-videos', user.id] })
  }, [user?.id]))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      {/* ── Top bar ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          {profile?.username ? `@${profile.username}` : (profile?.name || (ar ? 'حسابي' : 'My Profile'))}
        </Text>
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? colors.grey100 : 'transparent', alignItems: 'center', justifyContent: 'center' })}
        >
          <Ionicons name="settings-outline" size={24} color={colors.grey700} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* ── Profile info ── */}
        <View style={{ alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg }}>
          {/* Avatar */}
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              : <Ionicons name="person" size={52} color={colors.white} />
            }
          </View>

          {/* Name */}
          <Text style={{ fontSize: fontSize.lg, fontWeight: '900', color: colors.grey900 }}>
            {profile?.name || (ar ? 'مستخدم' : 'User')}
          </Text>

          {/* Bio */}
          {profile?.bio ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.grey500, marginTop: 4, textAlign: 'center', paddingHorizontal: spacing.xl }}>
              {profile.bio}
            </Text>
          ) : null}

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg }}>
            <StatItem count={myVideos.length} label={ar ? 'فيديو' : 'Videos'} />
            <Pressable onPress={() => router.push(`/creator/${user?.id}` as any)}>
              <StatItem count={(profile as any)?.followers_count ?? 0} label={ar ? 'متابع' : 'Followers'} />
            </Pressable>
            <StatItem count={(profile as any)?.following_count ?? 0} label={ar ? 'أتابع' : 'Following'} />
          </View>


        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: colors.grey100 }} />

        {/* ── Videos grid ── */}
        {myVideos.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Ionicons name="videocam-outline" size={56} color={colors.grey200} />
            <Text style={{ color: colors.grey400, fontSize: fontSize.sm }}>
              {ar ? 'لا توجد فيديوهات بعد' : 'No videos yet'}
            </Text>
            <Pressable
              onPress={() => router.push('/creator/upload')}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.primary }}
            >
              <Text style={{ color: colors.white, fontWeight: '700' }}>
                {ar ? 'ارفع أول فيديو' : 'Upload first video'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: spacing.lg, gap: 2 }}>
            {myVideos.map((v: any) => (
              <Pressable
                key={v.id}
                style={{ width: GRID_SIZE, height: GRID_SIZE * 1.4, backgroundColor: colors.grey100 }}
                onPress={() => router.push(`/creator/${user?.id}` as any)}
              >
                {v.thumbnail_url
                  ? <Image source={{ uri: v.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="film-outline" size={28} color={colors.grey400} />
                    </View>
                }
                <View style={{ position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Ionicons name="play" size={10} color={colors.white} />
                  <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>
                    {v.view_count > 999 ? `${(v.view_count/1000).toFixed(1)}k` : v.view_count || 0}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function StatItem({ count, label }: { count: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
        {count > 999 ? `${(count/1000).toFixed(1)}k` : count}
      </Text>
      <Text style={{ fontSize: fontSize.xs, color: colors.grey500, marginTop: 2 }}>{label}</Text>
    </View>
  )
}
