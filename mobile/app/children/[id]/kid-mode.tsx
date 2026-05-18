import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image, Modal, Alert, StatusBar, BackHandler } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import * as ScreenOrientation from 'expo-screen-orientation' // optional, won't break if absent

import { supabase } from '@/lib/supabase'
import { usePinVerify, useHasPin } from '@/hooks/usePinAuth'
import PinPad from '@/components/PinPad'
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
  const { verifyPin, verifyBiometric, verifying, error: pinError, setError: setPinError, biometricAvailable } = usePinVerify()
  const hasPin = useHasPin()
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

  const tryExitWithPin = async (pin: string) => {
    const ok = await verifyPin(pin)
    if (ok) { setExitOpen(false); router.back() }
  }

  const tryExitWithBiometric = async () => {
    const ok = await verifyBiometric()
    if (ok) { setExitOpen(false); router.back() }
  }

  const handleExitPress = () => {
    if (hasPin === null) return  // still loading — do nothing
    if (hasPin === false) {
      // No PIN set — shouldn't happen (blocked at entry) but handle gracefully
      Alert.alert(
        'رمز الأمان مطلوب',
        'يجب تعيين رمز PIN أولاً',
        [{ text: 'حسناً', style: 'cancel' }]
      )
      return
    }
    setPinError(null)
    setExitOpen(true)
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
          onPress={handleExitPress}
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 16, paddingBottom: 16, width: '90%', maxWidth: 360 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }}>
              <Pressable onPress={() => { setExitOpen(false); setPinError(null) }}>
                <Ionicons name="close" size={24} color={colors.grey700} />
              </Pressable>
              <Text style={{ fontWeight: '900', fontSize: fontSize.base, color: colors.grey900 }}>الخروج من وضع الطفل</Text>
              <View style={{ width: 24 }} />
            </View>

            <PinPad
              key={pinError ?? 'idle'}
              title="أدخل رمز PIN"
              subtitle="للخروج من وضع الطفل"
              onComplete={tryExitWithPin}
              onBiometric={biometricAvailable ? tryExitWithBiometric : undefined}
              error={pinError}
              loading={verifying}
            />
          </View>
        </View>
      </Modal>
    </LinearGradient>
  )
}
