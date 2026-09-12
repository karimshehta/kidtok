import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Toast from 'react-native-toast-message'
import { useQueryClient } from '@tanstack/react-query'

import KidCoinIcon from '@/components/KidCoinIcon'
import { useRewardedAd } from '@/hooks/useRewardedAd'
import { supabase } from '@/lib/supabase'
import {
  buyCreatorExtraUploadCredit,
  fetchCreatorUploadOptions,
  type CreatorUploadOptions,
} from '@/lib/creatorUploadQuota'
import { colors, fontSize, radius, spacing } from '@/lib/theme'

type Props = {
  ar: boolean
  onUnlocked: () => void
  onCancel: () => void
}

export default function CreatorUploadLimitGate({ ar, onUnlocked, onCancel }: Props) {
  const qc = useQueryClient()
  const rewardedAd = useRewardedAd()
  const [options, setOptions] = useState<CreatorUploadOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchCreatorUploadOptions()
      setOptions(next)
      return next
    } catch (error) {
      console.warn('[creator-upload-gate] Could not refresh upload options:', error)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const invalidateBalances = () => {
    qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'coins' })
    qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'creator-upload-quota' })
  }

  const handleBuy = async () => {
    if (buying) return
    setBuying(true)
    try {
      await buyCreatorExtraUploadCredit()
      invalidateBalances()
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'فيديو إضافي جاهز! 🎬' : 'Extra video unlocked! 🎬',
        text2: ar ? 'تقدر تصوّر أو ترفع فيديو جديد دلوقتي.' : 'You can record or upload one new video now.',
        props: { icon: '🎬', accent: 'gold' },
      })
      onUnlocked()
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.includes('INSUFFICIENT_COINS')) {
        await refresh()
        Toast.show({
          type: 'kidReward',
          text1: ar ? 'محتاج كوينز أكتر 🪙' : 'You need more coins 🪙',
          text2: ar ? 'شاهد إعلانًا واجمع كوينز ثم جرّب تاني.' : 'Watch an ad, collect coins, then try again.',
          props: { icon: '🪙', accent: 'gold' },
        })
      } else {
        Toast.show({
          type: 'error',
          text1: ar ? 'تعذّر فتح فيديو إضافي' : 'Could not unlock an extra video',
          text2: ar ? 'جرّب مرة تانية بعد شوية.' : 'Please try again in a moment.',
        })
      }
    } finally {
      setBuying(false)
    }
  }

  const handleRewardedAd = async () => {
    try {
      let earned = 0
      let rewardCreditError: unknown = null
      await rewardedAd.show(async () => {
        // This existing Edge Function reads coins_per_ad from the admin
        // dashboard and enforces the reward cooldown server-side.
        const { data, error } = await supabase.functions.invoke('reward-coins')
        // Do not throw through the native ad CLOSED listener. The current ad
        // hook waits for this callback before resolving; capture the failure
        // and surface it immediately after the ad lifecycle completes.
        if (error) {
          rewardCreditError = error
          return
        }
        earned = Math.max(0, Number(data?.coins_earned || 0))
      })
      if (rewardCreditError) throw rewardCreditError

      invalidateBalances()
      const next = await refresh()
      if ((next?.extra_upload_credits || 0) > 0) {
        Toast.show({
          type: 'kidReward',
          text1: ar ? 'فيديو إضافي مفتوح! 🎬' : 'Extra video unlocked! 🎬',
          text2: ar ? 'الإعلان فتح لك محاولة رفع جديدة.' : 'The ad unlocked one extra upload.',
          props: { icon: '🎬', accent: 'gold' },
        })
        onUnlocked()
        return
      }

      if (next?.extra_upload_purchase_available && next.extra_upload_coin_cost > 0 && next.coin_balance >= next.extra_upload_coin_cost) {
        await buyCreatorExtraUploadCredit()
        invalidateBalances()
        await refresh()
        Toast.show({
          type: 'kidReward',
          text1: ar ? 'فيديو إضافي جاهز! 🎬' : 'Extra video unlocked! 🎬',
          text2: ar
            ? `استخدمنا ${next.extra_upload_coin_cost} كوين وفتحنا محاولة رفع جديدة.`
            : `Used ${next.extra_upload_coin_cost} coins to unlock one extra upload.`,
          props: { icon: '🎬', accent: 'gold' },
        })
        onUnlocked()
        return
      }
      Toast.show({
        type: 'coinReward',
        text1: ar ? `كسبت +${earned} كوين!` : `You won +${earned} coins!`,
        text2: ar ? 'قرّبت من فتح الفيديو الإضافي.' : 'You are closer to unlocking the extra video.',
        props: { icon: '🪙', accent: 'gold', coins: earned },
      })
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message === 'AD_DISMISSED') return
      Toast.show({
        type: 'info',
        text1: ar ? 'الإعلان مش جاهز دلوقتي' : 'Ad is not ready yet',
        text2: ar ? 'الزر هيفضل موجود — جرّب كمان شوية.' : 'The button will stay here — try again shortly.',
      })
    }
  }

  const balance = options?.coin_balance ?? 0
  const cost = options?.extra_upload_coin_cost ?? 0
  const canBuy = !!options?.extra_upload_purchase_available && balance >= cost && cost > 0
  const needsCoins = !!options?.extra_upload_purchase_available && balance < cost

  return (
    <LinearGradient colors={['#180B3D', '#44216E', '#083C65']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, padding: spacing.lg }}>
        <Pressable
          onPress={onCancel}
          hitSlop={10}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 32, padding: spacing.xl, alignItems: 'center', borderWidth: 2, borderColor: '#FDE68A' }}>
            <LinearGradient
              colors={['#F96286', '#A855F7', '#03BBE5']}
              style={{ width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginTop: -62, borderWidth: 5, borderColor: '#FFF' }}
            >
              <Ionicons name="videocam" size={42} color="#FFF" />
            </LinearGradient>

            <Text style={{ color: '#1F1637', fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center', marginTop: spacing.md }}>
              {ar ? 'وصلت لحد الفيديوهات الشهري' : 'Monthly video limit reached'}
            </Text>
            <Text style={{ color: '#6B6480', fontSize: fontSize.sm, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm }}>
              {ar
                ? 'مش لازم تستنى بداية الشهر! افتح فيديو إضافي بالكوينز.'
                : "You don't have to wait for the next cycle. Unlock one extra video with coins."}
            </Text>

            {loading ? (
              <ActivityIndicator color="#A855F7" size="large" style={{ marginVertical: spacing.xl }} />
            ) : (
              <>
                <View style={{ width: '100%', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                  <InfoCard
                    icon={<KidCoinIcon size={25} />}
                    label={ar ? 'رصيدك' : 'Your balance'}
                    value={String(balance)}
                  />
                  <InfoCard
                    icon={<Ionicons name="film" size={25} color="#7C3AED" />}
                    label={ar ? 'فيديو جديد' : 'New video'}
                    value={cost > 0 ? `${cost}` : '—'}
                  />
                </View>

                {canBuy && (
                  <Pressable onPress={handleBuy} disabled={buying} style={({ pressed }) => ({ width: '100%', marginTop: spacing.lg, opacity: pressed || buying ? 0.75 : 1 })}>
                    <LinearGradient colors={['#F96286', '#A855F7', '#03BBE5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                      {buying ? <ActivityIndicator color="#FFF" /> : <Ionicons name="lock-open" size={20} color="#FFF" />}
                      <Text style={{ color: '#FFF', fontSize: fontSize.base, fontWeight: '900' }}>
                        {ar ? `افتح فيديو جديد بـ ${cost} كوين` : `Unlock one video for ${cost} coins`}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                )}

                {needsCoins && (
                  <>
                    <Text style={{ color: '#9A3412', fontSize: fontSize.sm, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg }}>
                      {ar ? `ناقصك ${Math.max(0, cost - balance)} كوين` : `You need ${Math.max(0, cost - balance)} more coins`}
                    </Text>
                    <Pressable
                      onPress={handleRewardedAd}
                      disabled={rewardedAd.loading}
                      style={({ pressed }) => ({ width: '100%', marginTop: spacing.sm, borderRadius: radius.pill, paddingVertical: 14, backgroundColor: '#FFF7D6', borderWidth: 2, borderColor: '#FBBF24', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed || rewardedAd.loading ? 0.75 : 1 })}
                    >
                      <Ionicons name="play-circle" size={22} color="#D97706" />
                      <Text style={{ color: '#92400E', fontSize: fontSize.sm, fontWeight: '900', textAlign: 'center', flexShrink: 1 }}>
                        {rewardedAd.loading
                          ? (ar ? 'جاري تجهيز الإعلان...' : 'Preparing ad...')
                          : (ar ? 'شاهد إعلانًا للحصول على عملات أكثر' : 'Watch an ad to get more coins')}
                      </Text>
                    </Pressable>
                    <Text style={{ color: '#8A819C', fontSize: 11, textAlign: 'center', marginTop: 7 }}>
                      {ar ? `كل إعلان يمنحك ${options?.coins_per_ad || 5} كوين حسب إعدادات الأدمن.` : `Each ad gives ${options?.coins_per_ad || 5} coins, set by the admin.`}
                    </Text>
                  </>
                )}

                {!options?.extra_upload_purchase_available && (
                  <View style={{ marginTop: spacing.lg, borderRadius: radius.lg, padding: spacing.md, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FDBA74' }}>
                    <Text style={{ color: '#9A3412', fontSize: fontSize.sm, fontWeight: '800', textAlign: 'center' }}>
                      {ar ? 'ميزة الفيديو الإضافي لسه بتتجهز. جرّب بعد التحديث.' : 'Extra-video unlock is still being enabled. Please try after the update.'}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  )
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View style={{ flex: 1, minHeight: 94, borderRadius: radius.xl, backgroundColor: '#F8F5FF', borderWidth: 1, borderColor: '#E9D5FF', alignItems: 'center', justifyContent: 'center', padding: spacing.sm }}>
      {icon}
      <Text style={{ color: '#7A718E', fontSize: 11, fontWeight: '800', marginTop: 5, textAlign: 'center' }}>{label}</Text>
      <Text style={{ color: '#2E1A54', fontSize: fontSize.lg, fontWeight: '900', marginTop: 2 }}>{value}</Text>
    </View>
  )
}
