/**
 * RewardedAdPrompt
 *
 * A rewarded-ad prompt for free users.
 * - mode="nudge": small bottom card, used by the time-based reminder.
 * - mode="gate": full-screen feed break after N swipes. It still keeps a
 *   "continue without reward" action because rewarded ads must remain opt-in.
 */
import { useEffect, useRef } from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRewardedAd } from '@/hooks/useRewardedAd'
import { colors, fontSize, radius, spacing } from '@/lib/theme'

interface Props {
  visible: boolean
  onDismiss: () => void
  mode?: 'nudge' | 'gate'
}

export default function RewardedAdPrompt({ visible, onDismiss, mode = 'nudge' }: Props) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const rewardedAd = useRewardedAd()
  const qc = useQueryClient()
  const { data: coinsPerAd = 5 } = useQuery({
    queryKey: ['coins-per-ad-setting'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'coins_per_ad')
        .maybeSingle()
      const n = Number(data?.value)
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5
    },
  })
  const slideAnim = useRef(new Animated.Value(140)).current
  const scaleAnim = useRef(new Animated.Value(0.94)).current
  const isGate = mode === 'gate'
  const coinLabel = new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US', { maximumFractionDigits: 0 }).format(coinsPerAd)

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: visible ? 0 : 140,
        useNativeDriver: true,
        speed: 14,
        bounciness: 3,
      }),
      Animated.spring(scaleAnim, {
        toValue: visible ? 1 : 0.94,
        useNativeDriver: true,
        speed: 16,
        bounciness: 4,
      }),
    ]).start()
  }, [scaleAnim, slideAnim, visible])

  const handleWatch = async () => {
    try {
      let earnedCoins = 0

      await rewardedAd.show(async () => {
        const { data, error } = await supabase.rpc('claim_ad_reward')
        if (!error && data?.success) {
          earnedCoins = data.coins_earned ?? coinsPerAd
          qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'coins' })
        }
      })

      if (earnedCoins > 0) {
        Toast.show({
          type: 'coinReward',
          text1: ar ? `ربحت +${earnedCoins} كوين!` : `You won +${earnedCoins} coins!`,
          text2: ar ? 'حطّيناهم في حصالة كيدتوك 🪙' : 'Added to your KidTok piggy bank 🪙',
          props: { icon: '🪙', accent: 'gold', coins: earnedCoins },
        })
      }
      onDismiss()
    } catch (err: any) {
      const code = String(err?.message || '')
      if (code === 'AD_DISABLED') {
        onDismiss()
      } else if (code === 'AD_NOT_READY' || code === 'AD_UNIT_MISSING') {
        const detail = rewardedAd.error || ''
        const noFill = /no fill|no ad|inventory/i.test(detail)
        Toast.show({
          type: 'kidReward',
          text1: noFill
            ? (ar ? 'مفيش إعلان متاح دلوقتي' : 'No ad available right now')
            : code === 'AD_UNIT_MISSING'
              ? (ar ? 'وحدة إعلان المكافأة ناقصة' : 'Rewarded ad unit is missing')
              : (ar ? 'الإعلان لسه بيتجهز' : 'Ad is still getting ready'),
          text2: noFill
            ? (ar ? 'دي من مخزون AdMob. جرب بعد شوية.' : 'This is AdMob inventory. Try again in a little bit.')
            : (ar ? 'جرب تاني بعد ثواني، ولو استمرت نراجع إعدادات AdMob.' : 'Try again in a few seconds; if it continues, check AdMob settings.'),
          props: { icon: '🎬', accent: 'purple' },
        })
      } else if (code !== 'AD_DISMISSED') {
        Toast.show({
          type: 'kidReward',
          text1: ar ? 'الإعلان ما اشتغلش' : 'Ad did not start',
          text2: rewardedAd.error ? String(rewardedAd.error).slice(0, 90) : (ar ? 'جرب تاني بعد شوية.' : 'Please try again shortly.'),
          props: { icon: '✨', accent: 'purple' },
        })
      }
    }
  }

  if (!visible) return null

  if (isGate) {
    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 200,
          backgroundColor: 'rgba(0,0,0,0.62)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 360,
            transform: [{ scale: scaleAnim }],
          }}
        >
          <LinearGradient
            colors={['#FFFFFF', '#FFF7D6', '#FFE4F0']}
            style={{
              borderRadius: 28,
              padding: spacing.xl,
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.25,
              shadowRadius: 20,
              elevation: 18,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: `${colors.secondary}20`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Text style={{ fontSize: 38 }}>🪙</Text>
            </View>

            <Text
              style={{
                color: colors.grey900,
                fontSize: fontSize.xl,
                fontWeight: '900',
                textAlign: 'center',
              }}
            >
              {ar ? `كنز سريع +${coinLabel} كوين!` : `Quick +${coinLabel} coin treasure!`}
            </Text>

            <Text
              style={{
                color: colors.grey600,
                fontSize: fontSize.sm,
                lineHeight: 21,
                marginTop: spacing.sm,
                textAlign: 'center',
              }}
            >
              {ar
                ? `شاهد إعلانًا قصيرًا واجمع +${coinLabel} كوين للهدايا والإطارات.`
                : `Watch a short ad and collect +${coinLabel} coins for gifts and frames.`}
            </Text>

            <Pressable
              onPress={handleWatch}
              disabled={rewardedAd.loading}
              style={({ pressed }) => ({
                marginTop: spacing.lg,
                width: '100%',
                paddingVertical: spacing.md,
                borderRadius: radius.pill,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                opacity: pressed || rewardedAd.loading ? 0.75 : 1,
              })}
            >
              <LinearGradient
                colors={['#F96286', '#A855F7', '#03BBE5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              />
              <Ionicons name={rewardedAd.loading ? 'time-outline' : 'play-circle'} size={19} color={colors.white} />
              <Text style={{ color: colors.white, fontWeight: '900', fontSize: fontSize.base }}>
                {rewardedAd.loading
                  ? (ar ? 'جار التحضير...' : 'Preparing...')
                  : (ar ? `شاهد واكسب +${coinLabel}` : `Watch & earn +${coinLabel}`)}
              </Text>
            </Pressable>

            <Pressable onPress={onDismiss} style={{ marginTop: spacing.md, padding: spacing.sm }}>
              <Text style={{ color: colors.grey500, fontWeight: '800', fontSize: fontSize.sm }}>
                {ar ? 'متابعة بدون مكافأة' : 'Continue without reward'}
              </Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    )
  }

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 80,
        left: spacing.md,
        right: spacing.md,
        transform: [{ translateY: slideAnim }],
        zIndex: 50,
      }}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FFF7D6', '#FFE4F0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: radius.xl,
          padding: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
          borderWidth: 1,
          borderColor: '#FCD34D',
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: `${colors.secondary}20`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 24 }}>🪙</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: fontSize.sm, color: colors.grey900 }}>
            {ar ? `كنز +${coinLabel} كوين!` : `+${coinLabel} coin treasure!`}
          </Text>
          <Text style={{ fontSize: 11, color: colors.grey500, marginTop: 1 }}>
            {ar ? `شاهد إعلانًا قصيرًا واجمع +${coinLabel} كوين` : `Watch a short ad and collect +${coinLabel} coins`}
          </Text>
        </View>

        <Pressable
          onPress={handleWatch}
          disabled={rewardedAd.loading}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: radius.pill,
            overflow: 'hidden',
            opacity: pressed || rewardedAd.loading ? 0.7 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          })}
        >
          <LinearGradient
            colors={['#F96286', '#A855F7']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <Ionicons name={rewardedAd.loading ? 'time-outline' : 'play-circle'} size={14} color={colors.white} />
          <Text style={{ color: colors.white, fontWeight: '800', fontSize: 12 }}>
            {rewardedAd.loading ? '...' : (ar ? `+${coinLabel}` : `+${coinLabel}`)}
          </Text>
        </Pressable>

        <Pressable onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.grey400} />
        </Pressable>
      </LinearGradient>
    </Animated.View>
  )
}
