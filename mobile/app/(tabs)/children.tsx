import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import ChildAvatar from '@/components/ChildAvatar'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Child {
  id: string
  name: string
  age: { name_ar: string; name_en: string } | null
  gender: 'male' | 'female' | null
  image_url: string | null
  interests?: { name_ar: string; name_en: string }[]
}

export default function ChildrenScreen() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    if (!userId) return
    setRefreshing(true)
    await qc.refetchQueries({ queryKey: ['children', userId] })
    setRefreshing(false)
  }, [userId])

  // Refetch quietly when tab is focused (no flicker — uses placeholder data)
  useFocusEffect(
    useCallback(() => {
      if (userId) qc.refetchQueries({ queryKey: ['children', userId], type: 'active' })
    }, [userId])
  )

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['children', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Child[]> => {
      const { data, error } = await supabase
        .from('children')
        .select('id, name, gender, image_url, age:ages(name_ar, name_en), child_interests(interest:interests(name_ar, name_en))')
        .eq('parent_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((child: any) => ({
        ...child,
        interests: (child.child_interests || []).map((ci: any) => ci.interest).filter(Boolean),
      })) as Child[]
    },
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900 }}>
            {t('tabs.children')}
          </Text>
          <Pressable
            onPress={() => router.push('/children/new')}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Ionicons name="add" size={26} color={colors.white} />
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xxl }} />
        ) : children.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: spacing.xxl }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: `${colors.primary}15`,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="people-outline" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.grey900 }}>
              لم تضف أطفالا بعد
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: spacing.xs, textAlign: 'center' }}>
              أضف طفلك الأول لتبدأ
            </Text>
            <Pressable
              onPress={() => router.push('/children/new')}
              style={{
                marginTop: spacing.lg,
                backgroundColor: colors.primary,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm + 4,
                borderRadius: radius.pill,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: '700' }}>+ إضافة طفل</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {children.map((child) => (
              <Pressable
                key={child.id}
                onPress={() => router.push(`/children/${child.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: spacing.md,
                  backgroundColor: colors.grey50,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.grey100,
                  opacity: pressed ? 0.7 : 1,
                  gap: spacing.md,
                })}
              >
                <ChildAvatar name={child.name} imageUrl={child.image_url} gender={child.gender} size="md" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>
                    {child.name}
                  </Text>
                  {!!child.age?.name_ar && (
                    <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>
                      {lang === 'ar' ? child.age.name_ar : child.age.name_en}
                    </Text>
                  )}
                  {!!child.interests?.length && (
                    <Text style={{ fontSize: fontSize.xs, color: colors.grey600, marginTop: 2 }} numberOfLines={1}>
                      {child.interests.map((interest) => lang === 'ar' ? interest.name_ar : interest.name_en).join(' • ')}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.grey400} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
