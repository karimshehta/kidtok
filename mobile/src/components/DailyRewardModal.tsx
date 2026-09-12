import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, Modal, Pressable, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, fontSize, radius, spacing } from '@/lib/theme'
import { useRewardedAd } from '@/hooks/useRewardedAd'

type MysteryBoxStatus = {
  can_open?: boolean
  opened_today?: boolean
  today?: string
}

type MysteryBoxResult = {
  success?: boolean
  reason?: string
  reward_kind?: 'coins' | 'badge' | 'avatar'
  coin_amount?: number
  badge_id?: string | null
  avatar_id?: string | null
  new_balance?: number
}

const AVATAR_NAMES: Record<string, { ar: string; en: string }> = {
  lion: { ar: 'الأسد', en: 'Lion' },
  dinosaur: { ar: 'الديناصور', en: 'Dinosaur' },
  superhero: { ar: 'السوبر هيرو', en: 'Superhero' },
}

const runAnimation = (animation: Animated.CompositeAnimation) =>
  new Promise<void>((resolve) => animation.start(() => resolve()))

export default function DailyRewardModal() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()
  const rewardedAd = useRewardedAd()

  const [visible, setVisible] = useState(false)
  const [opening, setOpening] = useState(false)
  const [result, setResult] = useState<MysteryBoxResult | null>(null)

  const scale = useRef(new Animated.Value(0.85)).current
  const opacity = useRef(new Animated.Value(0)).current
  const chestPulse = useRef(new Animated.Value(1)).current
  const chestLift = useRef(new Animated.Value(0)).current
  const chestShake = useRef(new Animated.Value(0)).current
  const lidOpen = useRef(new Animated.Value(0)).current
  const burst = useRef(new Animated.Value(0)).current
  const giftRise = useRef(new Animated.Value(0)).current
  const giftPop = useRef(new Animated.Value(0)).current

  const { data: status, refetch } = useQuery<MysteryBoxStatus>({
    queryKey: ['mystery-box-status', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mystery_box_status')
      if (error) throw error
      return (data || {}) as MysteryBoxStatus
    },
  })

  useEffect(() => {
    if (!userId || !status?.can_open) return
    const timer = setTimeout(() => setVisible(true), 4500)
    return () => clearTimeout(timer)
  }, [status?.can_open, userId])

  useEffect(() => {
    if (!visible) return
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [opacity, scale, visible])

  useEffect(() => {
    if (!visible || result || opening) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chestPulse, { toValue: 1.06, duration: 650, useNativeDriver: true }),
        Animated.timing(chestPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [chestPulse, opening, result, visible])

  const resetChestAnimation = () => {
    chestPulse.setValue(1)
    chestLift.setValue(0)
    chestShake.setValue(0)
    lidOpen.setValue(0)
    burst.setValue(0)
    giftRise.setValue(0)
    giftPop.setValue(0)
  }

  const playOpeningAnimation = async () => {
    resetChestAnimation()
    await runAnimation(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(chestLift, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.back(1.4)),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(chestShake, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(chestShake, { toValue: -1, duration: 70, useNativeDriver: true }),
            Animated.timing(chestShake, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(chestShake, { toValue: -1, duration: 70, useNativeDriver: true }),
            Animated.timing(chestShake, { toValue: 0, duration: 70, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.spring(lidOpen, {
            toValue: 1,
            speed: 18,
            bounciness: 9,
            useNativeDriver: true,
          }),
          Animated.timing(burst, {
            toValue: 1,
            duration: 360,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ])
    )
  }

  const playRewardAnimation = async () => {
    await runAnimation(
      Animated.parallel([
        Animated.spring(giftRise, {
          toValue: 1,
          speed: 14,
          bounciness: 10,
          useNativeDriver: true,
        }),
        Animated.spring(giftPop, {
          toValue: 1,
          speed: 16,
          bounciness: 12,
          useNativeDriver: true,
        }),
      ])
    )
  }

  const handleOpen = async () => {
    if (opening) return
    setOpening(true)
    setResult(null)

    try {
      try {
        await rewardedAd.show(async () => {})
      } catch (adError: any) {
        const code = String(adError?.message || adError || '')
        if (code !== 'AD_DISMISSED') {
          rewardedAd.reload()
          Toast.show({
            type: 'kidReward',
            text1: ar ? 'الإعلان مش جاهز دلوقتي' : 'Ad is not ready yet',
            text2: ar ? 'جرب تفتح الصندوق كمان ثواني.' : 'Try opening the box again in a few seconds.',
            props: { icon: '🎟️', accent: 'purple' },
          })
        }
        resetChestAnimation()
        return
      }

      await playOpeningAnimation()

      const { data, error } = await supabase.rpc('open_mystery_box')
      if (error) throw error

      const payload = (data || {}) as MysteryBoxResult
      if (!payload.success) {
        Toast.show({
          type: 'info',
          text1: ar ? 'فتحت صندوق اليوم بالفعل' : 'Today box is already open',
        })
        setVisible(false)
        await refetch()
        return
      }

      setResult(payload)
      supabase.rpc('record_kidtok_activity', {
        p_event_type: 'mystery_box_opened',
        p_ref_key: new Date().toISOString().slice(0, 10),
        p_metadata: {
          reward_kind: payload.reward_kind,
          coin_amount: payload.coin_amount || 0,
          badge_id: payload.badge_id || null,
          avatar_id: payload.avatar_id || null,
        },
      }).then(() => {}, () => {})
      await playRewardAnimation()
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'coins' })
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'kidtok-collection' })
      qc.invalidateQueries({ queryKey: ['avatar-ownerships'] })
      qc.invalidateQueries({ queryKey: ['mystery-box-status', userId] })
    } catch (err: any) {
      Toast.show({
        type: 'error',
        text1: ar ? 'فشل فتح الصندوق' : 'Could not open the box',
        text2: String(err?.message || err).slice(0, 120),
      })
      resetChestAnimation()
    } finally {
      setOpening(false)
    }
  }

  if (!visible) return null

  const rewardText = getRewardText(result, ar)
  const rewardIcon = result?.reward_kind === 'avatar'
    ? 'sparkles'
    : result?.reward_kind === 'badge'
      ? 'ribbon'
      : 'logo-bitcoin'

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={() => !opening && setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(3, 0, 16, 0.74)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Animated.View style={{ width: '100%', maxWidth: 380, opacity, transform: [{ scale }] }}>
          <LinearGradient
            colors={['#130021', '#2B0754', '#080315']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 26,
              padding: spacing.lg,
              borderWidth: 1,
              borderColor: 'rgba(191, 90, 242, 0.55)',
              shadowColor: '#8B5CF6',
              shadowOpacity: 0.35,
              shadowRadius: 18,
              elevation: 10,
            }}
          >
            {!opening && (
              <Pressable onPress={() => setVisible(false)} hitSlop={10} style={{ position: 'absolute', top: 14, right: 14, zIndex: 2 }}>
                <Ionicons name="close" size={22} color="#D8B4FE" />
              </Pressable>
            )}

            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontSize: fontSize['2xl'], fontWeight: '900', textAlign: 'center' }}>
                {result ? (ar ? 'مبروك!' : 'Nice pull!') : (ar ? 'الصندوق الغامض' : 'Mystery Box')}
              </Text>

              <Text style={{ color: '#D8B4FE', fontSize: fontSize.sm, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
                {result
                  ? rewardText.subtitle
                  : (ar ? 'شاهد إعلان Reward قصير وافتح صندوقك اليومي المفاجئ.' : 'Watch a short rewarded ad to open today’s surprise box.')}
              </Text>
            </View>

            <MysteryChest
              opening={opening}
              result={result}
              rewardIcon={rewardIcon as keyof typeof Ionicons.glyphMap}
              chestPulse={chestPulse}
              chestLift={chestLift}
              chestShake={chestShake}
              lidOpen={lidOpen}
              burst={burst}
              giftRise={giftRise}
              giftPop={giftPop}
            />

            {result && (
              <View style={{ marginTop: spacing.lg, alignItems: 'center', backgroundColor: 'rgba(255, 213, 79, 0.12)', borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(255, 213, 79, 0.45)', padding: spacing.lg }}>
                <Ionicons name={rewardIcon as any} size={32} color="#FFD54F" />
                <Text style={{ color: '#FFFFFF', fontSize: fontSize.xl, fontWeight: '900', marginTop: spacing.sm, textAlign: 'center' }}>
                  {rewardText.title}
                </Text>
              </View>
            )}

            <Pressable
              onPress={result ? () => setVisible(false) : handleOpen}
              disabled={opening}
              style={({ pressed }) => ({
                marginTop: spacing.lg,
                borderRadius: radius.pill,
                overflow: 'hidden',
                opacity: opening ? 0.75 : pressed ? 0.9 : 1,
              })}
            >
              <LinearGradient
                colors={['#FFB429', '#F96286', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ paddingVertical: spacing.md + 2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
              >
                {opening ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons name={result ? 'checkmark-circle' : 'cube'} size={21} color="#FFFFFF" />
                )}
                <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: fontSize.base }}>
                  {opening
                    ? (ar ? 'جاري تجهيز الصندوق...' : 'Getting the box ready...')
                    : result
                      ? (ar ? 'تم' : 'Done')
                      : (ar ? 'شاهد إعلان وافتح الصندوق' : 'Watch ad & open box')}
                </Text>
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  )
}

function MysteryChest({
  opening,
  result,
  rewardIcon,
  chestPulse,
  chestLift,
  chestShake,
  lidOpen,
  burst,
  giftRise,
  giftPop,
}: {
  opening: boolean
  result: MysteryBoxResult | null
  rewardIcon: keyof typeof Ionicons.glyphMap
  chestPulse: Animated.Value
  chestLift: Animated.Value
  chestShake: Animated.Value
  lidOpen: Animated.Value
  burst: Animated.Value
  giftRise: Animated.Value
  giftPop: Animated.Value
}) {
  const chestTranslateY = chestLift.interpolate({ inputRange: [0, 1], outputRange: [0, -16] })
  const chestRotate = chestShake.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-7deg', '0deg', '7deg'] })
  const lidTranslateY = lidOpen.interpolate({ inputRange: [0, 1], outputRange: [0, -34] })
  const lidRotate = lidOpen.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-18deg'] })
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] })
  const giftTranslateY = giftRise.interpolate({ inputRange: [0, 1], outputRange: [22, -74] })
  const giftScale = giftPop.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.45, 1.25, 1] })

  return (
    <View style={{ height: 190, marginTop: spacing.lg, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 62,
          width: 152,
          height: 152,
          borderRadius: 76,
          borderWidth: 2,
          borderColor: '#FDE68A',
          opacity: burstOpacity,
          transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.5] }) }],
        }}
      />

      {(opening || result) && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 58,
            width: 74,
            height: 74,
            borderRadius: 37,
            backgroundColor: 'rgba(255, 213, 79, 0.98)',
            borderWidth: 4,
            borderColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#FFD54F',
            shadowOpacity: 0.8,
            shadowRadius: 16,
            elevation: 14,
            opacity: result ? 1 : burst,
            transform: [{ translateY: giftTranslateY }, { scale: giftScale }],
          }}
        >
          <Ionicons name={rewardIcon} size={36} color="#7C2D12" />
        </Animated.View>
      )}

      <Animated.View
        style={{
          width: 152,
          height: 116,
          alignItems: 'center',
          justifyContent: 'flex-end',
          transform: [
            { translateY: chestTranslateY },
            { rotate: chestRotate },
            { scale: chestPulse },
          ],
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            width: 144,
            height: 44,
            borderRadius: 18,
            overflow: 'hidden',
            zIndex: 3,
            borderWidth: 2,
            borderColor: '#FDE68A',
            transform: [{ translateY: lidTranslateY }, { rotate: lidRotate }],
          }}
        >
          <LinearGradient
            colors={['#F59E0B', '#A855F7', '#6D28D9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="star" size={24} color="#FFE68A" />
          </LinearGradient>
        </Animated.View>

        <LinearGradient
          colors={['#7C3AED', '#4C1D95', '#1E063D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 152,
            height: 88,
            borderRadius: 22,
            borderWidth: 2,
            borderColor: '#FDE68A',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ position: 'absolute', left: 0, right: 0, top: 36, height: 10, backgroundColor: 'rgba(253, 230, 138, 0.95)' }} />
          <View style={{ position: 'absolute', top: 0, bottom: 0, width: 18, backgroundColor: 'rgba(253, 230, 138, 0.95)' }} />
          <View style={{ width: 42, height: 34, borderRadius: 14, backgroundColor: '#F59E0B', borderWidth: 2, borderColor: '#FFF7AD', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={21} color="#FFFFFF" />
          </View>
        </LinearGradient>

        <Sparkle style={{ top: -48, left: -18 }} delay={0} burst={burst} />
        <Sparkle style={{ top: -36, right: -24 }} delay={0.2} burst={burst} />
        <Sparkle style={{ top: 12, left: -34 }} delay={0.4} burst={burst} />
        <Sparkle style={{ top: 22, right: -38 }} delay={0.65} burst={burst} />
      </Animated.View>
    </View>
  )
}

function Sparkle({ style, delay, burst }: { style: any; delay: number; burst: Animated.Value }) {
  const start = Math.max(0.01, Math.min(0.7, delay))
  const peak = Math.min(0.92, start + 0.2)
  const opacity = burst.interpolate({
    inputRange: [0, start, peak, 1],
    outputRange: [0, 0, 1, 0],
  })
  const scale = burst.interpolate({
    inputRange: [0, Math.min(1, delay + 0.5)],
    outputRange: [0.3, 1.15],
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: 'rgba(255, 255, 255, 0.16)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          transform: [{ scale }],
        },
        style,
      ]}
    >
      <Ionicons name="sparkles" size={17} color="#FDE68A" />
    </Animated.View>
  )
}

function getRewardText(result: MysteryBoxResult | null, ar: boolean) {
  if (!result) return { title: '', subtitle: '' }

  if (result.reward_kind === 'avatar') {
    const avatar = result.avatar_id ? AVATAR_NAMES[result.avatar_id] : null
    const name = avatar ? (ar ? avatar.ar : avatar.en) : (ar ? 'أفاتار نادر' : 'Rare avatar')
    return {
      title: ar ? `فتحت ${name} مدى الحياة` : `${name} unlocked forever`,
      subtitle: ar ? 'الجائزة اتحفظت في حسابك وتقدر تستخدمها في رفع الفيديو.' : 'Saved to your account for future video uploads.',
    }
  }

  if (result.reward_kind === 'badge') {
    return {
      title: ar ? 'كسبت شارة الصندوق الغامض' : 'Mystery Box Badge unlocked',
      subtitle: ar ? 'شارة نادرة اتضافت لحسابك.' : 'A rare badge was added to your account.',
    }
  }

  const coins = result.coin_amount || 0
  return {
    title: ar ? `+${coins} كوين` : `+${coins} coins`,
    subtitle: ar ? 'الرصيد اتحدث فورًا.' : 'Your balance was updated.',
  }
}
