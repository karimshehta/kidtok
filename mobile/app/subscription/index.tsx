import BannerAd from '@/components/BannerAd'
import KidCoinIcon from '@/components/KidCoinIcon'
import RewardedAdPrompt from '@/components/RewardedAdPrompt'
import KeyboardScreen from '@/components/KeyboardScreen'
import { colors, fontSize, radius, spacing } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

export default function SubscriptionScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const userId = useAuth((s) => s.user?.id)
  const [showRewardAd, setShowRewardAd] = useState(false)

  const { data: coinBalance = 0 } = useQuery<number>({
    queryKey: ['coins', userId],
    enabled: !!userId,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_coin_balance')
      if (error) return 0
      return Number(data || 0)
    },
  })

  return (
    <KeyboardScreen variant="simple" style={{ flex: 1, backgroundColor: '#F8FCFF' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: pressed ? colors.grey100 : colors.white,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.grey100,
            })}
          >
            <Ionicons name={ar ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.grey900} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900, textAlign: ar ? 'right' : 'left' }}>
            {ar ? 'عملات ومكافآت KidTok' : 'KidTok Coins & Rewards'}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'center' }}>
          <LinearGradient
            colors={['#FFFFFF', '#ECFEFF', '#FFF1F7']}
            style={{
              borderRadius: 34,
              padding: spacing.xl,
              borderWidth: 1,
              borderColor: '#DFF7FF',
              shadowColor: '#0EA5E9',
              shadowOpacity: 0.16,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 10 },
              elevation: 8,
            }}
          >
            <View style={{ alignItems: 'center' }}>
              <LinearGradient
                colors={['#FFD54F', '#F59E0B']}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 5,
                  borderColor: '#FFFFFF',
                }}
              >
                <KidCoinIcon size={58} />
              </LinearGradient>

              <Text style={{ marginTop: spacing.md, fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900, textAlign: 'center' }}>
                {coinBalance.toLocaleString()} {ar ? 'كوين' : 'coins'}
              </Text>

              <Text style={{ marginTop: 8, fontSize: fontSize.base, fontWeight: '800', color: colors.grey700, textAlign: 'center', lineHeight: 24 }}>
                {ar
                  ? 'اجمع الكوينز من إعلانات المكافأة واستخدمها للهدايا والفريمات والعناصر الممتعة داخل KidTok.'
                  : 'Earn coins from rewarded ads and spend them on gifts, frames, and fun items inside KidTok.'}
              </Text>

              <View style={{ width: '100%', marginTop: spacing.lg, gap: spacing.sm }}>
                <Pressable
                  onPress={() => setShowRewardAd(true)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
                >
                  <LinearGradient
                    colors={['#F96286', '#A855F7', '#0EA5E9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{ height: 54, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: ar ? 'row-reverse' : 'row', gap: 8 }}
                  >
                    <Ionicons name="play-circle" size={22} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: fontSize.base, fontWeight: '900' }}>
                      {ar ? 'شاهد إعلان مكافأة' : 'Watch a rewarded ad'}
                    </Text>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  onPress={() => router.replace('/(tabs)/profile')}
                  style={({ pressed }) => ({
                    height: 50,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? '#E0F2FE' : '#ECFEFF',
                    borderWidth: 1,
                    borderColor: '#BAE6FD',
                  })}
                >
                  <Text style={{ color: '#0369A1', fontSize: fontSize.sm, fontWeight: '900' }}>
                    {ar ? 'اذهب إلى المتجر داخل البروفايل' : 'Open the profile shop'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>
        </View>

        <BannerAd variant="sticky" />
        <RewardedAdPrompt visible={showRewardAd} mode="nudge" onDismiss={() => setShowRewardAd(false)} />
      </SafeAreaView>
    </KeyboardScreen>
  )
}
