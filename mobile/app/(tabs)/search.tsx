import { View, Text, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'

import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function SearchScreen() {
  const { t } = useTranslation()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ padding: spacing.lg }}>
        <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900, marginBottom: spacing.md }}>
          {t('tabs.search')}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.grey50,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            borderWidth: 1,
            borderColor: colors.grey100,
          }}
        >
          <Ionicons name="search" size={20} color={colors.grey400} />
          <TextInput
            placeholder="ابحث عن فيديو أو منشئ..."
            placeholderTextColor={colors.grey400}
            style={{
              flex: 1,
              paddingVertical: spacing.sm + 4,
              paddingHorizontal: spacing.sm,
              fontSize: fontSize.base,
              color: colors.grey900,
            }}
          />
        </View>

        <View style={{ alignItems: 'center', marginTop: spacing.xxl, padding: spacing.lg }}>
          <Ionicons name="search-outline" size={64} color={colors.grey200} />
          <Text style={{ marginTop: spacing.md, color: colors.grey600, fontSize: fontSize.base }}>
            ابدأ بالبحث عن محتوى مناسب لطفلك
          </Text>
        </View>
      </View>
    </SafeAreaView>
  )
}
