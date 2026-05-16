import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Subscription {
  id: string
  status: string
  started_at: string
  expires_at: string
  paid_amount: number | null
  paid_currency: string | null
  payment_provider: string | null
  subscription_plans: {
    name_ar: string
    name_en: string
    price: number
    duration_days: number
  } | null
}

export default function SubscriptionManageScreen() {
  const router = useRouter()
  const qc = useQueryClient()

  const { data: mySub, isLoading } = useQuery({
    queryKey: ['my-subscription-detail'],
    queryFn: async (): Promise<Subscription | null> => {
      const { data: rows } = await supabase
        .from('subscriptions')
        .select('id, status, started_at, expires_at, paid_amount, paid_currency, payment_provider, subscription_plans(name_ar, name_en, price, duration_days)')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false })
        .limit(1)
      return (rows?.[0] as any) || null
    },
  })

  const { data: history = [] } = useQuery({
    queryKey: ['subscription-history'],
    queryFn: async (): Promise<Subscription[]> => {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, status, started_at, expires_at, paid_amount, paid_currency, payment_provider, subscription_plans(name_ar, name_en, price, duration_days)')
        .order('started_at', { ascending: false })
        .limit(10)
      return (data || []) as any
    },
  })

  const cancel = () => {
    if (!mySub) return
    Alert.alert(
      'إلغاء الاشتراك',
      'سيظل الاشتراك مفعلاً حتى تاريخ الانتهاء. هل تريد المتابعة؟',
      [
        { text: 'تراجع', style: 'cancel' },
        {
          text: 'إلغاء',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('subscriptions')
              .update({ status: 'cancelled' })
              .eq('id', mySub.id)
            if (error) {
              Toast.show({ type: 'error', text1: error.message })
            } else {
              await qc.invalidateQueries({ queryKey: ['my-subscription'] })
              await qc.invalidateQueries({ queryKey: ['my-subscription-detail'] })
              Toast.show({ type: 'success', text1: 'تم إلغاء الاشتراك' })
              router.back()
            }
          },
        },
      ]
    )
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    )
  }

  // No active subscription → redirect to plans
  if (!mySub) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color={colors.grey900} />
          </Pressable>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '900' }}>الاشتراك</Text>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <View
            style={{
              width: 96, height: 96, borderRadius: 48,
              backgroundColor: `${colors.primary}15`,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: spacing.md,
            }}
          >
            <Ionicons name="diamond-outline" size={48} color={colors.primary} />
          </View>
          <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.grey900 }}>
            لا يوجد اشتراك مفعّل
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: 4, textAlign: 'center' }}>
            اشترك الآن للحصول على ميزات إضافية
          </Text>
          <Pressable
            onPress={() => router.replace('/subscription')}
            style={{
              marginTop: spacing.lg,
              backgroundColor: colors.primary,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radius.pill,
            }}
          >
            <Text style={{ color: colors.white, fontWeight: '800' }}>اعرض الخطط</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(mySub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  )
  const totalDays = mySub.subscription_plans?.duration_days || 30
  const progress = Math.min(100, ((totalDays - daysLeft) / totalDays) * 100)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900' }}>الاشتراك الحالي</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {/* Active sub card */}
        <LinearGradient
          colors={[colors.primary, '#0891b2', colors.secondary]}
          style={{ borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '900' }}>
              {mySub.subscription_plans?.name_ar || 'مشترك'}
            </Text>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.25)',
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 4,
                borderRadius: radius.pill,
              }}
            >
              <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '800' }}>
                مفعّل
              </Text>
            </View>
          </View>

          {/* Days remaining */}
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, marginTop: spacing.lg }}>
            متبقي
          </Text>
          <Text style={{ color: colors.white, fontSize: fontSize['3xl'], fontWeight: '900' }}>
            {daysLeft} يوم
          </Text>

          {/* Progress bar */}
          <View
            style={{
              height: 8,
              backgroundColor: 'rgba(255,255,255,0.25)',
              borderRadius: 4,
              marginTop: spacing.sm,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${progress}%`,
                height: '100%',
                backgroundColor: colors.white,
              }}
            />
          </View>

          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.xs, marginTop: spacing.sm }}>
            ينتهي في {new Date(mySub.expires_at).toLocaleDateString('ar-EG')}
          </Text>
        </LinearGradient>

        {/* Details */}
        <View style={{ backgroundColor: colors.grey50, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg }}>
          <Detail label="بدأ في" value={new Date(mySub.started_at).toLocaleDateString('ar-EG')} />
          <Detail
            label="طريقة الدفع"
            value={
              mySub.payment_provider === 'coins' ? 'بالعملات 🪙'
                : mySub.payment_provider === 'paymob' ? 'بطاقة / محفظة'
                : mySub.payment_provider || '—'
            }
          />
          <Detail
            label="المبلغ المدفوع"
            value={
              mySub.paid_amount === 0 ? 'مجاناً'
                : `${mySub.paid_amount?.toFixed(2)} ${mySub.paid_currency || 'EGP'}`
            }
            last
          />
        </View>

        {/* History */}
        {history.length > 1 && (
          <>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.grey900, marginBottom: spacing.sm }}>
              السجل
            </Text>
            <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
              {history.slice(1).map((h) => (
                <View
                  key={h.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: spacing.sm + 4,
                    backgroundColor: colors.grey50,
                    borderRadius: radius.md,
                  }}
                >
                  <Ionicons
                    name={h.status === 'active' ? 'checkmark-circle' : 'time'}
                    size={20}
                    color={h.status === 'active' ? colors.green : colors.grey400}
                  />
                  <View style={{ flex: 1, marginStart: spacing.sm }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: '700' }}>
                      {h.subscription_plans?.name_ar}
                    </Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }}>
                      {new Date(h.started_at).toLocaleDateString('ar-EG')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }}>
                    {h.paid_amount === 0 ? 'مجاناً' : `${h.paid_amount?.toFixed(0)} EGP`}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Cancel button */}
        <Pressable
          onPress={cancel}
          style={{
            borderWidth: 1,
            borderColor: colors.red,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.red, fontWeight: '800' }}>إلغاء الاشتراك</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Detail({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.grey100,
      }}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900 }}>{value}</Text>
    </View>
  )
}
