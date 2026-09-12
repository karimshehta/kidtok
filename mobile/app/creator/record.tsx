import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, Pressable, Dimensions, ActivityIndicator, StatusBar,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
  type LayoutChangeEvent,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  Camera as VisionCamera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  useVideoOutput,
  type Recorder,
} from 'react-native-vision-camera'
import { createFaceDetectorOutput, type Face } from 'react-native-vision-camera-face-detector'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { Video as VideoCompressor } from 'react-native-compressor'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useQueryClient } from '@tanstack/react-query'
import { colors, spacing, fontSize, radius } from '@/lib/theme'
import {
  creatorUploadFunctionErrorMessage,
  ensureCreatorUploadQuota,
  fetchCreatorUploadOptions,
  isCreatorUploadLimitError,
} from '@/lib/creatorUploadQuota'
import CreatorUploadLimitGate from '@/components/CreatorUploadLimitGate'
import ChildSafetyReminderModal from '@/components/ChildSafetyReminderModal'
import KidAvatarFaceMask from '@/components/KidAvatarFaceMask'
import KidReplayFaceMask from '@/components/KidReplayFaceMask'
import KidTrackedFaceMask, { type TrackedFace } from '@/components/KidTrackedFaceMask'
import { smoothTrackedFace } from '@/lib/faceFrame'
import { createAvatarTrack, encodeAvatarTrack, pushAvatarSample, type AvatarTrack } from '@/lib/avatarTrack'
import { getKidAvatar } from '@/lib/kidAvatars'
import {
  completeCreatorR2Upload,
  getCreatorUploadFunctionName,
  maybeCreateCreatorVideoThumbnail,
  uploadVideoFileWithRetry,
  type CreatorUploadMethod,
} from '@/lib/creatorUploadStorage'
import { applyKidVoiceEffect, cleanupKidVoiceEffectFile, isKidVoiceEffectUnavailable, prepareWebArClip, requireKidVoiceEffect } from '@/lib/kidVideoEffects'
import { detectPersonalInfoRisk, hasSeenChildSafetyReminder, markChildSafetyReminderSeen } from '@/lib/childSafety'
import WebArRecorder from '@/components/WebArRecorder'
import { AVATAR_TO_WEB_ANIMAL } from '@/lib/webArHtml'
import {
  finalizeKidVoiceUse,
  isVoiceUseServiceUnavailable,
  releaseKidVoiceUse,
  reserveKidVoiceUse,
  type VoiceAccessMethod,
} from '@/lib/voiceUse'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const MAX_DURATION_SEC = 30
const VIDEO_FRAME_WIDTH = CommonResolutions.HD_16_9.width
const VIDEO_FRAME_HEIGHT = CommonResolutions.HD_16_9.height
// ML Kit can occasionally skip one or two frames during quick motion or a
// lighting adjustment. Keep the last good pose for this short grace period so
// the filter feels glued to the face instead of blinking on every missed frame.
const FACE_LOSS_GRACE_MS = 420

// Both VisionCamera and the preview player use a centered `cover` transform.
// Ask ML Kit to map into that same covered surface, then remove the cropped
// margins before drawing/storing coordinates. Mapping straight to the window
// stretches a 9:16 frame on tall Android screens and makes replay drift.
type PreviewTransform = {
  width: number
  height: number
  coverWidth: number
  coverHeight: number
  cropX: number
  cropY: number
}

function getPreviewTransform(width: number, height: number): PreviewTransform {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const scale = Math.max(safeWidth / VIDEO_FRAME_WIDTH, safeHeight / VIDEO_FRAME_HEIGHT)
  const coverWidth = VIDEO_FRAME_WIDTH * scale
  const coverHeight = VIDEO_FRAME_HEIGHT * scale
  return {
    width: safeWidth,
    height: safeHeight,
    coverWidth,
    coverHeight,
    cropX: Math.max(0, (coverWidth - safeWidth) / 2),
    cropY: Math.max(0, (coverHeight - safeHeight) / 2),
  }
}

type DetectorPoint = { x: number; y: number }

function screenPoint(point?: DetectorPoint): DetectorPoint | undefined {
  if (!point) return undefined
  return { x: Number(point.x), y: Number(point.y) }
}

function contourCenter(points?: readonly DetectorPoint[]): DetectorPoint | undefined {
  if (!points?.length) return undefined
  let x = 0
  let y = 0
  for (let i = 0; i < points.length; i += 1) {
    x += Number(points[i].x)
    y += Number(points[i].y)
  }
  return { x: x / points.length, y: y / points.length }
}

function contourExtreme(
  points: readonly DetectorPoint[] | undefined,
  axis: 'x' | 'y',
  direction: 'min' | 'max',
): DetectorPoint | undefined {
  if (!points?.length) return undefined
  let best = points[0]
  for (let i = 1; i < points.length; i += 1) {
    const candidate = points[i]
    if (
      (direction === 'min' && Number(candidate[axis]) < Number(best[axis])) ||
      (direction === 'max' && Number(candidate[axis]) > Number(best[axis]))
    ) best = candidate
  }
  return screenPoint(best)
}

/** Converts the native detector result into KidTok's renderer-independent face model. */
function detectorFaceToTracked(face: Face, preview: PreviewTransform): TrackedFace {
  const lm = face.landmarks
  const contours = face.contours
  const oval = contours?.FACE

  return {
    bounds: {
      x: Number(face.bounds.x) - preview.cropX,
      y: Number(face.bounds.y) - preview.cropY,
      width: Number(face.bounds.width),
      height: Number(face.bounds.height),
    },
    rollAngle: Number(face.rollAngle || 0),
    yawAngle: Number(face.yawAngle || 0),
    pitchAngle: Number(face.pitchAngle || 0),
    leftEyeOpenProbability: face.leftEyeOpenProbability,
    rightEyeOpenProbability: face.rightEyeOpenProbability,
    smilingProbability: face.smilingProbability,
    trackingId: face.trackingId,
    landmarks: {
      leftEye: offsetPoint(screenPoint(lm?.LEFT_EYE) || contourCenter(contours?.LEFT_EYE), preview),
      rightEye: offsetPoint(screenPoint(lm?.RIGHT_EYE) || contourCenter(contours?.RIGHT_EYE), preview),
      leftEar: offsetPoint(screenPoint(lm?.LEFT_EAR), preview),
      rightEar: offsetPoint(screenPoint(lm?.RIGHT_EAR), preview),
      noseBase: offsetPoint(screenPoint(lm?.NOSE_BASE) || contourCenter(contours?.NOSE_BOTTOM), preview),
      mouthLeft: offsetPoint(screenPoint(lm?.MOUTH_LEFT), preview),
      mouthRight: offsetPoint(screenPoint(lm?.MOUTH_RIGHT), preview),
      upperLip: offsetPoint(contourCenter(contours?.UPPER_LIP_BOTTOM), preview),
      lowerLip: offsetPoint(contourCenter(contours?.LOWER_LIP_TOP), preview),
      mouthBottom: offsetPoint(screenPoint(lm?.MOUTH_BOTTOM) || contourExtreme(contours?.LOWER_LIP_BOTTOM, 'y', 'max'), preview),
      faceTop: offsetPoint(contourExtreme(oval, 'y', 'min'), preview),
      chin: offsetPoint(contourExtreme(oval, 'y', 'max'), preview),
      leftCheek: offsetPoint(screenPoint(lm?.LEFT_CHEEK) || contourExtreme(oval, 'x', 'min'), preview),
      rightCheek: offsetPoint(screenPoint(lm?.RIGHT_CHEEK) || contourExtreme(oval, 'x', 'max'), preview),
    },
  }
}

function offsetPoint(point: DetectorPoint | undefined, preview: PreviewTransform): DetectorPoint | undefined {
  if (!point) return undefined
  return { x: point.x - preview.cropX, y: point.y - preview.cropY }
}

type UploadPhase = 'idle' | 'compressing' | 'voice' | 'uploading' | 'finishing' | 'done'
const COMPRESS_WEIGHT = 25
const FINISHING_PROGRESS = 92

// ─── Video preview — looping playback + title/tags inputs + post controls ───
function VideoPreview({
  uri, ar, uploading, uploadProgress, uploadPhase, title, tags, onTitleChange, onTagsChange, onRetake, onUpload,
}: {
  uri: string
  ar: boolean
  uploading: boolean
  uploadProgress: number
  uploadPhase: UploadPhase
  title: string
  tags: string
  onTitleChange: (t: string) => void
  onTagsChange:  (t: string) => void
  onRetake: () => void
  onUpload: () => void
}) {
  const insets = useSafeAreaInsets()
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true
    p.muted = false
    p.volume = 1
    p.audioMixingMode = 'doNotMix'
    p.play()
  })

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.black }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar hidden />
      <VideoView
        player={player}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        nativeControls={false}
      />
      {/* No mask overlay here: WebView-AR clips carry the mask burned into
          the video pixels themselves. */}

      {/* Close icon — top-left */}
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, zIndex: 10 }}>
        <Pressable
          onPress={onRetake}
          disabled={uploading}
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
            opacity: uploading ? 0.5 : 1,
          }}
        >
          <Ionicons name="close" size={24} color={colors.white} />
        </Pressable>
      </View>

      {/* Spacer pushes the form to the bottom of the safe area; KAV lifts
          the WHOLE screen when the keyboard opens so inputs stay visible. */}
      <View style={{ flex: 1 }} pointerEvents="none" />

      {/* Bottom panel: title + tags + actions */}
      <View style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.95)']}
          locations={[0, 0.3, 1]}
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xl,
            paddingBottom: 36,
            gap: spacing.md,
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm + 2 }}
          >
            {/* Title */}
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: fontSize.xs, letterSpacing: 0.3 }}>
              {ar ? 'عنوان الفيديو' : 'Video title'}
            </Text>
            <TextInput
              value={title}
              onChangeText={onTitleChange}
              editable={!uploading}
              maxLength={100}
              placeholder={ar ? 'أضف عنواناً للفيديو...' : 'Add a video title...'}
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={{
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.25)',
                color: colors.white,
                paddingHorizontal: spacing.md,
                paddingVertical: 11,
                borderRadius: radius.md,
                fontSize: fontSize.sm,
                fontWeight: '600',
                textAlign: ar ? 'right' : 'left',
              }}
            />

            {/* Tags */}
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: fontSize.xs, letterSpacing: 0.3, marginTop: 4 }}>
              {ar ? 'الهاشتاجات (مفصولة بفاصلة)' : 'Hashtags (comma separated)'}
            </Text>
            <TextInput
              value={tags}
              onChangeText={onTagsChange}
              editable={!uploading}
              maxLength={200}
              placeholder={ar ? 'تعليم, أطفال, قصص...' : 'education, kids, stories...'}
              placeholderTextColor="rgba(255,255,255,0.45)"
              autoCapitalize="none"
              style={{
                backgroundColor: 'rgba(255,255,255,0.12)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.25)',
                color: colors.white,
                paddingHorizontal: spacing.md,
                paddingVertical: 11,
                borderRadius: radius.md,
                fontSize: fontSize.sm,
                fontWeight: '600',
                textAlign: ar ? 'right' : 'left',
              }}
            />
          </ScrollView>

          {uploading && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, padding: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: colors.white, fontSize: fontSize.xs, fontWeight: '800' }}>
                  {uploadPhaseLabel(uploadPhase, ar)}
                </Text>
                <Text style={{ color: colors.grey300, fontSize: fontSize.xs, fontWeight: '800' }}>
                  {Math.min(100, Math.max(0, uploadProgress))}%
                </Text>
              </View>
              <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <View style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%`, height: '100%', backgroundColor: uploadPhase === 'finishing' ? '#A855F7' : colors.primary, borderRadius: 999 }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: uploadPhase === 'compressing' || uploadPhase === 'voice' ? colors.white : colors.grey500, fontSize: 10, fontWeight: '800' }}>
                  {ar ? 'تجهيز' : 'Prepare'}
                </Text>
                <Text style={{ color: uploadPhase === 'uploading' ? colors.white : colors.grey500, fontSize: 10, fontWeight: '800' }}>
                  {ar ? 'رفع' : 'Upload'}
                </Text>
                <Text style={{ color: uploadPhase === 'finishing' || uploadPhase === 'done' ? colors.white : colors.grey500, fontSize: 10, fontWeight: '800' }}>
                  {ar ? 'نشر' : 'Publish'}
                </Text>
              </View>
            </View>
          )}

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
            <Pressable
              onPress={onRetake}
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
              onPress={onUpload}
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
          </View>
        </LinearGradient>
      </View>
    </KeyboardAvoidingView>
  )
}

function uploadPhaseLabel(phase: UploadPhase, rtl: boolean) {
  if (phase === 'voice') return rtl ? 'جاري تركيب الصوت المرح...' : 'Adding playful voice...'
  if (phase === 'compressing') return rtl ? 'جاري تجهيز الفيديو...' : 'Preparing video...'
  if (phase === 'uploading') return rtl ? 'جاري رفع الفيديو...' : 'Uploading video...'
  if (phase === 'finishing') return rtl ? 'جاري إنشاء الصورة ونشر الفيديو...' : 'Creating preview and publishing...'
  if (phase === 'done') return rtl ? 'تم النشر ✓' : 'Published ✓'
  return rtl ? 'جاري التحضير...' : 'Preparing...'
}

async function syncAvatarVoiceChoice(creatorVideoId: string, voiceKey: string | null) {
  try {
    await supabase
      .from('creator_videos')
      .update({ kid_avatar_sound_key: voiceKey })
      .eq('id', creatorVideoId)
  } catch (err) {
    console.warn('[Record] Could not sync avatar voice choice:', err)
  }
}

/**
 * WebView-AR clips have the mask rendered INTO the pixels, so the feed must
 * not draw any overlay on top. The marker rides the same column the replay
 * timelines used; AvatarMaskLayer checks it first.
 */
async function syncAvatarBurnedMask(creatorVideoId: string) {
  try {
    await supabase
      .from('creator_videos')
      .update({ kid_avatar_track: { v: 1, burned: true } })
      .eq('id', creatorVideoId)
  } catch (err) {
    console.warn('[Record] Could not mark burned mask:', err)
  }
}

async function syncAvatarFaceTrack(creatorVideoId: string, track: AvatarTrack | null) {
  if (!track || !track.samples.length) return
  try {
    await supabase
      .from('creator_videos')
      .update({ kid_avatar_track: encodeAvatarTrack(track) })
      .eq('id', creatorVideoId)
  } catch (err) {
    // Mask replay in the feed simply falls back to the floating badge.
    console.warn('[Record] Could not sync avatar face track:', err)
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CameraRecordScreen() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'

  const router = useRouter()
  const { avatarId, avatarAccessMethod, avatarFlow, voiceKey, voiceAccessMethod } = useLocalSearchParams<{
    avatarId?: string
    avatarAccessMethod?: 'free' | 'reward' | 'coins'
    avatarFlow?: string
    voiceKey?: string
    voiceAccessMethod?: VoiceAccessMethod
  }>()
  // Legacy KidTok WebAR masks are disabled. Keep route params readable for
  // backwards compatibility, but never enter the old mask/video-effect flow.
  const isAvatarUpload = Boolean(false && avatarId)
  const kidAvatar = getKidAvatar(avatarId)
  // The voice can arrive from route params (legacy picker flow) or be chosen
  // inside the WebView camera itself (current flow).
  const [webVoiceKey, setWebVoiceKey] = useState<string | null>(null)
  const selectedVoiceKey = webVoiceKey || (voiceKey && voiceKey !== 'none' ? voiceKey : null)
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  const recorderRef = useRef<Recorder | null>(null)
  const recordingActionRef = useRef(false)
  const avatarCreatorVideoIdRef = useRef<string | null>(null)
  const voiceUseEventIdRef = useRef<string | null>(null)
  // Face-tracking timeline captured while recording; refs (not state) so the
  // ML Kit callback identity stays stable and native tracking is never reset.
  const isCapturingTrackRef = useRef(false)
  const captureStartRef = useRef(0)
  const avatarTrackRef = useRef<AvatarTrack | null>(null)
  const [finishedTrack, setFinishedTrack] = useState<AvatarTrack | null>(null)
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPerm } = useCameraPermission()
  const { hasPermission: hasMicPermission, requestPermission: requestMicPerm } = useMicrophonePermission()
  const [facing, setFacing] = useState<'back' | 'front'>(isAvatarUpload ? 'front' : 'back')
  const [flash, setFlash] = useState<'off' | 'on'>('off')
  const [trackingAvailable, setTrackingAvailable] = useState(true)
  // Freeze the first real layout measurement. Replacing a Nitro camera output
  // while ML Kit still owns an in-flight promise can destroy that promise and
  // surface `JPromise was destroyed`. Measuring the container before mounting
  // the avatar camera gives us exact cover coordinates without recreating it.
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(
    isAvatarUpload ? null : { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  )
  const previewTransform = useMemo(
    () => previewSize ? getPreviewTransform(previewSize.width, previewSize.height) : null,
    [previewSize],
  )
  // Real-time mask channel: detector frames are pushed straight to the mask's
  // Animated values via these listeners — React state only tracks presence
  // (for the helper chip), so nothing re-renders per camera frame.
  const faceListenersRef = useRef(new Set<(face: TrackedFace | null) => void>())
  const fallbackFaceRef = useRef<TrackedFace | null>(null)
  const lastFaceDetectedAtRef = useRef(0)
  const faceLossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasFaceRef = useRef(false)
  const [hasFace, setHasFace] = useState(false)
  const device = useCameraDevice(facing)
  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.HD_16_9,
    enableAudio: true,
    fileType: 'mp4',
  })

  const [recording, setRecording] = useState(false)
  const [recordingActionPending, setRecordingActionPending] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraSwitching, setCameraSwitching] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // Keep the camera's untouched recording separate from the preview. The
  // preview is allowed to be an effect-rendered cache file, but the upload
  // must always compress the original and apply the selected voice LAST.
  // Otherwise a compressor can replace/strip the preview's edited audio.
  const [recordedVideoUri, setRecordedVideoUri] = useState<string | null>(null)
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [preparingPreview, setPreparingPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  const [quotaChecking, setQuotaChecking] = useState(true)
  const [quotaGateVisible, setQuotaGateVisible] = useState(false)
  const cameraSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ── Title + tags entered before posting (TikTok-style metadata) ─────
  const [title, setTitle] = useState('')
  const [tags,  setTags]  = useState('')
  const [safetyVisible, setSafetyVisible] = useState(false)
  const [personalInfoRisk, setPersonalInfoRisk] = useState<ReturnType<typeof detectPersonalInfoRisk>>(null)

  const onCameraLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (width <= 0 || height <= 0) return
    setPreviewSize((current) => current || { width, height })
  }, [])

  const captureTrackSample = useCallback((face: TrackedFace | null) => {
    if (!isCapturingTrackRef.current || !avatarTrackRef.current) return
    const t = (Date.now() - captureStartRef.current) / 1000
    pushAvatarSample(avatarTrackRef.current, t, face)
  }, [])

  const subscribeFace = useCallback((listener: (face: TrackedFace | null) => void) => {
    faceListenersRef.current.add(listener)
    return () => {
      faceListenersRef.current.delete(listener)
    }
  }, [])

  const emitFace = useCallback((face: TrackedFace | null) => {
    // A renderer/listener must never be allowed to throw back through the
    // Nitro/ML Kit callback. Doing so can tear down the pending native promise
    // and surface the misleading `JPromise was destroyed` error on Android.
    for (const listener of faceListenersRef.current) {
      try {
        listener(face)
      } catch (error) {
        console.warn('[face-tracking] mask listener failed:', error)
      }
    }
    const has = !!face
    if (hasFaceRef.current !== has) {
      hasFaceRef.current = has
      setHasFace(has)
    }
  }, [])

  const clearFaceLossTimer = useCallback(() => {
    if (!faceLossTimerRef.current) return
    clearTimeout(faceLossTimerRef.current)
    faceLossTimerRef.current = null
  }, [])

  const releaseFaceAfterGrace = useCallback(() => {
    if (faceLossTimerRef.current) return
    faceLossTimerRef.current = setTimeout(() => {
      faceLossTimerRef.current = null
      if (Date.now() - lastFaceDetectedAtRef.current < FACE_LOSS_GRACE_MS) return
      fallbackFaceRef.current = null
      captureTrackSample(null)
      emitFace(null)
    }, FACE_LOSS_GRACE_MS)
  }, [captureTrackSample, emitFace])

  const onFacesDetected = useCallback((faces: Face[]) => {
    if (!previewTransform) return
    try {
      const face = faces[0]
      if (!face) {
        releaseFaceAfterGrace()
        return
      }

      lastFaceDetectedAtRef.current = Date.now()
      clearFaceLossTimer()
      // A higher smoothing value follows quick child movement with much less
      // visible lag, while still filtering the detector's single-pixel jitter.
      const next = smoothTrackedFace(fallbackFaceRef.current, detectorFaceToTracked(face, previewTransform), 0.72)
      fallbackFaceRef.current = next
      captureTrackSample(next)
      emitFace(next)
      setTrackingAvailable(true)
    } catch (error) {
      // Malformed/partial detector frames are disposable. Keep the camera
      // session alive and wait for the next valid frame instead of crashing.
      console.warn('[face-tracking] ignored malformed frame:', error)
      fallbackFaceRef.current = null
      emitFace(null)
      setTrackingAvailable(false)
    }
  }, [captureTrackSample, clearFaceLossTimer, emitFace, previewTransform, releaseFaceAfterGrace])

  const onFaceDetectionError = useCallback((error: Error) => {
    console.warn('[face-tracking] ML Kit error:', error.message)
    setTrackingAvailable(false)
  }, [])

  // Keep the native ML Kit output stable while its callbacks continue to read
  // the latest React state. This dedicated ImageAnalysis output already runs
  // off the JS thread and drops stale frames, so it avoids the experimental
  // AsyncRunner cross-runtime crash while keeping the preview responsive.
  const faceOutput = useMemo(() => {
    if (!isAvatarUpload || !previewTransform) return null
    return createFaceDetectorOutput({
      onFacesDetected,
      onError: onFaceDetectionError,
      outputResolution: 'preview',
      cameraFacing: facing,
      autoMode: true,
      windowWidth: previewTransform.coverWidth,
      windowHeight: previewTransform.coverHeight,
      performanceMode: 'fast',
      runLandmarks: true,
      runContours: true,
      runClassifications: true,
      minFaceSize: 0.12,
      // ML Kit contours are restricted to the prominent face. Its own docs
      // recommend disabling ID tracking in contour mode; KidTok smooths the
      // landmark stream itself instead.
      trackingEnabled: false,
    })
  }, [facing, isAvatarUpload, onFaceDetectionError, onFacesDetected, previewTransform])

  // ── Real-time worklet pipeline ──────────────────────────────────────────────
  const cameraOutputs = useMemo(() => {
    if (faceOutput) return [videoOutput, faceOutput]
    return [videoOutput]
  }, [faceOutput, videoOutput])

  useEffect(() => {
    // A new camera/output graph is not recordable until VisionCamera confirms
    // that all native connections have been configured.
    setCameraReady(false)
  }, [cameraOutputs, device])

  useEffect(() => {
    let active = true
    if (!userId) {
      setQuotaChecking(false)
      return () => { active = false }
    }

    setQuotaChecking(true)
    void fetchCreatorUploadOptions()
      .then((options) => {
        if (active) setQuotaGateVisible(!!options && !options.can_upload)
      })
      .catch((error) => {
        // The upload endpoint still enforces the limit. A transient preflight
        // error must not turn the camera into a dead end.
        console.warn('[record] Could not preflight creator upload quota:', error)
      })
      .finally(() => {
        if (active) setQuotaChecking(false)
      })

    return () => { active = false }
  }, [userId])

  // Tick timer while recording
  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => {
      setElapsed((e) => {
        const n = e + 1
        return Math.min(MAX_DURATION_SEC, n)
      })
    }, 1000)
    return () => clearInterval(t)
  }, [recording])

  // Request permissions on mount — the avatar/WebAR path handles its OWN
  // camera+mic permission flow entirely inside WebArRecorder (a direct,
  // single-source-of-truth PermissionsAndroid check/request). Also running
  // VisionCamera's requestPermission() here for that path would fire a
  // SECOND, independent native Activity.requestPermissions() call that can
  // clash with WebArRecorder's own — the exact `JPromise was destroyed`
  // concurrent-permission-request race. VisionCamera is only actually used
  // for capture on the legacy (non-avatar) path, so only request through it
  // there.
  useEffect(() => {
    if (isAvatarUpload) return
    ;(async () => {
      if (!hasCameraPermission) await requestCameraPerm()
      if (!hasMicPermission) await requestMicPerm()
    })()
  }, [isAvatarUpload, hasCameraPermission, hasMicPermission, requestCameraPerm, requestMicPerm])

  useEffect(() => () => {
    clearFaceLossTimer()
    if (cameraSwitchTimerRef.current) clearTimeout(cameraSwitchTimerRef.current)
    const recorder = recorderRef.current
    if (recorder?.isRecording) void recorder.cancelRecording().catch(() => {})
  }, [clearFaceLossTimer])

  const switchLegacyCamera = useCallback(() => {
    if (recording || recordingActionPending || preparingPreview || cameraSwitching) return
    setCameraReady(false)
    setCameraSwitching(true)
    setFlash('off')
    setFacing((current) => current === 'back' ? 'front' : 'back')
    if (cameraSwitchTimerRef.current) clearTimeout(cameraSwitchTimerRef.current)
    cameraSwitchTimerRef.current = setTimeout(() => {
      cameraSwitchTimerRef.current = null
      setCameraSwitching(false)
    }, 280)
  }, [cameraSwitching, preparingPreview, recording, recordingActionPending])

  const startRecording = async () => {
    if (!device || !cameraReady || recording || preparingPreview || recordingActionRef.current) return
    recordingActionRef.current = true
    setRecordingActionPending(true)
    // Give immediate visual feedback while VisionCamera opens the recorder.
    // If native setup fails, the catch below returns the UI to its idle state.
    setElapsed(0)
    setRecording(true)
    try {
      const recorder = await videoOutput.createRecorder({ maxDuration: MAX_DURATION_SEC })
      recorderRef.current = recorder
      await recorder.startRecording(
        async (filePath) => {
          recorderRef.current = null
          isCapturingTrackRef.current = false
          setFinishedTrack(avatarTrackRef.current)
          const recordedUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`
          setRecordedVideoUri(recordedUri)
          let previewUri = recordedUri
          try {
            if (selectedVoiceKey) {
              setPreparingPreview(true)
              const voicedUri = await applyKidVoiceEffect(previewUri, selectedVoiceKey)
              if (voicedUri !== previewUri) {
                previewUri = voicedUri
              }
            }
            setVideoUri(previewUri)
          } catch (err) {
            console.warn('[Record] Could not prepare voice preview:', err)
            setVideoUri(previewUri)
          } finally {
            setRecording(false)
            setPreparingPreview(false)
          }
        },
        (error) => {
          recorderRef.current = null
          isCapturingTrackRef.current = false
          setRecording(false)
          Toast.show({ type: 'error', text1: ar ? 'فشل التسجيل' : 'Recording failed', text2: error.message })
        },
      )
      if (isAvatarUpload) {
        avatarTrackRef.current = createAvatarTrack(
          previewTransform?.width || SCREEN_WIDTH,
          previewTransform?.height || SCREEN_HEIGHT,
        )
        captureStartRef.current = Date.now()
        isCapturingTrackRef.current = true
      }
      setRecording(true)
    } catch (err) {
      recorderRef.current = null
      isCapturingTrackRef.current = false
      setRecording(false)
      Toast.show({ type: 'error', text1: ar ? 'فشل التسجيل' : 'Recording failed', text2: (err as Error).message })
    } finally {
      recordingActionRef.current = false
      setRecordingActionPending(false)
    }
  }

  const stopRecording = () => {
    if (!recording || recordingActionRef.current) return
    const recorder = recorderRef.current
    if (!recorder) return
    recordingActionRef.current = true
    setRecordingActionPending(true)
    void recorder.stopRecording()
      .catch((err) => {
        console.warn('[Record] Could not stop recording:', err)
      })
      .finally(() => {
        recordingActionRef.current = false
        setRecordingActionPending(false)
      })
  }

  const retake = () => {
    void cleanupKidVoiceEffectFile(videoUri)
    setRecordedVideoUri(null)
    setVideoUri(null)
    setElapsed(0)
    setUploadProgress(0)
    setUploadPhase('idle')
    setTitle('')
    setTags('')
    avatarTrackRef.current = null
    setFinishedTrack(null)
  }

  // WebView-AR clip finished: normalize WebM → MP4 once (the upload pipeline
  // expects H.264), then prepare the audible voice preview exactly like the
  // native recorder callback did.
  const onWebArRecorded = useCallback(async (uri: string, seconds: number, chosenVoiceKey?: string | null) => {
    setElapsed(seconds)
    setPreparingPreview(true)
    if (chosenVoiceKey !== undefined) setWebVoiceKey(chosenVoiceKey)
    const effectiveVoice = chosenVoiceKey !== undefined
      ? chosenVoiceKey
      : selectedVoiceKey
    try {
      const normalized = await prepareWebArClip(uri, null)
      setRecordedVideoUri(normalized)
      let previewUri = normalized
      if (effectiveVoice) {
        const voicedUri = await applyKidVoiceEffect(normalized, effectiveVoice)
        if (voicedUri !== normalized) previewUri = voicedUri
      }
      setVideoUri(previewUri)
    } catch (err) {
      console.warn('[Record] Could not prepare WebAR preview:', err)
      setRecordedVideoUri(uri)
      setVideoUri(uri)
    } finally {
      setPreparingPreview(false)
    }
  }, [selectedVoiceKey])

  const upload = async () => {
    const sourceVideoUri = recordedVideoUri || videoUri
    if (!sourceVideoUri || !userId) return

    const metadataText = `${title}\n${tags}`
    const risk = detectPersonalInfoRisk(metadataText)
    if (risk) {
      setPersonalInfoRisk(risk)
      return
    }

    const seenSafety = await hasSeenChildSafetyReminder(userId, 'video')
    if (!seenSafety) {
      setSafetyVisible(true)
      return
    }

    let generatedVoiceUri: string | null = null
    let uploadCommitted = false
    setUploading(true)
    setUploadProgress(0)
    setUploadPhase('compressing')
    try {
      await ensureCreatorUploadQuota(ar)

      const finalTitle = title.trim()
      const tagsArray  = tags
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 10)

      // Voice billing is intentionally independent from the existing avatar
      // upload reservation.  If its new Edge Functions have not been deployed
      // yet, retain the legacy metadata update so normal uploads never break.
      let voiceReservationAvailable = false
      if (selectedVoiceKey) {
        try {
          const reservation = await reserveKidVoiceUse({
            voiceId: selectedVoiceKey,
            // Voices picked inside the WebView camera have no route param;
            // they are all free-tier profiles.
            accessMethod: voiceAccessMethod || 'free',
            ar,
          })
          voiceUseEventIdRef.current = reservation.eventId
          voiceReservationAvailable = true
        } catch (voiceError) {
          if (isVoiceUseServiceUnavailable(voiceError)) {
            console.warn('[Record] voice reservation service is not deployed; using legacy metadata path')
          } else {
            throw voiceError
          }
        }
      }

      const uploadFunctionName = await getCreatorUploadFunctionName(isAvatarUpload)
      const { data: urlData, error: urlErr } = await supabase.functions.invoke(
        uploadFunctionName,
        {
          body: {
            title: finalTitle,
            tags:  tagsArray.length ? tagsArray : ['camera'],
            max_duration_seconds: Math.max(1, elapsed || MAX_DURATION_SEC),
            start_time_seconds: 0,
            ...(isAvatarUpload ? {
              avatar_id: avatarId,
              access_method: avatarAccessMethod,
              voice_key: selectedVoiceKey,
              kid_avatar_sound_key: selectedVoiceKey,
            } : {}),
          },
        }
      )
      if (urlErr) throw new Error(await creatorUploadFunctionErrorMessage(urlErr, ar))
      const uploadURL: string = urlData.upload_url
      if (isAvatarUpload) avatarCreatorVideoIdRef.current = urlData.creator_video_id || null
      if (isAvatarUpload && urlData.creator_video_id) {
        if (finishedTrack?.samples.length) void syncAvatarFaceTrack(urlData.creator_video_id, finishedTrack)
        else void syncAvatarBurnedMask(urlData.creator_video_id)
      }
      const uploadMethod: CreatorUploadMethod = urlData.upload_method === 'PUT' ? 'PUT' : 'POST'

      // Do not compress the preview cache. It can already contain a temporary
      // effect render, and some Android compressors re-create its audio track.
      // Start with the untouched recording, then render the selected effect
      // onto the final compressed file that will actually be uploaded.
      let uploadUri = sourceVideoUri
      try {
        setUploadProgress(8)
        uploadUri = await VideoCompressor.compress(sourceVideoUri, {
          compressionMethod: 'auto',
          minimumFileSizeForCompress: 0,
        })
        setUploadProgress(COMPRESS_WEIGHT)
      } catch (compressErr: any) {
        console.warn('[Record] Compression failed, uploading recorded clip:', compressErr?.message)
        setUploadProgress(COMPRESS_WEIGHT)
      }

      const prepareWeight = selectedVoiceKey ? 35 : COMPRESS_WEIGHT
      if (selectedVoiceKey) {
        setUploadPhase('voice')
        setUploadProgress(Math.max(COMPRESS_WEIGHT + 1, 28))
        const voicedUri = await requireKidVoiceEffect(uploadUri, selectedVoiceKey)
        generatedVoiceUri = voicedUri
        uploadUri = voicedUri
        setUploadProgress(prepareWeight)
      }

      setUploadPhase('uploading')
      const uploadResult = await uploadVideoFileWithRetry({
        uri: uploadUri,
        url: uploadURL,
        method: uploadMethod,
        rtl: ar,
        onProgress: (uploadPct) => {
          setUploadProgress(Math.min(90, Math.round(prepareWeight + (uploadPct / 100) * (90 - prepareWeight))))
        },
      })
      setUploadPhase('finishing')
      setUploadProgress(FINISHING_PROGRESS)
      const thumbnail = urlData.storage_provider === 'r2'
        ? await maybeCreateCreatorVideoThumbnail(uploadUri)
        : null
      setUploadProgress(96)
      await completeCreatorR2Upload(urlData, Math.max(1, Math.min(MAX_DURATION_SEC, elapsed || MAX_DURATION_SEC)), uploadResult?.sizeBytes, thumbnail)
      uploadCommitted = true

      if (urlData.creator_video_id) {
        try {
          await finalizeKidVoiceUse({
            creatorVideoId: String(urlData.creator_video_id),
            eventId: voiceUseEventIdRef.current,
            ar,
          })
          voiceUseEventIdRef.current = null
        } catch (voiceError) {
          if (isVoiceUseServiceUnavailable(voiceError) || !voiceReservationAvailable) {
            // Backwards-compatible path until the migration + functions are
            // deployed. The new secure path never writes this client value.
            await syncAvatarVoiceChoice(String(urlData.creator_video_id), selectedVoiceKey)
          } else {
            // The media is already committed. Do not turn a bookkeeping
            // failure into a fake failed upload or delete the child's video.
            console.warn('[Record] Voice finalization failed after upload commit:', voiceError)
            if (voiceUseEventIdRef.current) {
              await releaseKidVoiceUse(voiceUseEventIdRef.current).catch(() => {})
              voiceUseEventIdRef.current = null
            }
          }
        }
      }
      setUploadPhase('done')
      setUploadProgress(100)
      avatarCreatorVideoIdRef.current = null

      // Refresh profile grid so the new tile shows up immediately with its
      // "Processing" badge (no waiting for Cloudflare to encode).
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
      if (avatarFlow === '1') router.dismissTo('/(tabs)/profile')
      else router.back()
    } catch (err) {
      if (isCreatorUploadLimitError(err)) {
        setQuotaGateVisible(true)
        return
      }
      const creatorVideoId = avatarCreatorVideoIdRef.current
      avatarCreatorVideoIdRef.current = null
      const voiceEventId = voiceUseEventIdRef.current
      voiceUseEventIdRef.current = null
      if (voiceEventId) {
        try {
          await releaseKidVoiceUse(voiceEventId)
          qc.invalidateQueries({ queryKey: ['voice-reward-credits'] })
          qc.invalidateQueries({ queryKey: ['voice-ownerships'] })
          qc.invalidateQueries({ queryKey: ['coins'] })
        } catch {}
      }
      if (!uploadCommitted && isAvatarUpload && creatorVideoId) {
        try {
          await supabase.functions.invoke('avatar-upload-cancel', {
            body: { creator_video_id: creatorVideoId },
          })
          qc.invalidateQueries({ queryKey: ['avatar-reward-credits'] })
          qc.invalidateQueries({ queryKey: ['avatar-ownerships'] })
          qc.invalidateQueries({ queryKey: ['coins'] })
        } catch {}
      }
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'النشر ماكملش' : 'Publish did not finish',
        text2: isKidVoiceEffectUnavailable(err)
          ? (ar ? 'تعذر تركيب الصوت المختار. جرّب صوتًا آخر أو اختر بدون صوت.' : 'Could not apply this voice. Try another voice or choose No voice.')
          : ((err as Error).message || (ar ? 'جرّب تاني بعد شوية' : 'Please try again')),
        props: { icon: '⚠️', accent: 'purple' },
      })
    } finally {
      void cleanupKidVoiceEffectFile(generatedVoiceUri)
      setUploading(false)
      setUploadPhase('idle')
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
        ar={ar}
        mode="reminder"
        surface="video"
        onCancel={() => setSafetyVisible(false)}
        onConfirm={confirmVideoSafety}
      />
      <ChildSafetyReminderModal
        visible={!!personalInfoRisk}
        ar={ar}
        mode="personalInfo"
        surface="video"
        riskLabel={ar ? personalInfoRisk?.labelAr : personalInfoRisk?.labelEn}
        onCancel={() => setPersonalInfoRisk(null)}
        onConfirm={() => setPersonalInfoRisk(null)}
      />
    </>
  )

  // ── Preview mode (both paths) ────────────────────────────────────────────────
  if (quotaChecking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#160A38', alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <ActivityIndicator color={colors.white} size="large" />
        <Text style={{ color: colors.white, fontWeight: '800' }}>
          {ar ? 'بنجهّز الكاميرا...' : 'Getting the camera ready...'}
        </Text>
      </View>
    )
  }

  if (quotaGateVisible) {
    return (
      <CreatorUploadLimitGate
        ar={ar}
        onCancel={() => router.back()}
        onUnlocked={() => setQuotaGateVisible(false)}
      />
    )
  }

  if (videoUri) {
    return (
      <>
        <VideoPreview
          uri={videoUri}
          ar={ar}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadPhase={uploadPhase}
          title={title}
          tags={tags}
          onTitleChange={setTitle}
          onTagsChange={setTags}
          onRetake={retake}
          onUpload={upload}
        />
        {safetyModals}
      </>
    )
  }

  // ── Avatar mode: WebView AR camera — the mask is rendered into the clip ────
  // Checked BEFORE the VisionCamera permission gate below: this path never
  // uses VisionCamera for capture, and WebArRecorder owns its complete
  // camera+mic permission flow itself. Falling through the VisionCamera gate
  // first would request permission through TWO independent native flows for
  // the same OS permissions — see the comment on the "Request permissions on
  // mount" effect above.
  if (isAvatarUpload) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black }}>
        <WebArRecorder
          ar={ar}
          initialAnimal={AVATAR_TO_WEB_ANIMAL[avatarId || ''] || 'grandpa'}
          onRecorded={onWebArRecorded}
          onClose={() => router.back()}
          onOpenGallery={() =>
            router.push({
              pathname: '/creator/upload',
              params: { avatarFlow: '1', avatarId: 'boy', avatarAccessMethod: 'free' },
            })
          }
        />
        {preparingPreview && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2,6,23,0.88)', alignItems: 'center', justifyContent: 'center', gap: spacing.md, zIndex: 40 }}>
            <ActivityIndicator color={colors.white} size="large" />
            <Text style={{ color: colors.white, fontWeight: '900', fontSize: fontSize.base, textAlign: 'center', paddingHorizontal: spacing.xl }}>
              {ar ? 'بنجهّز الفيديو والصوت... ثواني' : 'Preparing your video & voice...'}
            </Text>
          </View>
        )}
      </View>
    )
  }

  // ── Permission gate (legacy native camera path only) ────────────────────────
  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Ionicons name="camera-outline" size={80} color={colors.white} />
        <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800', marginTop: spacing.md, textAlign: 'center' }}>
          {ar ? 'يحتاج التطبيق إلى الكاميرا والميكروفون' : 'Camera & Microphone Permission Required'}
        </Text>
        <Pressable
          onPress={async () => { await requestCameraPerm(); await requestMicPerm() }}
          style={{ marginTop: spacing.xl, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill }}
        >
          <Text style={{ color: colors.white, fontWeight: '800' }}>{ar ? 'السماح' : 'Allow'}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)' }}>{ar ? 'إلغاء' : 'Cancel'}</Text>
        </Pressable>
      </View>
    )
  }

  // ── Recording mode (regular camera, no masks) ───────────────────────────────
  const progress = Math.min(100, (elapsed / MAX_DURATION_SEC) * 100)

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.black }}
      onLayout={isAvatarUpload ? onCameraLayout : undefined}
    >
      <StatusBar hidden />
      {device && (!isAvatarUpload || previewTransform) && !cameraSwitching ? (
        <VisionCamera
          style={{ flex: 1 }}
          device={device}
          isActive={!preparingPreview && !videoUri && !cameraSwitching}
          outputs={cameraOutputs}
          resizeMode="cover"
          // Android's default SurfaceView is faster, but it is drawn in a
          // separate surface and cannot reliably layer the live face mask on
          // top. TextureView keeps the mask visible while recording.
          implementationMode={isAvatarUpload ? 'compatible' : 'performance'}
          // The face-detector's front-camera coordinates are intentionally
          // mirrored. Force the same presentation on the selfie filter flow
          // instead of relying on vendor-specific `auto` camera metadata.
          // This prevents the artwork drifting opposite to a moving face on
          // devices that report a non-mirrored front preview.
          mirrorMode={isAvatarUpload ? 'on' : 'auto'}
          // Only ever touch the torch on devices that have one — calling
          // setTorchMode on a flash-less (front) camera throws "No flash unit".
          {...(device.hasTorch ? { torchMode: flash === 'on' ? ('on' as const) : ('off' as const) } : {})}
          enableSmoothAutoFocus
          onConfigured={() => setCameraReady(true)}
          onStarted={() => setCameraReady(true)}
          onStopped={() => setCameraReady(false)}
          onError={(error: Error) => console.warn('[record-camera] VisionCamera error:', error.message)}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' }}>
          <ActivityIndicator color={colors.white} />
        </View>
      )}
      {/* Top bar */}
      <View style={{ position: 'absolute', top: 48, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={26} color={colors.white} />
        </Pressable>

        {recording ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(220,38,38,0.9)', paddingHorizontal: spacing.sm + 4, paddingVertical: 6, borderRadius: radius.pill, gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white }} />
            <Text style={{ color: colors.white, fontWeight: '800', fontSize: fontSize.sm }}>
              {String(Math.floor(elapsed / 60)).padStart(1, '0')}:{String(elapsed % 60).padStart(2, '0')}
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: spacing.sm + 4, paddingVertical: 6, borderRadius: radius.pill }}>
            <Text style={{ color: colors.white, fontWeight: '700', fontSize: fontSize.sm }}>{ar ? '30 ثانية' : '30 seconds'}</Text>
          </View>
        )}

        {device?.hasTorch ? (
          <Pressable
            onPress={() => setFlash(flash === 'off' ? 'on' : 'off')}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={22} color={flash === 'on' ? '#FBBF24' : colors.white} />
          </Pressable>
        ) : (
          <View style={{ width: 44, height: 44 }} />
        )}
      </View>

      {/* Progress ring */}
      {recording && (
        <View style={{ position: 'absolute', bottom: 95, left: SCREEN_WIDTH / 2 - 45, width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${progress}%`, backgroundColor: 'rgba(220,38,38,0.6)' }} />
        </View>
      )}

      {preparingPreview && (
        <View style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 136, borderRadius: radius.xl, backgroundColor: 'rgba(15,23,42,0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
          <ActivityIndicator color={colors.white} />
          <Text style={{ color: colors.white, fontWeight: '900', textAlign: 'center' }}>
            {ar ? 'بنجهّز صوت الفيديو للمعاينة...' : 'Preparing the video voice preview...'}
          </Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: spacing.xl }}>
        <View style={{ width: 52 }} />

        <Pressable
          onPress={recording ? stopRecording : startRecording}
          disabled={preparingPreview || recordingActionPending || (!recording && !cameraReady)}
          style={({ pressed }) => ({
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: colors.white,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.95 : 1 }],
            opacity: preparingPreview || recordingActionPending || (!recording && !cameraReady) ? 0.55 : 1,
          })}
        >
          {recordingActionPending ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <View style={{ width: recording ? 32 : 64, height: recording ? 32 : 64, borderRadius: recording ? 8 : 32, backgroundColor: '#EF4444' }} />
          )}
        </Pressable>

        {isAvatarUpload ? (
          // Face filters intentionally stay on the front camera. Swapping the
          // Nitro analysis output while ML Kit is processing a frame can tear
          // down its native promise, and a rear-camera face mask is not useful
          // for this child recording flow anyway.
          <View style={{ width: 52, height: 52 }} />
        ) : (
          <Pressable
            onPress={switchLegacyCamera}
            disabled={recording || recordingActionPending || preparingPreview || cameraSwitching}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: recording || recordingActionPending || preparingPreview || cameraSwitching ? 0.45 : 1,
            }}
          >
            {cameraSwitching ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Ionicons name="camera-reverse" size={26} color={colors.white} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  )
}
