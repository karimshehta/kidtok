import { useEffect, useRef, useState } from 'react'
import {
  View, Text, Pressable, Dimensions, ActivityIndicator, StatusBar, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const MAX_DURATION_SEC = 30

export default function CameraRecordScreen() {
  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)

  const cameraRef = useRef<CameraView>(null)
  const [cameraPerm, requestCameraPerm] = useCameraPermissions()
  const [micPerm, requestMicPerm] = useMicrophonePermissions()
  const [facing, setFacing] = useState<'back' | 'front'>('back')
  const [flash, setFlash] = useState<'off' | 'on'>('off')

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recordedUri, setRecordedUri] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // ── Auto-stop timer ───────────────────────────────────────
  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => {
      setElapsed((e) => {
        const n = e + 1
        if (n >= MAX_DURATION_SEC) cameraRef.current?.stopRecording()
        return n
      })
    }, 1000)
    return () => clearInterval(t)
  }, [recording])

  // ── Request permissions on mount ──────────────────────────
  useEffect(() => {
    ;(async () => {
      if (!cameraPerm?.granted) await requestCameraPerm()
      if (!micPerm?.granted) await requestMicPerm()
    })()
  }, [])

  const startRecording = async () => {
    if (!cameraRef.current || recording) return
    setElapsed(0)
    setRecording(true)
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_DURATION_SEC })
      if (video?.uri) setRecordedUri(video.uri)
    } catch (err) {
      Toast.show({ type: 'error', text1: 'فشل التسجيل', text2: (err as Error).message })
    } finally {
      setRecording(false)
    }
  }

  const stopRecording = () => {
    if (recording) cameraRef.current?.stopRecording()
  }

  const retake = () => {
    setRecordedUri(null)
    setElapsed(0)
  }

  const upload = async () => {
    if (!recordedUri || !userId) return
    setUploading(true)
    try {
      const { data: urlData, error: urlErr } = await supabase.functions.invoke('creator-upload-url', {
        body: { duration_seconds: elapsed },
      })
      if (urlErr) throw urlErr

      const formData = new FormData()
      formData.append('file', { uri: recordedUri, name: 'video.mp4', type: 'video/mp4' } as any)

      const xhr = new XMLHttpRequest()
      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', urlData.upload_url)
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(formData)
      })

      const { error: insErr } = await supabase.from('creator_videos').insert({
        creator_id: userId,
        cloudflare_uid: urlData.uid,
        title: `Camera ${new Date().toLocaleString('ar-EG')}`,
        duration_seconds: elapsed,
        status: 'pending',
        recorded_in_app: true,
      })
      if (insErr) throw insErr

      Toast.show({ type: 'success', text1: '✓ تم رفع الفيديو', text2: 'سيظهر بعد المراجعة' })
      router.back()
    } catch (err) {
      Toast.show({ type: 'error', text1: 'فشل الرفع', text2: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }

  // ── Permission gate ───────────────────────────────────────
  if (!cameraPerm?.granted || !micPerm?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Ionicons name="camera-outline" size={80} color={colors.white} />
        <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: spacing.md, textAlign: 'center' }}>
          يحتاج الإذن بالكاميرا
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center' }}>
          الكاميرا والميكروفون مطلوبان للتسجيل
        </Text>
        <Pressable
          onPress={async () => { await requestCameraPerm(); await requestMicPerm() }}
          style={{ marginTop: spacing.xl, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill }}
        >
          <Text style={{ color: colors.white, fontWeight: '800' }}>السماح</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)' }}>إلغاء</Text>
        </Pressable>
      </View>
    )
  }

  // ── Preview mode — NO expo-video/expo-av (not available in Expo Go) ──
  // Shows a "recording done" UI instead of video playback
  if (recordedUri) {
    return (
      <LinearGradient colors={['#0a0a0a', '#1a1a1a']} style={{ flex: 1 }}>
        <StatusBar hidden />

        {/* Close */}
        <Pressable
          onPress={() => router.back()}
          style={{
            position: 'absolute', top: 48, left: spacing.md, zIndex: 10,
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={24} color={colors.white} />
        </Pressable>

        {/* Preview placeholder */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <View
            style={{
              width: 160, height: 160, borderRadius: 80,
              backgroundColor: 'rgba(3,187,229,0.15)',
              borderWidth: 4, borderColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: spacing.xl,
            }}
          >
            <Ionicons name="videocam" size={72} color={colors.primary} />
          </View>

          <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900', textAlign: 'center' }}>
            تم التسجيل ✓
          </Text>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              marginTop: spacing.sm,
              backgroundColor: 'rgba(255,255,255,0.1)',
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
            }}
          >
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '700' }}>
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} ثانية
            </Text>
          </View>

          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: fontSize.sm, marginTop: spacing.md, textAlign: 'center' }}>
            ملاحظة: معاينة الفيديو تحتاج نسخة dev build
          </Text>
        </View>

        {/* Buttons */}
        <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, paddingBottom: 48 }}>
          <Pressable
            onPress={retake}
            disabled={uploading}
            style={({ pressed }) => ({
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.1)',
              paddingVertical: spacing.md,
              borderRadius: radius.pill,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
              opacity: pressed || uploading ? 0.6 : 1,
            })}
          >
            <Ionicons name="refresh" size={20} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: '800' }}>إعادة</Text>
          </Pressable>

          <Pressable
            onPress={upload}
            disabled={uploading}
            style={({ pressed }) => ({
              flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              borderRadius: radius.pill,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {uploading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={22} color={colors.white} />
                <Text style={{ color: colors.white, fontWeight: '900', fontSize: fontSize.base }}>نشر</Text>
              </>
            )}
          </Pressable>
        </View>
      </LinearGradient>
    )
  }

  // ── Recording mode ────────────────────────────────────────
  const progress = Math.min(100, (elapsed / MAX_DURATION_SEC) * 100)

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <StatusBar hidden />

      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        flash={flash}
        mode="video"
      />

      {/* Top bar */}
      <View
        style={{
          position: 'absolute', top: 48, left: 0, right: 0,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>

        {/* Timer badge */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: recording ? 'rgba(220,38,38,0.9)' : 'rgba(0,0,0,0.55)',
            paddingHorizontal: spacing.md, paddingVertical: 6,
            borderRadius: radius.pill,
          }}
        >
          {recording && (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white }} />
          )}
          <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.sm }}>
            {recording
              ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
              : '30 ثانية max'}
          </Text>
        </View>

        {/* Flash */}
        <Pressable
          onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons
            name={flash === 'on' ? 'flash' : 'flash-off'}
            size={22}
            color={flash === 'on' ? '#FBBF24' : colors.white}
          />
        </Pressable>
      </View>

      {/* Progress bar at top when recording */}
      {recording && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <View style={{ height: '100%', width: `${progress}%`, backgroundColor: '#EF4444' }} />
        </View>
      )}

      {/* Bottom controls */}
      <View
        style={{
          position: 'absolute', bottom: 48, left: 0, right: 0,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
          paddingHorizontal: spacing.xl,
        }}
      >
        <View style={{ width: 52 }} />

        {/* Record / Stop */}
        <Pressable
          onPress={recording ? stopRecording : startRecording}
          style={({ pressed }) => ({
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colors.white,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: pressed ? 0.93 : 1 }],
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
          })}
        >
          <View
            style={{
              width: recording ? 30 : 62,
              height: recording ? 30 : 62,
              borderRadius: recording ? 6 : 31,
              backgroundColor: '#EF4444',
            }}
          />
        </Pressable>

        {/* Flip camera */}
        <Pressable
          onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
          style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="camera-reverse" size={26} color={colors.white} />
        </Pressable>
      </View>
    </View>
  )
}
