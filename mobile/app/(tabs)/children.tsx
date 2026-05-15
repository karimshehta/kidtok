import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Child {
  id: string
  name: string
  age: number | null
  gender: 'boy' | 'girl' | null
  avatar_url: string | null
}

export default function ChildrenScreen() {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.user?.id)

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['children', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Child[]> => {
      const { data, error } = await supabase
        .from('children')
        .select('id, name, age, gender, avatar_url')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Child[]
    },
  })

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900 }}>
            {t('tabs.children')}
          </Text>
          <Pressable
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
            }}
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
                width: 96, height: 96, borderRadius: 48,
                backgroundColor: `${colors.primary}15`,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="people-outline" size={48} color={colors.primary} />
            </View>
            <Text style={{ fontSize: fontSize.lg, fontWeight: '700', color: colors.grey900 }}>
              لم تضف أطفال بعد
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: spacing.xs, textAlign: 'center' }}>
              أضف طفلك الأول لتبدأ
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {children.map((child) => (
              <Pressable
                key={child.id}
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
                <View
                  style={{
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: child.gender === 'girl' ? `${colors.secondary}20` : `${colors.primary}20`,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={child.gender === 'girl' ? 'female' : 'male'}
                    size={28}
                    color={child.gender === 'girl' ? colors.secondary : colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>
                    {child.name}
                  </Text>
                  {child.age && (
                    <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>
                      {child.age} سنوات
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
