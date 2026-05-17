import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { ImageSourcePropType } from 'react-native'
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
  name_ar: string | null
  name_en: string | null
  min_age: number
  max_age: number
}

type InterestOption = {
  id: number
  name_ar: string | null
  name_en: string | null
  image_url?: string | null
  icon?: string | null
}

const INTEREST_IMAGE_FALLBACKS: Record<string, ImageSourcePropType> = {
  cartoons: require('../../assets/images/v.png'),
  cartoon: require('../../assets/images/v.png'),
  educational: require('../../assets/images/book2.png'),
  education: require('../../assets/images/book2.png'),
  stories: require('../../assets/images/book.png'),
  story: require('../../assets/images/book.png'),
  songs: require('../../assets/images/music2.png'),
  music: require('../../assets/images/music2.png'),
  sports: require('../../assets/images/game2.png'),
  sport: require('../../assets/images/game2.png'),
  science: require('../../assets/images/game.png'),
  arts: require('../../assets/images/ulbom.png'),
  art: require('../../assets/images/ulbom.png'),
  quran: require('../../assets/images/book.png'),
  english: require('../../assets/images/user2.png'),
  games: require('../../assets/images/game.png'),
  game: require('../../assets/images/game.png'),
  puzzles: require('../../assets/images/game.png'),
  puzzle: require('../../assets/images/game.png'),
  default: require('../../assets/images/book2.png'),
}

const INTEREST_LABEL_FALLBACKS: Record<string, { ar: string; en: string }> = {
  cartoons: { ar: 'كرتون', en: 'Cartoons' },
  cartoon: { ar: 'كرتون', en: 'Cartoons' },
  educational: { ar: 'تعليمي', en: 'Educational' },
  education: { ar: 'تعليمي', en: 'Educational' },
  stories: { ar: 'قصص', en: 'Stories' },
  story: { ar: 'قصص', en: 'Stories' },
  songs: { ar: 'أغاني', en: 'Songs' },
  music: { ar: 'موسيقى', en: 'Music' },
  sports: { ar: 'رياضة', en: 'Sports' },
  sport: { ar: 'رياضة', en: 'Sports' },
  science: { ar: 'علوم', en: 'Science' },
  arts: { ar: 'رسم وفنون', en: 'Arts' },
  art: { ar: 'رسم وفنون', en: 'Arts' },
  quran: { ar: 'قرآن', en: 'Quran' },
  english: { ar: 'إنجليزي', en: 'English' },
  games: { ar: 'ألعاب', en: 'Games' },
  game: { ar: 'ألعاب', en: 'Games' },
  puzzles: { ar: 'ألغاز', en: 'Puzzles' },
  puzzle: { ar: 'ألغاز', en: 'Puzzles' },
}

export default function AddChildScreen() {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'ar'
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [ageId, setAgeId] = useState<number | null>(null)
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [interestIds, setInterestIds] = useState<number[]>([])
  const [ageOpen, setAgeOpen] = useState(false)
  const [interestsOpen, setInterestsOpen] = useState(false)
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

  const { data: interests = [], isLoading: interestsLoading } = useQuery({
    queryKey: ['interests'],
    queryFn: async (): Promise<InterestOption[]> => {
      const { data, error } = await supabase
        .from('interests')
        .select('id, name_ar, name_en, image_url, icon')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  const selectedAge = ages.find((age) => age.id === ageId)
  const selectedInterests = interests.filter((interest) => interestIds.includes(interest.id))
  const selectedInterestsText = interestIds.length
    ? lang === 'ar'
      ? `${interestIds.length} اهتمامات مختارة`
      : `${interestIds.length} selected`
    : lang === 'ar'
      ? 'اختر الاهتمامات'
      : 'Choose interests'

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

      qc.setQueryData(['children', userId], (old: unknown) => {
        const list = Array.isArray(old) ? old : []
        return child ? [{ ...child, interests: selectedInterests }, ...list] : list
      })
      await qc.invalidateQueries({ queryKey: ['children', userId] })
      Toast.show({ type: 'success', text1: lang === 'ar' ? 'تم إضافة الطفل بنجاح' : 'Child added successfully' })
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
          {lang === 'ar' ? 'إضافة طفل' : 'Add Child'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl * 2 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: spacing.sm }}>
          {lang === 'ar' ? 'النوع' : 'Gender'}
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
                {lang === 'ar' ? (g === 'male' ? 'ولد' : 'بنت') : (g === 'male' ? 'Boy' : 'Girl')}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
          {lang === 'ar' ? 'الاسم' : 'Name'}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={lang === 'ar' ? 'اسم الطفل' : 'Child name'}
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
          {lang === 'ar' ? 'العمر' : 'Age'}
        </Text>
        <Pressable
          onPress={() => setAgeOpen((value) => !value)}
          style={{
            minHeight: 54,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: ageOpen ? colors.primary : colors.grey100,
            backgroundColor: colors.grey50,
            paddingHorizontal: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: ageOpen ? spacing.sm : spacing.lg,
          }}
        >
          <Text style={{ color: selectedAge ? colors.grey900 : colors.grey400, fontSize: fontSize.base, fontWeight: '800' }}>
            {selectedAge ? getAgeLabel(selectedAge, lang) : (lang === 'ar' ? 'اختر العمر' : 'Choose age')}
          </Text>
          <Ionicons name={ageOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.grey400} />
        </Pressable>
        {ageOpen && (
          <View
            style={{
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.grey100,
              overflow: 'hidden',
              marginBottom: spacing.lg,
            }}
          >
            {agesLoading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: spacing.md }} />
            ) : ages.length === 0 ? (
              <Text style={{ padding: spacing.md, color: colors.grey600, textAlign: 'center' }}>
                {lang === 'ar' ? 'لا توجد أعمار متاحة' : 'No ages available'}
              </Text>
            ) : ages.map((age) => {
              const active = ageId === age.id
              return (
                <Pressable
                  key={age.id}
                  onPress={() => {
                    setAgeId(age.id)
                    setAgeOpen(false)
                  }}
                  style={{
                    minHeight: 50,
                    paddingHorizontal: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: active ? `${colors.primary}12` : colors.white,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.grey100,
                  }}
                >
                  <Text style={{ fontWeight: '800', color: active ? colors.primary : colors.grey900 }}>
                    {getAgeLabel(age, lang)}
                  </Text>
                  {active && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </Pressable>
              )
            })}
          </View>
        )}

        <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey700, marginBottom: 6 }}>
          {lang === 'ar' ? 'الاهتمامات' : 'Interests'}
        </Text>
        <Pressable
          onPress={() => setInterestsOpen((value) => !value)}
          style={{
            minHeight: 54,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: interestsOpen ? colors.primary : colors.grey100,
            backgroundColor: colors.grey50,
            paddingHorizontal: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: interestsOpen ? spacing.sm : spacing.xl,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
            <Text
              style={{ color: interestIds.length ? colors.grey900 : colors.grey400, fontSize: fontSize.base, fontWeight: '800', flex: 1 }}
              numberOfLines={1}
            >
              {selectedInterestsText}
            </Text>
          </View>
          <Ionicons name={interestsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.grey400} />
        </Pressable>
        {interestsOpen && (
          <View
            style={{
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.grey100,
              padding: spacing.sm,
              marginBottom: spacing.xl,
            }}
          >
            {interestsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: spacing.md }} />
            ) : interests.length === 0 ? (
              <Text style={{ padding: spacing.md, color: colors.grey600, textAlign: 'center' }}>
                {lang === 'ar' ? 'لا توجد اهتمامات متاحة' : 'No interests available'}
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {interests.map((interest) => {
                  const active = interestIds.includes(interest.id)
                  return (
                    <Pressable
                      key={interest.id}
                      onPress={() => toggleInterest(interest.id)}
                      style={{
                        width: '31.5%',
                        minHeight: 122,
                        borderRadius: radius.md,
                        borderWidth: 2,
                        borderColor: active ? colors.primary : colors.grey100,
                        backgroundColor: active ? `${colors.primary}10` : colors.white,
                        padding: spacing.xs,
                        alignItems: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: radius.md,
                          backgroundColor: colors.grey50,
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          marginBottom: 8,
                        }}
                      >
                        <Image source={getInterestImage(interest)} style={{ width: 54, height: 54 }} resizeMode="contain" />
                      </View>
                      <Text
                        style={{ color: active ? colors.primary : colors.grey900, fontWeight: '800', fontSize: fontSize.xs, textAlign: 'center' }}
                        numberOfLines={2}
                      >
                        {getInterestLabel(interest, lang)}
                      </Text>
                      {active && (
                        <View
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 6,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: colors.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="checkmark" size={14} color={colors.white} />
                        </View>
                      )}
                    </Pressable>
                  )
                })}
              </View>
            )}
            <Pressable
              onPress={() => setInterestsOpen(false)}
              style={{
                marginTop: spacing.md,
                alignSelf: 'center',
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ color: colors.white, fontWeight: '900' }}>{lang === 'ar' ? 'تم' : 'Done'}</Text>
            </Pressable>
          </View>
        )}

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
              {lang === 'ar' ? 'حفظ' : 'Save'}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function getAgeLabel(age: AgeOption, lang: 'ar' | 'en') {
  const preferred = lang === 'ar' ? age.name_ar : age.name_en
  if (preferred && !looksCorrupted(preferred)) return preferred

  if (lang === 'en') {
    return age.min_age === age.max_age
      ? `${age.min_age} years`
      : `${age.min_age}-${age.max_age} years`
  }

  return age.min_age === age.max_age
    ? `${age.min_age} سنوات`
    : `${age.min_age} - ${age.max_age} سنوات`
}

function getInterestLabel(interest: InterestOption, lang: 'ar' | 'en') {
  const preferred = lang === 'ar' ? interest.name_ar : interest.name_en
  if (preferred && !looksCorrupted(preferred)) return preferred

  const fallback = INTEREST_LABEL_FALLBACKS[getInterestKey(interest)]
  if (fallback) return fallback[lang]

  const readable = interest.name_en || interest.name_ar
  return readable && !looksCorrupted(readable) ? readable : (lang === 'ar' ? 'اهتمام' : 'Interest')
}

function getInterestImage(interest: InterestOption): ImageSourcePropType {
  if (interest.image_url && !looksCorrupted(interest.image_url)) return { uri: interest.image_url }
  return INTEREST_IMAGE_FALLBACKS[getInterestKey(interest)] || INTEREST_IMAGE_FALLBACKS.default
}

function getInterestKey(interest: InterestOption) {
  const source = interest.name_en || interest.icon || interest.name_ar || ''
  const normalized = source.toLowerCase().replace(/[^a-z]/g, '')
  return normalized || `interest-${interest.id}`
}

function looksCorrupted(value: string) {
  return /(Ø|Ù|Ã|Â|ط§|ط£|ط¥|طھ|ط±|ط¨|ط©|ط¹|ط³|ط­|ط®|ط¬|ط؛|ط¶|ظ„|ظ…|ظ†|ظˆ|ظٹ|ظپ)/.test(value)
}
