import { View, Text, ScrollView, Pressable, Alert, Image, RefreshControl, Dimensions } from 'react-native'
import { useCallback, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { setLanguage } from '@/lib/i18n'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { width: SCREEN_W } = Dimensions.get('window')
const GRID_SIZE = (SCREEN_W - spacing.lg * 2 - spacing.xs * 2) / 3

export default function ProfileScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const { data: myProfile } = useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name, avatar_url, username, bio, followers_count, following_count')
        .eq('id', user!.id)
        .single()
      return data
    },
  })

  // My published videos
  const { data: myVideos = [] } = useQuery({
    queryKey: ['my-videos', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('videos')
        .select('id, thumbnail_url, title, view_count, like_count')
        .eq('creator_id', user!.id)
        .eq('source', 'creator')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30)
      return data || []
    },
  })

  const signOut = useAuth((s) => s.signOut)

  const onRefresh = useCallback(async () => {
    if (!user?.id) return
    setRefreshing(true)
    await Promise.all([
      qc.refetchQueries({ queryKey: ['profile', user.id] }),
      qc.refetchQueries({ queryKey: ['my-videos', user.id] }),
      qc.refetchQueries({ queryKey: ['my-subscription'] }),
    ])
    setRefreshing(false)
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        qc.invalidateQueries({ queryKey: ['profile', user.id] })
        qc.invalidateQueries({ queryKey: ['my-videos', user.id] })
      }
    }, [user?.id])
  )

  const myRole = useAuth((s) => s.user?.role as string | undefined)
  const isAdmin = myRole === 'admin'

  const { data: mySub } = useQuery({
    queryKey: ['my-subscription', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc('my_active_subscription')
      return data
    },
  })

  const confirmLogout = () => {
    Alert.alert(t('profile.logout'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'), style: 'destructive',
        onPress: async () => { await signOut(); router.replace('/landing') },
      },
    ])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* ── Profile Header ── */}
        <View style={{ alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.lg }}>
          {/* Avatar */}
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: spacing.md }}>
            {myProfile?.avatar_url ? (
              <Image source={{ uri: myProfile.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Ionicons name="person" size={56} color={colors.white} />
            )}
          </View>

          {/* Name */}
          <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
            {myProfile?.name || t('common.user') || 'User'}
          </Text>

          {/* @username */}
          {myProfile?.username ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: '700', marginTop: 2 }}>
              @{myProfile.username}
            </Text>
          ) : (
            <Pressable onPress={() => router.push('/profile/edit')}>
              <Text style={{ fontSize: fontSize.sm, color: colors.grey400, marginTop: 2 }}>
                أضف اسم مستخدم @
              </Text>
            </Pressable>
          )}

          {/* Bio */}
          {myProfile?.bio ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.lg }}>
              {myProfile.bio}
            </Text>
          ) : null}

          {/* Followers / Following */}
          <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
                {myVideos.length}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>فيديو</Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.grey100 }} />
            <Pressable style={{ alignItems: 'center' }} onPress={() => router.push(`/creator/${user?.id}`)}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
                {(myProfile?.followers_count || 0).toLocaleString()}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>متابع</Text>
            </Pressable>
            <View style={{ width: 1, backgroundColor: colors.grey100 }} />
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
                {(myProfile?.following_count || 0).toLocaleString()}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>أتابع</Text>
            </View>
          </View>

          {/* Edit profile button */}
          <Pressable
            onPress={() => router.push('/profile/edit')}
            style={{ marginTop: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.grey200 }}
          >
            <Text style={{ fontWeight: '700', color: colors.grey700, fontSize: fontSize.sm }}>تعديل الحساب</Text>
          </Pressable>
        </View>

        {/* ── My Videos Grid ── */}
        {myVideos.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
              <Ionicons name="grid-outline" size={20} color={colors.grey700} />
              <Text style={{ fontWeight: '800', color: colors.grey900, fontSize: fontSize.base, marginStart: spacing.xs }}>
                فيديوهاتي
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, gap: spacing.xs }}>
              {myVideos.map((v: any) => (
                <Pressable
                  key={v.id}
                  style={{ width: GRID_SIZE, height: GRID_SIZE * 1.4, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.grey100 }}
                  onPress={() => router.push(`/creator/${user?.id}`)}
                >
                  {v.thumbnail_url ? (
                    <Image source={{ uri: v.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="film-outline" size={30} color={colors.grey400} />
                    </View>
                  )}
                  {/* View count overlay */}
                  <View style={{ position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="play" size={10} color={colors.white} />
                    <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>
                      {v.view_count > 999 ? `${(v.view_count / 1000).toFixed(1)}k` : v.view_count}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── Settings ── */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey500, marginBottom: spacing.xs }}>
            الإعدادات
          </Text>

          {mySub && (
            {isAdmin && (
            <SettingRow
              icon="shield-checkmark"
              label="لوحة الإدارة"
              color={colors.secondary}
              onPress={() => router.push('/admin')}
            />
          )}
          <SettingRow icon="diamond" label={t('profile.subscription')} value={t('profile.active')} color={colors.primary} />
          )}

          {isAdmin && (
            <SettingRow
              icon="shield-checkmark"
              label="لوحة الإدارة"
              color={colors.secondary}
              onPress={() => router.push('/admin')}
            />
          )}
          <SettingRow
            icon="language"
            label={t('profile.language')}
            value={i18n.language === 'ar' ? t('lang.arabic') || 'العربية' : t('lang.english') || 'English'}
            onPress={async () => await setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
          />

          {isAdmin && (
            <SettingRow
              icon="shield-checkmark"
              label="لوحة الإدارة"
              color={colors.secondary}
              onPress={() => router.push('/admin')}
            />
          )}
          <SettingRow
            icon="log-out"
            label={t('profile.logout')}
            onPress={confirmLogout}
            color={colors.secondary}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function SettingRow({ icon, label, value, onPress, color }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: spacing.md, paddingHorizontal: spacing.md,
        backgroundColor: pressed ? colors.grey50 : colors.white,
        borderRadius: radius.lg, gap: spacing.md,
        borderWidth: 1, borderColor: colors.grey100,
        marginBottom: spacing.xs,
      })}
    >
      <Ionicons name={icon} size={20} color={color || colors.grey700} />
      <Text style={{ flex: 1, fontSize: fontSize.base, color: color || colors.grey900, fontWeight: '600' }}>{label}</Text>
      {value && <Text style={{ fontSize: fontSize.sm, color: colors.grey400 }}>{value}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.grey300} />}
    </Pressable>
  )
}
