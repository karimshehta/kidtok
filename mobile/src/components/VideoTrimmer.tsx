/**
 * VideoTrimmer — WhatsApp-style video trimmer using expo-video
 *
 * Features:
 * - Live video preview with expo-video
 * - Draggable start/end yellow handles (PanResponder)
 * - Max 30 seconds enforced
 * - Seeks video to current handle position while dragging
 * - Play/pause preview of selected clip
 * - Tick marks on selected region
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import {
  View, Text, Pressable, PanResponder,
  Animated, Dimensions, ActivityIndicator, StyleSheet,
} from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const MAX_SEC    = 30
const HANDLE_W   = 20
const TRACK_H    = 64
const { width: W } = Dimensions.get('window')
const TRACK_W    = W - spacing.lg * 2 - HANDLE_W * 2

interface Props {
  uri: string
  duration: number        // total video duration in seconds
  onConfirm: (startSec: number, durationSec: number) => void
  onCancel: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function fmt(s: number) {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function VideoTrimmer({ uri, duration, onConfirm, onCancel }: Props) {
  const [startSec, setStartSec] = useState(0)
  const [endSec,   setEndSec]   = useState(Math.min(MAX_SEC, duration))
  const [playing,  setPlaying]  = useState(false)
  const [ready,    setReady]    = useState(false)

  const clipSec = Math.max(0.5, endSec - startSec)

  // ── expo-video player ─────────────────────────────────────────────────────
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop    = false
    p.muted   = false
    p.currentTime = 0
  })

  // Stop when playback reaches end of clip
  useEffect(() => {
    const sub = player.addListener('timeUpdate', (e) => {
      if (e.currentTime >= endSec) {
        player.pause()
        player.currentTime = startSec
        setPlaying(false)
      }
    })
    return () => sub.remove()
  }, [player, startSec, endSec])

  // Ready when player is loaded
  useEffect(() => {
    const sub = player.addListener('statusChange', (e) => {
      if (e.status === 'readyToPlay') setReady(true)
    })
    return () => sub.remove()
  }, [player])

  const togglePlay = () => {
    if (playing) {
      player.pause()
      setPlaying(false)
    } else {
      player.currentTime = startSec
      player.play()
      setPlaying(true)
    }
  }

  // ── Pixel ↔ second conversion ─────────────────────────────────────────────
  const secToPx = (s: number) => (s / duration) * TRACK_W
  const pxToSec = (px: number) => (px / TRACK_W) * duration

  const sxRef = useRef(secToPx(0))
  const exRef = useRef(secToPx(Math.min(MAX_SEC, duration)))
  const sAnim = useRef(new Animated.Value(sxRef.current)).current
  const eAnim = useRef(new Animated.Value(exRef.current)).current

  // ── Start handle ──────────────────────────────────────────────────────────
  const startPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      player.pause()
      setPlaying(false)
    },
    onPanResponderMove: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(sxRef.current + g.dx, 0, exRef.current - HANDLE_W)),
        Math.max(0, endSec - MAX_SEC),
        endSec - 0.5
      )
      sAnim.setValue(secToPx(newSec))
      setStartSec(newSec)
      player.currentTime = newSec
    },
    onPanResponderRelease: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(sxRef.current + g.dx, 0, exRef.current - HANDLE_W)),
        Math.max(0, endSec - MAX_SEC),
        endSec - 0.5
      )
      sxRef.current = secToPx(newSec)
      sAnim.setValue(sxRef.current)
      setStartSec(newSec)
      player.currentTime = newSec
    },
  })).current

  // ── End handle ────────────────────────────────────────────────────────────
  const endPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      player.pause()
      setPlaying(false)
    },
    onPanResponderMove: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(exRef.current + g.dx, sxRef.current + HANDLE_W, TRACK_W)),
        startSec + 0.5,
        Math.min(duration, startSec + MAX_SEC)
      )
      eAnim.setValue(secToPx(newSec))
      setEndSec(newSec)
    },
    onPanResponderRelease: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(exRef.current + g.dx, sxRef.current + HANDLE_W, TRACK_W)),
        startSec + 0.5,
        Math.min(duration, startSec + MAX_SEC)
      )
      exRef.current = secToPx(newSec)
      eAnim.setValue(exRef.current)
      setEndSec(newSec)
    },
  })).current

  const leftPct  = (startSec / duration) * 100
  const rightPct = (endSec   / duration) * 100

  return (
    <View style={{ gap: spacing.md }}>

      {/* ── Video preview ── */}
      <View style={{ height: 260, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: '#000' }}>
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          nativeControls={false}
        />

        {/* Loading spinner */}
        {!ready && (
          <View style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}

        {/* Play/pause tap overlay */}
        <Pressable
          onPress={ready ? togglePlay : undefined}
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          {!playing && ready && (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="play" size={28} color="#fff" />
            </View>
          )}
        </Pressable>
      </View>

      {/* ── Time labels ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Text style={{ color: colors.grey500, fontSize: 12, fontVariant: ['tabular-nums'] }}>{fmt(startSec)}</Text>
        <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: '900' }}>
          {Math.round(clipSec)}s / {MAX_SEC}s
        </Text>
        <Text style={{ color: colors.grey500, fontSize: 12, fontVariant: ['tabular-nums'] }}>{fmt(endSec)}</Text>
      </View>

      {/* ── Timeline track ── */}
      <View style={{ marginHorizontal: spacing.lg }}>
        <View style={{ height: TRACK_H, borderRadius: radius.lg, backgroundColor: '#1F2937', position: 'relative', overflow: 'visible' }}>

          {/* Dimmed left */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: `${leftPct}%`,
            backgroundColor: 'rgba(0,0,0,0.65)',
            borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg,
          }} />

          {/* Dimmed right */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0, right: 0,
            width: `${100 - rightPct}%`,
            backgroundColor: 'rgba(0,0,0,0.65)',
            borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg,
          }} />

          {/* Golden selection border + ticks */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${leftPct}%`,
            width: `${rightPct - leftPct}%`,
            borderTopWidth: 3, borderBottomWidth: 3, borderColor: '#f59e0b',
          }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View key={i} style={{
                position: 'absolute',
                left: `${(i + 1) * 10}%`,
                top: 10, bottom: 10, width: 1,
                backgroundColor: 'rgba(255,255,255,0.12)',
              }} />
            ))}
          </View>
        </View>

        {/* Start handle */}
        <Animated.View
          {...startPan.panHandlers}
          style={{
            position: 'absolute', top: 0, bottom: 0, width: HANDLE_W,
            backgroundColor: '#f59e0b',
            borderTopLeftRadius: 6, borderBottomLeftRadius: 6,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ translateX: sAnim }],
          }}
        >
          <View style={{ width: 3, height: 24, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 2 }} />
        </Animated.View>

        {/* End handle */}
        <Animated.View
          {...endPan.panHandlers}
          style={{
            position: 'absolute', top: 0, bottom: 0, width: HANDLE_W,
            backgroundColor: '#f59e0b',
            borderTopRightRadius: 6, borderBottomRightRadius: 6,
            alignItems: 'center', justifyContent: 'center',
            transform: [{ translateX: eAnim }],
          }}
        >
          <View style={{ width: 3, height: 24, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 2 }} />
        </Animated.View>
      </View>

      <Text style={{ color: colors.grey500, fontSize: fontSize.xs, textAlign: 'center' }}>
        اسحب الحدود الصفراء لتحديد الجزء المطلوب
      </Text>

      {/* ── Buttons ── */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        <Pressable
          onPress={() => { player.pause(); onCancel() }}
          style={{ flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.grey100 }}
        >
          <Text style={{ fontWeight: '700', color: colors.grey700 }}>إلغاء</Text>
        </Pressable>
        <Pressable
          onPress={() => { player.pause(); onConfirm(startSec, clipSec) }}
          style={{ flex: 2, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Ionicons name="cut" size={18} color="#fff" />
          <Text style={{ fontWeight: '900', color: '#fff', fontSize: fontSize.base }}>
            تأكيد ({Math.round(clipSec)}s)
          </Text>
        </Pressable>
      </View>

    </View>
  )
}

