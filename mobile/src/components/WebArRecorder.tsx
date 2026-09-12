import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, PermissionsAndroid, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import * as FileSystem from 'expo-file-system/legacy'
import { Asset } from 'expo-asset'
import { Ionicons } from '@expo/vector-icons'
import Toast from 'react-native-toast-message'

import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

import { colors, fontSize, radius, spacing } from '@/lib/theme'
import { KID_VOICES } from '@/lib/kidVoices'
import { AR_MODELS } from '@/lib/arModels'
import { WRINKLE_TEXTURES } from '@/lib/wrinkleTextures'
import { FACE_AR_ART_ASSETS } from '@/lib/faceArArtAssets'
import { WEB_AR_FILTERS, WEB_AR_HTML, WEB_AR_INDEX_FILE } from '@/lib/webArHtml'
import { FACE_AR_RUNTIME } from '@/facear/config'
import { buildSdkIndexHtml, FACE_AR_BUNDLE_FILE } from '@/facear/webview/sdkHtml'

const MAX_DURATION_SEC = 30

// Module-scope (survives across mounts within one JS engine instance, unlike
// a ref/state which resets per component instance) — direct evidence for
// "is a second WebArRecorder/WebView ever mounted before the first one is
// gone." A concurrentMounts reading above 1 in the logs below is the
// RN-side half of the duplicate-rendering-instance investigation: the web
// page's own JS (see webArHtml.ts's window.__WEB_AR_RUNTIME__ guard) cannot
// see a sibling WebView at all, since each WebView is a fully isolated
// native engine/DOM — only React Native's own component lifecycle can catch
// two of them being alive at the same time.
let webArRecorderConcurrentMounts = 0
let webArRecorderMountSequence = 0

// Everything the AR page needs (index.html + every .glb) lives together in
// one real folder so the page can `fetch('./cat_ears.glb')` as a normal
// same-origin file:// read — no React Native↔WebView bridge traffic for
// model bytes at all (that was the previous approach, and large base64
// payloads pushed through postMessage's injected-JS promises caused
// `JPromise was destroyed` timeouts on Android).
const AR_DIR = `${FileSystem.cacheDirectory}armodels/`
const AR_INDEX_URI = `${AR_DIR}${WEB_AR_INDEX_FILE}`

/**
 * Idempotent one-time setup: write the current HTML + copy every bundled GLB
 * into AR_DIR. Safe to call every mount — the files are tiny (<110KB each)
 * and this keeps the on-disk copy in sync after an app update changes the JS
 * bundle (which can change WEB_AR_HTML or swap a .glb).
 */
async function prepareArAssets(): Promise<void> {
  await FileSystem.makeDirectoryAsync(AR_DIR, { intermediates: true }).catch(() => {})
  // Runtime selection (Phase 1). 'legacy' = the template-literal runtime
  // inlined in WEB_AR_HTML (default, unchanged). 'sdk' = the slim generated
  // shell that loads the esbuild bundle. Both write to the SAME index.html
  // path and share the SAME GLB/PNG siblings — only the runtime delivery
  // differs, so the parity test is a pure A/B on this one flag.
  const html = FACE_AR_RUNTIME === 'sdk' ? buildSdkIndexHtml() : WEB_AR_HTML
  await FileSystem.writeAsStringAsync(AR_INDEX_URI, html)
  console.log(`[web-ar] index.html written (runtime=${FACE_AR_RUNTIME}) to`, AR_INDEX_URI)
  // GLB accessory models + wrinkle-mask PNGs land in the same folder, all
  // fetched the same way by the page (same-origin file:// siblings of
  // index.html). In 'sdk' mode the esbuild bundle is copied alongside them
  // (from a .txt asset → facear.bundle.js the page loads via <script src>).
  const bundled = [
    ...AR_MODELS.map((m) => ({ file: m.file, module: m.module as number })),
    ...WRINKLE_TEXTURES.map((t) => ({ file: t.file, module: t.module as number })),
    ...FACE_AR_ART_ASSETS.map((asset) => ({ file: asset.file, module: asset.module as number })),
  ]
  if (FACE_AR_RUNTIME === 'sdk') {
    bundled.push({ file: FACE_AR_BUNDLE_FILE, module: require('../../assets/facear/facear.bundle.txt') as number })
  }
  for (const item of bundled) {
    const asset = Asset.fromModule(item.module)
    await asset.downloadAsync()
    if (!asset.localUri) throw new Error(`asset ${item.file} has no localUri after downloadAsync`)
    const dest = `${AR_DIR}${item.file}`
    await FileSystem.deleteAsync(dest, { idempotent: true })
    await FileSystem.copyAsync({ from: asset.localUri, to: dest })
    const info = await FileSystem.getInfoAsync(dest)
    console.log('[web-ar] copied', item.file, '→', dest, info.exists ? `(${(info as any).size} bytes)` : '(MISSING!)')
  }
}

// Premium filters show a lock; unlocking with coins reuses the avatar
// catalog and ships later (dev builds keep everything open for testing).
const PREMIUM_MASKS: string[] = []

// Single source of truth: builtin filters from webArHtml.ts + bundled GLB
// face masks from arModels.ts — adding a model automatically adds its button.
// Picker = Grandpa (aging) + the GLB accessories (glasses, cat ears, rabbit
// ears) — re-enabled on user request. Known caveat, deliberately accepted:
// the parked stale-accessory bug (a previous accessory occasionally staying
// visible after switching) may resurface with accessories selectable again;
// the Grandpa face-warp now draws opaque over the whole face region, which
// masks any face-area ghosting, but ear/head accessories sit outside it.
const ANIMALS: { id: string; emoji: string; color: string }[] = [
  ...WEB_AR_FILTERS,
  ...AR_MODELS.map((model) => ({ id: model.id, emoji: model.emoji, color: model.color })),
]

type WebMessage =
  | { type: 'ready' }
  | { type: 'loading'; label?: string }
  | { type: 'error'; message: string }
  | { type: 'tracking'; found: boolean }
  | { type: 'videoStart' }
  | { type: 'videoChunk'; index: number; total: number; data: string }
  | { type: 'videoDone'; mime: string; size: number }
  | { type: 'filterReady'; id: string }
  | { type: 'filterError'; id: string; message: string }
  | { type: 'debug'; message: string }
  | { type: 'diag'; stage: string; [key: string]: unknown }

/**
 * A 'diag' payload is a FAILURE only if it explicitly reports one: a
 * shaderCompile sub-object with vertexOk/fragmentOk/linked false, or any
 * glError-prefixed / status field that isn't the expected "fine" value.
 * Everything else (vertex/index/uv counts, camera near/far, bounding box,
 * world position, material flags) is informational, not a pass/fail signal
 * — so a clean run must log via console.log/info, never console.error.
 */
function isDiagFailure(rest: Record<string, unknown>): boolean {
  const shaderCompile = rest.shaderCompile as { vertexOk?: boolean; fragmentOk?: boolean; linked?: boolean } | undefined
  if (shaderCompile && (shaderCompile.vertexOk === false || shaderCompile.fragmentOk === false || shaderCompile.linked === false)) {
    return true
  }
  for (const [key, value] of Object.entries(rest)) {
    if (key.toLowerCase().startsWith('glerror') && typeof value === 'string' && value !== 'NO_ERROR') return true
    if (key === 'status' && typeof value === 'string' && value !== 'RENDERED') return true
  }
  return false
}

type Props = {
  ar: boolean
  initialAnimal: string
  /** voiceKey: the voice-transform profile picked in the camera (null = keep real voice). */
  onRecorded: (uri: string, seconds: number, voiceKey: string | null) => void
  onClose: () => void
  /** Opens the pick-from-gallery upload flow. */
  onOpenGallery?: () => void
}

function KidLoader({ ar }: { ar: boolean }) {
  const bounce = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [bounce])

  const translateY = bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -22] })
  return (
    <View style={styles.loader}>
      <Animated.Text style={{ fontSize: 64, transform: [{ translateY }] }}>🎪</Animated.Text>
      <ActivityIndicator color={colors.white} style={{ marginTop: spacing.md }} />
      <Text style={styles.loaderText}>{ar ? 'بنجهّز الحيوانات السحرية...' : 'Preparing the magic animals...'}</Text>
    </View>
  )
}

/**
 * The avatar camera: MindAR face AR inside a WebView. Records the mask BURNED
 * INTO the clip and hands the saved file back through onRecorded.
 */
export default function WebArRecorder({ ar, initialAnimal, onRecorded, onClose, onOpenGallery }: Props) {
  const webviewRef = useRef<WebView>(null)
  const chunksRef = useRef<string[]>([])
  const recordStartRef = useRef(0)
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards every async continuation (onMessage, asset prep) from acting after
  // this screen has been torn down — the crash fix's RN-side half of "never
  // resolve a promise / postMessage after destruction".
  const mountedRef = useRef(true)
  // One id per component instance, assigned once — identifies THIS mount in
  // the logs below regardless of how many times the component re-renders.
  const instanceIdRef = useRef<string | null>(null)
  if (instanceIdRef.current === null) {
    webArRecorderMountSequence += 1
    instanceIdRef.current = `war_${webArRecorderMountSequence}_${Date.now().toString(36)}`
  }

  // Requirement: confirm only one WebArRecorder/WebView is ever mounted at
  // once. Logs on mount and unmount; concurrentMounts > 1 in either log line
  // is direct, unambiguous proof of a stacked WebView (this component does
  // not itself render more than one <WebView>, so overlap can only come from
  // two INSTANCES of this component being alive together — e.g. a navigation
  // transition that does not unmount the previous screen before the next one
  // mounts).
  useEffect(() => {
    webArRecorderConcurrentMounts += 1
    console.log('[web-ar][LIFECYCLE] WebArRecorder MOUNT', {
      instanceId: instanceIdRef.current,
      concurrentMounts: webArRecorderConcurrentMounts,
    })
    return () => {
      webArRecorderConcurrentMounts -= 1
      console.log('[web-ar][LIFECYCLE] WebArRecorder UNMOUNT', {
        instanceId: instanceIdRef.current,
        concurrentMounts: webArRecorderConcurrentMounts,
      })
    }
  }, [])

  const [assetsReady, setAssetsReady] = useState(false)
  const [assetsError, setAssetsError] = useState<string | null>(null)
  // Android-only: the WebView's own permission check (RNCWebChromeClient.
  // onPermissionRequest) reads the OS permission SYNCHRONOUSLY. If it is not
  // yet actually granted at that exact moment, the WebView triggers its OWN
  // Activity.requestPermissions() call — and if that fires concurrently with
  // a still-in-flight request from elsewhere (e.g. the outer screen's own
  // camera-permission gate), the two clash on Android's single pending-
  // request slot and the loser's native bridge promise is abandoned — this
  // is the exact `JPromise was destroyed` crash. Confirming permissions
  // ourselves, directly and freshly, right here — before the WebView is ever
  // created — guarantees onPermissionRequest always hits its synchronous
  // grant path with no dialog and no race. (mediaCapturePermissionGrantType
  // is a NO-OP on Android in this react-native-webview version — verified in
  // its native source — so it cannot be relied on alone; it still helps on
  // iOS, where it is wired up, so it stays set below.)
  const [permissionsConfirmed, setPermissionsConfirmed] = useState(Platform.OS !== 'android')
  const [permissionsError, setPermissionsError] = useState(false)
  const [pageReady, setPageReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [animal, setAnimal] = useState<string>(initialAnimal)
  const [trackingLost, setTrackingLost] = useState(false)
  // Voice-transform profile: applied to the child's real speech after
  // recording (ffmpeg), so the clip "speaks" as an old man, a girl, a robot...
  const [voiceKey, setVoiceKey] = useState<string | null>(null)
  const activeAttribution = AR_MODELS.find((model) => model.id === animal)?.attribution
  const voiceKeyRef = useRef<string | null>(null)
  voiceKeyRef.current = voiceKey
  const previewPlayerRef = useRef<AudioPlayer | null>(null)

  const stopVoicePreview = useCallback(() => {
    try { previewPlayerRef.current?.pause() } catch {}
    try { previewPlayerRef.current?.release() } catch {}
    previewPlayerRef.current = null
  }, [])

  const pickVoice = useCallback((id: string | null) => {
    setVoiceKey(id)
    stopVoicePreview()
    if (!id) return
    const voice = KID_VOICES.find((item) => item.id === id)
    if (!voice) return
    try {
      // Play the real styled sample so the child hears how their clip will sound.
      const player = createAudioPlayer(voice.preview)
      previewPlayerRef.current = player
      player.play()
    } catch (err) {
      console.warn('[web-ar] voice preview failed:', err)
    }
  }, [stopVoicePreview])

  useEffect(() => () => stopVoicePreview(), [stopVoicePreview])

  // Fresh, direct OS permission confirmation (Android only — see the
  // permissionsConfirmed comment above for why this exists).
  useEffect(() => {
    if (Platform.OS !== 'android') return
    let cancelled = false
    ;(async () => {
      try {
        const [camera, mic] = await Promise.all([
          PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA),
          PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO),
        ])
        if (cancelled || !mountedRef.current) return
        if (camera && mic) {
          setPermissionsConfirmed(true)
          return
        }
        // The outer screen's own gate should already have requested these;
        // if they are somehow still missing here, ask once ourselves so the
        // WebView never has to (that is what caused the concurrent-request
        // race in the first place).
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ])
        if (cancelled || !mountedRef.current) return
        const granted =
          results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
          results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
        setPermissionsConfirmed(granted)
        setPermissionsError(!granted)
      } catch (err) {
        console.warn('[web-ar] permission confirmation failed:', err)
        if (!cancelled && mountedRef.current) setPermissionsError(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // One-time (per mount) local asset prep: write index.html + copy every
  // bundled .glb into AR_DIR. Runs before the WebView is even created.
  useEffect(() => {
    let cancelled = false
    setAssetsReady(false)
    setAssetsError(null)
    prepareArAssets()
      .then(() => {
        if (cancelled || !mountedRef.current) return
        setAssetsReady(true)
      })
      .catch((err) => {
        console.warn('[web-ar] asset prep failed:', err)
        if (cancelled || !mountedRef.current) return
        setAssetsError(err instanceof Error ? err.message : String(err))
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Full lifecycle guard: once this screen starts unmounting, stop honoring
  // any further WebView message and ask the page to tear itself down
  // (best-effort — the native WebView is destroyed regardless).
  useEffect(() => () => {
    mountedRef.current = false
    try { webviewRef.current?.postMessage(JSON.stringify({ type: 'destroy' })) } catch {}
  }, [])

  const sendToWeb = useCallback((payload: object) => {
    if (!mountedRef.current) return
    webviewRef.current?.postMessage(JSON.stringify(payload))
  }, [])

  const pickAnimal = useCallback((id: string) => {
    if (PREMIUM_MASKS.includes(id) && !__DEV__) {
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'الماسك ده مميز 🔒' : 'Premium mask 🔒',
        text2: ar ? 'هيتفتح قريباً بالكوينز!' : 'Coming soon with coins!',
        props: { icon: '🔒', accent: 'purple' },
      })
      return
    }
    setAnimal(id)
    sendToWeb({ type: 'setAnimal', id })
  }, [ar, sendToWeb])


  const stopRecording = useCallback(() => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
    sendToWeb({ type: 'record', on: false })
  }, [sendToWeb])

  const toggleRecord = useCallback(() => {
    if (recording) {
      stopRecording()
      return
    }
    stopVoicePreview()
    chunksRef.current = []
    setElapsed(0)
    setRecording(true)
    recordStartRef.current = Date.now()
    sendToWeb({ type: 'record', on: true })
    autoStopRef.current = setTimeout(stopRecording, MAX_DURATION_SEC * 1000)
  }, [recording, sendToWeb, stopRecording, stopVoicePreview])

  // Recording timer chip
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => {
      setElapsed(Math.min(MAX_DURATION_SEC, Math.round((Date.now() - recordStartRef.current) / 1000)))
    }, 500)
    return () => clearInterval(timer)
  }, [recording])

  useEffect(() => () => {
    if (autoStopRef.current) clearTimeout(autoStopRef.current)
  }, [])

  const onMessage = useCallback(async (event: WebViewMessageEvent) => {
    if (!mountedRef.current) return
    let msg: WebMessage
    try {
      msg = JSON.parse(event.nativeEvent.data) as WebMessage
    } catch {
      return
    }

    if (msg.type === 'ready') {
      setPageReady(true)
      sendToWeb({ type: 'setAnimal', id: animal })
    } else if (msg.type === 'loading') {
      setPageReady(false)
    } else if (msg.type === 'tracking') {
      setTrackingLost(!msg.found)
    } else if (msg.type === 'videoChunk') {
      chunksRef.current[msg.index] = msg.data
    } else if (msg.type === 'videoDone') {
      setRecording(false)
      setSaving(true)
      try {
        const seconds = Math.max(1, Math.min(MAX_DURATION_SEC, Math.round((Date.now() - recordStartRef.current) / 1000)))
        const base64 = chunksRef.current.join('')
        chunksRef.current = []
        if (!base64) throw new Error(ar ? 'التسجيل طلع فاضي' : 'Empty recording')
        const ext = msg.mime.includes('mp4') ? 'mp4' : 'webm'
        const uri = `${FileSystem.cacheDirectory}kidtok_webar_${Date.now()}.${ext}`
        await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 })
        if (!mountedRef.current) return
        onRecorded(uri, seconds, voiceKeyRef.current)
      } catch (err) {
        if (mountedRef.current) {
          Toast.show({ type: 'error', text1: ar ? 'حفظ الفيديو فشل' : 'Saving failed', text2: (err as Error).message })
        }
      } finally {
        if (mountedRef.current) setSaving(false)
      }
    } else if (msg.type === 'error') {
      console.warn('[web-ar] page error:', msg.message)
      if (msg.message === 'no-webgl') {
        Toast.show({ type: 'error', text1: ar ? 'الجهاز لا يدعم التجربة' : 'Device not supported' })
      }
    } else if (msg.type === 'filterError') {
      console.warn('[web-ar] filter load failed:', msg.id, msg.message)
      Toast.show({
        type: 'error',
        text1: ar ? 'الماسك ده مش شغال دلوقتي' : 'This mask failed to load',
        text2: msg.message,
      })
    } else if (msg.type === 'filterReady') {
      console.log('[web-ar] filter ready:', msg.id)
    } else if (msg.type === 'debug') {
      // Surfaced on request: shows the exact resolved file:// URL each GLB
      // load used, visible in the Metro terminal / adb logcat.
      console.log('[web-ar]', msg.message)
    } else if (msg.type === 'diag') {
      // UV-checker diagnostic build: forwarded to React Native (not just the
      // WebView's own console) so it's visible without adb logcat. Only
      // ACTUAL failures use console.error (which surfaces as an on-device
      // LogBox overlay in dev builds) — a successful diagnostic must not be
      // shown to the user as if something broke.
      const { type: _t, ...rest } = msg
      // webviewInstanceId (this React component instance) alongside the web
      // page's own runtimeInstanceId (already inside `rest`, stamped by
      // rnPost in webArHtml.ts) — together they tell you both which
      // WebArRecorder mount AND which in-page runtime produced this line.
      const payload = JSON.stringify({ webviewInstanceId: instanceIdRef.current, ...rest }, null, 2)
      if (isDiagFailure(rest)) {
        console.error('[web-ar][DIAG]', payload)
      } else {
        console.info('[web-ar][DIAG]', payload)
      }
    }
  }, [animal, ar, onRecorded, sendToWeb])

  // Only file:// requests inside our own AR_DIR (the page + its .glb
  // siblings) are allowed to navigate/fetch — everything else is blocked.
  const onShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    return request.url === 'about:blank' || request.url.startsWith(AR_DIR) || request.url.startsWith('data:')
  }, [])

  // Empty deps: this object keeps the SAME identity for this component
  // instance's entire lifetime. react-native-webview reloads the page (a
  // fresh native WebView navigation, tearing down the old JS realm) when the
  // `source` PROP identity changes — pickAnimal()/setAnimal() below never
  // touches this, only sendToWeb()'s postMessage, so switching filters can
  // never trigger a reload here.
  const webViewSource = useMemo(() => ({ uri: AR_INDEX_URI }), [])

  // Neither the assets nor the permission re-check are ready — do not mount
  // the WebView at all yet (a WebView pointed at a not-yet-written index.html
  // would itself fail to load).
  if (assetsError || permissionsError) {
    return (
      <View style={[styles.loader, { paddingHorizontal: spacing.xl }]}>
        <StatusBar hidden />
        <Ionicons name="alert-circle-outline" size={56} color={colors.white} />
        <Text style={[styles.loaderText, { textAlign: 'center' }]}>
          {ar ? 'مش قادرين نجهّز الكاميرا دلوقتي' : 'Could not prepare the camera right now'}
        </Text>
        <Pressable onPress={onClose} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)' }}>{ar ? 'رجوع' : 'Go back'}</Text>
        </Pressable>
      </View>
    )
  }

  if (!assetsReady || !permissionsConfirmed) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar hidden />
        <KidLoader ar={ar} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <WebView
        ref={webviewRef}
        source={webViewSource}
        style={{ flex: 1, backgroundColor: '#000' }}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Wired up on iOS only (verified in react-native-webview's native
        // source — it is a no-op on Android; the Android fix is the
        // permissionsConfirmed gate above).
        mediaCapturePermissionGrantType="grant"
        // Android: let the page fetch its co-located .glb files via file://.
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        // iOS: WKWebView needs explicit read access to the whole folder to
        // load index.html's sibling .glb files from outside its own bundle.
        allowingReadAccessToURL={AR_DIR}
        allowsFullscreenVideo={false}
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        overScrollMode="never"
        bounces={false}
      />

      {!pageReady && <KidLoader ar={ar} />}

      {pageReady && trackingLost && !recording && (
        <View style={styles.trackingChip}>
          <Ionicons name="scan" size={14} color={colors.white} />
          <Text style={styles.trackingText}>{ar ? 'ورّيني وشك يا بطل' : 'Show me your face!'}</Text>
        </View>
      )}

      {/* Top bar */}
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={26} color={colors.white} />
      </Pressable>

      {recording ? (
        <View style={styles.timerChip}>
          <View style={styles.timerDot} />
          <Text style={styles.timerText}>
            {String(Math.floor(elapsed / 60))}:{String(elapsed % 60).padStart(2, '0')}
          </Text>
        </View>
      ) : (
        <View style={styles.durationChip}>
          <Text style={styles.timerText}>{ar ? '30 ثانية' : '30 seconds'}</Text>
        </View>
      )}

      <Pressable
        style={styles.flipBtn}
        onPress={() => {
          Toast.show({
            type: 'kidReward',
            text1: ar ? 'التبديل مؤقتًا من كاميرا Snap' : 'Switching moved to Snap camera',
            text2: ar ? 'المسار القديم اتقفل فيه تبديل الكاميرا عشان ما يوقعش التطبيق.' : 'Camera flip is disabled here to keep recording stable.',
            props: { icon: '📸', accent: 'blue' },
          })
        }}
        disabled={recording}
      >
        <Ionicons name="camera-reverse" size={24} color={colors.white} />
      </Pressable>

      {/* Voice transform — the child's speech becomes this character's voice */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.soundRow}
        contentContainerStyle={styles.animalRowContent}
      >
        <Pressable
          onPress={() => pickVoice(null)}
          style={[styles.voiceChip, !voiceKey && styles.voiceChipActive]}
        >
          <Text style={{ fontSize: 16 }}>🎤</Text>
          <Text style={styles.voiceLabel}>{ar ? 'صوتي' : 'My voice'}</Text>
        </Pressable>
        {KID_VOICES.map((voice) => (
          <Pressable
            key={voice.id}
            onPress={() => pickVoice(voice.id)}
            style={[
              styles.voiceChip,
              { borderColor: voice.color },
              voiceKey === voice.id && [styles.voiceChipActive, { backgroundColor: voice.color }],
            ]}
          >
            <Text style={{ fontSize: 16 }}>{voice.emoji}</Text>
            <Text style={styles.voiceLabel}>{ar ? voice.labelAr : voice.labelEn}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* CC-BY attribution — required by the license of some bundled masks */}
      {activeAttribution ? (
        <View style={styles.attributionChip}>
          <Text style={styles.attributionText} numberOfLines={1}>{activeAttribution}</Text>
        </View>
      ) : null}

      {/* Animal picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.animalRow}
        contentContainerStyle={styles.animalRowContent}
      >
        {ANIMALS.map((item) => {
          const locked = PREMIUM_MASKS.includes(item.id) && !__DEV__
          return (
            <Pressable
              key={item.id}
              onPress={() => pickAnimal(item.id)}
              style={[
                styles.animalBtn,
                { backgroundColor: item.color },
                animal === item.id && styles.animalBtnActive,
                locked && { opacity: 0.75 },
              ]}
            >
              <Text style={{ fontSize: 30 }}>{item.emoji}</Text>
              {locked && (
                <View style={styles.lockBadge}>
                  <Text style={{ fontSize: 10 }}>🔒</Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Record + gallery */}
      <View style={styles.recordRow}>
        {onOpenGallery ? (
          <Pressable
            onPress={onOpenGallery}
            disabled={recording || saving}
            style={[styles.galleryBtn, (recording || saving) && { opacity: 0.4 }]}
          >
            <Ionicons name="images" size={24} color={colors.white} />
            <Text style={styles.galleryLabel}>{ar ? 'المعرض' : 'Gallery'}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 56 }} />
        )}

        <Pressable
          onPress={toggleRecord}
          disabled={!pageReady || saving}
          style={({ pressed }) => [styles.recordBtn, { transform: [{ scale: pressed ? 0.94 : 1 }], opacity: pageReady && !saving ? 1 : 0.5 }]}
        >
          {saving ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <View style={[styles.recordInner, recording && styles.recordInnerActive]} />
          )}
        </Pressable>

        <View style={{ width: 56 }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  loaderText: { color: colors.white, fontWeight: '900', marginTop: spacing.md, fontSize: fontSize.base },
  closeBtn: { position: 'absolute', top: 48, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  flipBtn: { position: 'absolute', top: 48, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  timerChip: { position: 'absolute', top: 54, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(220,38,38,0.9)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  timerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.white },
  durationChip: { position: 'absolute', top: 54, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  timerText: { color: colors.white, fontWeight: '800', fontSize: fontSize.sm },
  trackingChip: { position: 'absolute', top: 104, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(15,23,42,0.7)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  trackingText: { color: colors.white, fontWeight: '900', fontSize: 12 },
  animalRow: { position: 'absolute', bottom: 140, left: 0, right: 0, maxHeight: 72 },
  attributionChip: { position: 'absolute', bottom: 217, left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  attributionText: { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '600' },
  soundRow: { position: 'absolute', bottom: 214, left: 0, right: 0, maxHeight: 46 },
  voiceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.6)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  voiceChipActive: { borderColor: colors.white, backgroundColor: 'rgba(3,187,229,0.85)' },
  voiceLabel: { color: colors.white, fontSize: 11, fontWeight: '900' },
  lockBadge: { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(15,23,42,0.9)', alignItems: 'center', justifyContent: 'center' },
  animalRowContent: { paddingHorizontal: spacing.lg, gap: 12, alignItems: 'center' },
  animalBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  animalBtnActive: { borderColor: colors.white, transform: [{ scale: 1.12 }] },
  recordRow: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: spacing.xl },
  galleryBtn: { width: 56, alignItems: 'center', gap: 3 },
  galleryLabel: { color: colors.white, fontSize: 10, fontWeight: '800' },
  recordBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  recordInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#EF4444' },
  recordInnerActive: { width: 30, height: 30, borderRadius: 8 },
})
