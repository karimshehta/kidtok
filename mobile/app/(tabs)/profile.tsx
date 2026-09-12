import { View, Text, ScrollView, Pressable, Image, RefreshControl, Dimensions, ActivityIndicator, Modal } from 'react-native'
import { useCallback, useMemo, useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import VideoPreviewModal, { ProfileVideoPagerModal, PreviewVideo } from '@/components/VideoPreviewModal'
import VerifiedBadge from '@/components/VerifiedBadge'
import KidCoinIcon from '@/components/KidCoinIcon'
import RewardedAdPrompt from '@/components/RewardedAdPrompt'
import KidTokCollectionModal, { kidtokCollectionQueryKey } from '@/components/KidTokCollectionModal'
import CreatorAchievementMedals, {
  creatorAchievementQueryKey,
  useCreatorAchievements,
} from '@/components/CreatorAchievementMedals'
import { ProfileThemeDecor } from '@/components/ProfileThemeDecor'
import { getMyKidTokCollection } from '@/lib/kidtokCollection'

const { width: SCREEN_W } = Dimensions.get('window')
// Each row holds 3 video tiles. We subtract horizontal padding + the two
// 2px gaps between tiles, then floor so floating-point rounding never causes
// the third tile to wrap onto a new row.
const GRID_PADDING = 2
const GRID_GAP     = 2
const GRID_SIZE    = Math.floor((SCREEN_W - GRID_PADDING * 2 - GRID_GAP * 2) / 3)

type ProfileFrame = {
  id: string
  name_ar: string
  name_en: string
  gradient: string[]
  icon: string
  required_level: number
  tier_order: number
  coin_cost: number
  is_free: boolean
  owned: boolean
}

export default function ProfileScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const router = useRouter()
  const user = useAuth((s) => s.user)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [previewVideo, setPreviewVideo] = useState<PreviewVideo | null>(null)
  const [profileViewerIndex, setProfileViewerIndex] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<any | null>(null)
  const [showCollection, setShowCollection] = useState(false)
  const [showFrameShop, setShowFrameShop] = useState(false)
  const [frameCandidate, setFrameCandidate] = useState<ProfileFrame | null>(null)
  const [frameSaving, setFrameSaving] = useState(false)
  const [rewardFrameCandidate, setRewardFrameCandidate] = useState<ProfileFrame | null>(null)
  const [showFrameRewardAd, setShowFrameRewardAd] = useState(false)

  const handleDeleteVideo = (v: any) => {
    setDeleteCandidate(v)
  }

  const confirmDeleteVideo = async () => {
    const v = deleteCandidate
    if (!v || deletingId) return

    setDeletingId(v.id)
    try {
      const { data, error } = await supabase.functions.invoke('creator-delete-video', {
        body: { video_id: v.id },
      })
      if (error) {
        // supabase-js leaves the parsed JSON body in `data` even on non-2xx
        const detail =
          (data as any)?.detail ||
          (data as any)?.error  ||
          error.message
        throw new Error(detail)
      }
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'الفيديو اتحذف 🗑️' : 'Video deleted 🗑️',
        text2: ar ? 'اتشال من بروفايلك خلاص' : 'Removed from your profile',
        props: { icon: '✅', accent: 'blue' },
      })
      qc.invalidateQueries({ queryKey: ['my-videos', user?.id] })
      setDeleteCandidate(null)
    } catch (err: any) {
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'الحذف ماكملش' : 'Delete did not finish',
        text2: String(err?.message || err || (ar ? 'جرّب تاني بعد شوية' : 'Please try again')).slice(0, 120),
        props: { icon: '⚠️', accent: 'purple' },
      })
    } finally {
      setDeletingId(null)
    }
  }

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
    // Poll every 5s so once Cloudflare flips status → 'approved', the
    // processing tile updates to show the real thumbnail without a refresh.
    refetchInterval: 5_000,
    queryFn: async () => {
      // Best-effort: flip anything that's been stuck on uploading/processing
      // for >30 minutes into 'rejected'. Cheap RPC, only operates on the
      // current user's videos. Runs server-side so it works even if a webhook
      // was lost entirely.
      try {
        await supabase.rpc('mark_stuck_videos_failed', { p_creator_id: user!.id })
      } catch { /* non-fatal */ }

      // Read directly from creator_videos so the user sees their video the
      // *instant* the upload completes — even before Cloudflare's webhook
      // mirrors it into the public `videos` table. We then surface the
      // status badge (Processing / Pending review / Rejected) on the tile.
      const { data } = await supabase
        .from('creator_videos')
        .select('id, title, thumbnail_url, cloudflare_uid, hls_url, status, like_count, view_count, created_at, mirror:videos!videos_creator_video_id_fkey(id, creator_id, creator_video_id, like_count, dislike_count, comment_count, view_count)')
        .eq('creator_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(30)
      return (data || []).map((cv: any) => ({
        id:             cv.id,
        // Mirror videos.id — the feed's deep-link param expects this id,
        // not the creator_videos.id. Older rows that haven't been mirrored
        // yet will fall back to null and skip navigation.
        mirror_id:      cv.mirror?.[0]?.id ?? null,
        creator_id:     user!.id,
        creator_video_id: cv.id,
        title:          cv.title,
        source:         'creator',
        youtube_id:     null,
        thumbnail_url:  cv.thumbnail_url,
        cloudflare_uid: cv.cloudflare_uid,
        hls_url:        cv.hls_url,
        channel_name:   null,
        view_count:     cv.mirror?.[0]?.view_count ?? cv.view_count ?? 0,
        like_count:     cv.mirror?.[0]?.like_count ?? cv.like_count ?? 0,
        dislike_count:  cv.mirror?.[0]?.dislike_count ?? 0,
        comment_count:  cv.mirror?.[0]?.comment_count ?? 0,
        is_active:      cv.status === 'approved',
        status:         cv.status as string,
        created_at:     cv.created_at,
      }))
    },
  })

  const approvedProfileVideos = useMemo(
    () => myVideos.filter((video: any) => video.status === 'approved'),
    [myVideos]
  )
  const localVideoLikeTotal = useMemo(
    () => myVideos.reduce((sum: number, video: any) => sum + Number(video?.like_count || 0), 0),
    [myVideos]
  )

  // Unread notifications count for the bell badge in the top bar
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['unread-count', user?.id],
    enabled: !!user?.id,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await supabase.rpc('unread_notification_count')
      return (data as number) || 0
    },
  })

  const { data: creatorProgress, isLoading: creatorProgressLoading } = useQuery<any | null>({
    queryKey: ['creator-progress', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_creator_progress')
      if (error) return null
      return data || null
    },
  })

  const { data: coinBalance = 0 } = useQuery<number>({
    queryKey: ['coins', user?.id],
    enabled: !!user?.id,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_coin_balance')
      if (error) return 0
      return Number(data || 0)
    },
  })

  const { data: creatorAchievements } = useCreatorAchievements(user?.id)

  const { data: kidtokCollection } = useQuery({
    queryKey: kidtokCollectionQueryKey(user?.id),
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: getMyKidTokCollection,
  })

  const profileFrames: ProfileFrame[] = Array.isArray(creatorProgress?.frames) ? creatorProgress.frames : []
  const activeFrame = profileFrames.find((frame) => frame.id === creatorProgress?.current_frame_id)
  const activeTheme = kidtokCollection?.themes?.find((theme) => theme.equipped)
  const profileHeaderGradient = (activeTheme?.gradient?.length ? activeTheme.gradient : [colors.primary, '#0A8FB8']) as any

  const openFramePreview = (frame: ProfileFrame) => {
    setShowFrameShop(false)
    setFrameCandidate(frame)
  }

  const applyFrame = async () => {
    if (!frameCandidate || frameSaving) return
    setFrameSaving(true)
    const isEquipped = frameCandidate.id === creatorProgress?.current_frame_id
    try {
      const { data, error } = isEquipped
        ? await supabase.rpc('unequip_my_profile_frame')
        : await supabase.rpc('purchase_and_equip_profile_frame', { p_frame_id: frameCandidate.id })
      if (error) throw error

      const spent = Number((data as any)?.coins_spent || 0)
      Toast.show({
        type: 'kidReward',
        text1: isEquipped
          ? (ar ? 'تم إخفاء الإطار' : 'Frame removed')
          : (ar ? 'الإطار بقى على صورتك!' : 'Your new frame is on!'),
        text2: spent > 0
          ? (ar ? `تم استخدام ${spent} كوين` : `${spent} coins used`)
          : (ar ? 'اختيار رائع يا بطل' : 'Great choice, hero!'),
        props: { icon: isEquipped ? '🖼️' : frameCandidate.icon, accent: spent > 0 ? 'gold' : 'blue' },
      })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['creator-progress', user?.id] }),
        qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'coins' }),
      ])
      setFrameCandidate(null)
    } catch (error: any) {
      const raw = String(error?.message || error || '')
      const insufficient = raw.includes('INSUFFICIENT_COINS')
      Toast.show({
        type: 'kidReward',
        text1: insufficient
          ? (ar ? 'محتاج كوينز أكتر' : 'You need more coins')
          : (ar ? 'الإطار متغيرش' : 'Frame was not changed'),
        text2: insufficient
          ? (ar ? 'شاهد إعلان المكافأة واجمع كوينز ثم جرّب تاني.' : 'Watch a rewarded ad, collect coins, and try again.')
          : (ar ? 'جرّب مرة تانية بعد شوية.' : 'Please try again in a moment.'),
        props: { icon: insufficient ? '🪙' : '✨', accent: insufficient ? 'gold' : 'purple' },
      })
      // The balance shown in the client may have been stale. Keep the same
      // rewarded-ad escape hatch even when the server is the first place that
      // detects the insufficient balance.
      if (insufficient && frameCandidate) {
        setRewardFrameCandidate(frameCandidate)
        setFrameCandidate(null)
        setShowFrameRewardAd(true)
      }
    } finally {
      setFrameSaving(false)
    }
  }

  const earnCoinsForFrame = () => {
    if (!frameCandidate) return
    setRewardFrameCandidate(frameCandidate)
    setFrameCandidate(null)
    setShowFrameRewardAd(true)
  }

  const onRefresh = useCallback(async () => {
    if (!user?.id) return
    setRefreshing(true)
    await Promise.all([
      qc.refetchQueries({ queryKey: ['profile', user.id] }),
      qc.refetchQueries({ queryKey: ['my-videos', user.id] }),
      qc.refetchQueries({ queryKey: ['creator-progress', user.id] }),
      qc.refetchQueries({ queryKey: kidtokCollectionQueryKey(user.id) }),
      qc.refetchQueries({ queryKey: creatorAchievementQueryKey(user.id) }),
      qc.refetchQueries({ predicate: (query) => query.queryKey[0] === 'coins' }),
    ])
    setRefreshing(false)
  }, [user?.id])

  useFocusEffect(useCallback(() => {
    if (!user?.id) return
    // Invalidate → React Query will refetch in background while showing old data
    qc.invalidateQueries({ queryKey: ['profile', user.id] })
    qc.invalidateQueries({ queryKey: ['my-videos', user.id] })
    qc.invalidateQueries({ queryKey: ['creator-progress', user.id] })
    qc.invalidateQueries({ queryKey: kidtokCollectionQueryKey(user.id) })
    qc.invalidateQueries({ queryKey: creatorAchievementQueryKey(user.id) })
  }, [user?.id]))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {/* Gradient header — matches the visitor's view of this profile so the
            owner experiences exactly what their viewers do. */}
        <LinearGradient
          colors={profileHeaderGradient}
          style={{ paddingTop: 56, paddingBottom: spacing.lg, overflow: 'hidden' }}
        >
          <ProfileThemeDecor theme={activeTheme} variant="header" />
          {/* ── Top bar (bell + settings) ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg }}>
            <Text style={{ fontSize: fontSize.base, fontWeight: '800', color: colors.white }}>
              {profile?.username ? `@${profile.username}` : (profile?.name || (ar ? 'حسابي' : 'My Profile'))}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/notifications')}
                style={({ pressed }) => ({
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)',
                  alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                })}
              >
                <Ionicons name="notifications-outline" size={19} color={colors.white} />
                {unreadCount > 0 && (
                  <View style={{
                    position: 'absolute', top: 2, right: 2,
                    minWidth: 14, height: 14, paddingHorizontal: 3,
                    borderRadius: 7, backgroundColor: colors.secondary,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: colors.primary,
                  }}>
                    <Text style={{ fontSize: 8, fontWeight: '900', color: colors.white }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={ar ? 'فتح شنطة كيدتوك' : 'Open KidTok bag'}
                onPress={() => setShowCollection(true)}
                style={({ pressed }) => ({
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)',
                  alignItems: 'center', justifyContent: 'center',
                })}
              >
                <Ionicons name="bag-handle-outline" size={19} color={colors.white} />
              </Pressable>
              <Pressable
                onPress={() => router.push('/settings')}
                style={({ pressed }) => ({
                  width: 34, height: 34, borderRadius: 17,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)',
                  alignItems: 'center', justifyContent: 'center',
                })}
              >
                <Ionicons name="settings-outline" size={19} color={colors.white} />
              </Pressable>
            </View>
          </View>

          {/* ── Avatar + name ── */}
          <View style={{ alignItems: 'center', paddingTop: spacing.lg, paddingHorizontal: spacing.lg }}>
            <LinearGradient
              colors={(activeFrame?.gradient?.length ? activeFrame.gradient : [colors.white, colors.white]) as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 112, height: 112, borderRadius: 56, padding: activeFrame ? 7 : 4, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{
                width: 96, height: 96, borderRadius: 48,
                borderWidth: 3, borderColor: colors.white,
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {profile?.avatar_url
                  ? <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <Ionicons name="person" size={56} color={colors.white} />
                }
              </View>
              {activeFrame?.icon && (
                <View style={{ position: 'absolute', right: 2, bottom: 4, width: 31, height: 31, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)' }}>
                  <Text style={{ fontSize: 17 }}>{activeFrame.icon}</Text>
                </View>
              )}
            </LinearGradient>

            <CreatorAchievementMedals badges={creatorAchievements?.badges} ar={ar} />

            {/* Name + verified inline */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.white }}>
                {profile?.name || (ar ? 'مستخدم' : 'User')}
              </Text>
              {(profile as any)?.is_verified && <VerifiedBadge size="lg" />}
            </View>

            {profile?.username && (
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, fontWeight: '700', marginTop: 2 }}>
                @{profile.username}
              </Text>
            )}

            {profile?.bio ? (
              <Text style={{ fontSize: fontSize.sm, color: 'rgba(255,255,255,0.9)', marginTop: 4, textAlign: 'center', paddingHorizontal: spacing.xl }}>
                {profile.bio}
              </Text>
            ) : null}

            {/* Stats row */}
            <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg }}>
              <StatItem count={myVideos.length} label={ar ? 'فيديو' : 'Videos'} />
              <StatItem
                count={creatorAchievements?.success
                  ? creatorAchievements.metrics.followers
                  : ((profile as any)?.followers_count ?? 0)}
                label={ar ? 'متابع' : 'Followers'}
              />
              <StatItem count={(profile as any)?.following_count ?? 0} label={ar ? 'يتابع'  : 'Following'} />
            </View>

            {/* Edit profile button (owner-only convenience) */}
            <Pressable
              onPress={() => router.push('/profile/edit')}
              style={({ pressed }) => ({
                marginTop: spacing.md,
                backgroundColor: pressed ? 'rgba(255,255,255,0.85)' : colors.white,
                paddingHorizontal: 24, paddingVertical: 9, borderRadius: radius.pill,
                flexDirection: 'row', alignItems: 'center', gap: 6,
              })}
            >
              <Ionicons name="create-outline" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '800' }}>
                {ar ? 'تعديل الملف الشخصي' : 'Edit profile'}
              </Text>
            </Pressable>

          </View>
        </LinearGradient>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: colors.grey100 }} />

        {creatorProgress?.success && (
          <ProfileProgressCard progress={creatorProgress} ar={ar} onFramePress={setFrameCandidate} />
        )}

        {/* ── Videos grid ── */}
        {myVideos.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Ionicons name="videocam-outline" size={56} color={colors.grey200} />
            <Text style={{ color: colors.grey400, fontSize: fontSize.sm }}>
              {ar ? 'لا توجد فيديوهات بعد' : 'No videos yet'}
            </Text>
            <Pressable
              onPress={() => router.push('/creator/snap-record')}
              style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.primary }}
            >
              <Text style={{ color: colors.white, fontWeight: '700' }}>
                {ar ? 'ارفع أول فيديو' : 'Upload first video'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: GRID_PADDING, gap: GRID_GAP }}>
            {myVideos.map((v: any) => (
              <Pressable
                key={v.id}
                style={{ width: GRID_SIZE, height: GRID_SIZE * 1.4, backgroundColor: colors.grey100 }}
                onPress={() => {
                  if (v.status !== 'approved') return
                  const openIndex = approvedProfileVideos.findIndex((video: any) => video.id === v.id)
                  if (openIndex >= 0) setProfileViewerIndex(openIndex)
                  else setPreviewVideo(v)
                }}
              >
                {v.thumbnail_url
                  ? <Image source={{ uri: v.thumbnail_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' }}>
                      <Ionicons name={v.status === 'uploading' || v.status === 'processing' ? 'cloud-upload-outline' : 'film-outline'} size={28} color={colors.grey400} />
                    </View>
                }
                {/* 3-dot menu — top-end of every tile */}
                <Pressable
                  onPress={(e: any) => {
                    e?.stopPropagation?.()
                    handleDeleteVideo(v)
                  }}
                  hitSlop={8}
                  disabled={deletingId === v.id}
                  style={({ pressed }) => ({
                    position: 'absolute', top: 4, right: 4,
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: pressed ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.55)',
                    alignItems: 'center', justifyContent: 'center',
                    zIndex: 5,
                  })}
                >
                  {deletingId === v.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="ellipsis-vertical" size={16} color="#fff" />}
                </Pressable>
                {/* Status overlay for non-approved videos */}
                {v.status !== 'approved' && (
                  <View style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                    {(v.status === 'uploading' || v.status === 'processing') && (
                      <ActivityIndicator size="small" color="#fff" />
                    )}
                    <Text style={{
                      color: '#fff', fontSize: 10, fontWeight: '800',
                      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                      backgroundColor:
                        v.status === 'rejected' || v.status === 'blocked' ? '#DC2626' :
                        v.status === 'pending_review' ? '#F59E0B' :
                        'rgba(255,255,255,0.20)',
                      textAlign: 'center',
                    }}>
                      {v.status === 'uploading'      ? (ar ? 'جاري الرفع'    : 'Uploading')    :
                       v.status === 'processing'    ? (ar ? 'جاري المعالجة' : 'Processing')   :
                       v.status === 'pending_review'? (ar ? 'قيد المراجعة' : 'Under review') :
                       v.status === 'rejected'      ? (ar ? 'مرفوض'        : 'Rejected')     :
                       v.status === 'blocked'       ? (ar ? 'محظور'        : 'Blocked')      :
                       v.status}
                    </Text>
                  </View>
                )}
                {/* Badge: قيد المراجعة */}
                {!v.is_active && (
                  <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: '#FCD34D', fontSize: 9, fontWeight: '800' }}>{ar ? 'مراجعة' : 'Review'}</Text>
                  </View>
                )}
                <View style={{ position: 'absolute', bottom: 4, left: 4, right: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="play" size={10} color={colors.white} />
                    <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 }}>
                      {v.view_count > 999 ? `${(v.view_count/1000).toFixed(1)}k` : v.view_count || 0}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="heart" size={11} color="#F96286" />
                    <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 }}>
                      {v.like_count > 999 ? `${(v.like_count/1000).toFixed(1)}k` : (v.like_count || 0)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <KidTokCollectionModal
        visible={showCollection}
        ar={ar}
        userId={user?.id}
        coinBalance={coinBalance}
        initialTab="frames"
        showMissions={false}
        onClose={() => setShowCollection(false)}
        onChanged={() => {
          if (!user?.id) return
          qc.invalidateQueries({ queryKey: ['creator-progress', user.id] })
          qc.invalidateQueries({ queryKey: kidtokCollectionQueryKey(user.id) })
        }}
      />

      <ProfileFrameShopModal
        visible={showFrameShop}
        ar={ar}
        frames={profileFrames}
        currentFrameId={creatorProgress?.current_frame_id || null}
        coinBalance={coinBalance}
        loading={creatorProgressLoading}
        onClose={() => setShowFrameShop(false)}
        onSelect={openFramePreview}
        onRetry={() => qc.refetchQueries({ queryKey: ['creator-progress', user?.id] })}
      />

      <Modal
        visible={!!frameCandidate}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!frameSaving) setFrameCandidate(null)
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <Pressable style={{ width: '100%', maxWidth: 380 }} onPress={(event: any) => event?.stopPropagation?.()}>
            <LinearGradient
              colors={['#FFFFFF', '#ECFEFF', '#FFF1F7']}
              style={{ borderRadius: 30, padding: spacing.lg, borderWidth: 2, borderColor: '#BAE6FD', shadowColor: '#0EA5E9', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}
            >
              <Pressable
                disabled={frameSaving}
                onPress={() => setFrameCandidate(null)}
                style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
              >
                <Ionicons name="close" size={21} color={colors.grey700} />
              </Pressable>

              <View style={{ alignItems: 'center' }}>
                <LinearGradient
                  colors={(frameCandidate?.gradient?.length ? frameCandidate.gradient : ['#38BDF8', '#A855F7']) as any}
                  style={{ width: 118, height: 118, borderRadius: 59, padding: 8, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', backgroundColor: '#E0F2FE', borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    {profile?.avatar_url
                      ? <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      : <Ionicons name="person" size={52} color={colors.primary} />}
                  </View>
                  <View style={{ position: 'absolute', bottom: 2, right: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FDE68A' }}>
                    <Text style={{ fontSize: 19 }}>{frameCandidate?.icon}</Text>
                  </View>
                </LinearGradient>

                <Text style={{ marginTop: spacing.md, color: colors.grey900, fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center' }}>
                  {ar ? frameCandidate?.name_ar : frameCandidate?.name_en}
                </Text>
                <Text style={{ marginTop: 5, color: colors.grey500, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center' }}>
                  {frameCandidate?.owned
                    ? (ar ? 'الإطار ملكك للأبد — اختاره في أي وقت.' : 'You own this frame forever — equip it anytime.')
                    : frameCandidate?.is_free
                      ? (ar ? 'إطار مجاني لكل أبطال KidTok.' : 'A free frame for every KidTok hero.')
                      : (ar
                          ? `يفتح عند Level ${frameCandidate?.required_level} أو تقدر تشتريه الآن.`
                          : `Unlocks at Level ${frameCandidate?.required_level}, or buy it now.`)}
                </Text>

                <View style={{ marginTop: spacing.md, width: '100%', borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#78350F', fontWeight: '900' }}>{ar ? 'رصيدك' : 'Your balance'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <KidCoinIcon size={24} />
                    <Text style={{ color: '#78350F', fontWeight: '900', fontSize: fontSize.lg }}>{coinBalance.toLocaleString()}</Text>
                  </View>
                </View>

                {!frameCandidate?.owned && !frameCandidate?.is_free && (
                  <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: '#92400E', fontWeight: '900' }}>{ar ? 'السعر:' : 'Price:'}</Text>
                    <KidCoinIcon size={20} />
                    <Text style={{ color: '#92400E', fontWeight: '900' }}>{Number(frameCandidate?.coin_cost || 0).toLocaleString()}</Text>
                  </View>
                )}

                <Pressable
                  onPress={(!frameCandidate?.owned && !frameCandidate?.is_free && Number(frameCandidate?.coin_cost || 0) > coinBalance) ? earnCoinsForFrame : applyFrame}
                  disabled={frameSaving}
                  style={({ pressed }) => ({ width: '100%', marginTop: spacing.lg, opacity: (pressed || frameSaving) ? 0.68 : 1 })}
                >
                  <LinearGradient
                    colors={frameCandidate?.id === creatorProgress?.current_frame_id ? ['#64748B', '#475569'] : ['#F96286', '#A855F7', '#0EA5E9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                  >
                    {frameSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name={frameCandidate?.id === creatorProgress?.current_frame_id ? 'eye-off-outline' : frameCandidate?.owned ? 'checkmark-circle' : 'sparkles'} size={21} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.base }}>
                          {frameCandidate?.id === creatorProgress?.current_frame_id
                            ? (ar ? 'إخفاء الإطار' : 'Remove frame')
                            : frameCandidate?.owned || frameCandidate?.is_free
                              ? (ar ? 'استخدم الإطار' : 'Equip frame')
                              : Number(frameCandidate?.coin_cost || 0) > coinBalance
                                ? (ar ? 'شاهد إعلان واجمع كوينز أكثر' : 'Watch an ad to earn more coins')
                                : (ar ? `اشتري بـ ${frameCandidate?.coin_cost} كوين` : `Buy for ${frameCandidate?.coin_cost} coins`)}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={!!deleteCandidate}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingId) setDeleteCandidate(null)
        }}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(2,6,23,0.62)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{ width: '100%', maxWidth: 360 }}
          >
            <LinearGradient
              colors={['#FFFFFF', '#F1FBFF', '#FFF3F8']}
              style={{
                borderRadius: 28,
                padding: spacing.lg,
                borderWidth: 1,
                borderColor: '#DFF7FF',
                shadowColor: '#0EA5E9',
                shadowOpacity: 0.22,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <View style={{
                  width: 66,
                  height: 66,
                  borderRadius: 33,
                  backgroundColor: '#FFE4F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 4,
                  borderColor: '#FFFFFF',
                  marginBottom: spacing.sm,
                }}>
                  <Text style={{ fontSize: 32 }}>🗑️</Text>
                </View>

                <Text style={{
                  fontSize: fontSize.xl,
                  fontWeight: '900',
                  color: colors.grey900,
                  textAlign: 'center',
                }}>
                  {ar ? 'حذف الفيديو؟' : 'Delete video?'}
                </Text>
                <Text style={{
                  marginTop: 8,
                  fontSize: fontSize.sm,
                  fontWeight: '700',
                  color: colors.grey500,
                  textAlign: 'center',
                  lineHeight: 21,
                }}>
                  {ar
                    ? 'هل أنت متأكد من الحذف؟'
                    : 'Are you sure you want to delete this video?'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                <Pressable
                  disabled={!!deletingId}
                  onPress={() => setDeleteCandidate(null)}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 48,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? '#E0F2FE' : '#F1F5F9',
                    opacity: deletingId ? 0.6 : 1,
                  })}
                >
                  <Text style={{ color: colors.grey700, fontSize: fontSize.sm, fontWeight: '900' }}>
                    {ar ? 'إلغاء' : 'Cancel'}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!!deletingId}
                  onPress={confirmDeleteVideo}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 48,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? '#E11D48' : '#F43F5E',
                    opacity: deletingId ? 0.75 : 1,
                  })}
                >
                  {deletingId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '900' }}>
                      {ar ? 'حذف' : 'Delete'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      </Modal>

      <ProfileVideoPagerModal
        visible={profileViewerIndex !== null}
        videos={approvedProfileVideos}
        initialIndex={profileViewerIndex ?? 0}
        onClose={() => setProfileViewerIndex(null)}
      />
      <VideoPreviewModal visible={!!previewVideo} video={previewVideo} onClose={() => setPreviewVideo(null)} />
      <RewardedAdPrompt
        visible={showFrameRewardAd}
        mode="gate"
        onDismiss={async () => {
          setShowFrameRewardAd(false)
          // RewardedAdPrompt invalidates the balance after a successful ad.
          // Await the fresh value before reopening the frame preview so its
          // CTA immediately reflects the coins that were just earned.
          await qc.refetchQueries({ predicate: (query) => query.queryKey[0] === 'coins' })
          if (rewardFrameCandidate) setFrameCandidate(rewardFrameCandidate)
          setRewardFrameCandidate(null)
        }}
      />
    </SafeAreaView>
  )
}

function ProfileFrameShopModal({
  visible,
  ar,
  frames,
  currentFrameId,
  coinBalance,
  loading,
  onClose,
  onSelect,
  onRetry,
}: {
  visible: boolean
  ar: boolean
  frames: ProfileFrame[]
  currentFrameId: string | null
  coinBalance: number
  loading: boolean
  onClose: () => void
  onSelect: (frame: ProfileFrame) => void
  onRetry: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.68)' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar ? 'إغلاق متجر الإطارات' : 'Close frame shop'}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />

        <LinearGradient
          colors={['#FFFFFF', '#F0FDFF', '#FFF1F7']}
          style={{ maxHeight: '88%', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 10, paddingHorizontal: spacing.md, paddingBottom: spacing.xl, borderWidth: 1, borderColor: '#BAE6FD' }}
        >
          <View style={{ width: 48, height: 5, borderRadius: 999, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: spacing.sm }} />

          <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24 }}>🖼️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.grey900, fontSize: fontSize.xl, fontWeight: '900', textAlign: ar ? 'right' : 'left' }}>
                {ar ? 'متجر إطارات الصورة' : 'Profile frame shop'}
              </Text>
              <Text style={{ marginTop: 2, color: colors.grey500, fontSize: fontSize.xs, fontWeight: '700', textAlign: ar ? 'right' : 'left' }}>
                {ar ? 'اضغط على أي إطار لمعاينته على صورتك' : 'Tap any frame to preview it on your photo'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ar ? 'إغلاق' : 'Close'}
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: pressed ? '#E2E8F0' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' })}
            >
              <Ionicons name="close" size={22} color={colors.grey700} />
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.md, borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: 11, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: '#78350F', fontSize: fontSize.sm, fontWeight: '900' }}>
              {ar ? 'رصيد الشراء' : 'Shopping balance'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <KidCoinIcon size={22} />
              <Text style={{ color: '#78350F', fontSize: fontSize.lg, fontWeight: '900' }}>{coinBalance.toLocaleString()}</Text>
            </View>
          </View>

          {loading && frames.length === 0 ? (
            <View style={{ minHeight: 230, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.grey500, fontWeight: '800' }}>
                {ar ? 'جاري تحضير الإطارات...' : 'Getting the frames ready...'}
              </Text>
            </View>
          ) : frames.length === 0 ? (
            <View style={{ minHeight: 230, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }}>
              <Ionicons name="images-outline" size={48} color={colors.grey300} />
              <Text style={{ marginTop: 10, color: colors.grey700, fontSize: fontSize.base, fontWeight: '900', textAlign: 'center' }}>
                {ar ? 'الإطارات مش ظاهرة دلوقتي' : 'Frames are not available right now'}
              </Text>
              <Pressable
                onPress={onRetry}
                style={({ pressed }) => ({ marginTop: spacing.md, minHeight: 42, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.75 : 1 })}
              >
                <Ionicons name="refresh" size={17} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900' }}>{ar ? 'حاول تاني' : 'Try again'}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              style={{ marginTop: spacing.md }}
              contentContainerStyle={{ paddingBottom: spacing.md }}
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }}>
                {frames.map((frame) => {
                  const current = frame.id === currentFrameId
                  const available = frame.owned || frame.is_free
                  return (
                    <Pressable
                      key={frame.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${ar ? frame.name_ar : frame.name_en}${current ? (ar ? '، مستخدم حاليًا' : ', currently equipped') : ''}`}
                      onPress={() => onSelect(frame)}
                      style={({ pressed }) => ({
                        width: '48%', minHeight: 172, borderRadius: 22,
                        padding: 10, alignItems: 'center',
                        backgroundColor: current ? '#FFFBEB' : '#FFFFFF',
                        borderWidth: current ? 2 : 1,
                        borderColor: current ? '#F59E0B' : '#E2E8F0',
                        shadowColor: current ? '#F59E0B' : '#0F172A',
                        shadowOpacity: pressed ? 0.04 : 0.10,
                        shadowRadius: 9, shadowOffset: { width: 0, height: 4 },
                        elevation: pressed ? 1 : 3, opacity: pressed ? 0.76 : 1,
                      })}
                    >
                      <LinearGradient
                        colors={(frame.gradient?.length ? frame.gradient : ['#38BDF8', '#A855F7']) as any}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ width: 76, height: 76, borderRadius: 38, padding: 6, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#E0F2FE', borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="person" size={32} color={colors.primary} />
                        </View>
                        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FDE68A' }}>
                          <Text style={{ fontSize: 15 }}>{frame.icon}</Text>
                        </View>
                      </LinearGradient>

                      <Text numberOfLines={1} style={{ width: '100%', marginTop: 10, color: colors.grey900, fontSize: fontSize.sm, fontWeight: '900', textAlign: 'center' }}>
                        {ar ? frame.name_ar : frame.name_en}
                      </Text>

                      <View style={{ minHeight: 27, marginTop: 7, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: current ? '#FEF3C7' : available ? '#E0F2FE' : '#FFF7D6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {current ? (
                          <Ionicons name="checkmark-circle" size={14} color="#B45309" />
                        ) : available ? (
                          <Ionicons name="lock-open" size={13} color="#0369A1" />
                        ) : (
                          <KidCoinIcon size={15} />
                        )}
                        <Text style={{ color: current ? '#92400E' : available ? '#075985' : '#92400E', fontSize: 10, fontWeight: '900' }}>
                          {current
                            ? (ar ? 'مستخدم حاليًا' : 'Equipped')
                            : frame.owned
                              ? (ar ? 'ملكك' : 'Owned')
                              : frame.is_free
                                ? (ar ? 'مجاني' : 'Free')
                                : `${Number(frame.coin_cost || 0).toLocaleString()} ${ar ? 'كوين' : 'coins'}`}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            </ScrollView>
          )}
        </LinearGradient>
      </View>
    </Modal>
  )
}

function ProfileProgressCard({
  progress,
  ar,
  onFramePress,
}: {
  progress: any
  ar: boolean
  onFramePress: (frame: ProfileFrame) => void
}) {
  void onFramePress
  const [expanded, setExpanded] = useState(false)
  const xp = Number(progress?.xp || 0)
  const level = Number(progress?.level || 1)
  const next = Math.max(Number(progress?.next_level_xp || 50), 1)
  const prev = level <= 1 ? 0 : [0, 50, 150, 350, 700, 1200, 2000][level - 1] || 0
  const pct = level >= 7 ? 100 : Math.max(0, Math.min(100, ((xp - prev) / Math.max(1, next - prev)) * 100))
  const title = ar ? progress?.level_title_ar : progress?.level_title_en

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: expanded ? spacing.md : spacing.sm, backgroundColor: colors.white }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ar ? 'تفاصيل مستوى كيدتوك' : 'KidTok level details'}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}
      >
        <LinearGradient
          colors={['#10103A', '#1E3A8A', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: expanded ? 22 : radius.pill, paddingHorizontal: spacing.md, paddingVertical: expanded ? spacing.md : 10, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
              <Text style={{ fontSize: 22 }}>{level >= 7 ? '👑' : '⭐'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.sm, textAlign: ar ? 'right' : 'left' }}>
                {`Level ${level} · ${title || (ar ? 'بطل' : 'Hero')}`}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.74)', fontWeight: '800', fontSize: 10, marginTop: 2, textAlign: ar ? 'right' : 'left' }}>
                {level >= 7
                  ? (ar ? 'أعلى مستوى يا أسطورة!' : 'Max level reached, legend!')
                  : (ar ? `${xp} XP من ${next}` : `${xp} XP of ${next}`)}
              </Text>
            </View>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.86)" />
          </View>

          <View style={{ height: expanded ? 10 : 7, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', marginTop: expanded ? spacing.md : 8 }}>
            <LinearGradient
              colors={['#FDE68A', '#F97316', '#F43F5E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ width: `${pct}%`, height: '100%', borderRadius: 999 }}
            />
          </View>

          {expanded && (
            <View style={{ marginTop: spacing.md, gap: 9 }}>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: fontSize.xs, fontWeight: '800', lineHeight: 18, textAlign: ar ? 'right' : 'left' }}>
                {ar
                  ? 'ارفع فيديوهات، اجمع لايكات وتعليقات، واتفرج على فيديوهات عشان تزود XP وتفتح جوائز جديدة.'
                  : 'Post videos, collect likes and comments, and watch clips to grow your XP and unlock new rewards.'}
              </Text>
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 7 }}>
                <XpPill icon="🎬" text={ar ? '+10 رفع فيديو' : '+10 upload'} />
                <XpPill icon="💖" text={ar ? '+2 لايك' : '+2 like'} />
                <XpPill icon="💬" text={ar ? '+3 تعليق' : '+3 comment'} />
                <XpPill icon="👀" text={ar ? '+1 مشاهدة' : '+1 view'} />
              </View>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </View>
  )
}

function XpPill({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 12 }}>{icon}</Text>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{text}</Text>
    </View>
  )
}

function StatItem({ count, label }: { count: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.white }}>
        {count > 999 ? `${(count/1000).toFixed(1)}k` : count}
      </Text>
      <Text style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{label}</Text>
    </View>
  )
}
