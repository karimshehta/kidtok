import { useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

type AgeOption = {
  id: number
  name_ar: string
  name_en: string
  min_age: number
  max_age: number
}

type InterestOption = {
  id: number
  name_ar: string
  name_en: string
}

export default function AddChildScreen() {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [ageId, setAgeId] = useState<number | null>(null)
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [interestIds, setInterestIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  const { data: ages = [], isLoading: agesLoading } = useQuery({
    queryKey: ['ages'],
    queryFn: async (): Promise<AgeOption[]> => {
      const { data, error } = await supabase
        .from('ages')
        .select('id, name_ar, name_en, min_age, max_age')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  const { data: interests = [] } = useQuery({
    queryKey: ['interests'],
    queryFn: async (): Promise<InterestOption[]> => {
      const { data, error } = await supabase
        .from('interests')
        .select('id, name_ar, name_en')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  const toggleInterest = (id: number) => {
    setInterestIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const handleSave = async () => {
    if (!name.trim() || !userId || !ageId) return
    setSaving(true)
    try {
      const { data: child, error } = await supabase
        .from('children')
        .insert({
          parent_id: userId,
          name: name.trim(),
          age_id: ageId,
          gender,
        })
        .select('id, name, gender, image_url, age:ages(name_ar, name_en)')
        .single()
      if (error) throw error

      if (interestIds.length > 0) {
        const { error: interestsError } = await supabase.from('child_interests').insert(
          interestIds.map((interest_id) => ({
            child_id: child.id,
            interest_id,
          }))
        )
        if (interestsError) throw interestsError
      }

      const selectedInterests = interests.filter((interest) => interestIds.includes(interest.id))
      qc.setQueryData(['children', userId], (old: unknown) => {
        const list = Array.isArray(old) ? old : []
        return child ? [{ ...child, interests: selectedInterests }, ...list] : list
      })
      await qc.invalidateQueries({ queryKey: ['children', userId] })
      Toast.show({ type: 'success', text1: 'تم إضافة الطفل بنجاح' })
      router.replace('/(tabs)/children')
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!name.trim() && !!ageId && !saving

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900 }}>
          إضافة طفل
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: spacing.sm }}>
          النوع
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
          {(['male', 'female'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => setGender(g)}
              style={{
                flex: 1,
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: gender === g ? (g === 'male' ? colors.primary : colors.secondary) : colors.grey100,
                backgroundColor: gender === g
                  ? (g === 'male' ? `${colors.primary}15` : `${colors.secondary}15`)
                  : colors.grey50,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons
                name={g === 'male' ? 'male' : 'female'}
                size={32}
                color={g === 'male' ? colors.primary : colors.secondary}
              />
              <Text style={{ fontWeight: '700', color: colors.grey900 }}>
                {g === 'male' ? 'ولد' : 'بنت'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
          الاسم
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="اسم الطفل"
          placeholderTextColor={colors.grey400}
          style={{
            backgroundColor: colors.grey50,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            fontSize: fontSize.base,
            color: colors.grey900,
            borderWidth: 1,
            borderColor: colors.grey100,
            marginBottom: spacing.lg,
          }}
        />

        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
          العمر
        </Text>
        {agesLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.xl }} />
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xl, flexWrap: 'wrap' }}>
            {ages.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setAgeId(a.id)}
                style={{
                  minWidth: 90,
                  height: 52,
                  paddingHorizontal: spacing.sm,
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: ageId === a.id ? colors.primary : colors.grey100,
                  backgroundColor: ageId === a.id ? `${colors.primary}15` : colors.grey50,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontWeight: '800', color: ageId === a.id ? colors.primary : colors.grey900 }}>
                  {(lang === 'ar' ? a.name_ar : a.name_en) || `${a.min_age}-${a.max_age}`}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
          ط§ظ„ط§ظ‡طھظ…ط§ظ…ط§طھ
        </Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.grey600, marginBottom: spacing.sm }}>
          ط§ط®طھط§ط± ط§ظ„ط§ظ‡طھظ…ط§ظ…ط§طھ ط§ظ„ظ…ظ†ط§ط³ط¨ط© ظ„ظ„ط·ظپظ„
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xl }}>
          {interests.map((interest) => {
            const active = interestIds.includes(interest.id)
            return (
              <Pressable
                key={interest.id}
                onPress={() => toggleInterest(interest.id)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.grey50,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.grey100,
                }}
              >
                <Text style={{ color: active ? colors.white : colors.grey900, fontWeight: '700' }}>
                  {lang === 'ar' ? interest.name_ar : interest.name_en}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={!canSave}
          style={{
            backgroundColor: !canSave ? colors.grey200 : colors.primary,
            paddingVertical: spacing.md + 2,
            borderRadius: radius.pill,
            alignItems: 'center',
          }}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800' }}>
              حفظ
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
