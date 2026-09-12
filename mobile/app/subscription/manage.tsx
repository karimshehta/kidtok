import KeyboardScreen from '@/components/KeyboardScreen'
import { colors, fontSize, radius, spacing } from '@/lib/theme'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

export default function SubscriptionManageScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'

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
            {ar ? 'المكافآت' : 'Rewards'}
          </Text>
        </View>

        <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'center' }}>
          <LinearGradient
            colors={['#FFFFFF', '#ECFEFF', '#FFF1F7']}
            style={{ borderRadius: 30, padding: spacing.xl, borderWidth: 1, borderColor: '#DFF7FF', alignItems: 'center' }}
          >
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff' }}>
              <Ionicons name="gift" size={38} color="#D97706" />
            </View>
            <Text style={{ marginTop: spacing.md, color: colors.grey900, fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center' }}>
              {ar ? 'KidTok يعمل بالمكافآت والكوينز' : 'KidTok runs on rewards and coins'}
            </Text>
            <Text style={{ marginTop: 8, color: colors.grey600, fontSize: fontSize.sm, fontWeight: '700', textAlign: 'center', lineHeight: 22 }}>
              {ar
                ? 'اجمع العملات من إعلانات المكافأة واستخدمها في الهدايا والفريمات والعناصر الممتعة داخل التطبيق.'
                : 'Earn coins from rewarded ads and spend them on gifts, frames, and fun items inside the app.'}
            </Text>
            <Pressable
              onPress={() => router.replace('/(tabs)/profile')}
              style={({ pressed }) => ({
                marginTop: spacing.lg,
                height: 50,
                width: '100%',
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.primaryDark : colors.primary,
              })}
            >
              <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '900' }}>
                {ar ? 'اذهب إلى البروفايل' : 'Go to profile'}
              </Text>
            </Pressable>
          </LinearGradient>
        </View>
      </SafeAreaView>
    </KeyboardScreen>
  )
}
