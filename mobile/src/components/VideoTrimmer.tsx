/**
 * VideoTrimmer — WhatsApp-style trim UI
 * No video player needed (works in current build without rebuild)
 * Shows: duration bar + draggable yellow handles + time display
 */
import { useRef, useState, useCallback } from 'react'
import { View, Text, Pressable, PanResponder, Animated, Dimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

const MAX_SEC = 30
const HANDLE_W = 20
const TRACK_H = 64
const { width: SCREEN_W } = Dimensions.get('window')
const TRACK_W = SCREEN_W - spacing.lg * 2 - HANDLE_W * 2

interface Props {
  uri: string
  duration: number
  onConfirm: (startSec: number, durationSec: number) => void
  onCancel: () => void
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function VideoTrimmer({ uri, duration, onConfirm, onCancel }: Props) {
  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(Math.min(MAX_SEC, duration))
  const clipSec = Math.max(1, endSec - startSec)

  const secToPx = (s: number) => (s / duration) * TRACK_W
  const pxToSec = (px: number) => (px / TRACK_W) * duration

  const sxRef = useRef(secToPx(0))
  const exRef = useRef(secToPx(Math.min(MAX_SEC, duration)))
  const sAnim = useRef(new Animated.Value(sxRef.current)).current
  const eAnim = useRef(new Animated.Value(exRef.current)).current

  // ── Start handle ───────────────────────────────────────────────────────────
  const startPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(sxRef.current + g.dx, 0, exRef.current - HANDLE_W)),
        Math.max(0, endSec - MAX_SEC), endSec - 1
      )
      sAnim.setValue(secToPx(newSec))
      setStartSec(newSec)
    },
    onPanResponderRelease: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(sxRef.current + g.dx, 0, exRef.current - HANDLE_W)),
        Math.max(0, endSec - MAX_SEC), endSec - 1
      )
      sxRef.current = secToPx(newSec)
      sAnim.setValue(sxRef.current)
      setStartSec(newSec)
    },
  })).current

  // ── End handle ─────────────────────────────────────────────────────────────
  const endPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(exRef.current + g.dx, sxRef.current + HANDLE_W, TRACK_W)),
        startSec + 1, Math.min(duration, startSec + MAX_SEC)
      )
      eAnim.setValue(secToPx(newSec))
      setEndSec(newSec)
    },
    onPanResponderRelease: (_, g) => {
      const newSec = clamp(
        pxToSec(clamp(exRef.current + g.dx, sxRef.current + HANDLE_W, TRACK_W)),
        startSec + 1, Math.min(duration, startSec + MAX_SEC)
      )
      exRef.current = secToPx(newSec)
      eAnim.setValue(exRef.current)
      setEndSec(newSec)
    },
  })).current

  const leftPct  = (startSec / duration) * 100
  const rightPct = (endSec   / duration) * 100

  return (
    <View style={{ gap: spacing.lg }}>

      {/* Video icon placeholder instead of video player */}
      <View style={{ backgroundColor: '#111', borderRadius: radius.xl, height: 200, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Ionicons name="film-outline" size={64} color={colors.grey500} />
        <Text style={{ color: colors.grey500, fontSize: fontSize.sm }}>
          الفيديو: {fmt(startSec)} ← {fmt(endSec)}
        </Text>
        <Text style={{ color: '#f59e0b', fontSize: fontSize.xs, fontWeight: '700' }}>
          {Math.round(clipSec)} ثانية مختارة
        </Text>
      </View>

      {/* Time labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Text style={{ color: colors.grey400, fontSize: 12 }}>{fmt(startSec)}</Text>
        <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: '900' }}>
          {Math.round(clipSec)}s / {MAX_SEC}s
        </Text>
        <Text style={{ color: colors.grey400, fontSize: 12 }}>{fmt(endSec)}</Text>
      </View>

      {/* Track */}
      <View style={{ marginHorizontal: spacing.lg }}>
        <View style={{ height: TRACK_H, borderRadius: radius.lg, backgroundColor: '#2a2a2a', position: 'relative', overflow: 'visible' }}>

          {/* Dimmed left */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: `${leftPct}%`,
            backgroundColor: 'rgba(0,0,0,0.7)',
            borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg,
          }} />

          {/* Dimmed right */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0, right: 0,
            width: `${100 - rightPct}%`,
            backgroundColor: 'rgba(0,0,0,0.7)',
            borderTopRightRadius: radius.lg, borderBottomRightRadius: radius.lg,
          }} />

          {/* Selected region — gradient-like stripes */}
          <View style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${leftPct}%`,
            width: `${rightPct - leftPct}%`,
            borderTopWidth: 3, borderBottomWidth: 3, borderColor: '#f59e0b',
          }}>
            {/* Tick marks */}
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={{
                position: 'absolute',
                left: `${(i + 1) * 12.5}%`,
                top: 8, bottom: 8,
                width: 1,
                backgroundColor: 'rgba(255,255,255,0.15)',
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

      {/* Buttons */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        <Pressable
          onPress={onCancel}
          style={{ flex: 1, paddingVertical: 14, borderRadius: radius.pill, alignItems: 'center', backgroundColor: colors.grey100 }}
        >
          <Text style={{ fontWeight: '700', color: colors.grey700 }}>إلغاء</Text>
        </Pressable>
        <Pressable
          onPress={() => onConfirm(startSec, clipSec)}
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
