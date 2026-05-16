import { View, Text, Pressable, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'

import { colors, spacing, fontSize, radius } from '@/lib/theme'

export function ForceUpdateScreen({ messageAr, messageEn, storeUrl }: { messageAr: string; messageEn: string; storeUrl: string }) {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  return (
    <LinearGradient colors={[colors.primary, '#0891b2']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
      <View
        style={{
          width: 120, height: 120, borderRadius: 60,
          backgroundColor: 'rgba(255,255,255,0.25)',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: spacing.lg,
        }}
      >
        <Ionicons name="cloud-download" size={64} color={colors.white} />
      </View>
      <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900', textAlign: 'center' }}>
        {lang === 'ar' ? 'تحديث متاح' : 'Update Available'}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl }}>
        {lang === 'ar' ? messageAr : messageEn}
      </Text>
      <Pressable
        onPress={() => Linking.openURL(storeUrl)}
        style={{
          backgroundColor: colors.white,
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.md,
          borderRadius: radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <Ionicons name="download" size={22} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '900', fontSize: fontSize.base }}>
          {lang === 'ar' ? 'تحديث الآن' : 'Update Now'}
        </Text>
      </Pressable>
    </LinearGradient>
  )
}

export function MaintenanceScreen({ messageAr, messageEn }: { messageAr: string; messageEn: string }) {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  return (
    <LinearGradient colors={['#F59E0B', '#DC2626']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
      <View
        style={{
          width: 120, height: 120, borderRadius: 60,
          backgroundColor: 'rgba(255,255,255,0.25)',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: spacing.lg,
        }}
      >
        <Ionicons name="construct" size={64} color={colors.white} />
      </View>
      <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900', textAlign: 'center' }}>
        {lang === 'ar' ? 'صيانة مؤقتة' : 'Maintenance Mode'}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.sm }}>
        {lang === 'ar' ? messageAr : messageEn}
      </Text>
    </LinearGradient>
  )
}
