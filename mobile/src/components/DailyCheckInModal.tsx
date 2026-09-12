import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Modal, Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, fontSize, radius, spacing } from '@/lib/theme'
import KidCoinIcon from '@/components/KidCoinIcon'

type CheckInReward = {
  kind?: 'coins' | 'avatar'
  coin_amount?: number
  avatar_id?: string | null
  day_in_week?: number
  week_in_cycle?: number
}

type CheckInStatus = {
  can_claim?: boolean
  claimed_today?: boolean
  today?: string
  current_streak?: number
  best_streak?: number
  total_checkins?: number
  next_streak?: number
  reward?: CheckInReward
}

type CheckInResult = {
  success?: boolean
  reason?: string
  reward_kind?: 'coins' | 'avatar'
  coin_amount?: number
  avatar_id?: string | null
  current_streak?: number
  best_streak?: number
  total_checkins?: number
  reward?: CheckInReward
}

type AvatarLabel = { ar: string; en: string; emoji: string; shortAr: string; shortEn: string }

const AVATAR_NAMES: Record<string, AvatarLabel> = {
  lion: { ar: 'الأسد', en: 'Lion', shortAr: 'أسد', shortEn: 'Lion', emoji: '🦁' },
  dinosaur: { ar: 'الديناصور', en: 'Dinosaur', shortAr: 'دينو', shortEn: 'Dino', emoji: '🦖' },
  superhero: { ar: 'السوبر هيرو', en: 'Superhero', shortAr: 'هيرو', shortEn: 'Hero', emoji: '🦸' },
  princess: { ar: 'الأميرة', en: 'Princess', shortAr: 'أميرة', shortEn: 'Princess', emoji: '👸' },
  astronaut: { ar: 'رائد الفضاء', en: 'Astronaut', shortAr: 'فضاء', shortEn: 'Space', emoji: '🧑‍🚀' },
  king: { ar: 'الملك', en: 'King', shortAr: 'ملك', shortEn: 'King', emoji: '👑' },
  elephant: { ar: 'الفيل', en: 'Elephant', shortAr: 'فيل', shortEn: 'Elephant', emoji: '🐘' },
  'cartoon-boy': { ar: 'الولد الكرتوني', en: 'Cartoon boy', shortAr: 'ولد', shortEn: 'Boy', emoji: '👦' },
  'cartoon-girl': { ar: 'البنت الكرتونية', en: 'Cartoon girl', shortAr: 'بنت', shortEn: 'Girl', emoji: '👧' },
}

export default function DailyCheckInModal({
  disabled = false,
  openSignal = 0,
}: {
  disabled?: boolean
  openSignal?: number
}) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [visible, setVisible] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [lockedHint, setLockedHint] = useState<string | null>(null)
  const scale = useRef(new Animated.Value(0.94)).current
  const opacity = useRef(new Animated.Value(0)).current
  const activePulse = useRef(new Animated.Value(0)).current
  const claimPop = useRef(new Animated.Value(1)).current

  const {
    data: status,
    refetch,
    isLoading: statusLoading,
    isFetching: statusFetching,
    error: statusError,
  } = useQuery<CheckInStatus>({
    queryKey: ['daily-checkin-status', userId],
    enabled: !!userId && !disabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_daily_checkin_status')
      if (error) throw error
      return (data || {}) as CheckInStatus
    },
  })

  useEffect(() => {
    if (!userId || disabled || !status?.can_claim || !status.today) return

    let cancelled = false
    const key = `daily-checkin-seen:${userId}`

    AsyncStorage.getItem(key).then((seenDate) => {
      if (cancelled || seenDate === status.today) return
      return AsyncStorage.setItem(key, status.today!).then(() => {
        if (!cancelled) setTimeout(() => !cancelled && setVisible(true), 900)
      })
    }).catch(() => {
      if (!cancelled) setTimeout(() => !cancelled && setVisible(true), 900)
    })

    return () => { cancelled = true }
  }, [disabled, status?.can_claim, status?.today, userId])

  useEffect(() => {
    if (!userId || disabled || !openSignal) return
    setResult(null)
    setLockedHint(null)
    setVisible(true)
    void refetch()
  }, [disabled, openSignal, refetch, userId])

  useEffect(() => {
    if (!visible) return
    scale.setValue(0.94)
    opacity.setValue(0)
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start()
  }, [opacity, scale, visible])

  const displayStatus = useMemo<CheckInStatus>(() => {
    if (!result?.success) return status || {}
    const current = result.current_streak || status?.current_streak || 1
    return {
      ...(status || {}),
      current_streak: current,
      best_streak: result.best_streak,
      total_checkins: result.total_checkins,
      reward: result.reward || {
        kind: result.reward_kind,
        coin_amount: result.coin_amount,
        avatar_id: result.avatar_id,
      },
      next_streak: current,
      can_claim: false,
      claimed_today: true,
    }
  }, [result, status])

  const reward = displayStatus.reward || {}
  const nextStreak = Math.max(displayStatus.next_streak || 1, 1)
  const activeDayInWeek = reward.day_in_week || ((nextStreak - 1) % 7) + 1
  const activeWeek = reward.week_in_cycle || Math.floor(((nextStreak - 1) % 28) / 7) + 1
  const completedUntil = displayStatus.claimed_today ? activeDayInWeek : Math.max(0, activeDayInWeek - 1)

  useEffect(() => {
    if (!visible || !displayStatus.can_claim) return
    activePulse.setValue(0)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(activePulse, { toValue: 1, duration: 760, useNativeDriver: true }),
        Animated.timing(activePulse, { toValue: 0, duration: 760, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [activePulse, displayStatus.can_claim, visible])

  const handleClaim = async () => {
    if (claiming || !displayStatus.can_claim) return

    setClaiming(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    Animated.sequence([
      Animated.spring(claimPop, { toValue: 0.9, useNativeDriver: true, speed: 24, bounciness: 4 }),
      Animated.spring(claimPop, { toValue: 1.05, useNativeDriver: true, speed: 18, bounciness: 7 }),
      Animated.spring(claimPop, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 5 }),
    ]).start()

    try {
      const { data, error } = await supabase.rpc('claim_daily_checkin')
      if (error) throw error
      const payload = (data || {}) as CheckInResult

      if (!payload.success) {
        Toast.show({ type: 'info', text1: ar ? 'سجلت حضورك اليوم بالفعل' : 'Already checked in today' })
        setResult({
          success: true,
          current_streak: payload.current_streak || displayStatus.current_streak,
          best_streak: payload.best_streak || displayStatus.best_streak,
          total_checkins: payload.total_checkins || displayStatus.total_checkins,
          reward: displayStatus.reward,
        })
        await refetch()
        return
      }

      setResult(payload)
      supabase.rpc('record_kidtok_activity', {
        p_event_type: 'daily_checkin_claimed',
        p_ref_key: new Date().toISOString().slice(0, 10),
        p_metadata: {
          reward_kind: payload.reward_kind,
          coin_amount: payload.coin_amount || 0,
          current_streak: payload.current_streak || 0,
        },
      }).then(() => {}, () => {})
      const text = getResultText(payload, ar)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      Toast.show({
        type: 'kidReward',
        text1: text.title,
        text2: text.subtitle,
        props: {
          icon: getRewardEmoji(payload),
          accent: payload.reward_kind === 'avatar' ? 'purple' : 'gold',
          coins: payload.reward_kind === 'coins' ? payload.coin_amount : undefined,
        },
      })
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'coins' })
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'kidtok-collection' })
      qc.invalidateQueries({ queryKey: ['avatar-ownerships'] })
      qc.invalidateQueries({ queryKey: ['daily-checkin-status', userId] })
      void refetch()
    } catch (err: any) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      Toast.show({
        type: 'error',
        text1: ar ? 'فشل تسجيل الحضور' : 'Check-in failed',
        text2: String(err?.message || err).slice(0, 120),
      })
    } finally {
      setClaiming(false)
    }
  }

  const handleLockedTap = (day: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    const daysLeft = Math.max(0, day - activeDayInWeek)
    if (daysLeft === 0) {
      setLockedHint(ar ? 'هدية اليوم اتاستلمت بالفعل. ارجع بكرة!' : 'Today’s reward is already collected. Come back tomorrow!')
      return
    }
    const dayWord = daysLeft === 1 ? (ar ? 'يوم واحد' : '1 day') : (ar ? `${daysLeft} أيام` : `${daysLeft} days`)
    setLockedHint(
      ar
        ? `لسه بدري على الهدية دي ✨ تعال بعد ${dayWord}.`
        : `This reward is waiting for you! Come back in ${dayWord}.`,
    )
  }

  if (!visible) return null

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={() => !claiming && setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.md }}>
        <Animated.View style={{ width: '100%', maxWidth: 410, opacity, transform: [{ scale }] }}>
          <LinearGradient
            colors={['#FFFFFF', '#F2FBFF', '#FFF6DB']}
            style={{ borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(3,187,229,0.22)', padding: spacing.md }}
          >
            {!claiming && (
              <Pressable onPress={() => setVisible(false)} hitSlop={10} style={{ position: 'absolute', top: 10, right: 10, zIndex: 4 }}>
                <Ionicons name="close" size={20} color={colors.grey700} />
              </Pressable>
            )}

            <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, paddingHorizontal: 4 }}>
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#E0F7FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="calendar" size={21} color={colors.primaryDark} />
                </View>
                <View>
                  <Text style={{ color: colors.primaryDark, fontWeight: '900', fontSize: fontSize.lg, textAlign: ar ? 'right' : 'left' }}>
                    {ar ? 'الحضور اليومي' : 'Daily Check-In'}
                  </Text>
                  <Text style={{ color: colors.grey500, fontWeight: '800', fontSize: 11, marginTop: 1, textAlign: ar ? 'right' : 'left' }}>
                    {ar ? 'أسبوع جديد وجوائز جديدة' : 'A fresh week of rewards'}
                  </Text>
                </View>
              </View>
              <View style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' }}>
                <Text style={{ color: '#92400E', fontWeight: '900', fontSize: 12 }}>
                  {ar ? `اليوم ${activeDayInWeek}` : `Day ${activeDayInWeek}`}
                </Text>
              </View>
            </View>

            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 10, borderWidth: 1, borderColor: '#E0F2FE', shadowColor: '#03BBE5', shadowOpacity: 0.12, shadowRadius: 14, elevation: 5 }}>
              {!status && (statusLoading || statusFetching) ? (
                <View style={{ minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.grey600, fontSize: 11, fontWeight: '800' }}>
                    {ar ? 'بنجهّز جوائز الأسبوع...' : 'Preparing this week’s rewards...'}
                  </Text>
                </View>
              ) : statusError && !status ? (
                <Pressable
                  onPress={() => void refetch()}
                  style={{ minHeight: 86, alignItems: 'center', justifyContent: 'center', gap: 7 }}
                >
                  <Ionicons name="refresh-circle" size={27} color={colors.primary} />
                  <Text style={{ color: colors.grey700, fontSize: 11, fontWeight: '900' }}>
                    {ar ? 'اضغط علشان نحاول تاني' : 'Tap to try again'}
                  </Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: ar ? 'row-reverse' : 'row', gap: 7 }}>
                  {Array.from({ length: 7 }).map((_, dayIndex) => {
                    const day = dayIndex + 1
                    const isActive = day === activeDayInWeek
                    const isCompleted = completedUntil > 0 && day <= completedUntil
                    const canClaim = !!displayStatus.can_claim && isActive && !claiming
                    const label = getCalendarRewardLabel(day, activeWeek, ar, isActive ? reward : undefined)

                    return (
                      <CheckInDayCell
                        key={day}
                        day={day}
                        label={label}
                        active={isActive}
                        completed={isCompleted}
                        canClaim={canClaim}
                        claiming={claiming && isActive}
                        pulse={activePulse}
                        pop={claimPop}
                        onPress={canClaim ? handleClaim : () => handleLockedTap(day)}
                      />
                    )
                  })}
                </View>
              )}
            </View>
            {!!lockedHint && (
              <View style={{ marginTop: spacing.sm, flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 7, backgroundColor: '#EEF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9 }}>
                <Ionicons name="time-outline" size={16} color="#2563EB" />
                <Text style={{ flex: 1, color: '#1E3A8A', fontSize: 11, lineHeight: 18, fontWeight: '800', textAlign: ar ? 'right' : 'left' }}>
                  {lockedHint}
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  )
}

function CheckInDayCell({
  day,
  label,
  active,
  completed,
  canClaim,
  claiming,
  pulse,
  pop,
  onPress,
}: {
  day: number
  label: string
  active: boolean
  completed: boolean
  canClaim: boolean
  claiming: boolean
  pulse: Animated.Value
  pop: Animated.Value
  onPress: () => void
}) {
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] })
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] })
  const cellScale = canClaim || claiming ? Animated.multiply(pulseScale, pop) : 1
  const isCoinReward = label.startsWith('+')

  return (
    <Animated.View style={{ flex: 1, opacity: active ? pulseOpacity : 1, transform: [{ scale: cellScale as any }] }}>
      <Pressable
        onPress={onPress}
        disabled={claiming}
        style={({ pressed }) => ({
          minHeight: 86,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 8,
          paddingHorizontal: 3,
          backgroundColor: completed
            ? '#DCFCE7'
            : active
              ? '#FFF7D6'
              : '#F8FAFC',
          borderWidth: active ? 2 : 1,
          borderColor: completed
            ? '#86EFAC'
            : active
              ? '#F59E0B'
              : '#E5E7EB',
          opacity: pressed ? 0.86 : 1,
        })}
      >
        <Text style={{ color: active ? '#92400E' : colors.grey700, fontSize: 10, fontWeight: '900' }}>{day}</Text>
        {claiming ? (
          <ActivityIndicator size="small" color="#F59E0B" style={{ marginTop: 2 }} />
        ) : (
          <>
            <View style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              marginTop: 5,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isCoinReward ? '#FDE68A' : '#EDE9FE',
              borderWidth: 2,
              borderColor: '#FFFFFF',
            }}>
              {isCoinReward ? (
                <KidCoinIcon size={22} />
              ) : (
                <Ionicons name="gift" size={17} color="#7C3AED" />
              )}
            </View>
            <Text numberOfLines={1} style={{ color: active ? '#92400E' : colors.grey600, fontSize: 10, fontWeight: '900', marginTop: 4 }}>
              {label}
            </Text>
          </>
        )}
        {completed && !claiming && (
          <View style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' }}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
    </Animated.View>
  )
}

function getCalendarRewardLabel(day: number, week: number, ar: boolean, activeReward?: CheckInReward) {
  if (activeReward?.kind === 'coins') return `+${activeReward.coin_amount || 5}`
  if (day === 7) {
    if (activeReward?.kind === 'avatar' && activeReward.avatar_id) {
      const activeAvatar = AVATAR_NAMES[activeReward.avatar_id]
      if (activeAvatar) return ar ? activeAvatar.shortAr : activeAvatar.shortEn
    }
    void week
    return ar ? 'أفاتار' : 'Avatar'
  }
  if (day === 6) return '+15'
  if (day === 5) return '+10'
  return '+5'
}

function getRewardLabel(reward: CheckInReward, ar: boolean) {
  if (reward.kind === 'avatar' && reward.avatar_id) {
    const avatar = AVATAR_NAMES[reward.avatar_id]
    return avatar ? (ar ? avatar.ar : avatar.en) : (ar ? 'أفاتار مدى الحياة' : 'Avatar forever')
  }
  return ar ? `+${reward.coin_amount || 5} كوين` : `+${reward.coin_amount || 5} coins`
}

function getRewardEmoji(result: CheckInResult) {
  if (result.reward_kind === 'avatar' && result.avatar_id) return AVATAR_NAMES[result.avatar_id]?.emoji || '🎭'
  return '🪙'
}

function getResultText(result: CheckInResult | null, ar: boolean) {
  if (!result) return { title: '', subtitle: '' }
  if (result.reward_kind === 'avatar' && result.avatar_id) {
    const avatar = AVATAR_NAMES[result.avatar_id]
    const name = avatar ? (ar ? avatar.ar : avatar.en) : (ar ? 'أفاتار' : 'Avatar')
    return {
      title: ar ? `فتحت ${name}` : `${name} unlocked`,
      subtitle: ar ? 'اتضاف لحسابك مدى الحياة.' : 'Added to your account forever.',
    }
  }
  const coins = result.coin_amount || 0
  return {
    title: ar ? `كسبت +${coins} كوين` : `You won +${coins} coins`,
    subtitle: ar ? 'اتضافت لحصالة كيدتوك.' : 'Added to your KidTok piggy bank.',
  }
}
