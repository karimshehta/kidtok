import { useState } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

export default function AddChildScreen() {
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [age, setAge] = useState('5')
  const [gender, setGender] = useState<'boy' | 'girl'>('boy')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !userId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('children').insert({
        parent_id: userId,
        name: name.trim(),
        age: parseInt(age) || null,
        gender,
      })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['children'] })
      Toast.show({ type: 'success', text1: 'تم إضافة الطفل بنجاح' })
      router.back()
    } catch (err) {
      Toast.show({ type: 'error', text1: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

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
        {/* Gender */}
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: spacing.sm }}>
          النوع
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
          {(['boy', 'girl'] as const).map((g) => (
            <Pressable
              key={g}
              onPress={() => setGender(g)}
              style={{
                flex: 1,
                padding: spacing.md,
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: gender === g ? (g === 'boy' ? colors.primary : colors.secondary) : colors.grey100,
                backgroundColor: gender === g
                  ? (g === 'boy' ? `${colors.primary}15` : `${colors.secondary}15`)
                  : colors.grey50,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons
                name={g === 'boy' ? 'male' : 'female'}
                size={32}
                color={g === 'boy' ? colors.primary : colors.secondary}
              />
              <Text style={{ fontWeight: '700', color: colors.grey900 }}>
                {g === 'boy' ? 'ولد' : 'بنت'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Name */}
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

        {/* Age */}
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
          العمر
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xl, flexWrap: 'wrap' }}>
          {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((a) => (
            <Pressable
              key={a}
              onPress={() => setAge(String(a))}
              style={{
                width: 50, height: 50,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: age === String(a) ? colors.primary : colors.grey100,
                backgroundColor: age === String(a) ? `${colors.primary}15` : colors.grey50,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontWeight: '800', color: age === String(a) ? colors.primary : colors.grey900 }}>
                {a}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving || !name.trim()}
          style={{
            backgroundColor: !name.trim() ? colors.grey200 : colors.primary,
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
