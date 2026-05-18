import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { supabase } from '@/lib/supabase'
import { usePlanLimits } from '@/hooks/usePlanLimits'
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
  const [menuChild, setMenuChild] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { data: planLimits } = usePlanLimits()

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

  const deleteChild = async (childId: string, childName: string) => {
    Alert.alert(
      lang === 'ar' ? 'حذف الطفل' : 'Delete Child',
      lang === 'ar' ? `هل تريد حذف "${childName}" نهائياً؟` : `Delete "${childName}" permanently?`,
      [
        { text: lang === 'ar' ? 'إلغاء' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'ar' ? 'حذف' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            const { error } = await supabase.from('children').delete().eq('id', childId)
            if (!error) {
              qc.invalidateQueries({ queryKey: ['children'] })
            } else {
              Alert.alert('خطأ', error.message)
            }
            setMenuChild(null)
            setDeleting(false)
          },
        },
      ]
    )
  }

  return (
    <Pressable style={{ flex: 1 }} onPress={() => setMenuChild(null)}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: spacing.lg }}>
          {planLimits && children.length >= planLimits.max_children ? (
            <Pressable
              onPress={() => router.push('/subscription/plans')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#FCD34D' }}
            >
              <Ionicons name="lock-closed" size={14} color="#92400E" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>{children.length}/{planLimits.max_children}</Text>
              <Text style={{ fontSize: 11, color: '#92400E' }}>ترقية</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/children/new')}
              style={({ pressed }) => ({
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name="add" size={26} color={colors.white} />
            </Pressable>
          )}
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
              <View
                key={child.id}
                style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.grey50, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.grey100, gap: spacing.md }}
              >
                <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }} onPress={() => router.push(`/children/${child.id}`)}>
                  <ChildAvatar name={child.name} imageUrl={child.image_url} gender={child.gender} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>{child.name}</Text>
                    {!!child.age?.name_ar && (
                      <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>
                        {lang === 'ar' ? child.age.name_ar : child.age.name_en}
                      </Text>
                    )}
                    {!!child.interests?.length && (
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey600, marginTop: 2 }} numberOfLines={1}>
                        {child.interests.map((interest: any) => lang === 'ar' ? interest.name_ar : interest.name_en).join(' • ')}
                      </Text>
                    )}
                  </View>
                </Pressable>

                {/* 3-dot menu */}
                <Pressable
                  onPress={() => setMenuChild(menuChild === child.id ? null : child.id)}
                  style={{ padding: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.grey400} />
                </Pressable>

                {/* Dropdown menu */}
                {menuChild === child.id && (
                  <View style={{ position: 'absolute', right: 12, top: 44, backgroundColor: colors.white, borderRadius: radius.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, zIndex: 100, minWidth: 160, borderWidth: 1, borderColor: colors.grey100 }}>
                    <Pressable
                      onPress={() => { setMenuChild(null); router.push(`/children/${child.id}/edit` as any) }}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: pressed ? colors.grey50 : colors.white, borderRadius: radius.lg })}
                    >
                      <Ionicons name="pencil-outline" size={18} color={colors.grey700} />
                      <Text style={{ fontWeight: '600', color: colors.grey900 }}>{lang === 'ar' ? 'تعديل' : 'Edit'}</Text>
                    </Pressable>
                    <View style={{ height: 1, backgroundColor: colors.grey100 }} />
                    <Pressable
                      onPress={() => { setMenuChild(null); deleteChild(child.id, child.name) }}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: pressed ? '#FEF2F2' : colors.white, borderRadius: radius.lg })}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.secondary} />
                      <Text style={{ fontWeight: '600', color: colors.secondary }}>{lang === 'ar' ? 'حذف' : 'Delete'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
    </Pressable>
  )
}
