import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, Pressable, Image, Modal, Alert, StatusBar, BackHandler } from 'react-native'
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ScreenOrientation from 'expo-screen-orientation' // optional, won't break if absent

import { supabase } from '@/lib/supabase'
import { usePinVerify, useHasPin } from '@/hooks/usePinAuth'
import PinPad from '@/components/PinPad'
import Toast from 'react-native-toast-message'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import { useRewardedAdTimer } from '@/hooks/useRewardedAdTimer'
import ChildAvatar from '@/components/ChildAvatar'
import RewardedAdPrompt from '@/components/RewardedAdPrompt'
import { getChildSessionEndStorageKey, parseChildSessionTimer, serializeChildSessionTimer } from '@/lib/screenTime'

interface Playlist {
  id: string
  name: string
  video_count: number
}

async function fetchConfiguredSessionMinutes(childId?: string | null) {
  if (!childId) return 0

  const { data: remainingTime } = await supabase.rpc('get_child_remaining_time', {
    p_child_id: childId,
  })
  const row = Array.isArray(remainingTime) ? remainingTime[0] : remainingTime
  const rpcMinutes = Math.round(Number((row as any)?.limit_seconds || 0) / 60)
  if (rpcMinutes > 0) return rpcMinutes

  const { data: timeLimitRow } = await supabase
    .from('time_limits')
    .select('daily_minutes')
    .eq('child_id', childId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return Number((timeLimitRow as any)?.daily_minutes || 0)
}

export default function ChildModeScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { id: childId, name: pName, gender: pGender, imageUrl: pImageUrl } = useLocalSearchParams<{
    id: string; name?: string; gender?: string; imageUrl?: string
  }>()
  const { shouldShow: showRewardedPrompt, dismiss: dismissRewardedPrompt } = useRewardedAdTimer()

  const [exitOpen, setExitOpen] = useState(false)
  const { verifyPin, verifyBiometric, verifying, error: pinError, setError: setPinError, biometricAvailable } = usePinVerify()
  const hasPin = useHasPin()
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  const [limitSec,     setLimitSec]     = useState<number | null>(null)
  const [renewOpen,    setRenewOpen]    = useState(false)
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const endTimestampRef  = useRef<number | null>(null)  // absolute ms when limit is reached

  const { data: child } = useQuery({
    queryKey: ['child-kid-mode', childId],
    enabled: !!childId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('children')
        .select('name, gender, image_url')
        .eq('id', childId)
        .single()
      if (error) throw error
      const sessionMinutes = await fetchConfiguredSessionMinutes(childId)
      return { ...data, session_time_minutes: sessionMinutes }
    },
  })

  // ─── Mount: initialize the parent-configured per-session timer ─────────────
  useEffect(() => {
    if (!childId || !child) return

    // Per-session storage. The key is NOT tied to today's date — instead it's
    // cleared on exit (PIN/biometric leave). So:
    //  • Navigating to a playlist and back: timer continues (same session)
    //  • Exiting kid mode and re-entering: timer RESETS to full
    const storageKey = getChildSessionEndStorageKey(childId)
    const configuredMin = Number((child as any).session_time_minutes || (child as any).daily_time_minutes || 0)
    const sessionLimitSec = Math.max(0, configuredMin * 60)

    ;(async () => {
      // Never invent a default when the configured value is missing. A stale
      // partial child cache used to turn a parent's chosen limit into 30 min.
      if (sessionLimitSec <= 0) {
        endTimestampRef.current = null
        setLimitSec(null)
        setRemainingSec(null)
        AsyncStorage.removeItem(storageKey).catch(() => {})
        return
      }

      // 1) Mid-session continuation (e.g. came back from a playlist screen)
      try {
        const stored = await AsyncStorage.getItem(storageKey)
        const storedTimer = parseChildSessionTimer(stored)
        if (storedTimer?.endTs && storedTimer.limitSec === sessionLimitSec) {
            endTimestampRef.current = storedTimer.endTs
            const rem = Math.max(0, Math.round((storedTimer.endTs - Date.now()) / 1000))
            setRemainingSec(rem)
            setLimitSec(sessionLimitSec)
            return
        }
      } catch {}

      // 2) Fresh session — always start the countdown so the time-up + lock
      //    flow can fire reliably. sessionLimitSec is guaranteed > 0 above.
      const endTs = Date.now() + sessionLimitSec * 1000
      endTimestampRef.current = endTs
      setLimitSec(sessionLimitSec)
      setRemainingSec(sessionLimitSec)
      AsyncStorage.setItem(storageKey, serializeChildSessionTimer(endTs, sessionLimitSec)).catch(() => {})
    })()

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [childId, child])

  // ─── Focus/blur: countdown interval ─────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    if (endTimestampRef.current !== null) {
      const freshRem = Math.max(0, Math.round((endTimestampRef.current - Date.now()) / 1000))
      setRemainingSec(freshRem)
    }
    intervalRef.current = setInterval(() => {
      setRemainingSec((s) => {
        // CRITICAL: never poison the null state. `null` means "not yet
        // initialized" — the mount effect hasn't decided whether this
        // child has a limit. If we returned 0 here, isTimeUp would flip
        // true on the very first tick and the user would see "Time is up"
        // before the screen even loaded.
        if (s === null) return null
        if (s <= 0)     return 0
        return s - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  }, []))

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

  // Hide status bar + intercept back — but ONLY while THIS screen is focused.
  // Using useFocusEffect (not useEffect) means when a playlist is pushed on top,
  // this handler is removed, so going back from the playlist returns to the list
  // WITHOUT asking for the PIN. The PIN is only required to leave kid mode itself.
  useFocusEffect(
    useCallback(() => {
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
  )

  const tryExitWithPin = async (pin: string) => {
    const ok = await verifyPin(pin)
    if (ok) {
      setExitOpen(false)
      // Per-session timer: clear stored end-timestamp so re-entry starts fresh
      AsyncStorage.removeItem(getChildSessionEndStorageKey(childId)).catch(() => {})
      router.back()
    }
  }

  const tryExitWithBiometric = async () => {
    const ok = await verifyBiometric()
    if (ok) {
      setExitOpen(false)
      AsyncStorage.removeItem(getChildSessionEndStorageKey(childId)).catch(() => {})
      router.back()
    }
  }

  const renewSession = async () => {
    try {
      // 1) Use the limit that's already in state (set on session start).
      //    This is always positive if the user is on the time-up screen
      //    because time-up only happens when limitSec > 0.
      let sec: number = Number(limitSec ?? 0)

      // 2) If somehow not in state, pull from child cache.
      if (!sec || sec <= 0) {
        const m = Number((child as any)?.session_time_minutes ?? (child as any)?.daily_time_minutes ?? 0)
        sec = m * 60
      }

      // 3) Final fallback — refetch from DB.
      if (!sec || sec <= 0) {
        sec = (await fetchConfiguredSessionMinutes(childId)) * 60
      }

      if (!sec || sec <= 0) {
        throw new Error(ar ? 'لم يتم تعيين وقت للجلسة' : 'No session time is configured')
      }

      const endTs = Date.now() + sec * 1000

      // Persist BEFORE flipping state so useFocusEffect re-reads correctly.
      endTimestampRef.current = endTs
      try { await AsyncStorage.setItem(getChildSessionEndStorageKey(childId), serializeChildSessionTimer(endTs, sec)) } catch {}

      // Restart the countdown interval cleanly so we never have a leftover
      // tick from the "time is up" phase racing the renewed state.
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setLimitSec(sec)
      setRemainingSec(sec)
      intervalRef.current = setInterval(() => {
        setRemainingSec((s) => {
          if (s === null) return null
          if (s <= 0)     return 0
          return s - 1
        })
      }, 1000)

      setRenewOpen(false)
      setPinError(null)
      Toast.show({
        type:  'success',
        text1: ar ? 'تم تجديد الوقت ✓' : 'Time renewed ✓',
        text2: ar ? `${Math.round(sec/60)} دقيقة جديدة` : `${Math.round(sec/60)} new minutes`,
      })
    } catch (err: any) {
      Toast.show({
        type:  'error',
        text1: ar ? 'فشل تجديد الوقت' : 'Renew failed',
        text2: String(err?.message || err).slice(0, 120),
      })
    }
  }

  const tryRenewWithPin = async (pin: string) => {
    const ok = await verifyPin(pin)
    if (ok) await renewSession()
    // else: verifyPin already set pinError → PinPad displays it
  }

  const tryRenewWithBiometric = async () => {
    const ok = await verifyBiometric()
    if (ok) await renewSession()
  }

  const handleExitPress = () => {
    if (hasPin === null) return  // still loading — do nothing
    if (hasPin === false) {
      // No PIN set — shouldn't happen (blocked at entry) but handle gracefully
      Alert.alert(
        ar ? 'رمز الأمان مطلوب' : 'Security PIN required',
        ar ? 'يجب تعيين رمز PIN أولاً' : 'You must set a PIN first',
        [{ text: ar ? 'حسناً' : 'OK', style: 'cancel' }]
      )
      return
    }
    setPinError(null)
    setExitOpen(true)
  }

  const isTimeUp  = remainingSec !== null && remainingSec <= 0
  const isLowTime = remainingSec !== null && remainingSec > 0 && remainingSec <= 300 // 5 min

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
        <View style={{ borderRadius: 28, padding: 2, backgroundColor: 'rgba(255,255,255,0.25)' }}>
          <ChildAvatar
            name={child?.name || pName || ''}
            imageUrl={(child?.image_url as any) || pImageUrl}
            gender={((child?.gender as any) || pGender) as any}
            size="lg"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.white, fontSize: fontSize.xl, fontWeight: '900' }}>
            {ar ? `مرحباً ${child?.name || ''}` : `Hi ${child?.name || ''}`}
          </Text>
          {remainingSec !== null && (
            <View style={{ marginTop: 4, gap: 3 }}>
              <Text style={{
                color: isTimeUp ? '#FCA5A5' : isLowTime ? '#FCD34D' : 'rgba(255,255,255,0.95)',
                fontSize: isTimeUp ? fontSize.sm : fontSize.lg,
                fontWeight: '900',
                letterSpacing: isTimeUp ? 0 : 2,
                fontVariant: ['tabular-nums'] as any,
              }}>
                {isTimeUp
                  ? (ar ? 'انتهى الوقت' : 'Time is up')
                  : (() => {
                      const h = Math.floor(remainingSec / 3600)
                      const m = Math.floor((remainingSec % 3600) / 60)
                      const s = remainingSec % 60
                      if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                      return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                    })()}
              </Text>
              {/* Progress bar */}
              {limitSec !== null && limitSec > 0 && !isTimeUp && (
                <View style={{ height: 4, width: 120, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2 }}>
                  <View style={{
                    height: 4, borderRadius: 2,
                    width: `${Math.min(100, Math.round((remainingSec / limitSec) * 100))}%`,
                    backgroundColor: isLowTime ? '#FCD34D' : '#86EFAC',
                  }} />
                </View>
              )}
            </View>
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
            {ar ? 'انتهى الوقت' : 'Time is up'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.sm }}>
            {ar ? 'استأذن أبوك أو أمك لتجديد الوقت' : 'Ask your parent to renew the time'}
          </Text>
          <Pressable
            onPress={() => { setPinError(null); setRenewOpen(true) }}
            style={({ pressed }) => ({
              marginTop: spacing.xl,
              backgroundColor: pressed ? 'rgba(255,255,255,0.35)' : colors.white,
              paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999,
              flexDirection: 'row', alignItems: 'center', gap: 8,
            })}
          >
            <Ionicons name="refresh" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: fontSize.base, fontWeight: '800' }}>
              {ar ? 'تجديد الوقت (للأب/الأم)' : 'Renew time (parent)'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}>
          <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginBottom: spacing.md }}>
            {ar ? 'اختر قائمة تشغيل' : 'Choose a playlist'}
          </Text>
          {playlists.length === 0 ? (
            <View style={{ alignItems: 'center', padding: spacing.xl }}>
              <Ionicons name="list-outline" size={64} color="rgba(255,255,255,0.5)" />
              <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: spacing.sm }}>
                {ar ? 'لا توجد قوائم تشغيل' : 'No playlists yet'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {playlists.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => p.video_count > 0 && router.push({
                    pathname: '/playlist/[id]/play',
                    params: { id: p.id, kid: '1', childId },
                  })}
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
                      {p.video_count} {ar ? 'فيديو' : 'videos'}
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
              <Text style={{ fontWeight: '900', fontSize: fontSize.base, color: colors.grey900 }}>{ar ? 'الخروج من وضع الطفل' : 'Exit kid mode'}</Text>
              <View style={{ width: 24 }} />
            </View>

            <PinPad
              key={pinError ?? 'idle'}
              title={ar ? 'أدخل رمز PIN' : 'Enter PIN'}
              subtitle={ar ? 'للخروج من وضع الطفل' : 'to exit kid mode'}
              onComplete={tryExitWithPin}
              onBiometric={biometricAvailable ? tryExitWithBiometric : undefined}
              error={pinError}
              loading={verifying}
            />
          </View>
        </View>
      </Modal>

      {/* Renew modal — parent verifies and the session timer resets to full */}
      <Modal visible={renewOpen} animationType="fade" transparent onRequestClose={() => setRenewOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 16, paddingBottom: 16, width: '90%', maxWidth: 360 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }}>
              <Pressable onPress={() => { setRenewOpen(false); setPinError(null) }}>
                <Ionicons name="close" size={24} color={colors.grey700} />
              </Pressable>
              <Text style={{ fontWeight: '900', fontSize: fontSize.base, color: colors.grey900 }}>{ar ? 'تجديد وقت الجلسة' : 'Renew session time'}</Text>
              <View style={{ width: 24 }} />
            </View>
            <PinPad
              key={'renew-' + (pinError ?? 'idle')}
              title={ar ? 'أدخل رمز PIN' : 'Enter PIN'}
              subtitle={ar ? 'لتجديد الوقت' : 'to renew the time'}
              onComplete={tryRenewWithPin}
              onBiometric={biometricAvailable ? tryRenewWithBiometric : undefined}
              error={pinError}
              loading={verifying}
            />
          </View>
        </View>
      </Modal>
      {/* Rewarded ad prompt for free users — admin-controlled timer */}
      <RewardedAdPrompt visible={showRewardedPrompt} onDismiss={dismissRewardedPrompt} />
    </LinearGradient>
  )
}
