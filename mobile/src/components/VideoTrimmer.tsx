/**
 * VideoTrimmer — WhatsApp/Instagram style
 *
 * Touch architecture (LOWEST → HIGHEST z-order):
 *   1. Background Pressable (tap-to-seek on dimmed zones)
 *   2. Thumbnails (decorative, pointerEvents="none")
 *   3. Dimmed overlays (decorative, pointerEvents="none")
 *   4. Selection band — PanResponder captures touch → DRAG WINDOW
 *   5. Handles — PanResponder captures touch → RESIZE
 *
 * The band & handles MUST be ABOVE the Pressable in render order.
 */
import { useRef, useState, useEffect, useCallback, memo } from 'react'
import {
  View, Text, Pressable, PanResponder, Animated,
  StyleSheet, ActivityIndicator, Image, StatusBar, I18nManager,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

let VideoThumbnails: any = null
try { VideoThumbnails = require('expo-video-thumbnails') } catch {}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_DURATION = 30
const MIN_DURATION = 1
const THUMB_COUNT  = 12
const HANDLE_W     = 12
const TIMELINE_H   = 64
const ACCENT       = '#FF3B6B'   // modern pink (was yellow block)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
// With tenths, e.g. 0:29.3 — matches the reference timeline labels
const fmtTimeDec = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`

interface Props {
  uri: string
  duration: number
  onConfirm: (startSec: number, durationSec: number) => void
  onCancel:  () => void
}

// ════════════════════════════════════════════════════════════════════════════
// Thumbnail strip
// ════════════════════════════════════════════════════════════════════════════
const TimelineThumbnails = memo(function TimelineThumbnails({ uri, duration }: { uri: string; duration: number }) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const hasModule = !!VideoThumbnails

  useEffect(() => {
    if (!hasModule) return
    let cancelled = false
    const result: string[] = new Array(THUMB_COUNT).fill('')
    ;(async () => {
      for (let i = 0; i < THUMB_COUNT; i++) {
        if (cancelled) return
        const time = Math.floor((i / Math.max(1, THUMB_COUNT - 1)) * duration * 1000)
        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time, quality: 0.4 })
          result[i] = thumbUri
        } catch {}
        if (!cancelled) setThumbs([...result])
      }
    })()
    return () => { cancelled = true }
  }, [uri, duration, hasModule])

  if (!hasModule) {
    return (
      <View style={s.thumbStrip}>
        {Array.from({ length: THUMB_COUNT }).map((_, i) => (
          <View key={i} style={[s.thumbCell, { backgroundColor: `hsl(${25 + i * 8}, 30%, ${14 + (i % 2) * 4}%)` }]}>
            <Ionicons name="film-outline" size={11} color="rgba(252,211,77,0.25)" style={{ alignSelf: 'center' }} />
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={s.thumbStrip}>
      {Array.from({ length: THUMB_COUNT }).map((_, i) => (
        <View key={i} style={s.thumbCell}>
          {thumbs[i] ? <Image source={{ uri: thumbs[i] }} style={s.thumbImg} /> : <View style={s.thumbPlaceholder} />}
        </View>
      ))}
    </View>
  )
})

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
export default function VideoTrimmer({ uri, duration, onConfirm, onCancel }: Props) {
  const ar = I18nManager.isRTL
  const [trackW, setTrackW]         = useState(0)
  const [startSec, setStartSec]     = useState(0)
  const [endSec, setEndSec]         = useState(Math.min(10, duration))
  const [currentSec, setCurrentSec] = useState(0)
  const [playing, setPlaying]       = useState(false)
  const [ready, setReady]           = useState(false)

  // ── Refs (fresh values inside PanResponders) ───────────────────────────────
  const trackWRef = useRef(0)
  const durRef    = useRef(duration)
  const startRef  = useRef(0)
  const endRef    = useRef(Math.min(10, duration))
  const sPxRef    = useRef(0)
  const ePxRef    = useRef(0)

  useEffect(() => { startRef.current = startSec },  [startSec])
  useEffect(() => { endRef.current   = endSec },    [endSec])
  useEffect(() => { durRef.current   = duration },   [duration])
  useEffect(() => { trackWRef.current = trackW },    [trackW])

  // ── Animated values ────────────────────────────────────────────────────────
  const sAnim        = useRef(new Animated.Value(0)).current
  const eAnim        = useRef(new Animated.Value(0)).current
  const playheadAnim = useRef(new Animated.Value(0)).current

  // Init handle positions when track is measured
  useEffect(() => {
    if (trackW <= 0) return
    const initE = (Math.min(10, duration) / duration) * trackW
    sPxRef.current = 0
    ePxRef.current = initE
    sAnim.setValue(0)
    eAnim.setValue(initE)
  }, [trackW, duration])

  // ── Player ─────────────────────────────────────────────────────────────────
  const player = useVideoPlayer({ uri }, p => {
    p.loop = false
    p.timeUpdateEventInterval = 0.05
  })

  useEffect(() => {
    const t = player.addListener('timeUpdate', e => {
      setCurrentSec(e.currentTime)
      if (trackWRef.current > 0 && durRef.current > 0) {
        playheadAnim.setValue((e.currentTime / durRef.current) * trackWRef.current)
      }
      if (e.currentTime >= endRef.current) {
        player.pause()
        player.currentTime = startRef.current
        setCurrentSec(startRef.current)
        playheadAnim.setValue(secToPx(startRef.current))
        setPlaying(false)
      }
    })
    const r = player.addListener('statusChange', e => {
      if (e.status === 'readyToPlay') setReady(true)
    })
    return () => { t.remove(); r.remove() }
  }, [player])

  const togglePlay = useCallback(() => {
    if (!ready) return
    if (playing) {
      player.pause()
      setPlaying(false)
      return
    }
    // Hard-reset to startSec then play (Android needs the double seek)
    try {
      player.pause()
      player.currentTime = startRef.current
      requestAnimationFrame(() => {
        try {
          player.currentTime = startRef.current
          setCurrentSec(startRef.current)
          playheadAnim.setValue(secToPx(startRef.current))
          player.play()
          setPlaying(true)
        } catch {}
      })
    } catch {}
  }, [ready, playing, player])

  // ── Conversions ────────────────────────────────────────────────────────────
  const secToPx = (sec: number) => durRef.current > 0 ? (sec / durRef.current) * trackWRef.current : 0
  const pxToSec = (px: number)  => trackWRef.current > 0 ? (px / trackWRef.current) * durRef.current : 0

  // ── START handle ───────────────────────────────────────────────────────────
  const startPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { player.pause(); setPlaying(false) },
    onPanResponderMove: (_, g) => {
      const max = ePxRef.current - HANDLE_W * 2
      const raw = clamp(sPxRef.current + g.dx, 0, max)
      const sec = clamp(pxToSec(raw),
        Math.max(0, endRef.current - MAX_DURATION),
        endRef.current - MIN_DURATION)
      sAnim.setValue(secToPx(sec))
      playheadAnim.setValue(secToPx(sec))   // ← playhead follows start handle
      startRef.current = sec
      setStartSec(sec)
      try { player.currentTime = sec } catch {}
    },
    onPanResponderRelease: (_, g) => {
      const max = ePxRef.current - HANDLE_W * 2
      const raw = clamp(sPxRef.current + g.dx, 0, max)
      const sec = clamp(pxToSec(raw),
        Math.max(0, endRef.current - MAX_DURATION),
        endRef.current - MIN_DURATION)
      sPxRef.current = secToPx(sec)
      sAnim.setValue(sPxRef.current)
      playheadAnim.setValue(sPxRef.current)  // ← sync on release
      startRef.current = sec
      setStartSec(sec)
    },
  })).current

  // ── END handle ─────────────────────────────────────────────────────────────
  const endPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { player.pause(); setPlaying(false) },
    onPanResponderMove: (_, g) => {
      const min = sPxRef.current + HANDLE_W * 2
      const raw = clamp(ePxRef.current + g.dx, min, trackWRef.current)
      const sec = clamp(pxToSec(raw),
        startRef.current + MIN_DURATION,
        Math.min(durRef.current, startRef.current + MAX_DURATION))
      eAnim.setValue(secToPx(sec))
      endRef.current = sec
      setEndSec(sec)
    },
    onPanResponderRelease: (_, g) => {
      const min = sPxRef.current + HANDLE_W * 2
      const raw = clamp(ePxRef.current + g.dx, min, trackWRef.current)
      const sec = clamp(pxToSec(raw),
        startRef.current + MIN_DURATION,
        Math.min(durRef.current, startRef.current + MAX_DURATION))
      ePxRef.current = secToPx(sec)
      eAnim.setValue(ePxRef.current)
      endRef.current = sec
      setEndSec(sec)
    },
  })).current

  // ── MIDDLE BAND — drag entire selection ────────────────────────────────────
  // Captures touch IMMEDIATELY (onStartShouldSetPanResponder: () => true)
  // so it wins over the background Pressable
  const bandPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder:        () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder:         () => true,
    onPanResponderGrant: () => { player.pause(); setPlaying(false) },
    onPanResponderMove: (_, g) => {
      const clipPx = ePxRef.current - sPxRef.current
      const maxStart = trackWRef.current - clipPx
      const newSPx = clamp(sPxRef.current + g.dx, 0, maxStart)
      const newEPx = newSPx + clipPx
      sAnim.setValue(newSPx)
      eAnim.setValue(newEPx)
      playheadAnim.setValue(newSPx)   // ← playhead tracks selection start
      const newStart = pxToSec(newSPx)
      const newEnd   = pxToSec(newEPx)
      startRef.current = newStart
      endRef.current   = newEnd
      setStartSec(newStart)
      setEndSec(newEnd)
      try { player.currentTime = newStart } catch {}
    },
    onPanResponderRelease: (_, g) => {
      const clipPx = ePxRef.current - sPxRef.current
      const maxStart = trackWRef.current - clipPx
      const newSPx = clamp(sPxRef.current + g.dx, 0, maxStart)
      const newEPx = newSPx + clipPx
      sPxRef.current = newSPx
      ePxRef.current = newEPx
      sAnim.setValue(newSPx)
      eAnim.setValue(newEPx)
      playheadAnim.setValue(newSPx)   // ← sync on release
      const newStart = pxToSec(newSPx)
      const newEnd   = pxToSec(newEPx)
      startRef.current = newStart
      endRef.current   = newEnd
      setStartSec(newStart)
      setEndSec(newEnd)
    },
  })).current

  // ── Tap-to-seek on dimmed areas ─────────────────────────────────────────────
  const handleTimelineTap = (e: any) => {
    const x   = e.nativeEvent.locationX - HANDLE_W
    const sec = clamp(pxToSec(x), startRef.current, endRef.current)
    try { player.currentTime = sec } catch {}
    setCurrentSec(sec)
    playheadAnim.setValue(secToPx(sec))  // ← sync playhead on tap
  }

  const clipSec = Math.max(MIN_DURATION, endSec - startSec)
  const previewSec = clamp(currentSec, startSec, endSec)
  const previewOffsetSec = clamp(previewSec - startSec, 0, clipSec)
  const leftPx  = trackW > 0 ? (startSec / duration) * trackW : 0
  const rightPx = trackW > 0 ? (endSec   / duration) * trackW : 0

  return (
    <SafeAreaView style={s.root} edges={['top','bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={s.headerTitle}>{ar ? 'اقتطاع الفيديو' : 'Trim video'}</Text>
        <Pressable onPress={() => { player?.pause(); onConfirm(startSec, clipSec) }} style={s.headerSave}>
          <Text style={s.headerSaveText}>{ar ? 'تم' : 'Done'}</Text>
        </Pressable>
      </View>

      {/* Video */}
      <View style={s.previewWrap}>
        <View style={s.preview}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
          {!ready && (
            <View style={[StyleSheet.absoluteFill, s.previewLoading]}>
              <ActivityIndicator color={ACCENT} size="large" />
            </View>
          )}
          <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
            {ready && !playing && (
              <View style={s.playBtnWrap}>
                <View style={s.playBtn}>
                  <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
                </View>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Bottom panel */}
      <View style={s.bottomPanel}>
        <View style={s.liveRow}>
          <View style={s.livePill}>
            <View style={[s.liveDot, playing && s.liveDotActive]} />
            <Text style={s.liveText}>
              {fmtTimeDec(previewOffsetSec)}
              <Text style={s.liveMuted}> / {fmtTimeDec(clipSec)}</Text>
            </Text>
          </View>
          <Text style={s.liveAbsolute}>{fmtTimeDec(previewSec)}</Text>
        </View>
        {/* Top labels — start (left) · selected length (center, pink) · total (right) */}
        <View style={[s.topLabels, { direction: 'ltr' } as any]}>
          <Text style={s.edgeLabel}>{fmtTimeDec(startSec)}</Text>
          <Text style={s.centerLabel}>{fmtTimeDec(clipSec)}</Text>
          <Text style={s.edgeLabel}>{fmtTimeDec(duration)}</Text>
        </View>

        {/* ═══ TIMELINE — z-ordered layers ═══ */}
        <View
          style={[s.timelineOuter, { direction: 'ltr' } as any]}
          onLayout={(e) => setTrackW(e.nativeEvent.layout.width - HANDLE_W * 2)}
        >
          {/* Layer 1 (bottom): Tap-to-seek */}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleTimelineTap} />

          {/* Layer 2: Thumbnails (decorative) */}
          <View pointerEvents="none" style={[s.thumbsContainer, { marginHorizontal: HANDLE_W }]}>
            <TimelineThumbnails uri={uri} duration={duration} />
          </View>

          {trackW > 0 && (
            <>
              {/* Layer 3: Dimmed regions (decorative) */}
              <View pointerEvents="none" style={[s.dimmed, { left: HANDLE_W, width: leftPx }]} />
              <View pointerEvents="none" style={[s.dimmed, { right: HANDLE_W, width: trackW - rightPx }]} />

              {/* Layer 4: DRAGGABLE SELECTION BAND (slim borders only, no block) */}
              <Animated.View
                {...bandPan.panHandlers}
                style={[
                  s.selectionBand,
                  {
                    left: HANDLE_W,
                    width: rightPx - leftPx,
                    transform: [{ translateX: sAnim }],
                  },
                ]}
              >
                <View style={s.selBorderTop} />
                <View style={s.selBorderBot} />
              </Animated.View>

              {/* Layer 5: Playhead (always visible — shows current preview position) */}
              {ready && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    s.playhead,
                    { left: HANDLE_W, transform: [{ translateX: playheadAnim }] },
                  ]}
                >
                  <View style={s.playheadCap} />
                </Animated.View>
              )}

              {/* Layer 6 (top): Resize handles */}
              <Animated.View
                {...startPan.panHandlers}
                style={[s.handle, s.handleL, { transform: [{ translateX: sAnim }] }]}
              >
                <Ionicons name="chevron-back" size={15} color="#fff" />
              </Animated.View>

              <Animated.View
                {...endPan.panHandlers}
                style={[s.handle, s.handleR, { transform: [{ translateX: eAnim }] }]}
              >
                <Ionicons name="chevron-forward" size={15} color="#fff" />
              </Animated.View>
            </>
          )}
        </View>

        {/* Selected duration — center, real-time */}
        <View style={s.selectedRow}>
          <Text style={s.selectedText}>
            {ar ? 'المحدد: ' : 'Selected: '}
            <Text style={s.selectedValue}>{fmtTimeDec(clipSec)}</Text>
            <Text style={s.selectedMax}>{ar ? '  /  الأقصى 0:30' : '  /  Max 0:30'}</Text>
          </Text>
        </View>

        {/* Bottom controls — cancel · play · done */}
        <View style={[s.bottomControls, { direction: 'ltr' } as any]}>
          <Pressable onPress={onCancel} style={s.sideBtn}>
            <Text style={s.sideBtnText}>{ar ? 'إلغاء' : 'Cancel'}</Text>
          </Pressable>

          <Pressable onPress={togglePlay} style={s.bigPlay}>
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#fff" style={{ marginLeft: playing ? 0 : 3 }} />
          </Pressable>

          <Pressable onPress={() => { player?.pause(); onConfirm(startSec, clipSec) }} style={s.sideBtn}>
            <Text style={s.sideBtnText}>{ar ? 'تم' : 'Done'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  headerTitle:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSave:     { backgroundColor: ACCENT, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 100 },
  headerSaveText: { color: '#0a0a0a', fontWeight: '900', fontSize: 14 },

  previewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  preview:     { flex: 1, width: '100%', backgroundColor: '#000', borderRadius: 20, overflow: 'hidden', marginVertical: 8 },
  previewLoading: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  playBtnWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playBtn:     { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },

  bottomPanel: { backgroundColor: '#0a0a0a', paddingTop: 12, paddingBottom: 8, paddingHorizontal: 16 },

  liveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 2 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6b7280' },
  liveDotActive: { backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  liveMuted: { color: '#9ca3af', fontSize: 12, fontWeight: '800' },
  liveAbsolute: { color: '#d1d5db', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },

  topLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  edgeLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  centerLabel: { color: ACCENT, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },

  timelineOuter: { height: TIMELINE_H, position: 'relative', backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' },
  thumbsContainer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  thumbStrip: { flex: 1, flexDirection: 'row' },
  thumbCell:  { flex: 1, height: '100%', justifyContent: 'center' },
  thumbImg:   { width: '100%', height: '100%', resizeMode: 'cover' },
  thumbPlaceholder: { width: '100%', height: '100%', backgroundColor: '#27272a' },

  dimmed: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },

  // Selection band — translateX moves the whole selection
  selectionBand: { position: 'absolute', top: 0, bottom: 0 },
  selBorderTop:  { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: ACCENT },
  selBorderBot:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: ACCENT },

  playhead: {
    position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2,
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 6,
  },
  playheadCap: {
    position: 'absolute', top: 3, left: -4,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)',
  },

  // Handles — slim modern pink, rounded outer edge, white grip line inside
  handle: {
    position: 'absolute', top: -2, bottom: -2, width: HANDLE_W,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  handleL: { left: 0, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  handleR: { left: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6 },

  // Selected duration line (center, real-time)
  selectedRow:   { alignItems: 'center', marginTop: 14 },
  selectedText:  { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  selectedValue: { color: ACCENT, fontSize: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  selectedMax:   { color: '#6b7280', fontSize: 12, fontWeight: '600' },

  // Bottom controls — cancel · play · done
  bottomControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 8 },
  sideBtn:     { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 100, backgroundColor: '#1f1f23', minWidth: 96, alignItems: 'center' },
  sideBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  bigPlay:     { width: 60, height: 60, borderRadius: 30, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
})
