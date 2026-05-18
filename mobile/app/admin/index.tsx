import { useState, useCallback } from 'react'
import { View, Text, TextInput, Pressable, FlatList, Image, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import VerifiedBadge from '@/components/VerifiedBadge'

type AdminUser = {
  id: string; name: string; username: string | null
  avatar_url: string | null; role: string
  is_verified: boolean; followers_count: number
}

export default function AdminScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AdminUser[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const search = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    const { data } = await supabase.rpc('admin_search_users', { p_query: query.trim(), p_limit: 30 })
    setResults(data || [])
    setSearching(false)
  }, [query])

  const toggleVerified = (item: AdminUser) => {
    Alert.alert(
      `${item.is_verified ? 'إلغاء' : 'منح'} الشارة لـ ${item.name}`,
      '',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: async () => {
            setLoadingId(item.id)
            const { error } = await supabase.rpc('set_verified', { p_user_id: item.id, p_verified: !item.is_verified })
            if (error) {
              Toast.show({ type: 'error', text1: error.message })
            } else {
              setResults((prev) => prev.map((u) => u.id === item.id ? { ...u, is_verified: !u.is_verified } : u))
              Toast.show({ type: 'success', text1: item.is_verified ? 'تم إلغاء الشارة' : '✅ تم منح الشارة المعتمدة' })
            }
            setLoadingId(null)
          },
        },
      ]
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={26} color={colors.grey900} />
        </Pressable>
        <View>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>لوحة الإدارة</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>إدارة المستخدمين والشارات المعتمدة</Text>
        </View>
      </View>

      <View style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.grey50, borderRadius: radius.pill, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.grey100 }}>
          <Ionicons name="person-outline" size={20} color={colors.grey400} />
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="ابحث بالاسم أو @username"
            placeholderTextColor={colors.grey400}
            returnKeyType="search" onSubmitEditing={search}
            style={{ flex: 1, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.sm, fontSize: fontSize.base, color: colors.grey900 }}
          />
          <Pressable onPress={search} disabled={!query.trim() || searching}>
            {searching ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="search" size={20} color={colors.primary} />}
          </Pressable>
        </View>
      </View>

      {/* ── Ad Frequency Control ── */}
      <AdFrequencyControl />

      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Ionicons name="shield-checkmark-outline" size={60} color={colors.grey200} />
            <Text style={{ color: colors.grey400, marginTop: spacing.md }}>ابحث عن مستخدم لمنحه الشارة</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={{ width: '100%', height: '100%' }} />
                : <Ionicons name="person" size={28} color={colors.white} />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontWeight: '800', fontSize: fontSize.base, color: colors.grey900 }}>{item.name || 'مستخدم'}</Text>
                {item.is_verified && <VerifiedBadge size="sm" />}
              </View>
              {item.username && <Text style={{ fontSize: fontSize.sm, color: colors.primary }}>@{item.username}</Text>}
              <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>{item.role} · {item.followers_count} متابع</Text>
            </View>
            <Pressable
              onPress={() => toggleVerified(item)}
              disabled={loadingId === item.id}
              style={({ pressed }) => ({
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                backgroundColor: item.is_verified ? colors.primary : colors.grey100,
                borderWidth: item.is_verified ? 0 : 1, borderColor: colors.grey200,
                opacity: (pressed || loadingId === item.id) ? 0.7 : 1,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              })}
            >
              {loadingId === item.id
                ? <ActivityIndicator size="small" color={item.is_verified ? colors.white : colors.grey500} />
                : <>
                    <Ionicons name={item.is_verified ? 'checkmark-circle' : 'add-circle-outline'} size={14} color={item.is_verified ? colors.white : colors.grey600} />
                    <Text style={{ fontSize: fontSize.xs, fontWeight: '800', color: item.is_verified ? colors.white : colors.grey700 }}>
                      {item.is_verified ? 'معتمد' : 'منح شارة'}
                    </Text>
                  </>
              }
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  )
}


// ── Ad Frequency Control Component ──────────────────────────────────────────
function AdFrequencyControl() {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('app_settings')
      .select('value').eq('key', 'ads_interstitial_after_videos').single()
      .then(({ data }) => {
        if (data?.value) { setCurrent(data.value); setValue(data.value) }
      })
  }, [])

  const save = async () => {
    const n = parseInt(value, 10)
    if (isNaN(n) || n < 0) return
    setSaving(true)
    await supabase.from('app_settings')
      .update({ value: String(n) })
      .eq('key', 'ads_interstitial_after_videos')
    setCurrent(String(n))
    setSaving(false)
    Toast.show({ type: 'success', text1: n === 0 ? 'الإعلانات معطّلة' : `الإعلان كل ${n} فيديوهات` })
  }

  return (
    <View style={{ margin: spacing.lg, backgroundColor: '#FFF7ED', borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: '#FED7AA' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
        <Ionicons name="megaphone" size={20} color="#EA580C" />
        <Text style={{ fontWeight: '900', fontSize: fontSize.base, color: '#9A3412' }}>تحكم في تكرار الإعلانات</Text>
      </View>
      <Text style={{ fontSize: fontSize.xs, color: '#C2410C', marginBottom: spacing.md }}>
        كل كم فيديو يظهر الإعلان للمستخدمين المجانيين؟ (0 = معطّل)
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          placeholder="5"
          style={{
            flex: 1, backgroundColor: colors.white, borderRadius: radius.lg,
            paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
            fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center',
            color: colors.grey900, borderWidth: 1, borderColor: '#FED7AA',
          }}
        />
        <Pressable
          onPress={save} disabled={saving}
          style={{ backgroundColor: '#EA580C', borderRadius: radius.lg, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>حفظ</Text>}
        </Pressable>
      </View>
      {current && (
        <Text style={{ fontSize: fontSize.xs, color: '#92400E', marginTop: spacing.sm }}>
          الحالي: {current === '0' ? 'معطّل' : `كل ${current} فيديوهات`}
        </Text>
      )}
    </View>
  )
}
