import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { usePinSetup } from '@/hooks/usePinAuth'
import PinPad from '@/components/PinPad'
import { colors, spacing, fontSize } from '@/lib/theme'

export default function SetPinScreen() {
  const router = useRouter()
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>()
  const { savePin, saving, error, success, setError } = usePinSetup()
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin] = useState('')

  const handleFirst = (pin: string) => {
    setFirstPin(pin)
    setStep('confirm')
  }

  const handleConfirm = async (pin: string) => {
    if (pin !== firstPin) {
      setError('الـ PIN غير متطابق، حاول مرة أخرى')
      setStep('enter')
      setFirstPin('')
      return
    }
    const ok = await savePin(pin)
    if (ok) {
      Toast.show({ type: 'success', text1: '✅ تم تعيين الـ PIN بنجاح' })
      if (returnTo) {
        router.replace(returnTo as any)
      } else {
        router.back()
      }
    }
    // if !ok: error state is set by savePin → PinPad shows error
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          {step === 'enter' ? 'تعيين رمز الدخول' : 'تأكيد الرمز'}
        </Text>
      </View>

      <PinPad
        key={step}
        title={step === 'enter' ? 'أدخل رمز PIN جديد' : 'أدخل الرمز مرة أخرى للتأكيد'}
        subtitle={step === 'enter'
          ? 'سيُستخدم هذا الرمز للخروج من وضع الطفل'
          : 'تأكد من الرمز الذي أدخلته'}
        onComplete={step === 'enter' ? handleFirst : handleConfirm}
        error={error}
        loading={saving}
      />
    </SafeAreaView>
  )
}
