import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { colors, fontSize, radius, spacing } from '@/lib/theme'

export default function AvatarPickerDisabledScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'

  return (
    <LinearGradient colors={['#03BBE5', '#7C3AED', '#F96286']} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1, padding: spacing.lg, justifyContent: 'center' }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 34, padding: spacing.xl, alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: '#E0F7FF', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={46} color={colors.primary} />
          </View>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: '#111827', textAlign: 'center' }}>
            {ar ? 'عدسات كيدتوك الجديدة قيد التجهيز' : 'New KidTok lenses are coming'}
          </Text>
          <Text style={{ fontSize: fontSize.base, color: '#475569', textAlign: 'center', lineHeight: 24 }}>
            {ar
              ? 'أوقفنا تجربة الماسكات القديمة مؤقتًا، وهنرجعها بجودة Snap Camera Kit بدل التجربة الحالية.'
              : 'The old mask experiment is paused. We are replacing it with Snap Camera Kit quality.'}
          </Text>
          <Pressable
            onPress={() => router.replace('/creator/record')}
            style={{ marginTop: spacing.sm, width: '100%', borderRadius: radius.pill, overflow: 'hidden' }}
          >
            <LinearGradient colors={[colors.primary, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
              <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '900' }}>
                {ar ? 'سجّل فيديو عادي الآن' : 'Record a normal video now'}
              </Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => router.back()} style={{ paddingVertical: spacing.sm }}>
            <Text style={{ color: '#64748B', fontWeight: '800' }}>
              {ar ? 'رجوع' : 'Back'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  )
}
