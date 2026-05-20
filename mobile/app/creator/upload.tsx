import { useState, useEffect } from 'react'
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
  }

  const upload = async () => {
    if (!videoUri || !userId) return
    const finalTitle = title.trim() || `فيديو ${new Date().toLocaleString('ar-EG')}`
    const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean)

    setUploading(true)
    setProgress(0)

    try {
      // 1. Get Cloudflare upload URL (pass startSec + duration for server-side trim)
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

      // 2. Upload via XHR with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        })
        xhr.open('POST', uploadURL)
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('فشل الاتصال'))
        const form = new FormData()
        // @ts-ignore
        form.append('file', { uri: videoUri, name: 'upload.mp4', type: 'video/mp4' })
        xhr.send(form)
      })

      setProgress(100)
      Toast.show({ type: 'success', text1: '✅ تم رفع الفيديو', text2: 'سيظهر بعد المراجعة' })
      router.back()
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'فشل الرفع', text2: err.message })
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
            <Text style={{ color: '#fff', fontWeight: '800' }}>فيديو جاهز للرفع</Text>
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
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 2 }} />
            </View>
            <Text style={{ color: colors.grey400, fontSize: fontSize.xs, textAlign: 'center' }}>
              جاري الرفع... {progress}%
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable onPress={() => router.back()} disabled={uploading} style={{ flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>إلغاء</Text>
          </Pressable>
          <Pressable onPress={upload} disabled={uploading} style={{ flex: 2, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, opacity: uploading ? 0.7 : 1 }}>
            {uploading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="cloud-upload" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.base }}>رفع الفيديو</Text>
              </>
            )}
          </Pressable>
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
