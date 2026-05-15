import { View, Text, Pressable, ScrollView, useColorScheme } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { colors, spacing, radius, fontSize } from '@/lib/theme'

export default function Landing() {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <LinearGradient
      colors={[colors.primary, '#0891b2', colors.secondary]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}>
          {/* Logo + Hero */}
          <View style={{ alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxl }}>
            <View
              style={{
                width: 96, height: 96,
                borderRadius: radius.xl,
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: spacing.lg,
              }}
            >
              <Ionicons name="play-circle" size={72} color={colors.white} />
            </View>
            <Text style={{ color: colors.white, fontSize: fontSize['4xl'], fontWeight: '900' }}>
              {t('landing.title')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.lg, textAlign: 'center', marginTop: spacing.sm }}>
              {t('landing.subtitle')}
            </Text>
          </View>

          {/* Features */}
          <View style={{ gap: spacing.md, marginBottom: spacing.xxl }}>
            <Feature icon="shield-checkmark" text={t('landing.feature1')} />
            <Feature icon="time" text={t('landing.feature2')} />
            <Feature icon="stats-chart" text={t('landing.feature3')} />
          </View>

          {/* CTAs */}
          <View style={{ marginTop: 'auto', gap: spacing.md }}>
            <Pressable
              onPress={() => router.push('/auth/signup')}
              style={({ pressed }) => ({
                backgroundColor: colors.white,
                paddingVertical: spacing.md + 2,
                borderRadius: radius.pill,
                alignItems: 'center',
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: colors.primary, fontSize: fontSize.lg, fontWeight: '800' }}>
                {t('landing.getStarted')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/auth/login')}
              style={({ pressed }) => ({
                paddingVertical: spacing.md + 2,
                borderRadius: radius.pill,
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '600' }}>
                {t('landing.haveAccount')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  )
}

function Feature({ icon, text }: { icon: any; text: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        padding: spacing.md,
        borderRadius: radius.lg,
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 40, height: 40, borderRadius: radius.md,
          backgroundColor: 'rgba(255,255,255,0.25)',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={22} color={colors.white} />
      </View>
      <Text style={{ color: colors.white, fontSize: fontSize.base, flex: 1, fontWeight: '600' }}>{text}</Text>
    </View>
  )
}
