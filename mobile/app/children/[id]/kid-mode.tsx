import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image, Modal, TextInput, Alert, StatusBar, BackHandler } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import * as ScreenOrientation from 'expo-screen-orientation' // optional, won't break if absent

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Playlist {
  id: string
  name: string
  video_count: number
}

export default function ChildModeScreen() {
  const router = useRouter()
  const { id: childId } = useLocalSearchParams<{ id: string }>()

  const [exitOpen, setExitOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [remainingMin, setRemainingMin] = useState<number | null>(null)

  const { data: child } = useQuery({
    queryKey: ['child', childId],
    queryFn: async () => {
      const { data } = await supabase
        .from('children')
        .select('name, age, gender, daily_time_minutes')
        .eq('id', childId)
        .single()
      return data
    },
  })

  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists', childId],
    queryFn: async (): Promise<Playlist[]> => {
      const { data } = await supabase
        .from('playlists')
        .select('id, name, playlist_videos(count)')
        .eq('child_id', childId)
      return (data || []).map((p: any) => ({
        ...p,
        video_count: p.playlist_videos?.[0]?.count || 0,
      })) as any
    },
  })

  // Daily time remaining
  useEffect(() => {
    if (!childId) return
    ;(async () => {
      try {
        const { data } = await supabase.rpc('get_child_remaining_time', { p_child_id: childId })
        if (typeof data === 'number') setRemainingMin(Math.round(data / 60))
      } catch {}
    })()
  }, [childId])

  // Hide status bar + block back button
  useEffect(() => {
    StatusBar.setHidden(true, 'fade')
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setExitOpen(true)
      return true
    })
    return () => {
      StatusBar.setHidden(false, 'fade')
      sub.remove()
    }
  }, [])

  const tryExit = async () => {
    // Verify password against current user
    const { data: u } = await supabase.auth.getUser()
    if (!u.user?.email) return
    const { error } = await supabase.auth.signInWithPassword({
      email: u.user.email,
      password,
    })
    if (error) {
      Alert.alert('خطأ', 'كلمة المرور غير صحيحة')
      setPassword('')
      return
    }
    setExitOpen(false)
    router.back()
  }

  const isTimeUp = remainingMin !== null && remainingMin <= 0
  const isLowTime = remainingMin !== null && remainingMin > 0 && remainingMin <= 5

  return (
    <LinearGradient colors={[colors.primary, '#0891b2', colors.secondary]} style={{ flex: 1 }}>
      <StatusBar hidden />

      {/* Top bar with name + exit + timer */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 40,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.md,
        gap: spacing.md,
      }}>
        <View
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: 'rgba(255,255,255,0.25)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons
            name={child?.gender === 'girl' ? 'female' : 'male'}
            size={32}
            color={colors.white}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '900' }}>
            مرحباً {child?.name}!
          </Text>
          {remainingMin !== null && (
            <Text
              style={{
                color: isTimeUp ? '#FCA5A5' : isLowTime ? '#FCD34D' : 'rgba(255,255,255,0.85)',
                fontSize: fontSize.sm,
                fontWeight: '700',
              }}
            >
              {isTimeUp ? 'انتهى الوقت اليوم' : `متبقي ${remainingMin} دقيقة`}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => setExitOpen(true)}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.25)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="lock-closed" size={22} color={colors.white} />
        </Pressable>
      </View>

      {isTimeUp ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <View
            style={{
              width: 120, height: 120, borderRadius: 60,
              backgroundColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="time" size={64} color={colors.white} />
          </View>
          <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900', marginTop: spacing.lg }}>
            انتهى وقت اليوم
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.sm }}>
            عُد غداً يا بطل
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
          <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginBottom: spacing.md }}>
            اختر قائمة تشغيل
          </Text>
          {playlists.length === 0 ? (
            <View style={{ alignItems: 'center', padding: spacing.xl }}>
              <Ionicons name="list-outline" size={64} color="rgba(255,255,255,0.5)" />
              <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: spacing.sm }}>
                لا توجد قوائم تشغيل
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {playlists.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => p.video_count > 0 && router.push(`/playlist/${p.id}/play`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: spacing.md,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    borderRadius: radius.lg,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
                    gap: spacing.md,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 56, height: 56, borderRadius: radius.md,
                      backgroundColor: 'rgba(255,255,255,0.25)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="play" size={28} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800' }}>
                      {p.name}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.xs }}>
                      {p.video_count} فيديو
                    </Text>
                  </View>
                  <Ionicons name="chevron-back" size={24} color={colors.white} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Exit modal */}
      <Modal visible={exitOpen} animationType="fade" transparent onRequestClose={() => setExitOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, width: '100%', maxWidth: 360 }}>
            <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
              <View
                style={{
                  width: 64, height: 64, borderRadius: 32,
                  backgroundColor: `${colors.primary}15`,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: spacing.sm,
                }}
              >
                <Ionicons name="lock-closed" size={32} color={colors.primary} />
              </View>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '900' }}>الخروج من وضع الطفل</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.grey600, marginTop: 4 }}>
                أدخل كلمة مرور حسابك
              </Text>
            </View>

            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="كلمة المرور"
              secureTextEntry
              autoFocus
              style={{
                backgroundColor: colors.grey50,
                borderRadius: radius.lg,
                padding: spacing.md,
                fontSize: fontSize.base,
                borderWidth: 1, borderColor: colors.grey100,
                marginBottom: spacing.md,
              }}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() => { setExitOpen(false); setPassword('') }}
                style={{ flex: 1, padding: spacing.md, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.grey100 }}
              >
                <Text style={{ fontWeight: '800', color: colors.grey700 }}>إلغاء</Text>
              </Pressable>
              <Pressable
                onPress={tryExit}
                disabled={!password}
                style={{
                  flex: 1,
                  padding: spacing.md,
                  alignItems: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: !password ? colors.grey200 : colors.primary,
                }}
              >
                <Text style={{ fontWeight: '800', color: colors.white }}>خروج</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  )
}
