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
  StyleSheet, ActivityIndicator, Image, StatusBar,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

let VideoThumbnails: any = null
try { VideoThumbnails = require('expo-video-thumbnails') } catch {}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_DURATION = 30
const THUMB_COUNT  = 12
const HANDLE_W     = 18
const TIMELINE_H   = 64
const ACCENT       = '#FCD34D'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

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
  const [trackW, setTrackW]         = useState(0)
  const [startSec, setStartSec]     = useState(0)
  const [endSec, setEndSec]         = useState(Math.min(MAX_DURATION, duration))
  const [currentSec, setCurrentSec] = useState(0)
  const [playing, setPlaying]       = useState(false)
  const [ready, setReady]           = useState(false)

  // ── Refs (fresh values inside PanResponders) ───────────────────────────────
  const trackWRef = useRef(0)
  const durRef    = useRef(duration)
  const startRef  = useRef(0)
  const endRef    = useRef(Math.min(MAX_DURATION, duration))
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
    const initE = (Math.min(MAX_DURATION, duration) / duration) * trackW
    sPxRef.current = 0
    ePxRef.current = initE
    sAnim.setValue(0)
    eAnim.setValue(initE)
  }, [trackW, duration])

  // ── Player ─────────────────────────────────────────────────────────────────
  const player = useVideoPlayer({ uri }, p => { p.loop = false })

  useEffect(() => {
    const t = player.addListener('timeUpdate', e => {
      setCurrentSec(e.currentTime)
      if (trackWRef.current > 0 && durRef.current > 0) {
        playheadAnim.setValue((e.currentTime / durRef.current) * trackWRef.current)
      }
      if (e.currentTime >= endRef.current) {
        player.pause()
        player.currentTime = startRef.current
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
        endRef.current - 0.5)
      sAnim.setValue(secToPx(sec))
      startRef.current = sec
      setStartSec(sec)
      try { player.currentTime = sec } catch {}
    },
    onPanResponderRelease: (_, g) => {
      const max = ePxRef.current - HANDLE_W * 2
      const raw = clamp(sPxRef.current + g.dx, 0, max)
      const sec = clamp(pxToSec(raw),
        Math.max(0, endRef.current - MAX_DURATION),
        endRef.current - 0.5)
      sPxRef.current = secToPx(sec)
      sAnim.setValue(sPxRef.current)
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
        startRef.current + 0.5,
        Math.min(durRef.current, startRef.current + MAX_DURATION))
      eAnim.setValue(secToPx(sec))
      endRef.current = sec
      setEndSec(sec)
    },
    onPanResponderRelease: (_, g) => {
      const min = sPxRef.current + HANDLE_W * 2
      const raw = clamp(ePxRef.current + g.dx, min, trackWRef.current)
      const sec = clamp(pxToSec(raw),
        startRef.current + 0.5,
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
  }

  const clipSec = Math.max(0.5, endSec - startSec)
  const clipRel = Math.max(0, currentSec - startSec)
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
        <Text style={s.headerTitle}>اقتطاع الفيديو</Text>
        <Pressable onPress={() => { player?.pause(); onConfirm(startSec, clipSec) }} style={s.headerSave}>
          <Text style={s.headerSaveText}>تم</Text>
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
        {/* Duration */}
        <View style={[s.durationRow, { direction: 'ltr' } as any]}>
          <View style={s.timeBox}>
            <Text style={s.timeLabel}>{fmtTime(startSec)}</Text>
            <Text style={s.timeSub}>START</Text>
          </View>
          <View style={s.clipBadge}>
            <Ionicons name="cut" size={13} color={ACCENT} />
            <Text style={s.clipText}>{Math.round(clipSec)}s</Text>
            <Text style={s.clipMax}>/ {MAX_DURATION}s</Text>
          </View>
          <View style={[s.timeBox, { alignItems: 'flex-end' }]}>
            <Text style={s.timeLabel}>{fmtTime(endSec)}</Text>
            <Text style={s.timeSub}>END</Text>
          </View>
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

              {/* Layer 4: DRAGGABLE SELECTION BAND */}
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
                <View style={s.bandGrip}>
                  <View style={s.bandGripDot} />
                  <View style={s.bandGripDot} />
                  <View style={s.bandGripDot} />
                </View>
              </Animated.View>

              {/* Layer 5: Playhead */}
              {playing && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    s.playhead,
                    { left: HANDLE_W, transform: [{ translateX: playheadAnim }] },
                  ]}
                />
              )}

              {/* Layer 6 (top): Resize handles */}
              <Animated.View
                {...startPan.panHandlers}
                style={[s.handle, s.handleL, { transform: [{ translateX: sAnim }] }]}
              >
                <Ionicons name="chevron-back" size={14} color="#0a0a0a" />
              </Animated.View>

              <Animated.View
                {...endPan.panHandlers}
                style={[s.handle, s.handleR, { transform: [{ translateX: eAnim }] }]}
              >
                <Ionicons name="chevron-forward" size={14} color="#0a0a0a" />
              </Animated.View>
            </>
          )}
        </View>

        {/* Play controls */}
        <View style={s.controls}>
          <Pressable onPress={togglePlay} style={s.playToggle}>
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={20}
              color="#0a0a0a"
              style={{ marginLeft: playing ? 0 : 2 }}
            />
          </Pressable>
          <Text style={s.controlsText}>
            {fmtTime(clipRel)}
            <Text style={{ color: '#52525b' }}>  /  {fmtTime(clipSec)}</Text>
          </Text>
        </View>

        <Text style={s.hint}>
          اسحب الشريط الأصفر لتحريك التحديد، أو اسحب الأطراف للتعديل
        </Text>
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

  durationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  timeBox:   { minWidth: 56 },
  timeLabel: { color: '#fff', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeSub:   { color: '#6b7280', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 1 },
  clipBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4, backgroundColor: 'rgba(252,211,77,0.12)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(252,211,77,0.3)' },
  clipText:  { color: ACCENT, fontSize: 16, fontWeight: '900' },
  clipMax:   { color: '#a16207', fontSize: 11, fontWeight: '600' },

  timelineOuter: { height: TIMELINE_H, position: 'relative', backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' },
  thumbsContainer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  thumbStrip: { flex: 1, flexDirection: 'row' },
  thumbCell:  { flex: 1, height: '100%', justifyContent: 'center' },
  thumbImg:   { width: '100%', height: '100%', resizeMode: 'cover' },
  thumbPlaceholder: { width: '100%', height: '100%', backgroundColor: '#27272a' },

  dimmed: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(10,10,10,0.75)' },

  // Selection band — translateX moves the whole selection
  selectionBand: { position: 'absolute', top: 0, bottom: 0 },
  selBorderTop:  { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: ACCENT },
  selBorderBot:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: ACCENT },
  bandGrip: {
    position: 'absolute', top: '50%', left: '50%',
    marginTop: -8, marginLeft: -10,
    flexDirection: 'row', gap: 3,
  },
  bandGripDot: { width: 3, height: 16, backgroundColor: 'rgba(252,211,77,0.85)', borderRadius: 2 },

  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },

  // Handles — absolute-positioned, translateX moves them
  handle: {
    position: 'absolute', top: -2, bottom: -2, width: HANDLE_W,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
  },
  handleL: { left: 0, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  handleR: { left: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 16 },
  playToggle: { width: 36, height: 36, borderRadius: 18, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  controlsText: { color: '#fff', fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '600' },

  hint: { textAlign: 'center', color: '#52525b', fontSize: 11, marginTop: 12 },
})
