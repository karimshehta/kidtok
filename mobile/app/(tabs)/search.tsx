import { useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface YTResult {
  youtube_id: string
  video_id?: string          // alias, may be absent
  title: string
  thumbnail_url: string
  thumbnail?: string         // alias
  channel_name: string
  channel?: string           // alias
  channel_id: string
  duration_seconds: number
  blocked?: boolean
}

export default function SearchScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YTResult[]>([])
  const [searching, setSearching] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: query.trim() },
      })
      if (error) throw error
      setResults((data?.results || data?.videos || []) as YTResult[])
    } catch (err) {
      Toast.show({ type: 'error', text1: 'فشل البحث', text2: (err as Error).message })
    } finally {
      setSearching(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.md }}>
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
          <Ionicons name="logo-youtube" size={22} color="#FF0000" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث في YouTube..."
            placeholderTextColor={colors.grey400}
            returnKeyType="search"
            onSubmitEditing={search}
            style={{
              flex: 1,
              paddingVertical: spacing.sm + 4,
              paddingHorizontal: spacing.sm,
              fontSize: fontSize.base,
              color: colors.grey900,
            }}
          />
          <Pressable onPress={search} disabled={!query.trim()}>
            <Ionicons name="search" size={22} color={query.trim() ? colors.primary : colors.grey400} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 100 }}>
        {searching ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : results.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: spacing.xxl, padding: spacing.lg }}>
            <View
              style={{
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: `${colors.primary}15`,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="search-outline" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900, textAlign: 'center' }}>
              ابحث عن محتوى آمن للأطفال
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: 4, textAlign: 'center' }}>
              النتائج مفلترة تلقائياً
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {results.map((v) => (
              <View
                key={v.youtube_id || v.video_id}
                style={{
                  flexDirection: 'row',
                  backgroundColor: colors.grey50,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  borderWidth: 1, borderColor: colors.grey100,
                }}
              >
                <View style={{ width: 120, height: 80, backgroundColor: colors.black }}>
                  <Image source={{ uri: v.thumbnail_url || v.thumbnail }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => {}} />
                </View>
                <View style={{ flex: 1, padding: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900 }} numberOfLines={2}>
                    {v.title}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.grey600, marginTop: 4 }} numberOfLines={1}>
                    {v.channel_name || v.channel || 'YouTube'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
