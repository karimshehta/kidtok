/**
 * DailyRewardModal — "سجّل اليوم"
 * Shows on Feed open after sign-in (once per day)
 * Watch ad → Get 5 coins
 */
import { useState, useEffect } from 'react'
import { View, Text, Pressable, Modal, Animated } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function DailyRewardModal() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [visible, setVisible] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimed, setClaimed] = useState(false)
  const scaleAnim = useState(new Animated.Value(0.8))[0]
  const opacityAnim = useState(new Animated.Value(0))[0]

  useEffect(() => {
    if (!userId) return
    // Check if user has claimed today
    supabase.from('profiles').select('last_daily_reward').eq('id', userId).single()
      .then(({ data }) => {
        const today = new Date().toISOString().split('T')[0]
        if (data?.last_daily_reward !== today) {
          // Show after 1.5s delay
          setTimeout(() => setVisible(true), 1500)
        }
      })
  }, [userId])

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  const claim = async () => {
    setClaiming(true)
    try {
      // Try to show rewarded ad first (will silently skip if AdMob not in build)
      try {
        const AdMob = require('react-native-google-mobile-ads')
        // Rewarded ad logic here when build includes it
      } catch {}

      const { data } = await supabase.rpc('claim_daily_reward')
      if (data?.success) {
        setClaimed(true)
        qc.invalidateQueries({ queryKey: ['coin-balance'] })
        setTimeout(() => setVisible(false), 2000)
      }
    } catch {}
    setClaiming(false)
  }

  if (!visible) return null

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={() => setVisible(false)}>
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
          <Pressable onPress={() => setVisible(false)} style={{ position: 'absolute', top: 16, right: 16 }}>
            <Ionicons name="close" size={22} color={colors.grey400} />
          </Pressable>

          {/* Icon */}
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${colors.secondary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 40 }}>🎁</Text>
          </View>

          <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900, textAlign: 'center' }}>
            {ar ? 'سجّل اليوم!' : 'Daily Reward!'}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.grey500, textAlign: 'center', marginTop: 6, marginBottom: spacing.xl }}>
            {ar ? 'شاهد إعلاناً قصيراً واحصل على 5 عملات يومياً' : 'Watch a short ad and earn 5 coins daily'}
          </Text>

          {/* Reward display */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF3C7', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, marginBottom: spacing.xl, borderWidth: 1.5, borderColor: '#FCD34D' }}>
            <Text style={{ fontSize: 28 }}>🪙</Text>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: '#78350F' }}>+5</Text>
            <Text style={{ fontSize: fontSize.base, color: '#92400E', fontWeight: '700' }}>
              {ar ? 'عملات' : 'Coins'}
            </Text>
          </View>

          {claimed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#DCFCE7', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill }}>
              <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
              <Text style={{ fontWeight: '900', color: '#16a34a', fontSize: fontSize.base }}>
                {ar ? 'تم! +5 عملات 🎉' : 'Claimed! +5 Coins 🎉'}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={claim}
              disabled={claiming}
              style={({ pressed }) => ({
                width: '100%', paddingVertical: spacing.md + 4, borderRadius: radius.pill,
                backgroundColor: pressed ? '#d4547a' : colors.secondary,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                elevation: 6, shadowColor: colors.secondary, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4, shadowRadius: 8,
                opacity: claiming ? 0.8 : 1,
              })}
            >
              <Ionicons name="play-circle" size={22} color="#fff" />
              <Text style={{ fontWeight: '900', color: '#fff', fontSize: fontSize.base }}>
                {claiming ? (ar ? 'جاري...' : 'Loading...') : (ar ? 'شاهد واحصل على العملات' : 'Watch & Earn Coins')}
              </Text>
            </Pressable>
          )}

          <Pressable onPress={() => setVisible(false)} style={{ marginTop: spacing.md, paddingVertical: spacing.sm }}>
            <Text style={{ color: colors.grey400, fontSize: fontSize.sm }}>
              {ar ? 'لاحقاً' : 'Later'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}
