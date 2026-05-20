import BannerAd from '@/components/BannerAd'
import { useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from 'react-native'
import KeyboardScreen from '@/components/KeyboardScreen'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Plan {
  id: number
  code: string
  name_ar: string
  name_en: string
  description_ar: string | null
  description_en: string | null
  price: number
  old_price: number | null
  currency: string | null
  duration_days: number
  plan_type: 'free' | 'paid'
  max_children: number | null
  max_playlists: number | null
  max_videos_per_playlist: number | null
  has_insights: boolean
  has_ads: boolean
  has_games: boolean
  has_free_courses: boolean
  daily_time_minutes: number | null
}

export default function SubscriptionScreen() {
  const router = useRouter()
  const qc = useQueryClient()

  const [methodModal, setMethodModal] = useState<Plan | null>(null)
  const [walletModal, setWalletModal] = useState<Plan | null>(null)
  const [walletPhone, setWalletPhone] = useState('')
  const [paying, setPaying] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async (): Promise<Plan[]> => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      return (data || []) as Plan[]
    },
  })

  const { data: coinBalance = 0 } = useQuery({
    queryKey: ['coins'],
    queryFn: async (): Promise<number> => {
      const { data } = await supabase.rpc('my_coin_balance')
      return (data as number) ?? 0
    },
  })

  const startPayment = async (plan: Plan, method: 'card' | 'wallet' | 'apple_pay') => {
    setPaying(true)
    try {
      // Normalize Egyptian mobile number to E.164 (+2001XXXXXXXX)
      const normalizePhone = (p: string): string => {
        const digits = p.replace(/\D/g, '')  // strip non-digits
        if (digits.startsWith('2')) return `+${digits}`          // 201XXXXXXXX → +201XXXXXXXX
        if (digits.startsWith('01')) return `+20${digits}`       // 01XXXXXXXX  → +2001XXXXXXXX
        if (digits.startsWith('1')) return `+201${digits.slice(1)}` // 1XXXXXXXX → +2001XXXXXXXX
        return `+20${digits}`
      }
      const phone = method === 'wallet' ? normalizePhone(walletPhone) : undefined

      const { data, error } = await supabase.functions.invoke('subscription-create', {
        body: { plan_id: plan.id, payment_method: method, wallet_phone: phone },
      })
      if (error) {
        let msg = error.message
        try {
          const body = await (error as any).context?.json?.()
          msg = body?.error?.message || msg
        } catch {}
        throw new Error(msg)
      }

      // ✅ Extract URL based on payment method:
      // card/apple_pay → data.payment_url (iframe URL)
      // wallet         → data.wallet_response.redirect_url (OTP page)
      const url =
        data?.payment_url ||
        data?.wallet_response?.redirect_url ||
        data?.redirect_url

      if (url) {
        setPaymentUrl(url)
        setMethodModal(null)
        setWalletModal(null)
        if (method === 'wallet') {
          Toast.show({
            type: 'info',
            text1: 'سيصلك رسالة OTP',
            text2: 'أدخل الرمز في الصفحة التالية',
          })
        }
      } else {
        Toast.show({ type: 'success', text1: 'تم إرسال طلب الدفع' })
        setMethodModal(null)
        setWalletModal(null)
        await qc.invalidateQueries({ queryKey: ['my-subscription'] })
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'فشل الدفع', text2: (err as Error).message })
    } finally {
      setPaying(false)
    }
  }

  const redeemWithCoins = async (plan: Plan) => {
    setPaying(true)
    try {
      const { error } = await supabase.rpc('my_redeem_subscription_with_coins', { p_plan_id: plan.id })
      if (error) {
        if (error.message.includes('INSUFFICIENT_COINS')) {
          Toast.show({ type: 'error', text1: 'رصيدك من العملات غير كافٍ' })
        } else {
          throw error
        }
        return
      }
      await qc.invalidateQueries({ queryKey: ['my-subscription'] })
      await qc.invalidateQueries({ queryKey: ['coins'] })
      Toast.show({ type: 'success', text1: 'تم تفعيل الاشتراك! 🎉' })
      router.back()
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setPaying(false)
    }
  }

  return (
    <KeyboardScreen variant="simple" style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          الاشتراكات
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 100 }}>
        {/* Coin balance card */}
        <View
          style={{
            backgroundColor: '#FEF3C7',
            borderRadius: radius.lg,
            padding: spacing.md,
            marginBottom: spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            borderWidth: 1, borderColor: '#FCD34D',
          }}
        >
          <Text style={{ fontSize: 24 }}>🪙</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.xs, color: '#92400E' }}>رصيدك</Text>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: '#78350F' }}>
              {coinBalance} عملة
            </Text>
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={{ gap: spacing.md }}>
            {plans.map((plan, idx) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                idx={idx}
                coinBalance={coinBalance}
                onSubscribe={() => setMethodModal(plan)}
                onRedeem={() => redeemWithCoins(plan)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Payment method modal */}
      <Modal visible={!!methodModal} animationType="slide" transparent onRequestClose={() => setMethodModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '800' }}>اختر طريقة الدفع</Text>
              <Pressable onPress={() => setMethodModal(null)}>
                <Ionicons name="close" size={28} color={colors.grey600} />
              </Pressable>
            </View>

            <MethodOption
              icon="card"
              label="بطاقة بنكية"
              onPress={() => methodModal && startPayment(methodModal, 'card')}
              disabled={paying}
            />
            <MethodOption
              icon="phone-portrait"
              label="محفظة موبايل"
              onPress={() => {
                const plan = methodModal
                setMethodModal(null)
                setTimeout(() => setWalletModal(plan), 200)
              }}
              disabled={paying}
            />
          </View>
        </View>
      </Modal>

      {/* Wallet phone modal */}
      <Modal visible={!!walletModal} animationType="slide" transparent onRequestClose={() => setWalletModal(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '800' }}>رقم المحفظة</Text>
              <Pressable onPress={() => setWalletModal(null)}>
                <Ionicons name="close" size={28} color={colors.grey600} />
              </Pressable>
            </View>

            <TextInput
              value={walletPhone}
              onChangeText={setWalletPhone}
              placeholder="01XXXXXXXXX"
              placeholderTextColor={colors.grey400}
              keyboardType="phone-pad"
              style={{
                backgroundColor: colors.grey50,
                borderRadius: radius.lg,
                padding: spacing.md,
                fontSize: fontSize.base,
                borderWidth: 1,
                borderColor: colors.grey100,
                marginBottom: spacing.md,
              }}
            />

            <Pressable
              onPress={() => walletModal && walletPhone && startPayment(walletModal, 'wallet')}
              disabled={paying || !walletPhone}
              style={{
                backgroundColor: !walletPhone ? colors.grey200 : colors.primary,
                paddingVertical: spacing.md + 2,
                borderRadius: radius.pill,
                alignItems: 'center',
                marginBottom: spacing.lg,
              }}
            >
              {paying ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={{ color: colors.white, fontWeight: '800' }}>متابعة</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Payment WebView modal */}
      <Modal visible={!!paymentUrl} animationType="slide" onRequestClose={() => setPaymentUrl(null)}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
            <Pressable onPress={() => setPaymentUrl(null)}>
              <Ionicons name="close" size={28} color={colors.grey900} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontWeight: '800', fontSize: fontSize.base }}>
              الدفع الآمن
            </Text>
            <View style={{ width: 28 }} />
          </View>
          {paymentUrl && <PaymentWebView url={paymentUrl} onClose={() => {
            setPaymentUrl(null)
            qc.invalidateQueries({ queryKey: ['my-subscription'] })
          }} />}
        </KeyboardScreen>
      </Modal>
          <BannerAd variant="sticky" />
      </SafeAreaView>
  )
}

function PlanCard({ plan, idx, coinBalance, onSubscribe, onRedeem }: {
  plan: Plan; idx: number; coinBalance: number; onSubscribe: () => void; onRedeem: () => void
}) {
  const isFree = plan.plan_type === 'free'
  const gradients = [
    ['#7C3AED', '#EC4899'] as const,
    ['#03BBE5', '#0891b2'] as const,
    ['#F59E0B', '#DC2626'] as const,
  ]
  const gradient = gradients[idx % gradients.length]
  const isMonthly = plan.duration_days <= 31
  const coinsNeeded = isMonthly ? 100 : 200
  const canRedeem = coinBalance >= coinsNeeded
  const features = getPlanFeatures(plan)

  return (
    <LinearGradient colors={gradient} style={{ borderRadius: radius.xl, padding: spacing.lg }}>
      <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '900' }}>
        {plan.name_ar}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, marginTop: 4 }}>
        {plan.description_ar}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.md, gap: 4 }}>
        <Text style={{ color: colors.white, fontSize: fontSize['3xl'], fontWeight: '900' }}>
          {plan.price === 0 ? 'مجاناً' : plan.price.toFixed(2)}
        </Text>
        {plan.price > 0 && (
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm }}>
            ج.م / {isMonthly ? 'شهر' : 'سنة'}
          </Text>
        )}
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {features.map((feature) => (
          <View key={feature} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={16} color={colors.white} />
            </View>
            <Text style={{ flex: 1, color: colors.white, fontSize: fontSize.sm, fontWeight: '700' }}>
              {feature}
            </Text>
          </View>
        ))}
      </View>

      {!isFree && (
        <>
          <Pressable
            onPress={onSubscribe}
            style={({ pressed }) => ({
              backgroundColor: colors.white,
              paddingVertical: spacing.sm + 4,
              borderRadius: radius.pill,
              alignItems: 'center',
              marginTop: spacing.md,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: gradient[0], fontWeight: '800' }}>اشترك الآن</Text>
          </Pressable>

          <Pressable
            onPress={onRedeem}
            disabled={!canRedeem}
            style={{
              marginTop: spacing.sm,
              paddingVertical: spacing.sm + 2,
              borderRadius: radius.pill,
              alignItems: 'center',
              flexDirection: 'row', justifyContent: 'center', gap: 6,
              backgroundColor: canRedeem ? 'rgba(251, 191, 36, 0.3)' : 'rgba(255,255,255,0.1)',
              borderWidth: 1, borderColor: canRedeem ? '#FCD34D' : 'rgba(255,255,255,0.2)',
            }}
          >
            <Text style={{ fontSize: 14 }}>🪙</Text>
            <Text style={{ color: canRedeem ? '#FBBF24' : 'rgba(255,255,255,0.4)', fontSize: fontSize.xs, fontWeight: '700' }}>
              {canRedeem ? `استخدم ${coinsNeeded} عملة (مجاناً)` : `تحتاج ${coinsNeeded} (لديك ${coinBalance})`}
            </Text>
          </Pressable>
        </>
      )}
    </LinearGradient>
  )
}

function getPlanFeatures(plan: Plan): string[] {
  const features: string[] = []
  if (!plan.has_ads) features.push('بدون إعلانات')
  if (plan.max_children) features.push(`${plan.max_children} طفل`)
  if (plan.max_playlists) features.push(`${plan.max_playlists} قائمة تشغيل`)
  if (plan.max_videos_per_playlist) features.push(`${plan.max_videos_per_playlist} فيديو لكل قائمة`)
  if (plan.has_insights) features.push('تقارير ومتابعة المشاهدة')
  if (plan.has_games) features.push('ألعاب تعليمية')
  if (plan.has_free_courses) features.push('كورسات مجانية')
  if (plan.daily_time_minutes) features.push(`${plan.daily_time_minutes} دقيقة يوميا`)
  if (features.length === 0) features.push('مزايا KidTok الأساسية')
  return features
}

function MethodOption({ icon, label, onPress, disabled }: { icon: any; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        backgroundColor: colors.grey50,
        borderRadius: radius.lg,
        borderWidth: 1, borderColor: colors.grey100,
        gap: spacing.md,
        marginBottom: spacing.sm,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={colors.grey400} />
    </Pressable>
  )
}

// Lazy-loaded WebView component (only imports when needed)
function PaymentWebView({ url, onClose }: { url: string; onClose: () => void }) {
  const qc = useQueryClient()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WebView } = require('react-native-webview')
  return (
    <WebView
      source={{ uri: url }}
      style={{ flex: 1 }}
      onNavigationStateChange={(state: any) => {
        const u: string = state.url || ''
        // Paymob callback comes back to our Edge Function URL
        const isSuccess =
          u.includes('success=true') ||
          u.includes('subscription-success') ||
          (u.includes('subscription-paymob-callback') && u.includes('success=true')) ||
          (u.includes('paymob') && u.includes('success=true'))
        const isFail =
          u.includes('success=false') ||
          u.includes('error=true')
        if (isSuccess) {
          setTimeout(() => {
            onClose()
            Toast.show({ type: 'success', text1: 'تم تفعيل الاشتراك! 🎉' })
          }, 1200)
        } else if (isFail) {
          setTimeout(() => {
            onClose()
            Toast.show({ type: 'error', text1: 'فشل الدفع', text2: 'يرجى المحاولة مجدداً' })
          }, 500)
        }
      }}
    />
  )
}
