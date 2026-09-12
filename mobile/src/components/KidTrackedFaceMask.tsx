import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Animated, I18nManager, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { FILTER_ART_SIZE, getFilterParts } from '@/components/KidFaceFilterParts'
import { computeFaceFrame, placePart, MAX_ROLL_RAD, MOUTH_MODE_CAVITY, MOUTH_MODE_NONE, MOUTH_MODE_STRETCH, type TrackedFace } from '@/lib/faceFrame'

export type { TrackedFace, TrackedLandmarks, TrackedPoint } from '@/lib/faceFrame'

type Props = {
  avatarId?: string | null
  face?: TrackedFace | null
  trackingAvailable?: boolean
  /** Hide the "keep your face visible" helper (e.g. during playback replay). */
  showGuide?: boolean
  /**
   * Real-time mode: subscribe to detector frames directly and drive the
   * Animated values with zero React re-renders in between. When provided, the
   * `face` prop is ignored and `faceVisible` controls the helper chip.
   */
  subscribe?: (listener: (face: TrackedFace | null) => void) => () => void
  faceVisible?: boolean
}

type PartAnimation = {
  x: Animated.Value
  y: Animated.Value
  scale: Animated.Value
  squashX: Animated.Value
  stretch: Animated.Value
  rotation: Animated.Value
}

/**
 * Live face filter driven by real ML Kit landmarks. Every art part is placed
 * independently: glasses/visors on the eye line, muzzle pieces between nose
 * and mouth, headwear above the forehead. Muzzle parts stretch when the child
 * opens their mouth for a playful TikTok-mask feel.
 */
export default function KidTrackedFaceMask({ avatarId, face, trackingAvailable = true, showGuide = true, subscribe, faceVisible }: Props) {
  const parts = useMemo(() => getFilterParts(avatarId), [avatarId])
  const opacity = useRef(new Animated.Value(0)).current
  const faceVisibleRef = useRef(false)
  const animationsRef = useRef<Map<string, PartAnimation>>(new Map())
  const reaction = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale: new Animated.Value(0.72),
    rotation: new Animated.Value(0),
  }).current

  const partAnimation = (key: string): PartAnimation => {
    let entry = animationsRef.current.get(key)
    if (!entry) {
      entry = {
        x: new Animated.Value(0),
        y: new Animated.Value(0),
        scale: new Animated.Value(0.4),
        squashX: new Animated.Value(1),
        stretch: new Animated.Value(1),
        rotation: new Animated.Value(0),
      }
      animationsRef.current.set(key, entry)
    }
    return entry
  }

  // Applies one detector/replay frame straight onto the Animated values. In
  // subscribe mode this runs synchronously inside the ML Kit callback, so the
  // only remaining latency is detection time + one short easing.
  const applyFace = useCallback((nextFace: TrackedFace | null) => {
    if (!nextFace) {
      if (faceVisibleRef.current) {
        faceVisibleRef.current = false
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: false }).start()
        Animated.timing(reaction.opacity, { toValue: 0, duration: 140, useNativeDriver: false }).start()
      }
      return
    }

    const frame = computeFaceFrame(nextFace)
    if (!faceVisibleRef.current) {
      faceVisibleRef.current = true
      Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: false }).start()
    }

    const energy = Math.max(frame.smile, frame.mouthOpen)
    const reactionOpacity = energy > 0.52 ? Math.min(1, (energy - 0.52) * 3.2) : 0
    // Calling Animated.parallel dozens of times per second queues a large
    // number of JS-driven animations on Android. The detector data is already
    // smoothed before it reaches this component, so setting the values directly
    // is both steadier and tracks a moving face with less latency.
    reaction.x.setValue(frame.anchors.headTop.x - 80)
    reaction.y.setValue(frame.anchors.headTop.y - frame.iod * 0.92 - 76)
    reaction.opacity.setValue(reactionOpacity)
    reaction.scale.setValue(0.72 + energy * 0.34)
    reaction.rotation.setValue(frame.angleRad)

    for (const part of parts) {
      const anim = partAnimation(part.key)
      const placement = placePart(
        frame,
        part.anchor,
        part.designAnchor.x,
        part.designAnchor.y,
        part.widthInIod,
        part.mouthCavity ? MOUTH_MODE_CAVITY : part.followMouth ? MOUTH_MODE_STRETCH : MOUTH_MODE_NONE,
        FILTER_ART_SIZE,
      )

      anim.x.setValue(placement.translateX)
      anim.y.setValue(placement.translateY)
      anim.scale.setValue(placement.scale)
      anim.squashX.setValue(placement.squashX)
      anim.stretch.setValue(placement.stretch)
      anim.rotation.setValue(placement.angleRad)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity, parts])

  // Real-time mode: detector frames drive the mask directly.
  useEffect(() => {
    if (!subscribe || !avatarId) return
    return subscribe(applyFace)
  }, [applyFace, avatarId, subscribe])

  // Prop mode (preview/feed replay): follow the `face` prop.
  useEffect(() => {
    if (subscribe) return
    if (!avatarId) {
      applyFace(null)
      return
    }
    applyFace(face || null)
  }, [applyFace, avatarId, face, subscribe])

  if (!avatarId) return null

  const noFace = subscribe ? faceVisible === false : !face
  const reactionRotate = reaction.rotation.interpolate({
    inputRange: [-MAX_ROLL_RAD, MAX_ROLL_RAD],
    outputRange: [`-${MAX_ROLL_RAD}rad`, `${MAX_ROLL_RAD}rad`],
  })

  return (
    <View pointerEvents="none" style={styles.root}>
      {parts.map((part) => {
        const anim = partAnimation(part.key)
        const rotate = anim.rotation.interpolate({
          inputRange: [-MAX_ROLL_RAD, MAX_ROLL_RAD],
          outputRange: [`-${MAX_ROLL_RAD}rad`, `${MAX_ROLL_RAD}rad`],
        })
        return (
          <Animated.View
            key={part.key}
            style={[
              styles.part,
              {
                opacity,
                left: anim.x,
                top: anim.y,
                transform: [
                  { rotate },
                  { scale: anim.scale },
                  { scaleX: anim.squashX },
                  { scaleY: anim.stretch },
                ],
              },
            ]}
          >
            {part.render()}
          </Animated.View>
        )
      })}

      <Animated.View
        style={[
          styles.reaction,
          {
            left: reaction.x,
            top: reaction.y,
            opacity: reaction.opacity,
            transform: [{ rotate: reactionRotate }, { scale: reaction.scale }],
          },
        ]}
      >
        <Ionicons name="sparkles" size={30} color="#FDE047" style={styles.sparkTopLeft} />
        <Ionicons name="star" size={20} color="#FB7185" style={styles.sparkTopRight} />
        <Ionicons name="sparkles" size={22} color="#38BDF8" style={styles.sparkBottomLeft} />
        <Ionicons name="star" size={16} color="#A78BFA" style={styles.sparkBottomRight} />
      </Animated.View>

      {noFace && showGuide && (
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
