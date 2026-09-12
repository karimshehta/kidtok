import { useMemo } from 'react'
import { I18nManager, StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated'
import { Ionicons } from '@expo/vector-icons'

import { FILTER_ART_SIZE, getFilterParts, type FilterPart } from '@/components/KidFaceFilterParts'
import { computeFaceFrame, placePart, MOUTH_MODE_CAVITY, MOUTH_MODE_NONE, MOUTH_MODE_STRETCH, type TrackedFace } from '@/lib/faceFrame'

type Props = {
  avatarId?: string | null
  /** Detector frames pushed from the camera frame worklet. */
  face: SharedValue<TrackedFace | null>
  faceVisible?: boolean
  trackingAvailable?: boolean
}

const TIMING = { duration: 45, easing: Easing.out(Easing.quad) }

function RealtimePart({ part, face }: { part: FilterPart; face: SharedValue<TrackedFace | null> }) {
  const style = useAnimatedStyle(() => {
    const current = face.value
    if (!current) {
      return { opacity: withTiming(0, { duration: 150 }) }
    }

    const frame = computeFaceFrame(current)
    const placement = placePart(
      frame,
      part.anchor,
      part.designAnchor.x,
      part.designAnchor.y,
      part.widthInIod,
      part.mouthCavity ? MOUTH_MODE_CAVITY : part.followMouth ? MOUTH_MODE_STRETCH : MOUTH_MODE_NONE,
      FILTER_ART_SIZE,
    )

    return {
      opacity: withTiming(1, { duration: 90 }),
      left: withTiming(placement.translateX, TIMING),
      top: withTiming(placement.translateY, TIMING),
      transform: [
        { rotate: withTiming(`${placement.angleRad}rad`, TIMING) },
        { scale: withTiming(placement.scale * (1 + frame.smile * 0.035), TIMING) },
        { scaleX: withTiming(placement.squashX, TIMING) },
        { scaleY: withTiming(placement.stretch, { duration: 40 }) },
      ],
    }
  }, [part])

  return (
    <Animated.View style={[styles.part, style]}>
      {part.render()}
    </Animated.View>
  )
}

function RealtimeReaction({ face }: { face: SharedValue<TrackedFace | null> }) {
  const style = useAnimatedStyle(() => {
    const current = face.value
    if (!current) return { opacity: withTiming(0, { duration: 120 }) }
    const frame = computeFaceFrame(current)
    const energy = Math.max(frame.smile, frame.mouthOpen)
    const visible = energy > 0.52 ? Math.min(1, (energy - 0.52) * 3.2) : 0
    return {
      opacity: withTiming(visible, { duration: visible > 0 ? 90 : 180 }),
      left: withTiming(frame.anchors.headTop.x - 80, TIMING),
      top: withTiming(frame.anchors.headTop.y - frame.iod * 0.92 - 76, TIMING),
      transform: [
        { rotate: withTiming(`${frame.angleRad}rad`, TIMING) },
        { scale: withTiming(0.72 + energy * 0.34, TIMING) },
      ],
    }
  })

  return (
    <Animated.View style={[styles.reaction, style]}>
      <Ionicons name="sparkles" size={30} color="#FDE047" style={styles.sparkTopLeft} />
      <Ionicons name="star" size={20} color="#FB7185" style={styles.sparkTopRight} />
      <Ionicons name="sparkles" size={22} color="#38BDF8" style={styles.sparkBottomLeft} />
      <Ionicons name="star" size={16} color="#A78BFA" style={styles.sparkBottomRight} />
    </Animated.View>
  )
}

/**
 * True real-time face mask: ML Kit results are written to a Reanimated shared
 * value on the camera frame thread and consumed here directly on the UI
 * thread — zero React renders and zero JS-thread hops per frame. Requires the
 * frame-processor pipeline (react-native-vision-camera-worklets).
 */
export default function KidRealtimeFaceMask({ avatarId, face, faceVisible = true, trackingAvailable = true }: Props) {
  const parts = useMemo(() => getFilterParts(avatarId), [avatarId])

  if (!avatarId) return null

  return (
    <View pointerEvents="none" style={styles.root}>
      {parts.map((part) => (
        <RealtimePart key={part.key} part={part} face={face} />
      ))}
      <RealtimeReaction face={face} />

      {!faceVisible && (
        <View style={styles.guide}>
          <Ionicons name={trackingAvailable ? 'scan' : 'alert-circle-outline'} size={15} color="#FFFFFF" />
          <Text style={styles.guideText}>
            {trackingAvailable
              ? (I18nManager.isRTL ? 'خلّي وشك ظاهر عشان الماسك يركب' : 'Keep your face visible to place the filter')
              : (I18nManager.isRTL ? 'بنجهّز تتبّع الوجه...' : 'Preparing face tracking...')}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
  },
  part: {
    position: 'absolute',
    width: FILTER_ART_SIZE,
    height: FILTER_ART_SIZE,
    left: 0,
    top: 0,
  },
  reaction: {
    position: 'absolute',
    width: 160,
    height: 150,
  },
  sparkTopLeft: { position: 'absolute', left: 6, top: 34 },
  sparkTopRight: { position: 'absolute', right: 12, top: 4 },
  sparkBottomLeft: { position: 'absolute', left: 28, bottom: 6 },
  sparkBottomRight: { position: 'absolute', right: 4, bottom: 30 },
  guide: {
    position: 'absolute',
    top: 86,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.66)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
})
