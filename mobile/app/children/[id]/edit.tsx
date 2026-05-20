import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native'
import KeyboardScreen from '@/components/KeyboardScreen'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

export default function EditChildScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [selectedAge, setSelectedAge] = useState<number | null>(null)

  // Load child data
  const { data: child, isLoading } = useQuery({
    queryKey: ['child', id],
    queryFn: async () => {
      const { data } = await supabase.from('children')
        .select('id, name, age_id, gender')
        .eq('id', id!).single()
      return data
    },
  })

  // Load ages
  const { data: ages = [] } = useQuery({
    queryKey: ['ages'],
    queryFn: async () => {
      const { data } = await supabase.from('ages').select('id, name_ar, name_en').order('id')
      return data || []
    },
  })

  useEffect(() => {
    if (child) {
      setName(child.name || '')
      setSelectedAge(child.age_id || null)
    }
  }, [child])

  const save = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: ar ? 'أدخل اسم الطفل' : 'Enter child name' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('children')
      .update({ name: name.trim(), age_id: selectedAge })
      .eq('id', id!)
    setSaving(false)
    if (error) {
      Toast.show({ type: 'error', text1: error.message })
    } else {
      qc.invalidateQueries({ queryKey: ['children'] })
      qc.invalidateQueries({ queryKey: ['child', id] })
      Toast.show({ type: 'success', text1: ar ? 'تم التحديث ✓' : 'Updated ✓' })
      router.back()
    }
  }

  if (isLoading) {
    return (
      <KeyboardScreen variant="form">
        <ActivityIndicator color={colors.primary} />
      </KeyboardScreen>
    )
  }

  return (
    <KeyboardScreen variant="form" style={{ flex: 1, backgroundColor: colors.white  }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.grey900} />
        </Pressable>
        <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
          {ar ? 'تعديل بيانات الطفل' : 'Edit Child'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {/* Name */}
        <View>
          <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 8 }}>
            {ar ? 'اسم الطفل' : "Child's Name"}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={ar ? 'أدخل الاسم...' : 'Enter name...'}
            style={{
              borderWidth: 1.5, borderColor: colors.grey200, borderRadius: radius.lg,
              paddingHorizontal: spacing.md, paddingVertical: 14,
              fontSize: fontSize.base, color: colors.grey900,
            }}
          />
        </View>

        {/* Age */}
        <View>
          <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 8 }}>
            {ar ? 'العمر' : 'Age'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {ages.map((age: any) => (
              <Pressable
                key={age.id}
                onPress={() => setSelectedAge(age.id)}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
                  borderRadius: radius.pill,
                  backgroundColor: selectedAge === age.id ? colors.primary : colors.grey100,
                  borderWidth: 1.5,
                  borderColor: selectedAge === age.id ? colors.primary : 'transparent',
                }}
              >
                <Text style={{ fontWeight: '700', color: selectedAge === age.id ? '#fff' : colors.grey700 }}>
                  {ar ? age.name_ar : age.name_en}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Save button */}
        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.primaryDark : colors.primary,
            paddingVertical: spacing.md + 4, borderRadius: radius.pill,
            alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
            opacity: saving ? 0.7 : 1, marginTop: spacing.lg,
          })}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.base }}>
                  {ar ? 'حفظ التغييرات' : 'Save Changes'}
                </Text>
              </>
          }
        </Pressable>
      </ScrollView>
    </KeyboardScreen>
  )
}
