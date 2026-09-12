import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

import { supabase } from '@/lib/supabase'
import { usePlanLimits, useLockedChildrenIds } from '@/hooks/usePlanLimits'
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
  const { data: lockedIds = new Set<string>() } = useLockedChildrenIds()

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
              Alert.alert(lang === 'ar' ? 'خطأ' : 'Error', error.message)
            }
            setMenuChild(null)
            setDeleting(false)
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAFBFD' }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* ─── Hero header — professional gradient intro card ─────────────── */}
        <LinearGradient
          colors={['#03BBE5', '#0A8FB8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: radius.xl,
            padding: spacing.lg,
            marginBottom: spacing.lg,
            overflow: 'hidden',
          }}
        >
          {/* Decorative bubbles */}
          <View style={{ position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.10)' }} />
          <View style={{ position: 'absolute', bottom: -40, left: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.08)' }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="people" size={20} color="#fff" />
            </View>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize['2xl'] }}>
              {lang === 'ar' ? 'أطفالك' : 'Your children'}
            </Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: fontSize.sm, fontWeight: '600', lineHeight: 20, textAlign: lang === 'ar' ? 'right' : 'left' }}>
            {lang === 'ar'
              ? 'أنشئ ملفاً لكل طفل وقم بإعداد قوائم تشغيل آمنة بنفسك لمحتوى يناسبه.'
              : 'Create a profile for each child and curate safe playlists yourself for content that suits them.'}
          </Text>
        </LinearGradient>

        {/* ─── Action row: Limit pill / Add button ───────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: '800', color: colors.grey700 }}>
            {lang === 'ar' ? `${children.length} ${children.length === 1 ? 'طفل' : 'أطفال'}` : `${children.length} ${children.length === 1 ? 'child' : 'children'}`}
          </Text>
          {planLimits && children.length >= planLimits.max_children ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#FCD34D' }}
            >
              <Ionicons name="lock-closed" size={14} color="#92400E" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>{children.length}/{planLimits.max_children}</Text>
              <Text style={{ fontSize: 11, color: '#92400E' }}>{lang === 'ar' ? 'الحد الحالي' : 'Current limit'}</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/children/new')}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={{ color: colors.white, fontWeight: '800', fontSize: 13 }}>{lang === 'ar' ? 'إضافة طفل' : 'Add child'}</Text>
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
              {lang === 'ar' ? 'لم تضف أطفالا بعد' : 'No children added yet'}            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: spacing.xs, textAlign: 'center' }}>
              {lang === 'ar' ? 'أضف طفلك الأول لتبدأ' : 'Add your first child to get started'}            </Text>
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
              <Text style={{ color: colors.white, fontWeight: '700' }}>{lang === 'ar' ? '+ إضافة طفل' : '+ Add child'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {children.map((child) => {
              const isLocked = lockedIds.has(child.id)
              return (
              <View
                key={child.id}
                style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: isLocked ? '#FFF7ED' : colors.grey50, borderRadius: radius.lg, borderWidth: 1, borderColor: isLocked ? '#FED7AA' : colors.grey100, gap: spacing.md, opacity: isLocked ? 0.85 : 1 }}
              >
                <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }} onPress={() => {
                  if (isLocked) {
                    Alert.alert(
                      lang === 'ar' ? '🔒 مقفول' : '🔒 Locked',
                      lang === 'ar'
                        ? `الحد الحالي يسمح بـ ${planLimits?.max_children || 1} أطفال فقط.`
                        : `The current limit allows ${planLimits?.max_children || 1} children only.`,
                      [
                        { text: lang === 'ar' ? 'حسناً' : 'OK', style: 'cancel' },
                      ]
                    )
                    return
                  }
                  router.push(`/children/${child.id}`)
                }}>
                  <ChildAvatar name={child.name} imageUrl={child.image_url} gender={child.gender} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: '700', color: colors.grey900 }}>{child.name}</Text>
                    {(() => {
                      const ageLabel = child.age && (lang === 'ar' ? (child.age.name_ar || child.age.name_en) : (child.age.name_en || child.age.name_ar))
                      return ageLabel ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Ionicons name="calendar-outline" size={12} color={colors.grey600} />
                          <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>
                            {ageLabel}
                          </Text>
                        </View>
                      ) : null
                    })()}
                    {!!child.interests?.length && (
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey600, marginTop: 2 }} numberOfLines={1}>
                        {child.interests.map((interest: any) => lang === 'ar' ? interest.name_ar : interest.name_en).join(' • ')}
                      </Text>
                    )}
                  </View>
                </Pressable>

                {/* 3-dot menu — opens centralized Modal below */}
                <Pressable
                  onPress={() => setMenuChild(child.id)}
                  style={{ padding: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.grey400} />
                </Pressable>
              {isLocked && (
                <View style={{ position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F97316', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, zIndex: 1 }}>
                  <Ionicons name="lock-closed" size={10} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{lang === 'ar' ? 'مقفول' : 'Locked'}</Text>
                </View>
              )}
              </View>
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* ─── Child actions Modal — renders above everything (no overlap with cards below) ─── */}
      <Modal
        visible={menuChild !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuChild(null)}
      >
        <Pressable
          onPress={() => setMenuChild(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.white,
              borderRadius: radius.lg,
              width: 260,
              overflow: 'hidden',
              shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 16,
            }}
          >
            <Pressable
              onPress={() => {
                const cid = menuChild
                setMenuChild(null)
                if (cid) router.push(`/children/${cid}/edit` as any)
              }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                backgroundColor: pressed ? colors.grey50 : colors.white,
              })}
            >
              <Ionicons name="pencil-outline" size={20} color={colors.grey700} />
              <Text style={{ fontWeight: '700', color: colors.grey900, fontSize: fontSize.base }}>{lang === 'ar' ? 'تعديل' : 'Edit'}</Text>
            </Pressable>
            <View style={{ height: 1, backgroundColor: colors.grey100 }} />
            <Pressable
              onPress={() => {
                const cid = menuChild
                const name = children?.find((c) => c.id === cid)?.name || ''
                setMenuChild(null)
                if (cid) deleteChild(cid, name)
              }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                backgroundColor: pressed ? '#FEF2F2' : colors.white,
              })}
            >
              <Ionicons name="trash-outline" size={20} color={colors.secondary} />
              <Text style={{ fontWeight: '700', color: colors.secondary, fontSize: fontSize.base }}>{lang === 'ar' ? 'حذف' : 'Delete'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
