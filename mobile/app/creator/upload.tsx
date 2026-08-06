import { useState, useEffect, useRef } from 'react'
import {
  View, Text, Pressable, ScrollView, TextInput,
  ActivityIndicator, StatusBar, Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import KeyboardScreen from '@/components/KeyboardScreen'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import VideoTrimmer from '@/components/VideoTrimmer'
import { Video as VideoCompressor } from 'react-native-compressor'

type Step = 'picking' | 'trimming' | 'details'

export default function UploadScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const userId = useAuth((s) => s.user?.id)

  const [step, setStep] = useState<Step>('picking')
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [totalDuration, setTotalDuration] = useState(0)

  // Trim selection
  const [startSec, setStartSec] = useState(0)
  const [clipDuration, setClipDuration] = useState(30)

  // Details
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'compressing' | 'uploading' | 'done'>('idle')
  const cancelCompressId = useRef<string>('')
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  // ── Background compression state ──────────────────────────────────────────
  const [bgCompressedUri, setBgCompressedUri] = useState<string | null>(null)
  const [bgCompressProgress, setBgCompressProgress] = useState(0)
  const [bgCompressDone, setBgCompressDone] = useState(false)
  const bgCompressStarted = useRef(false)

  // Open picker on mount
  useEffect(() => { pickVideo() }, [])

  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Toast.show({ type: 'error', text1: 'يلزم الإذن بالوصول للفيديوهات' })
      router.back()
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      quality: 1,
    })

    if (result.canceled || !result.assets?.[0]) {
      router.back()
      return
    }

    const asset = result.assets[0]
    const dur = Math.round((asset.duration || 0) / 1000)
    setVideoUri(asset.uri)
    setTotalDuration(dur || 60)
    setClipDuration(Math.min(30, dur || 30))
    setStep('trimming')
  }

  const handleTrimConfirm = (start: number, duration: number) => {
    setStartSec(start)
    setClipDuration(duration)
    setStep('details')
    // Start compressing immediately in background while user fills title/tags
    startBackgroundCompression()
  }

  // ── Background compression (runs while user is on details screen) ─────────
  const startBackgroundCompression = async () => {
    if (!videoUri || bgCompressStarted.current) return
    bgCompressStarted.current = true
    try {
      const compressed = await VideoCompressor.compress(
        videoUri,
        {
          compressionMethod: 'auto',
          minimumFileSizeForCompress: 4,
          getCancellationId: (id) => { cancelCompressId.current = id },
        },
        (p: number) => setBgCompressProgress(Math.round(p * 100))
      )
      setBgCompressedUri(compressed)
      setBgCompressDone(true)
    } catch (err: any) {
      // Compression failed — we'll fall back to original on upload
      console.warn('[Upload] BG compress failed:', err?.message)
      setBgCompressedUri(videoUri)  // use original
      setBgCompressDone(true)
    }
  }

  // ── Wait for background compression to finish (usually instant if user took time on details) ─
  const waitForCompression = async (): Promise<string> => {
    // If already done, return immediately — typical happy path
    if (bgCompressedUri) return bgCompressedUri
    if (!bgCompressStarted.current) startBackgroundCompression()

    setUploadPhase('compressing')
    return new Promise<string>((resolve) => {
      const check = setInterval(() => {
        if (bgCompressedUri) { clearInterval(check); resolve(bgCompressedUri) }
        else setProgress(bgCompressProgress)
      }, 100)
    })
  }

  const uploadWithRetry = async (uri: string, url: string, maxRetries = 3) => {
    setUploadPhase('uploading')
    setProgress(0)
    let lastErr: any = null
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrRef.current = xhr
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
          })
          xhr.open('POST', url)
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
          xhr.onerror = () => reject(new Error('فشل الاتصال'))
          xhr.onabort = () => reject(new Error('تم الإلغاء'))
          xhr.ontimeout = () => reject(new Error('انتهت المهلة'))
          const form = new FormData()
          // @ts-ignore RN FormData accepts {uri,name,type}
          form.append('file', { uri, name: 'upload.mp4', type: 'video/mp4' })
          xhr.send(form)
        })
        return  // success
      } catch (err: any) {
        lastErr = err
        const msg = String(err?.message || '')
        // Don't retry on auth errors or user cancel
        if (msg.includes('4') || msg.includes('تم الإلغاء')) throw err
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))  // 2s, 4s
        }
      }
    }
    throw lastErr
  }

  const cancelUpload = () => {
    try { if (cancelCompressId.current) VideoCompressor.cancelCompression(cancelCompressId.current) } catch {}
    try { xhrRef.current?.abort() } catch {}
    setUploadPhase('idle')
    setUploading(false)
    setProgress(0)
  }

  const upload = async () => {
    if (!videoUri || !userId) return
    const finalTitle = title.trim() || `فيديو ${new Date().toLocaleString('ar-EG')}`
    const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean)

    setUploading(true)

    try {
      // STEP 1: Use the file already compressing in background
      const localFileUri = await waitForCompression()

      // STEP 2: Request upload URL from edge fn
      const { data: urlData, error: urlErr } = await supabase.functions.invoke(
        'creator-upload-url',
        {
          body: {
            title: finalTitle,
            tags: tagsArray,
            max_duration_seconds: Math.ceil(clipDuration),
            start_time_seconds: Math.floor(startSec),
          }
        }
      )
      if (urlErr) throw urlErr
      const uploadURL: string = urlData.upload_url

      // STEP 3: Upload compressed file with retry
      await uploadWithRetry(localFileUri, uploadURL, 3)

      setUploadPhase('done')
      setProgress(100)
      Toast.show({ type: 'success', text1: 'تم نشر الفيديو 🎬', text2: 'سيظهر بعد المراجعة' })
      setTimeout(() => router.back(), 800)
    } catch (err: any) {
      const isCancel = String(err?.message || '').includes('تم الإلغاء')
      if (!isCancel) {
        Toast.show({ type: 'error', text1: 'فشل الرفع', text2: err?.message || 'حدث خطأ' })
      }
      setUploadPhase('idle')
    } finally {
      setUploading(false)
    }
  }

  // ── Picking state ──────────────────────────────────────────────────────────
  if (step === 'picking' || !videoUri) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar hidden />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.white, marginTop: spacing.md }}>جاري فتح الجاليري...</Text>
      </View>
    )
  }

  // ── Trim state — fullscreen handled inside VideoTrimmer ───────────────────
  if (step === 'trimming') {
    return (
      <>
        <StatusBar hidden />
        <VideoTrimmer
          uri={videoUri}
          duration={totalDuration}
          onConfirm={handleTrimConfirm}
          onCancel={() => router.back()}
        />
      </>
    )
  }

  // ── Details state ──────────────────────────────────────────────────────────
  return (
    <KeyboardScreen variant="simple" backgroundColor={colors.grey900} edges={['top']}>
      <StatusBar hidden />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Preview info */}
        <View style={{ margin: spacing.lg, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.08)', padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="videocam" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>فيديو جاهز للرفع</Text>
              {bgCompressDone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100 }}>
                  <Ionicons name="checkmark-circle" size={11} color="#22C55E" />
                  <Text style={{ color: '#22C55E', fontSize: 10, fontWeight: '700' }}>محسّن</Text>
                </View>
              ) : bgCompressStarted.current ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(252,211,77,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100 }}>
                  <ActivityIndicator size="small" color="#FCD34D" />
                  <Text style={{ color: '#FCD34D', fontSize: 10, fontWeight: '700' }}>تحسين {bgCompressProgress}%</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: colors.grey400, fontSize: fontSize.sm, marginTop: 2 }}>
              من {fmtSec(startSec)} ← {fmtSec(startSec + clipDuration)} ({Math.round(clipDuration)}s)
            </Text>
          </View>
          <Pressable onPress={() => setStep('trimming')}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.sm }}>تعديل</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <View>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>عنوان الفيديو</Text>
            <TextInput
              value={title} onChangeText={setTitle}
              placeholder="أضف عنواناً للفيديو..."
              placeholderTextColor={colors.grey500}
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 14, color: '#fff', fontSize: fontSize.base, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
            />
          </View>
          <View>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>الهاشتاجات (مفصولة بفاصلة)</Text>
            <TextInput
              value={tags} onChangeText={setTags}
              placeholder="تعليم, أطفال, قصص..."
              placeholderTextColor={colors.grey500}
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 14, color: '#fff', fontSize: fontSize.base, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
            />
          </View>
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.95)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: insets.bottom + spacing.md, gap: spacing.sm }}
      >
        {uploading && (
          <View>
            <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginBottom: spacing.sm }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: uploadPhase === 'compressing' ? '#FCD34D' : colors.primary, borderRadius: 2 }} />
            </View>
            <Text style={{ color: colors.grey400, fontSize: fontSize.xs, textAlign: 'center' }}>
              {uploadPhase === 'compressing' && `جاري ضغط الفيديو... ${progress}%`}
              {uploadPhase === 'uploading'   && `جاري الرفع... ${progress}%`}
              {uploadPhase === 'done'        && `تم الرفع ✓`}
              {uploadPhase === 'idle'        && `جاري التحضير...`}
            </Text>
            {uploadPhase === 'compressing' && (
              <Text style={{ color: '#FCD34D', fontSize: 10, textAlign: 'center', marginTop: 2 }}>
                ضغط على الجهاز - رفع أسرع
              </Text>
            )}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {uploading ? (
            <Pressable onPress={cancelUpload} style={{ flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>إلغاء</Text>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={() => router.back()} style={{ flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>إلغاء</Text>
              </Pressable>
              <Pressable onPress={upload} style={{ flex: 2, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: colors.primary }}>
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.base }}>رفع الفيديو</Text>
              </Pressable>
            </>
          )}
        </View>
      </LinearGradient>
    </KeyboardScreen>
  )
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
