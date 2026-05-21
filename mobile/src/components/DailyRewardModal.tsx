/**
 * DailyRewardModal — "سجّل اليوم"
 * Shows in Feed on open (once per day)
 * Tries to play rewarded ad → grants 5 coins
 * Always claims coins, even if ad fails to load
 */
import { useState, useEffect, useRef } from 'react'
import { View, Text, Pressable, Modal, Animated, ActivityIndicator } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useRewardedAd } from '@/hooks/useRewardedAd'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function DailyRewardModal() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [visible, setVisible] = useState(false)
  const [step, setStep]       = useState<'idle' | 'showing-ad' | 'claiming' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const scaleAnim   = useRef(new Animated.Value(0.8)).current
  const opacityAnim = useRef(new Animated.Value(0)).current

  const rewardedAd = useRewardedAd()

  // Check if user hasn't claimed today
  useEffect(() => {
    if (!userId) return
    supabase.from('profiles').select('last_daily_reward').eq('id', userId).single()
      .then(({ data }) => {
        const today = new Date().toISOString().split('T')[0]
        if (data?.last_daily_reward !== today) {
          setTimeout(() => setVisible(true), 1500)
        }
      })
  }, [userId])

  // Animate in
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim,  { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  // ── Claim flow — explicit & robust ─────────────────────────────────────────
  const handleClaim = async () => {
    setErrorMsg('')

    // 1. Try rewarded ad first
    setStep('showing-ad')
    let watchedAd = false

    try {
      await rewardedAd.show(() => { watchedAd = true })
    } catch {
      // ad failed — proceed to claim anyway
    }

    // 2. Claim reward (regardless of whether ad played)
    setStep('claiming')
    try {
      const { data, error } = await supabase.rpc('claim_daily_reward')

      if (error) {
        setStep('error')
        setErrorMsg(error.message || 'فشل المحاولة')
        return
      }

      if (data?.success) {
        setStep('done')
        qc.invalidateQueries({ queryKey: ['coin-balance'] })
        setTimeout(() => setVisible(false), 2000)
        Toast.show({
          type: 'success',
          text1: ar ? '🎉 +5 عملات!' : '🎉 +5 Coins!',
          text2: ar ? 'شكراً على المشاهدة' : 'Thanks for watching',
        })
      } else if (data?.reason === 'ALREADY_CLAIMED') {
        setStep('error')
        setErrorMsg(ar ? 'حصلت على مكافأة اليوم بالفعل' : 'Already claimed today')
        setTimeout(() => setVisible(false), 2000)
      } else {
        setStep('error')
        setErrorMsg('فشلت العملية')
      }
    } catch (e: any) {
      setStep('error')
      setErrorMsg(e?.message || 'فشل غير متوقع')
    }
  }

  if (!visible) return null

  const isLoading = step === 'showing-ad' || step === 'claiming'
  const isDone    = step === 'done'
  const isError   = step === 'error'

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={() => !isLoading && setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <Animated.View
          style={{
            backgroundColor: colors.white,
            borderRadius: 28,
            padding: spacing.xl,
            width: '100%',
            maxWidth: 360,
            alignItems: 'center',
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          }}
        >
          {/* Close */}
          {!isLoading && (
            <Pressable onPress={() => setVisible(false)} style={{ position: 'absolute', top: 16, right: 16 }} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.grey400} />
            </Pressable>
          )}

          {/* Icon */}
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${colors.secondary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 40 }}>{isDone ? '✅' : '🎁'}</Text>
          </View>

          <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900, textAlign: 'center' }}>
            {isDone ? (ar ? 'تم! 🎉' : 'Done! 🎉') : (ar ? 'سجّل اليوم!' : 'Daily Reward!')}
          </Text>

          <Text style={{ fontSize: fontSize.sm, color: colors.grey500, textAlign: 'center', marginTop: 6, marginBottom: spacing.xl }}>
            {isDone
              ? (ar ? 'حصلت على 5 عملات' : 'You earned 5 coins')
              : (ar ? 'شاهد إعلاناً قصيراً واحصل على 5 عملات يومياً' : 'Watch a short ad and earn 5 coins daily')
            }
          </Text>

          {/* Reward badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, marginBottom: spacing.xl, borderWidth: 1.5, borderColor: '#FCD34D' }}>
            <Text style={{ fontSize: 28 }}>🪙</Text>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: '#78350F' }}>+5</Text>
            <Text style={{ fontSize: fontSize.base, color: '#92400E', fontWeight: '700' }}>
              {ar ? 'عملات' : 'Coins'}
            </Text>
          </View>

          {/* Error message */}
          {isError && errorMsg && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, width: '100%' }}>
              <Text style={{ color: '#991B1B', fontSize: fontSize.sm, textAlign: 'center', fontWeight: '600' }}>
                {errorMsg}
              </Text>
            </View>
          )}

          {/* CTA */}
          {!isDone && !isError && (
            <Pressable
              onPress={handleClaim}
              disabled={isLoading}
              style={({ pressed }) => ({
                width: '100%', paddingVertical: spacing.md + 4, borderRadius: radius.pill,
                backgroundColor: pressed ? '#d4547a' : colors.secondary,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                elevation: 6, shadowColor: colors.secondary, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4, shadowRadius: 8,
                opacity: isLoading ? 0.8 : 1,
              })}
            >
              {isLoading
                ? <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ fontWeight: '900', color: '#fff', fontSize: fontSize.base }}>
                      {step === 'showing-ad'
                        ? (ar ? 'جاري عرض الإعلان...' : 'Loading ad...')
                        : (ar ? 'جاري الحصول على المكافأة...' : 'Claiming...')}
                    </Text>
                  </>
                : <>
                    <Ionicons name="play-circle" size={22} color="#fff" />
                    <Text style={{ fontWeight: '900', color: '#fff', fontSize: fontSize.base }}>
                      {ar ? 'شاهد واحصل على العملات' : 'Watch & Earn Coins'}
                    </Text>
                  </>
              }
            </Pressable>
          )}

          {!isLoading && (
            <Pressable onPress={() => setVisible(false)} style={{ marginTop: spacing.md, paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.grey400, fontSize: fontSize.sm }}>
                {isError ? (ar ? 'إغلاق' : 'Close') : (ar ? 'لاحقاً' : 'Later')}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}
