import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { usePinSetup } from '@/hooks/usePinAuth'
import PinPad from '@/components/PinPad'
import { colors, spacing, fontSize } from '@/lib/theme'

export default function SetPinScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>()
  const { savePin, saving, error, success, setError } = usePinSetup()
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin] = useState('')
  const qc = useQueryClient()

  const handleFirst = (pin: string) => {
    setFirstPin(pin)
    setStep('confirm')
  }

  const handleConfirm = async (pin: string) => {
    if (pin !== firstPin) {
      setError(ar ? 'الـ PIN غير متطابق، حاول مرة أخرى' : 'PIN does not match, try again')
      setStep('enter')
      setFirstPin('')
      return
    }
    const ok = await savePin(pin)
    if (ok) {
      // Bust the has-pin cache so the children screen + kid-mode entry
      // gate stop showing "Set PIN" after a successful save.
      qc.invalidateQueries({ queryKey: ['has-pin'] })
      Toast.show({ type: 'success', text1: ar ? '✅ تم تعيين الـ PIN بنجاح' : '✅ PIN set successfully' })
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
          {step === 'enter' ? (ar ? 'تعيين رمز الدخول' : 'Set PIN') : (ar ? 'تأكيد الرمز' : 'Confirm PIN')}
        </Text>
      </View>

      <PinPad
        key={step}
        title={step === 'enter' ? (ar ? 'أدخل رمز PIN جديد' : 'Enter a new PIN') : (ar ? 'أدخل الرمز مرة أخرى للتأكيد' : 'Re-enter the PIN to confirm')}
        subtitle={step === 'enter'
          ? (ar ? 'سيُستخدم هذا الرمز للخروج من وضع الطفل' : 'This PIN will be used to exit kid mode')
          : (ar ? 'تأكد من الرمز الذي أدخلته' : 'Confirm the PIN you entered')}
        onComplete={step === 'enter' ? handleFirst : handleConfirm}
        error={error}
        loading={saving}
      />
    </SafeAreaView>
  )
}
