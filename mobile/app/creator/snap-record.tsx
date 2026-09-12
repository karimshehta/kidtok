import { Ionicons } from '@expo/vector-icons'
import {
  CameraKitContext,
  CameraKitReactNative,
  CameraPreviewView,
  useCameraKit,
  useCameraPermissions,
  type Lens,
  type VideoRecording,
} from '@snap/camera-kit-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, StatusBar, Text, View } from 'react-native'
import Toast from 'react-native-toast-message'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'

import CreatorUploadLimitGate from '@/components/CreatorUploadLimitGate'
import RewardedAdPrompt from '@/components/RewardedAdPrompt'
import { ensureCreatorUploadQuota, isCreatorUploadLimitError } from '@/lib/creatorUploadQuota'
import { getSnapCameraKitConfig } from '@/lib/snapCameraKit'
import {
  getSnapLensUseCost,
  getSnapLensIconUrl,
  loadSnapLensCatalog,
  matchSnapLensCatalogItem,
  shouldShowSnapLens,
  snapLensPriceLabel,
  syncSnapLensesToCatalog,
  type SnapLensCatalogItem,
  useSnapLensOnce,
} from '@/lib/snapLensCatalog'
import { colors, fontSize, radius, spacing } from '@/lib/theme'

const MAX_DURATION_SEC = 30
const ANDROID_SNAP_SESSION_RESET_MS = 850
const SNAP_CAMERA_READY_TIMEOUT_MS = 7_000
const SNAP_LENSES_LOAD_TIMEOUT_MS = 8_000

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

let snapSessionResetChain: Promise<void> = Promise.resolve()

function resetSnapCameraSession(delayMs = ANDROID_SNAP_SESSION_RESET_MS) {
  if (Platform.OS !== 'android') return Promise.resolve()

  snapSessionResetChain = snapSessionResetChain
    .catch(() => {})
    .then(async () => {
      await CameraKitReactNative.closeSession().catch(() => {})
      await wait(delayMs)
    })

  return snapSessionResetChain
}

function LensOneVideoUsePrompt({
  visible,
  ar,
  lens,
  meta,
  busy,
  onCancel,
  onConfirm,
  onEarnCoins,
}: {
  visible: boolean
  ar: boolean
  lens?: Lens | null
  meta?: SnapLensCatalogItem | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  onEarnCoins: () => void
}) {
  const cost = getSnapLensUseCost(meta || undefined)
  const icon = meta?.icon_url || (lens ? getSnapLensIconUrl(lens) : null)
  const title = ar
    ? (meta?.name_ar || meta?.name_en || lens?.name || 'عدسة سناب')
    : (meta?.name_en || meta?.name_ar || lens?.name || 'Snap face')

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.70)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <LinearGradient
          colors={['#FFFFFF', '#FFF7ED', '#ECFEFF']}
          style={{ width: '100%', borderRadius: 30, padding: spacing.lg, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' }}
        >
          <View style={{ alignItems: 'center' }}>
            <LinearGradient colors={['#F97316', '#F43F5E', '#8B5CF6']} style={{ width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {icon ? <Image source={{ uri: icon }} style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff' }} /> : <Ionicons name="sparkles" size={38} color="#fff" />}
            </LinearGradient>
            <Text style={{ marginTop: spacing.md, color: colors.grey900, fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center' }}>
              {ar ? 'استخدم الوش للفيديو ده؟' : 'Use this face for one video?'}
            </Text>
            <Text style={{ marginTop: 6, color: colors.grey600, fontSize: fontSize.sm, fontWeight: '800', textAlign: 'center', lineHeight: 20 }}>
              {ar
                ? `${title} هيتخصم ${cost} كوين عند بداية التسجيل، والاستخدام للفيديو الحالي فقط.`
                : `${title} costs ${cost} coins when recording starts. It is for this video only.`}
            </Text>
          </View>

          <View style={{ marginTop: spacing.lg, flexDirection: ar ? 'row-reverse' : 'row', gap: 10 }}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={{ flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.grey700, fontWeight: '900' }}>{ar ? 'إلغاء' : 'Cancel'}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              style={{ flex: 1.35, height: 48, borderRadius: radius.pill, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', flexDirection: ar ? 'row-reverse' : 'row', gap: 7 }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="videocam" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '900' }}>
                {ar ? `ادفع ${cost} وسجل` : `Pay ${cost} & record`}
              </Text>
            </Pressable>
          </View>

          <Pressable onPress={onEarnCoins} disabled={busy} style={{ marginTop: spacing.md, alignSelf: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: '#ECFEFF', opacity: busy ? 0.5 : 1 }}>
            <Text style={{ color: colors.primary, fontWeight: '900', fontSize: fontSize.xs }}>
              {ar ? 'محتاج كوينز؟ شاهد إعلان مكافأة' : 'Need coins? Watch a rewarded ad'}
            </Text>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  )
}

function SnapRecorderInner({ lensGroupId, ar }: { lensGroupId: string; ar: boolean }) {
  const router = useRouter()
  const qc = useQueryClient()
  const { isSessionReady, loadLensGroup, applyLens, removeLens, takeVideo } = useCameraKit()
  const { request } = useCameraPermissions()
  const [permissionsReady, setPermissionsReady] = useState(Platform.OS !== 'android')
  const [lenses, setLenses] = useState<Lens[]>([])
  const [lensMetaById, setLensMetaById] = useState<Record<string, SnapLensCatalogItem | undefined>>({})
  const [selectedLensId, setSelectedLensId] = useState<string | null>(null)
  const [applyingLensId, setApplyingLensId] = useState<string | null>(null)
  const [lensUseCandidate, setLensUseCandidate] = useState<{ lens: Lens; meta: SnapLensCatalogItem } | null>(null)
  const [lensUseBusy, setLensUseBusy] = useState(false)
  const [rewardPromptVisible, setRewardPromptVisible] = useState(false)
  const [loadingLenses, setLoadingLenses] = useState(false)
  const [startupTimedOut, setStartupTimedOut] = useState(false)
  const [recording, setRecording] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front')
  const [cameraSwitching, setCameraSwitching] = useState(false)
  const [quotaGateVisible, setQuotaGateVisible] = useState(false)
  const recordingRef = useRef<VideoRecording | null>(null)
  const elapsedRef = useRef(0)
  const selectedLensRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      if (Platform.OS === 'android') {
        await request([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ])
      }
      if (active) setPermissionsReady(true)
    })().catch((error) => {
      console.warn('[snap-camera] permission request failed:', error)
      if (active) setPermissionsReady(false)
    })
    return () => { active = false }
  }, [request])

  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => {
      elapsedRef.current = Math.min(MAX_DURATION_SEC, elapsedRef.current + 1)
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [recording])

  useEffect(() => {
    if (isSessionReady && permissionsReady) {
      setStartupTimedOut(false)
      return
    }
    setStartupTimedOut(false)
    const timer = setTimeout(() => {
      setStartupTimedOut(true)
    }, SNAP_CAMERA_READY_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isSessionReady, permissionsReady])

  useEffect(() => {
    selectedLensRef.current = selectedLensId
  }, [selectedLensId])

  const stopRecording = useCallback(async () => {
    const current = recordingRef.current
    if (!current || finishing) return
    setFinishing(true)
    try {
      const duration = Math.max(1, Math.min(MAX_DURATION_SEC, elapsedRef.current || elapsed || 1))
      const recorded = await current.stop()
      recordingRef.current = null
      setRecording(false)
      setElapsed(0)
      elapsedRef.current = 0
      if (!recorded?.uri) throw new Error('Snap Camera Kit returned an empty video file.')
      await removeLens().catch(() => {})
      if (Platform.OS === 'android') {
        await resetSnapCameraSession(180)
      }
      router.replace({
        pathname: '/creator/upload',
        params: {
          sourceUri: recorded.uri,
          sourceDurationSeconds: String(duration),
        },
      })
    } catch (error: any) {
      console.warn('[snap-camera] stop recording failed:', error)
      recordingRef.current = null
      setRecording(false)
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'التسجيل ماكملش' : 'Recording did not finish',
        text2: error?.message || (ar ? 'جرّب تاني بعد شوية' : 'Please try again'),
        props: { icon: '🎥', accent: 'purple' },
      })
    } finally {
      setFinishing(false)
    }
  }, [ar, elapsed, finishing, removeLens, router])

  useEffect(() => {
    if (!recording) return
    if (elapsed >= MAX_DURATION_SEC) void stopRecording()
  }, [elapsed, recording, stopRecording])

  useEffect(() => {
    return () => {
      if (recordingRef.current) void recordingRef.current.stop().catch(() => {})
      void removeLens().catch(() => {})
    }
  }, [removeLens])

  useEffect(() => {
    if (!isSessionReady || !permissionsReady || !lensGroupId) return
    let cancelled = false
    setLoadingLenses(true)
    ;(async () => {
      const group = await withTimeout(
        loadLensGroup(lensGroupId),
        SNAP_LENSES_LOAD_TIMEOUT_MS,
        'SNAP_LENSES_LOAD_TIMEOUT'
      )
      let catalog = await loadSnapLensCatalog()

      if (!cancelled) {
        const discovery = await syncSnapLensesToCatalog(group, lensGroupId)
        if (!cancelled && discovery.inserted > 0) {
          catalog = await loadSnapLensCatalog()
        }
      }

      if (cancelled) return
      const visible = group
        .map((lens) => ({ lens, meta: matchSnapLensCatalogItem(lens, catalog) }))
        .filter(({ lens, meta }) => shouldShowSnapLens(lens, meta))
        .sort((left, right) => {
          const leftOrder = left.meta?.sort_order ?? 9999
          const rightOrder = right.meta?.sort_order ?? 9999
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
          return String(left.lens.name || '').localeCompare(String(right.lens.name || ''))
        })
      setLensMetaById(Object.fromEntries(visible.map(({ lens, meta }) => [lens.id, meta])))
      setLenses(visible.map(({ lens }) => lens))
      const first = visible[0]?.lens
      if (first && !selectedLensRef.current) {
        setApplyingLensId(first.id)
        const ok = await withTimeout(
          applyLens(first.id),
          SNAP_LENSES_LOAD_TIMEOUT_MS,
          'SNAP_FIRST_LENS_TIMEOUT'
        )
        if (!cancelled && ok) {
          selectedLensRef.current = first.id
          setSelectedLensId(first.id)
        }
      }
    })()
      .catch((error) => {
        console.warn('[snap-camera] could not load lenses:', error)
        Toast.show({
          type: 'kidReward',
          text1: ar ? 'عدسات Snap مش جاهزة' : 'Snap lenses are not ready',
          text2: ar ? 'هتقدر تسجل فيديو عادي بدلها.' : 'You can still record a normal video.',
          props: { icon: '✨', accent: 'blue' },
        })
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLenses(false)
          setApplyingLensId(null)
        }
      })
    return () => {
      cancelled = true
      setApplyingLensId(null)
    }
  }, [applyLens, ar, isSessionReady, lensGroupId, loadLensGroup, permissionsReady])

  const canRecord = isSessionReady && permissionsReady && !loadingLenses && !finishing && !cameraSwitching && !applyingLensId

  const leaveRecorder = useCallback(async () => {
    if (finishing) return
    try {
      if (recordingRef.current) {
        await recordingRef.current.stop().catch(() => {})
        recordingRef.current = null
      }
      await removeLens().catch(() => {})
      if (Platform.OS === 'android') {
        await resetSnapCameraSession(180)
      }
      selectedLensRef.current = null
      setSelectedLensId(null)
    } finally {
      router.back()
    }
  }, [finishing, removeLens, router])

  const openNormalRecorder = useCallback(async () => {
    if (finishing || recording) return
    setApplyingLensId('__none__')
    try {
      if (recordingRef.current) {
        await recordingRef.current.stop().catch(() => {})
        recordingRef.current = null
      }
      await removeLens().catch(() => {})
      selectedLensRef.current = null
      setSelectedLensId(null)
      if (Platform.OS === 'android') {
        await resetSnapCameraSession(220)
      }
      router.replace('/creator/record')
    } catch (error) {
      console.warn('[snap-camera] open normal recorder failed:', error)
      router.replace('/creator/record')
    } finally {
      setApplyingLensId(null)
    }
  }, [finishing, removeLens, recording, router])

  const beginRecording = useCallback(async (options?: { checkQuota?: boolean }) => {
    if (!canRecord || recording) return
    try {
      if (options?.checkQuota !== false) {
        await ensureCreatorUploadQuota(ar)
      }
      elapsedRef.current = 0
      setElapsed(0)
      recordingRef.current = takeVideo()
      setRecording(true)
    } catch (error: any) {
      if (isCreatorUploadLimitError(error)) {
        setQuotaGateVisible(true)
        return
      }
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'مش قادر نبدأ التسجيل' : 'Could not start recording',
        text2: error?.message || (ar ? 'جرّب تاني' : 'Try again'),
        props: { icon: '🎬', accent: 'purple' },
      })
    }
  }, [ar, canRecord, recording, takeVideo])

  const startRecording = useCallback(async () => {
    if (!canRecord || recording) return
    const currentLensId = selectedLensRef.current
    const meta = currentLensId ? lensMetaById[currentLensId] : undefined
    const cost = getSnapLensUseCost(meta)
    const selectedLens = currentLensId ? lenses.find((lens) => lens.id === currentLensId) : undefined

    if (meta && selectedLens && cost > 0) {
      setLensUseCandidate({ lens: selectedLens, meta })
      return
    }

    await beginRecording()
  }, [beginRecording, canRecord, lensMetaById, lenses, recording])

  const confirmLensOneVideoUse = useCallback(async () => {
    if (!lensUseCandidate || lensUseBusy || !canRecord || recording) return
    setLensUseBusy(true)
    try {
      await ensureCreatorUploadQuota(ar)
      const result = await useSnapLensOnce(lensUseCandidate.meta.id)
      const spent = Number(result?.coins_spent || getSnapLensUseCost(lensUseCandidate.meta) || 0)
      setLensUseCandidate(null)
      qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'coins' })
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'العدسة جاهزة للفيديو ده!' : 'Lens ready for this video!',
        text2: spent > 0
          ? (ar ? `اتخصم ${spent} كوين لاستخدام واحد.` : `${spent} coins used for one recording.`)
          : (ar ? 'استخدام مجاني.' : 'Free use.'),
        props: { icon: '✨', accent: spent > 0 ? 'gold' : 'blue' },
      })
      await beginRecording({ checkQuota: false })
    } catch (error: any) {
      if (isCreatorUploadLimitError(error)) {
        setLensUseCandidate(null)
        setQuotaGateVisible(true)
        return
      }
      const message = String(error?.message || error || '')
      if (message.includes('INSUFFICIENT_COINS')) {
        Toast.show({
          type: 'kidReward',
          text1: ar ? 'محتاج كوينز أكتر 🪙' : 'You need more coins 🪙',
          text2: ar ? 'شاهد إعلان مكافأة واجمع كوينز، وبعدها دوس Record تاني.' : 'Watch a rewarded ad to earn coins, then press Record again.',
          props: { icon: '🪙', accent: 'gold' },
        })
        setLensUseCandidate(null)
        setRewardPromptVisible(true)
        return
      }
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'مش قادر نجهز العدسة' : 'Could not prepare lens',
        text2: message.slice(0, 110) || (ar ? 'جرب تاني بعد شوية.' : 'Please try again.'),
        props: { icon: '✨', accent: 'purple' },
      })
    } finally {
      setLensUseBusy(false)
    }
  }, [ar, beginRecording, canRecord, lensUseBusy, lensUseCandidate, qc, recording])

  const chooseLens = useCallback(async (lens: Lens) => {
    if (!isSessionReady || recording || finishing || applyingLensId) return
    if (selectedLensRef.current === lens.id) return
    setApplyingLensId(lens.id)
    try {
      const ok = await withTimeout(
        applyLens(lens.id),
        SNAP_LENSES_LOAD_TIMEOUT_MS,
        'SNAP_APPLY_LENS_TIMEOUT'
      )
      if (ok) {
        selectedLensRef.current = lens.id
        setSelectedLensId(lens.id)
      }
    } catch (error: any) {
      console.warn('[snap-camera] apply lens failed:', error)
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'العدسة مش جاهزة' : 'Lens is not ready',
        text2: ar ? 'جرّب عدسة تانية أو حاول كمان شوية.' : 'Try another lens or try again shortly.',
        props: { icon: '✨', accent: 'blue' },
      })
    } finally {
      setApplyingLensId(null)
    }
  }, [applyLens, applyingLensId, ar, finishing, isSessionReady, recording])

  const switchCamera = useCallback(() => {
    if (recording || finishing || cameraSwitching) return
    setCameraSwitching(true)
    setTimeout(() => {
      setCameraPosition((current) => current === 'front' ? 'back' : 'front')
      setTimeout(() => setCameraSwitching(false), 260)
    }, 120)
  }, [cameraSwitching, finishing, recording])

  if (quotaGateVisible) {
    return (
      <CreatorUploadLimitGate
        ar={ar}
        onCancel={() => setQuotaGateVisible(false)}
        onUnlocked={() => setQuotaGateVisible(false)}
      />
    )
  }

  if (startupTimedOut && (!isSessionReady || !permissionsReady)) {
    return (
      <LinearGradient colors={['#10103A', '#03BBE5']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <Ionicons name="logo-snapchat" size={72} color="#fff" />
        <Text style={{ color: '#fff', fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center', marginTop: spacing.lg }}>
          {ar ? 'كاميرا Snap لسه مش جاهزة' : 'Snap Camera is not ready yet'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.sm, lineHeight: 24 }}>
          {ar
            ? 'لو نسخة Production لسه تحت مراجعة Snap، العدسات ممكن تتأخر. سجّل عادي دلوقت بدل ما الشاشة تعلق.'
            : 'If the Production version is still under Snap review, lenses may stall. Record normally for now instead of getting stuck.'}
        </Text>
        <Pressable onPress={openNormalRecorder} style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: '#fff' }}>
          <Text style={{ color: colors.primary, fontWeight: '900' }}>
            {ar ? 'افتح الكاميرا العادية' : 'Open normal recorder'}
          </Text>
        </Pressable>
      </LinearGradient>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      {isSessionReady && permissionsReady && !cameraSwitching ? (
        <CameraPreviewView
          key={cameraPosition}
          style={{ flex: 1 }}
          cameraPosition={cameraPosition}
          mirrorFramesHorizontally={cameraPosition === 'front'}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: '#fff', fontWeight: '900' }}>
            {ar ? 'بنجهّز كاميرا Snap...' : 'Preparing Snap Camera...'}
          </Text>
        </View>
      )}

      <LinearGradient colors={['rgba(0,0,0,0.7)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 34, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={leaveRecorder} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: recording ? '#EF4444' : 'rgba(0,0,0,0.45)' }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: fontSize.base }}>
              {recording ? `${Math.max(0, MAX_DURATION_SEC - elapsed)}s` : `${MAX_DURATION_SEC} seconds`}
            </Text>
          </View>
          <Pressable
            onPress={switchCamera}
            disabled={recording || finishing || cameraSwitching}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', opacity: (recording || cameraSwitching) ? 0.45 : 1 }}
          >
            <Ionicons name="camera-reverse" size={25} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.86)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, paddingBottom: 18, paddingTop: spacing.lg }}>
        <View style={{ minHeight: 66, justifyContent: 'center' }}>
          {loadingLenses ? (
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '900' }}>
              {ar ? 'بنحمّل العدسات...' : 'Loading lenses...'}
            </Text>
          ) : lenses.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: spacing.md, alignItems: 'center' }}
            >
              {lenses.map((lens) => {
                const active = selectedLensId === lens.id
                const applying = applyingLensId === lens.id
                const meta = lensMetaById[lens.id]
                const icon = meta?.icon_url || getSnapLensIconUrl(lens)
                const lensSize = active ? 58 : 48
                const lensUseCost = getSnapLensUseCost(meta)
                const showAccessBadge = active || lensUseCost > 0
                const displayName = ar
                  ? (meta?.name_ar || meta?.name_en || lens.name || 'عدسة')
                  : (meta?.name_en || meta?.name_ar || lens.name || 'Lens')
                return (
                  <Pressable
                    key={lens.id}
                    onPress={() => chooseLens(lens)}
                    disabled={recording || finishing || Boolean(applyingLensId)}
                    style={{ alignItems: 'center', width: active ? 74 : 64, opacity: recording ? 0.45 : active ? 1 : 0.58, transform: [{ scale: active ? 1 : 0.94 }] }}
                  >
                    <View style={{ width: lensSize, height: lensSize, borderRadius: lensSize / 2, backgroundColor: active ? colors.primary : 'rgba(255,255,255,0.16)', borderWidth: active ? 4 : 1.5, borderColor: active ? '#fff' : 'rgba(255,255,255,0.52)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {icon ? <Image source={{ uri: icon }} style={{ width: '100%', height: '100%' }} /> : <Ionicons name="sparkles" size={28} color="#fff" />}
                      {applying && (
                        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' }}>
                          <ActivityIndicator color="#fff" size="small" />
                        </View>
                      )}
                    </View>
                    {showAccessBadge && (
                    <View style={{ marginTop: 4, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: radius.pill, backgroundColor: active ? '#fff' : 'rgba(255,255,255,0.16)' }}>
                      <Text numberOfLines={1} style={{ color: active ? colors.primary : '#fff', fontSize: 8, fontWeight: '900' }}>
                        {snapLensPriceLabel(meta, ar)}
                      </Text>
                    </View>
                    )}
                    <Text numberOfLines={1} style={{ marginTop: 3, color: '#fff', fontSize: active ? 10 : 8, fontWeight: '900', maxWidth: active ? 74 : 64, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 4 }}>
                      {displayName}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : (
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ color: '#fff', fontWeight: '900', textAlign: 'center' }}>
                {ar ? 'مفيش عدسات متاحة في الجروب ده' : 'No lenses found in this group'}
              </Text>
              <Pressable onPress={() => router.replace('/creator/record')} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontWeight: '900' }}>
                  {ar ? 'استخدم التسجيل العادي' : 'Use normal camera'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
          <Pressable
            onPress={() => router.replace('/creator/upload')}
            disabled={recording || finishing}
            style={{ alignItems: 'center', opacity: recording ? 0.35 : 0.7 }}
          >
            <Ionicons name="images-outline" size={23} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10, marginTop: 2 }}>
              {ar ? 'المعرض' : 'Gallery'}
            </Text>
          </Pressable>

          <Pressable
            onPress={recording ? stopRecording : startRecording}
            disabled={!canRecord}
            style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: canRecord ? 0.7 : 0.45 }}
          >
            <View style={{ width: recording ? 34 : 58, height: recording ? 34 : 58, borderRadius: recording ? 10 : 29, backgroundColor: recording ? '#EF4444' : '#F83B4B' }} />
          </Pressable>

          <Pressable
            onPress={openNormalRecorder}
            disabled={recording || finishing || Boolean(applyingLensId)}
            style={{ alignItems: 'center', opacity: recording ? 0.35 : selectedLensId ? 0.7 : 0.5 }}
          >
            {applyingLensId === '__none__' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="sparkles-outline" size={23} color="#fff" />}
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10, marginTop: 2 }}>
              {ar ? 'بدون' : 'None'}
            </Text>
          </Pressable>
        </View>
      </LinearGradient>

      <LensOneVideoUsePrompt
        visible={Boolean(lensUseCandidate)}
        ar={ar}
        lens={lensUseCandidate?.lens}
        meta={lensUseCandidate?.meta}
        busy={lensUseBusy}
        onCancel={() => {
          if (!lensUseBusy) setLensUseCandidate(null)
        }}
        onConfirm={confirmLensOneVideoUse}
        onEarnCoins={() => {
          setLensUseCandidate(null)
          setRewardPromptVisible(true)
        }}
      />

      <RewardedAdPrompt
        visible={rewardPromptVisible}
        mode="gate"
        onDismiss={() => {
          setRewardPromptVisible(false)
          qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'coins' })
        }}
      />

      {finishing && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: '#fff', fontWeight: '900' }}>
            {ar ? 'بنجهّز الفيديو...' : 'Preparing video...'}
          </Text>
        </View>
      )}
    </View>
  )
}

export default function SnapRecordScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const config = useMemo(() => getSnapCameraKitConfig(), [])
  const [cameraKitMounted, setCameraKitMounted] = useState(false)
  const [cameraKitSessionKey, setCameraKitSessionKey] = useState(0)

  useFocusEffect(useCallback(() => {
    let cancelled = false
    setCameraKitMounted(false)
    ;(async () => {
      if (Platform.OS === 'android') {
        await resetSnapCameraSession(ANDROID_SNAP_SESSION_RESET_MS)
      }
      if (cancelled) return
      setCameraKitSessionKey((key) => key + 1)
      setCameraKitMounted(true)
    })()

    return () => {
      cancelled = true
      setCameraKitMounted(false)
      setCameraKitSessionKey((key) => key + 1)
      void resetSnapCameraSession(220)
    }
  }, []))

  if (!config.enabled) {
    return (
      <LinearGradient colors={['#10103A', '#03BBE5']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <Ionicons name="logo-snapchat" size={72} color="#fff" />
        <Text style={{ color: '#fff', fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center', marginTop: spacing.lg }}>
          {ar ? 'Snap Camera Kit محتاج توكن في البيلد' : 'Snap Camera Kit needs a build token'}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: fontSize.base, textAlign: 'center', marginTop: spacing.sm, lineHeight: 24 }}>
          {ar
            ? 'ضيف EXPO_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN في EAS Environment، أو سجّل فيديو عادي دلوقت.'
            : 'Add EXPO_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN in EAS Environment, or record normally for now.'}
        </Text>
        <Pressable onPress={() => router.replace('/creator/record')} style={{ marginTop: spacing.xl, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: '#fff' }}>
          <Text style={{ color: colors.primary, fontWeight: '900' }}>
            {ar ? 'افتح التسجيل العادي' : 'Open normal recorder'}
          </Text>
        </Pressable>
      </LinearGradient>
    )
  }

  if (!cameraKitMounted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: '#fff', fontWeight: '900' }}>
          {ar ? 'بنجهّز كاميرا Snap...' : 'Preparing Snap Camera...'}
        </Text>
      </View>
    )
  }

  return (
    <CameraKitContext key={`snap-session-${cameraKitSessionKey}`} apiToken={config.apiToken} logLevels={['error', 'warn']}>
      <SnapRecorderInner lensGroupId={config.lensGroupId} ar={ar} />
    </CameraKitContext>
  )
}
