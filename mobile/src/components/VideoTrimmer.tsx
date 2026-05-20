/**
 * VideoTrimmer — Production-quality video trim experience
 *
 * Inspired by WhatsApp Status / Instagram Reels / TikTok / CapCut
 *
 * Architecture:
 *   <VideoTrimmer />
 *     ├── <VideoPreview />         — large video player area
 *     ├── <DurationIndicator />    — time labels (start, clip, end)
 *     ├── <TimelineThumbnails />   — horizontal video thumbnail strip
 *     ├── <TrimHandles />          — draggable handles + selection overlay
 *     └── <PlaybackControls />     — play/pause + seek
 */
import { useRef, useState, useEffect, useCallback, memo } from 'react'
import {
  View, Text, Pressable, PanResponder, Animated,
  StyleSheet, ActivityIndicator, Image, StatusBar,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
// Safe load — works without rebuild
let VideoThumbnails: any = null
try { VideoThumbnails = require('expo-video-thumbnails') } catch {}
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_DURATION = 30
const THUMB_COUNT  = 12
const HANDLE_W     = 16
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
// VideoPreview — centered video with play overlay
// ════════════════════════════════════════════════════════════════════════════
interface VideoPreviewProps {
  player: any
  ready: boolean
  playing: boolean
  onTogglePlay: () => void
}

const VideoPreview = memo(function VideoPreview({ player, ready, playing, onTogglePlay }: VideoPreviewProps) {
  return (
    <View style={s.previewWrap}>
      <View style={s.preview}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
        {!ready && (
          <View style={[StyleSheet.absoluteFill, s.previewLoading]}>
            <ActivityIndicator color={ACCENT} size="large" />
          </View>
        )}
        <Pressable style={StyleSheet.absoluteFill} onPress={onTogglePlay}>
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
  )
})

// ════════════════════════════════════════════════════════════════════════════
// DurationIndicator — shows start/end/clip times
// ════════════════════════════════════════════════════════════════════════════
const DurationIndicator = memo(function DurationIndicator({ startSec, endSec }: { startSec: number; endSec: number }) {
  const clip = Math.max(0.5, endSec - startSec)
  return (
    <View style={s.durationRow}>
      <View style={s.timeBox}>
        <Text style={s.timeLabel}>{fmtTime(startSec)}</Text>
        <Text style={s.timeSub}>START</Text>
      </View>

      <View style={s.clipBadge}>
        <Ionicons name="cut" size={13} color={ACCENT} />
        <Text style={s.clipText}>{Math.round(clip)}s</Text>
        <Text style={s.clipMax}>/ {MAX_DURATION}s</Text>
      </View>

      <View style={[s.timeBox, { alignItems: 'flex-end' }]}>
        <Text style={s.timeLabel}>{fmtTime(endSec)}</Text>
        <Text style={s.timeSub}>END</Text>
      </View>
    </View>
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TimelineThumbnails — extracts and renders thumbnails strip
// ════════════════════════════════════════════════════════════════════════════
const TimelineThumbnails = memo(function TimelineThumbnails({ uri, duration }: { uri: string; duration: number }) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const hasThumbsModule = !!VideoThumbnails

  useEffect(() => {
    if (!hasThumbsModule) return
    let cancelled = false
    const result: string[] = new Array(THUMB_COUNT).fill('')
    ;(async () => {
      for (let i = 0; i < THUMB_COUNT; i++) {
        if (cancelled) return
        const time = Math.floor((i / Math.max(1, THUMB_COUNT - 1)) * duration * 1000)
        try {
          const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
            time,
            quality: 0.4,
          })
          result[i] = thumbUri
        } catch {}
        if (!cancelled) setThumbs([...result])
      }
    })()
    return () => { cancelled = true }
  }, [uri, duration, hasThumbsModule])

  // Fallback: pretty gradient strip if no thumbs module
  if (!hasThumbsModule) {
    return (
      <View style={s.thumbStrip}>
        {Array.from({ length: THUMB_COUNT }).map((_, i) => {
          const hue = 30 + i * 8  // amber → orange gradient
          return (
            <View
              key={i}
              style={[s.thumbCell, {
                backgroundColor: `hsl(${hue}, 35%, ${15 + (i % 2) * 4}%)`,
                borderRightWidth: i < THUMB_COUNT - 1 ? 1 : 0,
                borderColor: 'rgba(0,0,0,0.4)',
              }]}
            >
              <View style={{ position: 'absolute', top: '50%', left: '50%', marginTop: -6, marginLeft: -6 }}>
                <Ionicons name="film-outline" size={12} color="rgba(252,211,77,0.3)" />
              </View>
            </View>
          )
        })}
      </View>
    )
  }

  return (
    <View style={s.thumbStrip}>
      {Array.from({ length: THUMB_COUNT }).map((_, i) => (
        <View key={i} style={s.thumbCell}>
          {thumbs[i]
            ? <Image source={{ uri: thumbs[i] }} style={s.thumbImg} />
            : <View style={s.thumbPlaceholder} />
          }
        </View>
      ))}
    </View>
  )
})

// ════════════════════════════════════════════════════════════════════════════
// TrimHandles — draggable left/right handles + selection overlay
// ════════════════════════════════════════════════════════════════════════════
interface TrimHandlesProps {
  bandPan:     any
  trackW:      number
  startSec:    number
  endSec:      number
  duration:    number
  sAnim:       Animated.Value
  eAnim:       Animated.Value
  startPan:    any
  endPan:      any
  playheadAnim: Animated.Value
  playing:     boolean
}

const TrimHandles = memo(function TrimHandles({
  bandPan, trackW, startSec, endSec, duration, sAnim, eAnim, startPan, endPan, playheadAnim, playing,
}: TrimHandlesProps) {
  if (trackW <= 0) return null

  const leftPx  = (startSec / duration) * trackW
  const rightPx = (endSec   / duration) * trackW

  return (
    <>
      {/* Dimmed left (unselected before start) */}
      <View pointerEvents="none" style={[s.dimmed, { left: 0, width: leftPx }]} />
      {/* Dimmed right (unselected after end) */}
      <View pointerEvents="none" style={[s.dimmed, { right: 0, width: trackW - rightPx }]} />

      {/* Selection band — draggable middle */}
      <Animated.View
        {...bandPan.panHandlers}
        style={[s.selectionBand, { left: leftPx, width: rightPx - leftPx }]}
      >
        <View style={s.selectionTop} />
        <View style={s.selectionBot} />
        {/* Grab affordance */}
        <View style={s.bandGrip}>
          <View style={s.bandGripDot} />
          <View style={s.bandGripDot} />
          <View style={s.bandGripDot} />
        </View>
      </Animated.View>

      {/* Playhead */}
      {playing && (
        <Animated.View
          pointerEvents="none"
          style={[s.playhead, { transform: [{ translateX: playheadAnim }] }]}
        />
      )}

      {/* Start handle */}
      <Animated.View
        {...startPan.panHandlers}
        style={[s.handle, s.handleL, { transform: [{ translateX: sAnim }] }]}
      >
        <View style={s.handleInner}>
          <Ionicons name="chevron-back" size={14} color="#0a0a0a" />
        </View>
      </Animated.View>

      {/* End handle */}
      <Animated.View
        {...endPan.panHandlers}
        style={[s.handle, s.handleR, { transform: [{ translateX: eAnim }] }]}
      >
        <View style={s.handleInner}>
          <Ionicons name="chevron-forward" size={14} color="#0a0a0a" />
        </View>
      </Animated.View>
    </>
  )
})

// ════════════════════════════════════════════════════════════════════════════
// PlaybackControls — play/pause + scrub time
// ════════════════════════════════════════════════════════════════════════════
const PlaybackControls = memo(function PlaybackControls({
  playing, onToggle, currentTime, clipDuration,
}: {
  playing: boolean; onToggle: () => void; currentTime: number; clipDuration: number
}) {
  return (
    <View style={s.controls}>
      <Pressable onPress={onToggle} style={s.playToggle}>
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#0a0a0a" style={{ marginLeft: playing ? 0 : 2 }} />
      </Pressable>
      <Text style={s.controlsText}>
        {fmtTime(currentTime)}
        <Text style={{ color: '#52525b' }}>  /  {fmtTime(clipDuration)}</Text>
      </Text>
    </View>
  )
})

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function VideoTrimmer({ uri, duration, onConfirm, onCancel }: Props) {
  // ── Track measurement ──────────────────────────────────────────────────────
  const [trackW, setTrackW] = useState(0)

  // ── State ──────────────────────────────────────────────────────────────────
  const [startSec, setStartSec]       = useState(0)
  const [endSec, setEndSec]           = useState(Math.min(MAX_DURATION, duration))
  const [currentSec, setCurrentSec]   = useState(0)
  const [playing, setPlaying]         = useState(false)
  const [ready, setReady]             = useState(false)

  // ── Refs (for stable PanResponder closures) ────────────────────────────────
  const trackWRef  = useRef(0)
  const durRef     = useRef(duration)
  const startRef   = useRef(0)
  const endRef     = useRef(Math.min(MAX_DURATION, duration))
  const sPxRef     = useRef(0)
  const ePxRef     = useRef(0)

  // Keep refs synced
  useEffect(() => { startRef.current = startSec },   [startSec])
  useEffect(() => { endRef.current   = endSec },     [endSec])
  useEffect(() => { durRef.current   = duration },    [duration])
  useEffect(() => { trackWRef.current = trackW },     [trackW])

  // ── Animated values ────────────────────────────────────────────────────────
  const sAnim         = useRef(new Animated.Value(0)).current
  const eAnim         = useRef(new Animated.Value(0)).current
  const playheadAnim  = useRef(new Animated.Value(0)).current

  // Initialize handle positions when track width is known
  useEffect(() => {
    if (trackW <= 0) return
    const initEnd = (Math.min(MAX_DURATION, duration) / duration) * trackW
    sPxRef.current = 0
    ePxRef.current = initEnd
    sAnim.setValue(0)
    eAnim.setValue(initEnd)
  }, [trackW, duration])

  // ── Video player ───────────────────────────────────────────────────────────
  const player = useVideoPlayer({ uri }, p => { p.loop = false })

  useEffect(() => {
    const t = player.addListener('timeUpdate', e => {
      setCurrentSec(e.currentTime)
      // Move playhead
      if (trackWRef.current > 0 && durRef.current > 0) {
        const px = (e.currentTime / durRef.current) * trackWRef.current
        playheadAnim.setValue(px)
      }
      // Auto-stop at end of clip
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
    } else {
      // Always seek to trim start before playing
      try { player.currentTime = startRef.current } catch {}
      // Small delay to ensure seek completes
      setTimeout(() => {
        try {
          player.currentTime = startRef.current
          player.play()
          setPlaying(true)
        } catch {}
      }, 30)
    }
  }, [ready, playing, player])

  // ── Helpers (always read from refs) ────────────────────────────────────────
  const secToPx = useCallback((sec: number) =>
    durRef.current > 0 ? (sec / durRef.current) * trackWRef.current : 0
  , [])
  const pxToSec = useCallback((px: number) =>
    trackWRef.current > 0 ? (px / trackWRef.current) * durRef.current : 0
  , [])

  // ── Start handle PanResponder ──────────────────────────────────────────────
  const startPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      player.pause()
      setPlaying(false)
    },
    onPanResponderMove: (_, g) => {
      const max = ePxRef.current - HANDLE_W * 2
      const raw = clamp(sPxRef.current + g.dx, 0, max)
      const sec = clamp(
        pxToSec(raw),
        Math.max(0, endRef.current - MAX_DURATION),
        endRef.current - 0.5
      )
      sAnim.setValue(secToPx(sec))
      startRef.current = sec
      setStartSec(sec)
      try { player.currentTime = sec } catch {}
    },
    onPanResponderRelease: (_, g) => {
      const max = ePxRef.current - HANDLE_W * 2
      const raw = clamp(sPxRef.current + g.dx, 0, max)
      const sec = clamp(
        pxToSec(raw),
        Math.max(0, endRef.current - MAX_DURATION),
        endRef.current - 0.5
      )
      sPxRef.current = secToPx(sec)
      sAnim.setValue(sPxRef.current)
      startRef.current = sec
      setStartSec(sec)
    },
  })).current

  // ── End handle PanResponder ────────────────────────────────────────────────
  const endPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      player.pause()
      setPlaying(false)
    },
    onPanResponderMove: (_, g) => {
      const min = sPxRef.current + HANDLE_W * 2
      const raw = clamp(ePxRef.current + g.dx, min, trackWRef.current)
      const sec = clamp(
        pxToSec(raw),
        startRef.current + 0.5,
        Math.min(durRef.current, startRef.current + MAX_DURATION)
      )
      eAnim.setValue(secToPx(sec))
      endRef.current = sec
      setEndSec(sec)
    },
    onPanResponderRelease: (_, g) => {
      const min = sPxRef.current + HANDLE_W * 2
      const raw = clamp(ePxRef.current + g.dx, min, trackWRef.current)
      const sec = clamp(
        pxToSec(raw),
        startRef.current + 0.5,
        Math.min(durRef.current, startRef.current + MAX_DURATION)
      )
      ePxRef.current = secToPx(sec)
      eAnim.setValue(ePxRef.current)
      endRef.current = sec
      setEndSec(sec)
    },
  })).current

  // ── MIDDLE BAND — drag whole selection ─────────────────────────────────────
  const bandPan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3,
    onPanResponderGrant: () => {
      player?.pause()
      setPlaying(false)
    },
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

  // ── Tap to seek ────────────────────────────────────────────────────────────
  const handleTimelineTap = (e: any) => {
    const x = e.nativeEvent.locationX - HANDLE_W
    const sec = clamp(pxToSec(x), startRef.current, endRef.current)
    try { player.currentTime = sec } catch {}
    setCurrentSec(sec)
  }

  const clipSec = Math.max(0.5, endSec - startSec)
  const clipRel = Math.max(0, currentSec - startSec)

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* ── Header ── */}
      <View style={s.header}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={s.headerTitle}>اقتطاع الفيديو</Text>
        <Pressable
          onPress={() => { player?.pause(); onConfirm(startSec, clipSec) }}
          style={s.headerSave}
        >
          <Text style={s.headerSaveText}>تم</Text>
        </Pressable>
      </View>

      {/* ── Video preview (takes available space) ── */}
      <VideoPreview
        player={player}
        ready={ready}
        playing={playing}
        onTogglePlay={togglePlay}
      />

      {/* ── Bottom panel ── */}
      <View style={s.bottomPanel}>

        <DurationIndicator startSec={startSec} endSec={endSec} />

        {/* Timeline */}
        <Pressable onPress={handleTimelineTap} style={s.timelineWrap}>
          <View
            style={s.timelineInner}
            onLayout={e => setTrackW(e.nativeEvent.layout.width - HANDLE_W * 2)}
          >
            {/* Thumbnails row */}
            <View style={[s.thumbsContainer, { marginHorizontal: HANDLE_W }]}>
              <TimelineThumbnails uri={uri} duration={duration} />
            </View>

            {/* Overlay handles + dimming */}
            <View style={[StyleSheet.absoluteFill, { marginHorizontal: HANDLE_W }]} pointerEvents="box-none">
              <TrimHandles
                bandPan={bandPan}
                trackW={trackW}
                startSec={startSec}
                endSec={endSec}
                duration={duration}
                sAnim={sAnim}
                eAnim={eAnim}
                startPan={startPan}
                endPan={endPan}
                playheadAnim={playheadAnim}
                playing={playing}
              />
            </View>
          </View>
        </Pressable>

        <PlaybackControls
          playing={playing}
          onToggle={togglePlay}
          currentTime={clipRel}
          clipDuration={clipSec}
        />

        <Text style={s.hint}>
          اسحب الأطراف لتعديل البداية والنهاية
        </Text>
      </View>
    </SafeAreaView>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSave: {
    backgroundColor: ACCENT,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 100,
  },
  headerSaveText: {
    color: '#0a0a0a',
    fontWeight: '900',
    fontSize: 14,
  },

  // ── Video Preview ──
  previewWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  preview: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 20,
    overflow: 'hidden',
    marginVertical: 8,
  },
  previewLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  playBtnWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  // ── Bottom Panel ──
  bottomPanel: {
    backgroundColor: '#0a0a0a',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },

  // ── Duration indicator ──
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
    direction: 'ltr',
  },
  timeBox: {
    minWidth: 56,
  },
  timeLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timeSub: {
    color: '#6b7280',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 1,
  },
  clipBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    backgroundColor: 'rgba(252, 211, 77, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(252, 211, 77, 0.3)',
  },
  clipText: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: '900',
  },
  clipMax: {
    color: '#a16207',
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Timeline ──
  timelineWrap: {
    height: TIMELINE_H + 8,
    justifyContent: 'center',
  },
  timelineInner: {
    height: TIMELINE_H,
    backgroundColor: '#18181b',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    direction: 'ltr',
  },
  thumbsContainer: {
    height: TIMELINE_H,
  },
  thumbStrip: {
    flex: 1,
    flexDirection: 'row',
  },
  thumbCell: {
    flex: 1,
    height: '100%',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#27272a',
  },

  // ── Handles ──
  dimmed: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
  },
  selectionBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  bandGrip: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -8,
    marginLeft: -10,
    flexDirection: 'row',
    gap: 3,
    width: 20,
  },
  bandGripDot: {
    width: 3,
    height: 16,
    backgroundColor: 'rgba(252,211,77,0.7)',
    borderRadius: 2,
  },
  selectionTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: ACCENT,
  },
  selectionBot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: ACCENT,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  handle: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: HANDLE_W,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleL: {
    left: -HANDLE_W,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  handleR: {
    left: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  handleInner: {
    width: 14,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Playback controls ──
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  playToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsText: {
    color: '#fff',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },

  hint: {
    textAlign: 'center',
    color: '#52525b',
    fontSize: 11,
    marginTop: 12,
  },
})
