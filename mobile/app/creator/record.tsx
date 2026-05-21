import { useEffect, useRef, useState } from 'react'
import {
  View, Text, Pressable, Dimensions, ActivityIndicator, StatusBar, Alert, Modal,
} from 'react-native'
import { useRouter } from 'expo-router'
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { ResizeMode, Video } from 'expo-av'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const MAX_DURATION_SEC = 30

export default function CameraRecordScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'

  const router = useRouter()
  const userId = useAuth((s) => s.user?.id)

  const cameraRef = useRef<CameraView>(null)
  const [cameraPerm, requestCameraPerm] = useCameraPermissions()
  const [micPerm, requestMicPerm] = useMicrophonePermissions()
  const [facing, setFacing] = useState<'back' | 'front'>('back')
  const [flash, setFlash] = useState<'off' | 'on'>('off')

  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Tick timer while recording
  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => {
      setElapsed((e) => {
        const n = e + 1
        if (n >= MAX_DURATION_SEC) {
          // Auto-stop at 30s
          cameraRef.current?.stopRecording()
        }
        return n
      })
    }, 1000)
    return () => clearInterval(t)
  }, [recording])

  // Request permissions on mount
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
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SEC,
      })
      if (video?.uri) setVideoUri(video.uri)
    } catch (err) {
      Toast.show({ type: 'error', text1: ar ? 'فشل التسجيل' : 'Recording failed', text2: (err as Error).message })
    } finally {
      setRecording(false)
    }
  }

  const stopRecording = () => {
    if (!recording) return
    cameraRef.current?.stopRecording()
  }

  const retake = () => {
    setVideoUri(null)
    setElapsed(0)
  }

  const upload = async () => {
    if (!videoUri || !userId) return
    setUploading(true)
    try {
      // 1. Get a Cloudflare Stream one-time upload URL from our Edge Function
      const { data: urlData, error: urlErr } = await supabase.functions.invoke(
        'creator-upload-url',
        { body: { duration_seconds: elapsed } }
      )
      if (urlErr) throw urlErr
      const uploadURL: string = urlData.upload_url
      const uid: string = urlData.uid

      // 2. PUT the video file to Cloudflare
      const fileResp = await fetch(videoUri)
      const blob = await fileResp.blob()

      const xhr = new XMLHttpRequest()
      await new Promise<void>((resolve, reject) => {
        xhr.open('POST', uploadURL)
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        const formData = new FormData()
        // @ts-ignore — RN FormData accepts this shape
        formData.append('file', { uri: videoUri, name: 'video.mp4', type: 'video/mp4' })
        xhr.send(formData)
      })

      // 3. Save creator_video row (status='pending' — webhook flips to 'ready')
      const { error: insErr } = await supabase.from('creator_videos').insert({
        creator_id: userId,
        cloudflare_uid: uid,
        title: `Camera ${new Date().toLocaleString('ar-EG')}`,
        duration_seconds: elapsed,
        status: 'pending',
        recorded_in_app: true,
      })
      if (insErr) throw insErr

      Toast.show({
        type: 'success',
        text1: ar ? 'تم رفع الفيديو ✓' : 'Video uploaded ✓',
        text2: ar ? 'سيظهر بعد المراجعة' : 'Will appear after review',
      })
      router.back()
    } catch (err) {
      Toast.show({ type: 'error', text1: ar ? 'فشل الرفع' : 'Upload failed', text2: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }

  // Permission gate
  if (!cameraPerm?.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Ionicons name="camera-outline" size={80} color={colors.white} />
        <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: spacing.md, textAlign: 'center' }}>
          {ar ? 'يحتاج التطبيق إلى الكاميرا والميكروفون' : 'Camera & Microphone Permission Required'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center' }}>
          {ar ? 'نحتاج الإذن للوصول للكاميرا والميكروفون لتسجيل الفيديوهات' : 'We need access to your camera and microphone to record videos'}
        </Text>
        <Pressable
          onPress={async () => {
            await requestCameraPerm()
            await requestMicPerm()
          }}
          style={{
            marginTop: spacing.xl,
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.md,
            borderRadius: radius.pill,
          }}
        >
          <Text style={{ color: colors.white, fontWeight: '800' }}>{ar ? 'السماح' : 'Allow'}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)' }}>{ar ? 'إلغاء' : 'Cancel'}</Text>
        </Pressable>
      </View>
    )
  }

  // ── Preview mode (after recording, before upload)
  if (videoUri) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black }}>
        <StatusBar hidden />
        <Video
          source={{ uri: videoUri }}
          style={{ flex: 1 }}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          useNativeControls={false}
        />

        {/* Top: close */}
        <Pressable
          onPress={() => router.back()}
          style={{
            position: 'absolute', top: 48, left: spacing.md,
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>

        {/* Bottom: retake + post */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
            paddingBottom: 50,
            flexDirection: 'row',
            gap: spacing.md,
          }}
        >
          <Pressable
            onPress={retake}
            disabled={uploading}
            style={{
              flex: 1,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.15)',
              paddingVertical: spacing.md,
              borderRadius: radius.pill,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
              opacity: uploading ? 0.5 : 1,
            }}
          >
            <Ionicons name="refresh" size={20} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: '800' }}>{ar ? 'إعادة' : 'Retake'}</Text>
          </Pressable>

          <Pressable
            onPress={upload}
            disabled={uploading}
            style={{
              flex: 2,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              borderRadius: radius.pill,
            }}
          >
            {uploading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={22} color={colors.white} />
                <Text style={{ color: colors.white, fontWeight: '900', fontSize: fontSize.base }}>
                  {ar ? 'نشر' : 'Post'}
                </Text>
              </>
            )}
          </Pressable>
        </LinearGradient>
      </View>
    )
  }

  // ── Recording mode
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
        videoQuality="720p"
      />

      {/* Top bar */}
      <View
        style={{
          position: 'absolute',
          top: 48, left: 0, right: 0,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>

        {/* Recording indicator + timer */}
        {recording ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(220, 38, 38, 0.9)',
              paddingHorizontal: spacing.sm + 4,
              paddingVertical: 6,
              borderRadius: radius.pill,
              gap: 6,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white }} />
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.sm }}>
              {String(Math.floor(elapsed / 60)).padStart(1, '0')}:{String(elapsed % 60).padStart(2, '0')}
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: 'rgba(0,0,0,0.55)',
              paddingHorizontal: spacing.sm + 4,
              paddingVertical: 6,
              borderRadius: radius.pill,
            }}
          >
            <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.sm }}>
              30 ثانية
            </Text>
          </View>
        )}

        {/* Flash toggle */}
        <Pressable
          onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons
            name={flash === 'on' ? 'flash' : 'flash-off'}
            size={22}
            color={flash === 'on' ? '#FBBF24' : colors.white}
          />
        </Pressable>
      </View>

      {/* Progress ring around record button */}
      {recording && (
        <View
          style={{
            position: 'absolute',
            bottom: 95,
            left: SCREEN_WIDTH / 2 - 45,
            width: 90, height: 90,
            borderRadius: 45,
            borderWidth: 4,
            borderColor: 'rgba(255,255,255,0.3)',
            overflow: 'hidden',
          }}
        >
          {/* Simple half-circle fill */}
          <View
            style={{
              position: 'absolute',
              left: 0, right: 0, bottom: 0,
              height: `${progress}%`,
              backgroundColor: 'rgba(220, 38, 38, 0.6)',
            }}
          />
        </View>
      )}

      {/* Bottom controls */}
      <View
        style={{
          position: 'absolute',
          bottom: 40, left: 0, right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: spacing.xl,
        }}
      >
        {/* Spacer for symmetry */}
        <View style={{ width: 52 }} />

        {/* Record / Stop button */}
        <Pressable
          onPress={recording ? stopRecording : startRecording}
          style={({ pressed }) => ({
            width: 80, height: 80,
            borderRadius: 40,
            backgroundColor: colors.white,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <View
            style={{
              width: recording ? 32 : 64,
              height: recording ? 32 : 64,
              borderRadius: recording ? 8 : 32,
              backgroundColor: '#EF4444',
            }}
          />
        </Pressable>

        {/* Flip camera */}
        <Pressable
          onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
          style={{
            width: 52, height: 52, borderRadius: 26,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="camera-reverse" size={26} color={colors.white} />
        </Pressable>
      </View>
    </View>
  )
}
