import { useState, useEffect, useRef } from 'react'
import {
  View, Text, Pressable, ScrollView, TextInput,
  ActivityIndicator, StatusBar, Alert, I18nManager,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import KeyboardScreen from '@/components/KeyboardScreen'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import Toast from 'react-native-toast-message'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import VideoTrimmer from '@/components/VideoTrimmer'
import { Video as VideoCompressor } from 'react-native-compressor'
import { useQueryClient } from '@tanstack/react-query'
import {
  creatorUploadFunctionErrorMessage,
  ensureCreatorUploadQuota,
  isCreatorUploadLimitError,
} from '@/lib/creatorUploadQuota'
import CreatorUploadLimitGate from '@/components/CreatorUploadLimitGate'
import ChildSafetyReminderModal from '@/components/ChildSafetyReminderModal'
import { trimVideoSegment } from '@/lib/videoTrim'
import KidAvatarFaceMask from '@/components/KidAvatarFaceMask'
import { getKidAvatar } from '@/lib/kidAvatars'
import { detectPersonalInfoRisk, hasSeenChildSafetyReminder, markChildSafetyReminderSeen } from '@/lib/childSafety'
import {
  completeCreatorR2Upload,
  getCreatorUploadFunctionName,
  maybeCreateCreatorVideoThumbnail,
  uploadVideoFileWithRetry,
  type CreatorUploadMethod,
} from '@/lib/creatorUploadStorage'
import { cleanupKidVoiceEffectFile, isKidVoiceEffectUnavailable, requireKidVoiceEffect } from '@/lib/kidVideoEffects'
import {
  finalizeKidVoiceUse,
  isVoiceUseServiceUnavailable,
  releaseKidVoiceUse,
  reserveKidVoiceUse,
  type VoiceAccessMethod,
} from '@/lib/voiceUse'

type Step = 'picking' | 'trimming' | 'details'
type UploadPhase = 'idle' | 'compressing' | 'voice' | 'uploading' | 'finishing' | 'done'

const MAX_UPLOAD_DURATION_SEC = 30
const MIN_UPLOAD_DURATION_SEC = 1
const SAME_SELECTION_EPSILON_SEC = 0.25

export default function UploadScreen() {
  const router = useRouter()
  const { avatarId, avatarAccessMethod, avatarFlow, voiceKey, voiceAccessMethod, sourceUri, sourceDurationSeconds } = useLocalSearchParams<{
    avatarId?: string
    avatarAccessMethod?: 'free' | 'reward' | 'coins'
    avatarFlow?: string
    voiceKey?: string
    voiceAccessMethod?: VoiceAccessMethod
    sourceUri?: string
    sourceDurationSeconds?: string
  }>()
  // Legacy KidTok WebAR masks are disabled. Deep links with avatar params
  // should behave like a normal gallery upload until Snap Camera Kit replaces
  // the experiment.
  const isAvatarUpload = Boolean(false && avatarId)
  const kidAvatar = getKidAvatar(avatarId)
  const selectedVoiceKey = voiceKey && voiceKey !== 'none' ? voiceKey : null
  const insets = useSafeAreaInsets()
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

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
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [quotaGateVisible, setQuotaGateVisible] = useState(false)
  const [safetyVisible, setSafetyVisible] = useState(false)
  const [personalInfoRisk, setPersonalInfoRisk] = useState<ReturnType<typeof detectPersonalInfoRisk>>(null)
  const cancelCompressId = useRef<string>('')
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const avatarCreatorVideoIdRef = useRef<string | null>(null)
  const voiceUseEventIdRef = useRef<string | null>(null)
  // ── Background compression state ──────────────────────────────────────────
  const [bgCompressedUri, setBgCompressedUri] = useState<string | null>(null)
  const [bgCompressProgress, setBgCompressProgress] = useState(0)
  const [bgCompressDone, setBgCompressDone] = useState(false)
  const bgCompressStarted = useRef(false)
  // Refs mirror the state values so setInterval callbacks don't capture stale closures
  const bgCompressedUriRef = useRef<string | null>(null)
  const bgCompressProgressRef = useRef(0)
  const bgCompressErrorRef = useRef<Error | null>(null)
  const bgCompressRunIdRef = useRef(0)
  const trimSelectionRef = useRef({ startSec: 0, durationSec: MAX_UPLOAD_DURATION_SEC })

  // Open picker on mount, unless a recorded clip was passed by Snap Camera Kit.
  useEffect(() => {
    if (sourceUri) {
      const duration = Math.max(
        MIN_UPLOAD_DURATION_SEC,
        Math.min(MAX_UPLOAD_DURATION_SEC, Math.round(Number(sourceDurationSeconds) || MAX_UPLOAD_DURATION_SEC)),
      )
      ;(async () => {
        try {
          await ensureCreatorUploadQuota(I18nManager.isRTL)
          resetBackgroundCompression()
          setVideoUri(sourceUri)
          setTotalDuration(duration)
          trimSelectionRef.current = { startSec: 0, durationSec: duration }
          setStartSec(0)
          setClipDuration(duration)
          setStep('trimming')
        } catch (err: any) {
          if (isCreatorUploadLimitError(err)) {
            setQuotaGateVisible(true)
            return
          }
          Toast.show({
            type: 'error',
            text1: I18nManager.isRTL ? 'لا يمكن رفع فيديو الآن' : 'Upload unavailable',
            text2: err?.message || (I18nManager.isRTL ? 'جرّب تاني بعد شوية' : 'Please try again'),
          })
          router.back()
        }
      })()
      return
    }

    pickVideo()
  }, [])

  const resetBackgroundCompression = () => {
    bgCompressRunIdRef.current += 1
    try { if (cancelCompressId.current) VideoCompressor.cancelCompression(cancelCompressId.current) } catch {}
    cancelCompressId.current = ''
    bgCompressStarted.current = false
    bgCompressedUriRef.current = null
    bgCompressProgressRef.current = 0
    bgCompressErrorRef.current = null
    setBgCompressedUri(null)
    setBgCompressProgress(0)
    setBgCompressDone(false)
  }

  const pickVideo = async () => {
    resetBackgroundCompression()

    try {
      await ensureCreatorUploadQuota(I18nManager.isRTL)
    } catch (err: any) {
      if (isCreatorUploadLimitError(err)) {
        setQuotaGateVisible(true)
        return
      }
      Toast.show({
        type: 'error',
        text1: I18nManager.isRTL ? 'لا يمكن رفع فيديو الآن' : 'Upload unavailable',
        text2: err?.message || (I18nManager.isRTL ? 'وصلت لحد باقتك' : 'Plan limit reached'),
      })
      router.back()
      return
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Toast.show({ type: 'error', text1: I18nManager.isRTL ? 'يلزم الإذن بالوصول للفيديوهات' : 'Video library access is required' })
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
    trimSelectionRef.current = { startSec: 0, durationSec: Math.min(MAX_UPLOAD_DURATION_SEC, dur || MAX_UPLOAD_DURATION_SEC) }
    setStartSec(0)
    setClipDuration(trimSelectionRef.current.durationSec)
    setStep('trimming')
  }

  const handleTrimConfirm = (start: number, duration: number) => {
    const sourceDuration = totalDuration || start + duration
    const safeStart = Math.min(
      Math.max(0, start),
      Math.max(0, sourceDuration - MIN_UPLOAD_DURATION_SEC)
    )
    const maxDurationFromStart = Math.max(MIN_UPLOAD_DURATION_SEC, sourceDuration - safeStart)
    const safeDuration = Math.min(
      MAX_UPLOAD_DURATION_SEC,
      Math.max(MIN_UPLOAD_DURATION_SEC, duration),
      maxDurationFromStart
    )

    resetBackgroundCompression()
    trimSelectionRef.current = { startSec: safeStart, durationSec: safeDuration }
    setStartSec(safeStart)
    setClipDuration(safeDuration)
    setStep('details')
    // Start compressing immediately in background while user fills title/tags
    void prepareSelectedVideo(safeStart, safeDuration)
  }

  // ── Background compression (runs while user is on details screen) ─────────
  // Pipeline: original → TRIM to [startSec, startSec+clipDuration] → COMPRESS.
  // The trim step ensures Cloudflare only receives the chosen segment, fixing
  // both the upload speed and the "video duration exceeded" account constraint.
  const startBackgroundCompression = async () => {
    if (!videoUri || bgCompressStarted.current) return
    bgCompressStarted.current = true
    try {
      // 1) TRIM — keep only the chosen [startSec, startSec+clipDuration] slice.
      // MANDATORY: if native trim fails or isn't available we abort the entire
      // upload so we never send the full untrimmed video to Cloudflare (which
      // is slow + would be rejected by the account duration constraint).
      let trimmedUri: string
      try {
        const result = await trimVideoSegment(
          videoUri,
          Math.max(0, Math.floor(startSec * 1000)),
          Math.max(1, Math.floor((startSec + clipDuration) * 1000))
        )
        if (typeof result !== 'string' || !result) {
          throw new Error('trim returned no path')
        }
        trimmedUri = result
      } catch (trimErr: any) {
        const msg = String(trimErr?.message || trimErr)
        throw new Error(
          (I18nManager.isRTL
            ? `فشل اقتصاص الفيديو — تأكد أن البيلد الأخير مفعّل به الميزة. (${msg})`
            : `Video trim failed — make sure the latest build includes the native trim module. (${msg})`)
        )
      }

      // 2) COMPRESS the trimmed result
      const compressed = await VideoCompressor.compress(
        trimmedUri,
        {
          compressionMethod: 'auto',
          minimumFileSizeForCompress: 4,
          getCancellationId: (id) => { cancelCompressId.current = id },
        },
        (p: number) => { const pct = Math.round(p * 100); bgCompressProgressRef.current = pct; setBgCompressProgress(pct) }
      )
      bgCompressedUriRef.current = compressed
      setBgCompressedUri(compressed)
      setBgCompressDone(true)
    } catch (err: any) {
      // Compression failed — fall back to original
      console.warn('[Upload] BG compress failed:', err?.message)
      bgCompressedUriRef.current = videoUri
      setBgCompressedUri(videoUri)
      setBgCompressDone(true)
    }
  }

  // ── Wait for background compression to finish (usually instant if user took time on details) ─
  // Compression contributes 0–30% of the combined progress bar.
  const prepareSelectedVideo = async (
    selectedStartSec = trimSelectionRef.current.startSec,
    selectedDurationSec = trimSelectionRef.current.durationSec
  ) => {
    const sourceUri = videoUri
    if (!sourceUri || bgCompressStarted.current) return

    const runId = ++bgCompressRunIdRef.current
    bgCompressStarted.current = true
    bgCompressErrorRef.current = null

    const sourceDuration = Math.max(totalDuration || 0, selectedStartSec + selectedDurationSec)
    const safeStartSec = Math.min(
      Math.max(0, selectedStartSec),
      Math.max(0, sourceDuration - MIN_UPLOAD_DURATION_SEC)
    )
    const safeDurationSec = Math.min(
      MAX_UPLOAD_DURATION_SEC,
      Math.max(MIN_UPLOAD_DURATION_SEC, selectedDurationSec),
      Math.max(MIN_UPLOAD_DURATION_SEC, sourceDuration - safeStartSec)
    )
    const safeEndSec = Math.min(sourceDuration, safeStartSec + safeDurationSec)
    const selectedFullSource =
      safeStartSec <= SAME_SELECTION_EPSILON_SEC &&
      safeEndSec >= sourceDuration - SAME_SELECTION_EPSILON_SEC &&
      sourceDuration <= MAX_UPLOAD_DURATION_SEC
    const needsTrim = !selectedFullSource

    try {
      let preparedUri = sourceUri

      if (needsTrim) {
        const trimmed = await trimVideoSegment(
          sourceUri,
          Math.max(0, Math.floor(safeStartSec * 1000)),
          Math.max(1, Math.floor(safeEndSec * 1000))
        )
        if (typeof trimmed !== 'string' || !trimmed.trim()) {
          throw new Error('Video trim returned no file')
        }
        preparedUri = trimmed
      }

      let finalUri = preparedUri
      try {
        finalUri = await VideoCompressor.compress(
          preparedUri,
          {
            compressionMethod: 'auto',
            minimumFileSizeForCompress: 0,
            getCancellationId: (id) => { cancelCompressId.current = id },
          },
          (p: number) => {
            if (runId !== bgCompressRunIdRef.current) return
            const pct = Math.round(p * 100)
            bgCompressProgressRef.current = pct
            setBgCompressProgress(pct)
          }
        )
      } catch (compressErr: any) {
        console.warn('[Upload] Compression failed, using trimmed clip:', compressErr?.message)
        finalUri = preparedUri
      }

      if (runId !== bgCompressRunIdRef.current) return
      bgCompressedUriRef.current = finalUri
      setBgCompressedUri(finalUri)
      setBgCompressDone(true)
    } catch (err: any) {
      if (runId !== bgCompressRunIdRef.current) return
      const error = err instanceof Error ? err : new Error(String(err?.message || err || 'Video preparation failed'))
      console.warn('[Upload] Video preparation failed:', error.message)
      bgCompressErrorRef.current = error
      setBgCompressDone(true)
    }
  }

  const COMPRESS_WEIGHT = 25
  const UPLOAD_WEIGHT   = 65
  const FINISHING_PROGRESS = 92

  const waitForCompression = async (): Promise<string> => {
    if (bgCompressedUriRef.current) {
      // Already compressed — skip directly to the upload weight
      setProgress(COMPRESS_WEIGHT)
      return bgCompressedUriRef.current
    }
    if (bgCompressErrorRef.current) throw bgCompressErrorRef.current
    if (!bgCompressStarted.current) void prepareSelectedVideo()

    setUploadPhase('compressing')
    return new Promise<string>((resolve, reject) => {
      const check = setInterval(() => {
        const prepError = bgCompressErrorRef.current
        if (prepError) {
          clearInterval(check)
          reject(prepError)
        } else if (bgCompressedUriRef.current) {
          clearInterval(check)
          setProgress(COMPRESS_WEIGHT)
          resolve(bgCompressedUriRef.current)
        } else {
          // Map compress 0–100 → combined 0–COMPRESS_WEIGHT
          setProgress(Math.round((bgCompressProgressRef.current / 100) * COMPRESS_WEIGHT))
        }
      }, 100)
    })
  }

  const uploadWithRetry = async (uri: string, url: string, maxRetries = 3) => {
    setUploadPhase('uploading')
    // Don't reset progress to 0 — keep the compression's 30% baseline
    setProgress(COMPRESS_WEIGHT)
    let lastErr: any = null
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhrRef.current = xhr
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              // Map upload 0–100 → combined COMPRESS_WEIGHT–100
              const uploadPct = (e.loaded / e.total) * 100
              setProgress(Math.min(100, Math.round(COMPRESS_WEIGHT + (uploadPct / 100) * UPLOAD_WEIGHT)))
            }
          })
          xhr.open('POST', url)
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
          xhr.onerror = () => reject(new Error(I18nManager.isRTL ? 'فشل الاتصال' : 'Connection failed'))
          xhr.onabort = () => reject(new Error(I18nManager.isRTL ? 'تم الإلغاء' : 'Cancelled'))
          xhr.ontimeout = () => reject(new Error(I18nManager.isRTL ? 'انتهت المهلة' : 'Timed out'))
          const form = new FormData()
          // @ts-ignore RN FormData accepts {uri,name,type}
          form.append('file', { uri: toFormDataUri(uri), name: 'upload.mp4', type: 'video/mp4' })
          xhr.send(form)
        })
        return  // success
      } catch (err: any) {
        lastErr = err
        const msg = String(err?.message || '')
        if (msg.includes('4') || msg.includes('تم الإلغاء')) throw err
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))  // 2s, 4s
        }
      }
    }
    throw lastErr
  }

  const uploadPreparedVideoWithRetry = async (
    uri: string,
    url: string,
    method: CreatorUploadMethod = 'POST',
    maxRetries = 3,
    baseProgress = COMPRESS_WEIGHT
  ) => {
    setUploadPhase('uploading')
    setProgress(baseProgress)
    return uploadVideoFileWithRetry({
      uri,
      url,
      method,
      maxRetries,
      rtl: I18nManager.isRTL,
      onXhr: (xhr) => { xhrRef.current = xhr },
      onProgress: (uploadPct) => {
        setProgress(Math.min(90, Math.round(baseProgress + (uploadPct / 100) * (90 - baseProgress))))
      },
    })
  }

  const cancelAvatarUploadReservation = async () => {
    const creatorVideoId = avatarCreatorVideoIdRef.current
    if (!isAvatarUpload || !creatorVideoId) return
    avatarCreatorVideoIdRef.current = null
    try {
      await supabase.functions.invoke('avatar-upload-cancel', {
        body: { creator_video_id: creatorVideoId },
      })
      qc.invalidateQueries({ queryKey: ['avatar-reward-credits'] })
      qc.invalidateQueries({ queryKey: ['avatar-ownerships'] })
      qc.invalidateQueries({ queryKey: ['coins'] })
    } catch {}
  }

  const cancelVoiceUseReservation = async () => {
    const eventId = voiceUseEventIdRef.current
    if (!eventId) return
    voiceUseEventIdRef.current = null
    try {
      await releaseKidVoiceUse(eventId)
      qc.invalidateQueries({ queryKey: ['voice-reward-credits'] })
      qc.invalidateQueries({ queryKey: ['voice-ownerships'] })
      qc.invalidateQueries({ queryKey: ['coins'] })
    } catch {}
  }

  const cancelUpload = () => {
    resetBackgroundCompression()
    try { xhrRef.current?.abort() } catch {}
    void cancelAvatarUploadReservation()
    void cancelVoiceUseReservation()
    setUploadPhase('idle')
    setUploading(false)
    setProgress(0)
  }

  const upload = async () => {
    if (!videoUri || !userId) return
    const finalTitle = title.trim()
    const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean)
    const risk = detectPersonalInfoRisk(`${finalTitle}\n${tagsArray.join('\n')}`)
    if (risk) {
      setPersonalInfoRisk(risk)
      return
    }

    const seenSafety = await hasSeenChildSafetyReminder(userId, 'video')
    if (!seenSafety) {
      setSafetyVisible(true)
      return
    }

    const uploadSelection = trimSelectionRef.current
    let generatedVoiceUri: string | null = null
    let voiceReservationAvailable = false
    let uploadCommitted = false

    setUploading(true)

    try {
      await ensureCreatorUploadQuota(I18nManager.isRTL)

      // STEP 1: Use the file already compressing in background
      const localFileUri = await waitForCompression()
      let uploadFileUri = localFileUri
      const prepareWeight = selectedVoiceKey ? 35 : COMPRESS_WEIGHT
      if (selectedVoiceKey) {
        setUploadPhase('voice')
        setProgress(Math.max(COMPRESS_WEIGHT + 1, 28))
        const voicedUri = await requireKidVoiceEffect(localFileUri, selectedVoiceKey)
        generatedVoiceUri = voicedUri
        uploadFileUri = voicedUri
        setProgress(prepareWeight)
      }

      if (selectedVoiceKey) {
        try {
          const reservation = await reserveKidVoiceUse({
            voiceId: selectedVoiceKey,
            accessMethod: voiceAccessMethod,
            ar: I18nManager.isRTL,
          })
          voiceUseEventIdRef.current = reservation.eventId
          voiceReservationAvailable = true
        } catch (voiceError) {
          if (isVoiceUseServiceUnavailable(voiceError)) {
            console.warn('[Upload] voice reservation service is not deployed; using legacy metadata path')
          } else {
            throw voiceError
          }
        }
      }

      // STEP 2: Request upload URL from edge fn
      const uploadFunctionName = await getCreatorUploadFunctionName(isAvatarUpload)
      const { data: urlData, error: urlErr } = await supabase.functions.invoke(
        uploadFunctionName,
        {
          body: {
            title: finalTitle,
            tags: tagsArray,
            max_duration_seconds: Math.ceil(Math.min(MAX_UPLOAD_DURATION_SEC, uploadSelection.durationSec)),
            start_time_seconds: Math.floor(uploadSelection.startSec),
            ...(isAvatarUpload ? {
              avatar_id: avatarId,
              access_method: avatarAccessMethod,
              voice_key: selectedVoiceKey,
              kid_avatar_sound_key: selectedVoiceKey,
            } : {}),
          }
        }
      )
      if (urlErr) throw new Error(await creatorUploadFunctionErrorMessage(urlErr, I18nManager.isRTL))
      const uploadURL: string = urlData.upload_url
      if (isAvatarUpload) avatarCreatorVideoIdRef.current = urlData.creator_video_id || null
      const uploadMethod: CreatorUploadMethod = urlData.upload_method === 'PUT' ? 'PUT' : 'POST'

      // STEP 3: Upload compressed file with retry
      const uploadResult = await uploadPreparedVideoWithRetry(uploadFileUri, uploadURL, uploadMethod, 3, prepareWeight)
      setUploadPhase('finishing')
      setProgress(FINISHING_PROGRESS)
      const thumbnail = urlData.storage_provider === 'r2'
        ? await maybeCreateCreatorVideoThumbnail(uploadFileUri)
        : null
      setProgress(96)
      await completeCreatorR2Upload(
        urlData,
        Math.ceil(Math.min(MAX_UPLOAD_DURATION_SEC, uploadSelection.durationSec)),
        uploadResult?.sizeBytes,
        thumbnail
      )
      uploadCommitted = true

      if (urlData.creator_video_id) {
        try {
          await finalizeKidVoiceUse({
            creatorVideoId: String(urlData.creator_video_id),
            eventId: voiceUseEventIdRef.current,
            ar: I18nManager.isRTL,
          })
          voiceUseEventIdRef.current = null
        } catch (voiceError) {
          if (isVoiceUseServiceUnavailable(voiceError) || !voiceReservationAvailable) {
            await syncAvatarVoiceChoice(String(urlData.creator_video_id), selectedVoiceKey)
          } else {
            // The media is already committed. Keep the video and only clean
            // up the metering reservation if finalization has a transient
            // failure.
            console.warn('[Upload] Voice finalization failed after upload commit:', voiceError)
            if (voiceUseEventIdRef.current) {
              await releaseKidVoiceUse(voiceUseEventIdRef.current).catch(() => {})
              voiceUseEventIdRef.current = null
            }
          }
        }
      }
      avatarCreatorVideoIdRef.current = null

      setUploadPhase('done')
      setProgress(100)
      // Refresh the profile grid right away so the new tile shows up with
      // its "Processing" / "Under review" badge — no need to wait for the
      // 5s poll or for Cloudflare to finish encoding.
      qc.invalidateQueries({ queryKey: ['my-videos', userId] })
      qc.invalidateQueries({ queryKey: ['creator-upload-quota', userId] })
      if (isAvatarUpload) {
        qc.invalidateQueries({ queryKey: ['avatar-reward-credits'] })
        qc.invalidateQueries({ queryKey: ['avatar-ownerships'] })
        qc.invalidateQueries({ queryKey: ['coins'] })
      }
      if (selectedVoiceKey) {
        qc.invalidateQueries({ queryKey: ['voice-reward-credits'] })
        qc.invalidateQueries({ queryKey: ['voice-ownerships'] })
        qc.invalidateQueries({ queryKey: ['coins'] })
      }
      Toast.show({
        type: 'kidReward',
        text1: 'تم نشر الفيديو 🎬',
        text2: 'هيظهر بعد المراجعة',
        props: { icon: '🎬', accent: 'blue' },
      })
      setTimeout(() => {
        if (avatarFlow === '1') router.dismissTo('/(tabs)/profile')
        else router.back()
      }, 800)
    } catch (err: any) {
      if (!uploadCommitted) await cancelAvatarUploadReservation()
      await cancelVoiceUseReservation()
      if (isCreatorUploadLimitError(err)) {
        setQuotaGateVisible(true)
        setUploadPhase('idle')
        return
      }
      const isCancel = String(err?.message || '').includes('تم الإلغاء')
      if (!isCancel) {
        Toast.show({
          type: 'kidReward',
          text1: I18nManager.isRTL ? 'النشر ماكملش' : 'Publish did not finish',
           text2: isKidVoiceEffectUnavailable(err)
             ? (I18nManager.isRTL ? 'تعذر تركيب الصوت المختار. جرّب صوتًا آخر أو اختر بدون صوت.' : 'Could not apply this voice. Try another voice or choose No voice.')
             : (err?.message || (I18nManager.isRTL ? 'جرّب تاني بعد شوية' : 'Please try again')),
          props: { icon: '⚠️', accent: 'purple' },
        })
      }
      setUploadPhase('idle')
    } finally {
      void cleanupKidVoiceEffectFile(generatedVoiceUri)
      setUploading(false)
    }
  }

  const confirmVideoSafety = async () => {
    await markChildSafetyReminderSeen(userId, 'video')
    setSafetyVisible(false)
    void upload()
  }

  const safetyModals = (
    <>
      <ChildSafetyReminderModal
        visible={safetyVisible}
        ar={I18nManager.isRTL}
        mode="reminder"
        surface="video"
        onCancel={() => setSafetyVisible(false)}
        onConfirm={confirmVideoSafety}
      />
      <ChildSafetyReminderModal
        visible={!!personalInfoRisk}
        ar={I18nManager.isRTL}
        mode="personalInfo"
        surface="video"
        riskLabel={I18nManager.isRTL ? personalInfoRisk?.labelAr : personalInfoRisk?.labelEn}
        onCancel={() => setPersonalInfoRisk(null)}
        onConfirm={() => setPersonalInfoRisk(null)}
      />
    </>
  )

  // ── Picking state ──────────────────────────────────────────────────────────
  if (quotaGateVisible) {
    return (
      <CreatorUploadLimitGate
        ar={I18nManager.isRTL}
        onCancel={() => router.back()}
        onUnlocked={() => {
          setQuotaGateVisible(false)
          if (!videoUri) void pickVideo()
        }}
      />
    )
  }

  if (step === 'picking' || !videoUri) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar hidden />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.white, marginTop: spacing.md }}>{I18nManager.isRTL ? 'جاري فتح الجاليري...' : 'Opening gallery...'}</Text>
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
    <>
      <KeyboardScreen variant="simple" backgroundColor={colors.grey900} edges={['top']}>
        <StatusBar hidden />
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Preview info */}
        <View style={{ margin: spacing.lg, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
          {kidAvatar ? (
            <LinearGradient
              colors={['#10103A', `${kidAvatar.color}55`, '#0B1020']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ minHeight: 210, paddingTop: spacing.md, justifyContent: 'center' }}
            >
              <KidAvatarFaceMask avatarId={kidAvatar.id} voiceKey={selectedVoiceKey} isActive mode="picker" showVoiceBadge />
              <View style={{ position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.base }}>
                    {I18nManager.isRTL ? 'ماسك الفيديو جاهز' : 'Video mask is ready'}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.74)', fontSize: fontSize.xs, marginTop: 2 }}>
                    {I18nManager.isRTL ? 'هيظهر فوق الوش في الفيد' : 'It will appear over the face in the feed'}
                  </Text>
                </View>
                <Pressable onPress={() => { resetBackgroundCompression(); setStep('trimming') }} style={{ backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.xs }}>{I18nManager.isRTL ? 'تعديل' : 'Edit'}</Text>
                </Pressable>
              </View>
            </LinearGradient>
          ) : (
            <View style={{ padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Ionicons name="videocam" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{I18nManager.isRTL ? 'فيديو جاهز للرفع' : 'Video ready to upload'}</Text>
                <Text style={{ color: colors.grey400, fontSize: fontSize.sm, marginTop: 2 }}>
                  {I18nManager.isRTL ? 'من' : 'From'} {fmtSec(startSec)} ← {fmtSec(startSec + clipDuration)} ({Math.round(clipDuration)}s)
                </Text>
              </View>
              <Pressable onPress={() => { resetBackgroundCompression(); setStep('trimming') }}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: fontSize.sm }}>{I18nManager.isRTL ? 'تعديل' : 'Edit'}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <View>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>{I18nManager.isRTL ? 'عنوان الفيديو' : 'Video title'}</Text>
            <TextInput
              value={title} onChangeText={setTitle}
              placeholder={I18nManager.isRTL ? 'أضف عنواناً للفيديو...' : 'Add a video title...'}
              placeholderTextColor={colors.grey500}
              style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 14, color: '#fff', fontSize: fontSize.base, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
            />
          </View>
          <View>
            <Text style={{ color: '#fff', fontWeight: '700', marginBottom: 6 }}>{I18nManager.isRTL ? 'الهاشتاجات (مفصولة بفاصلة)' : 'Hashtags (comma separated)'}</Text>
            <TextInput
              value={tags} onChangeText={setTags}
              placeholder={I18nManager.isRTL ? 'تعليم, أطفال, قصص...' : 'education, kids, stories...'}
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
          <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, padding: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '800' }}>
                {uploadPhaseLabel(uploadPhase, I18nManager.isRTL)}
              </Text>
              <Text style={{ color: colors.grey300, fontSize: fontSize.xs, fontWeight: '800' }}>
                {Math.min(100, Math.max(0, progress))}%
              </Text>
            </View>
            <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: uploadPhase === 'finishing' ? '#A855F7' : colors.primary, borderRadius: 999 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: uploadPhase === 'compressing' || uploadPhase === 'voice' ? colors.white : colors.grey500, fontSize: 10, fontWeight: '800' }}>
                {I18nManager.isRTL ? 'تجهيز' : 'Prepare'}
              </Text>
              <Text style={{ color: uploadPhase === 'uploading' ? colors.white : colors.grey500, fontSize: 10, fontWeight: '800' }}>
                {I18nManager.isRTL ? 'رفع' : 'Upload'}
              </Text>
              <Text style={{ color: uploadPhase === 'finishing' || uploadPhase === 'done' ? colors.white : colors.grey500, fontSize: 10, fontWeight: '800' }}>
                {I18nManager.isRTL ? 'نشر' : 'Publish'}
              </Text>
            </View>
          </View>
        )}
        {false && uploading && (
          <View>
            <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginBottom: spacing.sm }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: colors.primary, borderRadius: 2 }} />
            </View>
            <Text style={{ color: colors.grey400, fontSize: fontSize.xs, textAlign: 'center' }}>
              {uploadPhase === 'done'
                ? (I18nManager.isRTL ? 'تم الرفع ✓' : 'Uploaded ✓')
                : (I18nManager.isRTL ? `جاري النشر... ${progress}%` : `Publishing... ${progress}%`)}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {uploading ? (
            <Pressable onPress={cancelUpload} style={{ flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{I18nManager.isRTL ? 'إلغاء' : 'Cancel'}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={() => router.back()} style={{ flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{I18nManager.isRTL ? 'إلغاء' : 'Cancel'}</Text>
              </Pressable>
              <Pressable onPress={upload} style={{ flex: 2, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.base, letterSpacing: 0.3 }}>
                  {I18nManager.isRTL ? 'نشر' : 'Publish'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
        </LinearGradient>
      </KeyboardScreen>
      {safetyModals}
    </>
  )
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function toFormDataUri(uri: string): string {
  if (/^[A-Za-z]:\\/.test(uri)) {
    return `file:///${uri.replace(/\\/g, '/')}`
  }
  if (uri.startsWith('/')) {
    return `file://${uri}`
  }
  return uri
}

async function syncAvatarVoiceChoice(creatorVideoId: string, voiceKey: string | null) {
  try {
    await supabase
      .from('creator_videos')
      .update({ kid_avatar_sound_key: voiceKey })
      .eq('id', creatorVideoId)
  } catch (err) {
    console.warn('[Upload] Could not sync avatar voice choice:', err)
  }
}

function uploadPhaseLabel(
  phase: UploadPhase,
  rtl: boolean
) {
  if (phase === 'voice') return rtl ? 'جاري تركيب الصوت المرح...' : 'Adding playful voice...'
  if (phase === 'compressing') return rtl ? 'جاري تجهيز الفيديو...' : 'Preparing video...'
  if (phase === 'uploading') return rtl ? 'جاري رفع الفيديو...' : 'Uploading video...'
  if (phase === 'finishing') return rtl ? 'جاري إنشاء الصورة ونشر الفيديو...' : 'Creating preview and publishing...'
  if (phase === 'done') return rtl ? 'تم النشر ✓' : 'Published ✓'
  return rtl ? 'جاري التحضير...' : 'Preparing...'
}
