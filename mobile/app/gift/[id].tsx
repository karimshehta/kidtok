import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, fontSize, radius, spacing } from '@/lib/theme'

const QUICK_AMOUNTS = [1, 5, 10, 25, 50]

export default function GiftCoinsScreen() {
  const router = useRouter()
  const qc = useQueryClient()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const myId = useAuth((s) => s.user?.id)
  const { id, videoId } = useLocalSearchParams<{ id: string; videoId?: string }>()

  const [amountText, setAmountText] = useState('5')
  const [sending, setSending] = useState(false)

  const amount = useMemo(() => {
    const parsed = Number(String(amountText).replace(/[^\d]/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }, [amountText])

  const { data: recipient, isLoading: loadingRecipient } = useQuery({
    queryKey: ['gift-recipient', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; name: string | null; username: string | null; avatar_url: string | null } | null
    },
  })

  const { data: coinBalance = 0, isLoading: loadingCoins } = useQuery({
    queryKey: ['coins', myId],
    enabled: !!myId,
    staleTime: 15_000,
    queryFn: async (): Promise<number> => {
      const { data } = await supabase.rpc('my_coin_balance')
      return (data as number) ?? 0
    },
  })

  const displayName = recipient?.username
    ? `@${recipient.username}`
    : (recipient?.name || (ar ? 'صديق كيدتوك' : 'KidTok friend'))

  const canSend = !!id && id !== myId && amount > 0 && amount <= coinBalance && !sending

  const errorHint = useMemo(() => {
    if (id === myId) return ar ? 'لا يمكن إرسال هدية لنفسك.' : "You can't gift yourself."
    if (amount <= 0) return ar ? 'اختار عدد كوينز صحيح.' : 'Choose a valid amount.'
    if (amount > coinBalance) return ar ? 'رصيدك الحالي لا يكفي لهذه الهدية.' : 'Your coin balance is not enough for this gift.'
    return ''
  }, [amount, ar, coinBalance, id, myId])

  const sendGift = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const { data, error } = await supabase.rpc('send_coin_gift', {
        p_recipient_id: id,
        p_amount: amount,
        p_video_id: videoId || null,
      })
      if (error) throw error

      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'coins' })
      qc.invalidateQueries({ queryKey: ['notifications', id] })
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'الهدية وصلت 🎁' : 'Gift sent 🎁',
        text2: ar
          ? `بعت ${amount} كوين إلى ${displayName}`
          : `You sent ${amount} coins to ${displayName}`,
        props: { icon: '🎁', accent: 'purple' },
      })

      setTimeout(() => router.back(), 750)
      return data
    } catch (err: any) {
      const raw = String(err?.message || err)
      const friendly = raw.includes('INSUFFICIENT_COINS')
        ? (ar ? 'رصيدك لا يكفي.' : 'Not enough coins.')
        : raw.includes('SELF_GIFT_NOT_ALLOWED')
          ? (ar ? 'لا يمكن إرسال هدية لنفسك.' : "You can't gift yourself.")
          : raw.includes('RECIPIENT_NOT_FOUND')
            ? (ar ? 'لم نجد هذا المستخدم.' : 'Recipient was not found.')
            : raw.includes('send_coin_gift') || raw.includes('Could not find the function')
              ? (ar ? 'الميزة جاهزة في التطبيق، لكن تحتاج تحديث قاعدة البيانات أولًا.' : 'The app is ready, but the database function still needs to be deployed.')
              : (ar ? 'حاول مرة ثانية بعد لحظات.' : 'Please try again in a moment.')
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'فشل إرسال الهدية' : 'Gift failed',
        text2: friendly,
        props: { icon: '🎁', accent: 'purple' },
      })
    } finally {
      setSending(false)
    }
  }

  if (loadingRecipient || loadingCoins) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.secondary} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#FFF7ED' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <LinearGradient colors={['#03BBE5', '#F96286', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <Pressable onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', color: '#FFFFFF', fontSize: fontSize.lg, fontWeight: '900' }}>
              {ar ? 'إهداء كوينز' : 'Gift Coins'}
            </Text>
            <View style={{ width: 42 }} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl, justifyContent: 'center' }}
          >
            <View style={{ backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 30, padding: spacing.lg, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, elevation: 14 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 118, height: 118, borderRadius: 59, backgroundColor: '#FFE4F0', borderWidth: 5, borderColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: -58, shadowColor: colors.secondary, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8 }}>
                  {recipient?.avatar_url ? (
                    <Image source={{ uri: recipient.avatar_url }} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <Ionicons name="person" size={58} color={colors.secondary} />
                  )}
                </View>

                <View style={{ marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="gift" size={24} color={colors.secondary} />
                  <Text style={{ color: colors.grey900, fontSize: fontSize.xl, fontWeight: '900' }} numberOfLines={1}>
                    {displayName}
                  </Text>
                </View>
                <Text style={{ color: colors.grey600, textAlign: 'center', marginTop: 6, fontSize: fontSize.sm }}>
                  {ar ? 'اختار عدد الكوينز اللي تحب تبعته كهدية.' : 'Choose how many coins you want to send as a gift.'}
                </Text>
              </View>

              <View style={{ marginTop: spacing.lg, backgroundColor: '#FFF7D6', borderWidth: 1, borderColor: '#FCD34D', borderRadius: radius.xl, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: '#78350F', fontWeight: '800' }}>{ar ? 'رصيدك الحالي' : 'Your balance'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 20 }}>🪙</Text>
                  <Text style={{ color: '#78350F', fontSize: fontSize.lg, fontWeight: '900' }}>{coinBalance.toLocaleString()}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg }}>
                {QUICK_AMOUNTS.map((value) => {
                  const selected = amount === value
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setAmountText(String(value))}
                      style={({ pressed }) => ({
                        minWidth: 74,
                        paddingVertical: spacing.sm + 2,
                        borderRadius: radius.pill,
                        alignItems: 'center',
                        backgroundColor: selected ? colors.secondary : '#F3F4F6',
                        borderWidth: 2,
                        borderColor: selected ? colors.secondary : '#E5E7EB',
                        transform: [{ scale: pressed ? 0.96 : 1 }],
                      })}
                    >
                      <Text style={{ color: selected ? '#FFFFFF' : colors.grey700, fontWeight: '900' }}>{value} 🪙</Text>
                    </Pressable>
                  )
                })}
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <Text style={{ color: colors.grey700, fontSize: fontSize.sm, fontWeight: '800', marginBottom: 8 }}>
                  {ar ? 'أو اكتب رقم تاني' : 'Or enter a custom amount'}
                </Text>
                <TextInput
                  value={amountText}
                  onChangeText={(text) => setAmountText(text.replace(/[^\d]/g, '').slice(0, 5))}
                  keyboardType="number-pad"
                  placeholder="5"
                  placeholderTextColor={colors.grey400}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 2,
                    borderColor: amount > coinBalance ? '#FCA5A5' : '#E5E7EB',
                    borderRadius: radius.xl,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 14,
                    fontSize: fontSize.xl,
                    fontWeight: '900',
                    color: colors.grey900,
                    textAlign: 'center',
                  }}
                />
                {!!errorHint && (
                  <Text style={{ color: amount > coinBalance || id === myId ? '#DC2626' : colors.grey500, marginTop: 8, fontSize: fontSize.xs, fontWeight: '700', textAlign: 'center' }}>
                    {errorHint}
                  </Text>
                )}
              </View>

              <Pressable
                onPress={sendGift}
                disabled={!canSend}
                style={({ pressed }) => ({
                  marginTop: spacing.lg,
                  borderRadius: radius.pill,
                  overflow: 'hidden',
                  opacity: !canSend ? 0.55 : pressed ? 0.9 : 1,
                })}
              >
                <LinearGradient
                  colors={['#F96286', '#A855F7', '#03BBE5']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ paddingVertical: spacing.md + 4, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}
                >
                  {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="gift" size={22} color="#FFFFFF" />}
                  <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: fontSize.base }}>
                    {sending
                      ? (ar ? 'جاري الإرسال...' : 'Sending...')
                      : (ar ? `ابعت ${amount || 0} كوين` : `Send ${amount || 0} coins`)}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}
