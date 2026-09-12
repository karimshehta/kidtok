import { useEffect, useMemo, useRef } from 'react'
import { Animated, Dimensions, Easing, I18nManager, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'

import KidFaceFilterArt from '@/components/KidFaceFilterArt'
import { getKidAvatar } from '@/lib/kidAvatars'
import { getKidVoiceLabel } from '@/lib/kidVoices'

type FaceMaskMode = 'recording' | 'preview' | 'playback' | 'picker'

interface Props {
  avatarId?: string | null
  isActive?: boolean
  mode?: FaceMaskMode
  mirror?: boolean
  showVoiceBadge?: boolean
  compact?: boolean
  voiceKey?: string | null
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

export default function KidAvatarFaceMask({
  avatarId,
  isActive = true,
  mode = 'playback',
  mirror = false,
  showVoiceBadge = true,
  compact = false,
  voiceKey,
}: Props) {
  const avatar = getKidAvatar(avatarId)
  const float = useRef(new Animated.Value(0)).current
  const mouth = useRef(new Animated.Value(0)).current
  const sparkle = useRef(new Animated.Value(0)).current

  useEffect(() => {
    float.stopAnimation()
    mouth.stopAnimation()
    sparkle.stopAnimation()

    if (!isActive) {
      float.setValue(0)
      mouth.setValue(0)
      sparkle.setValue(0)
      return
    }

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: mode === 'playback' ? 1150 : 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: mode === 'playback' ? 1150 : 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    )
    const mouthLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(mouth, {
          toValue: 1,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(mouth, {
          toValue: 0,
          duration: 210,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(90),
      ])
    )
    const sparkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, {
          toValue: 1,
          duration: 720,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sparkle, {
          toValue: 0,
          duration: 620,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    )

    floatLoop.start()
    mouthLoop.start()
    sparkleLoop.start()

    return () => {
      floatLoop.stop()
      mouthLoop.stop()
      sparkleLoop.stop()
    }
  }, [float, isActive, mode, mouth, sparkle])

  const metrics = useMemo(() => getMaskMetrics(mode, compact), [compact, mode])

  if (!avatar) return null

  const ar = I18nManager.isRTL
  const voiceLabel = getKidVoiceLabel(voiceKey, ar)
  const mood = getMoodIcon(avatar.id)

  const frameTransform = [
    { translateX: float.interpolate({ inputRange: [0, 1], outputRange: [-9, 9] }) },
    { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [5, -9] }) },
    { rotate: float.interpolate({ inputRange: [0, 1], outputRange: ['-2.8deg', '2.8deg'] }) },
    { scale: float.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1.025] }) },
  ]

  const maskTransform = [
    { scaleX: mirror ? -1 : 1 },
    { scale: mouth.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) },
  ]

  const sparkleTransform = [
    { translateY: sparkle.interpolate({ inputRange: [0, 1], outputRange: [10, -8] }) },
    { scale: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.18] }) },
    { rotate: sparkle.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '10deg'] }) },
  ]

  const rootStyle = mode === 'picker'
    ? [styles.pickerRoot, { height: metrics.rootHeight }]
    : styles.absoluteRoot

  const frameStyle = mode === 'picker'
    ? { width: metrics.size, height: metrics.size }
    : {
        position: 'absolute' as const,
        top: metrics.top,
        left: Math.max(10, (SCREEN_WIDTH - metrics.size) / 2),
        width: metrics.size,
        height: metrics.size,
      }

  return (
    <View pointerEvents="none" style={rootStyle}>
      {mode !== 'playback' && (
        <View style={[styles.guidePill, { top: mode === 'picker' ? 6 : Math.max(74, metrics.top - 44) }]}>
          <Ionicons name="scan" size={15} color="#fff" />
          <Text style={styles.guideText}>
            {ar ? 'حط الماسك على وشك' : 'Place the mask on your face'}
          </Text>
        </View>
      )}

      <Animated.View style={[styles.maskFrame, frameStyle, { transform: frameTransform }]}>
        <Animated.Text
          style={[
            styles.sparkle,
            styles.sparkleLeft,
            {
              opacity: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
              transform: sparkleTransform,
            },
          ]}
        >
          ✨
        </Animated.Text>
        <Animated.Text
          style={[
            styles.sparkle,
            styles.sparkleRight,
            {
              opacity: sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.95] }),
              transform: sparkleTransform,
            },
          ]}
        >
          {mood}
        </Animated.Text>

        <Animated.View
          style={[
            styles.vectorMaskWrap,
            {
              width: metrics.size,
              height: metrics.size,
              transform: maskTransform,
            },
          ]}
        >
          <KidFaceFilterArt avatarId={avatar.id} size={metrics.size} />
        </Animated.View>

        <View style={[styles.faceLockDot, styles.faceLockDotTop, { backgroundColor: avatar.color }]} />
        <View style={[styles.faceLockDot, styles.faceLockDotBottom, { backgroundColor: avatar.color }]} />

        {showVoiceBadge && (
          <LinearGradient
            colors={[`${avatar.color}F2`, '#7C3AEDF2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.voiceBadge, mode === 'picker' ? styles.voiceBadgePicker : null]}
          >
            <Ionicons name="mic" size={14} color="#fff" />
            <Text numberOfLines={1} style={styles.voiceBadgeText}>{voiceLabel}</Text>
          </LinearGradient>
        )}
      </Animated.View>
    </View>
  )
}

function getMaskMetrics(mode: FaceMaskMode, compact: boolean) {
  if (mode === 'picker') {
    const size = compact ? 130 : 162
    return { size, faceSize: size, top: 0, rootHeight: compact ? 146 : 184 }
  }

  if (mode === 'recording') {
    const size = Math.min(238, SCREEN_WIDTH * 0.63)
    return {
      size,
      faceSize: size,
      top: Math.max(126, SCREEN_HEIGHT * 0.18),
      rootHeight: SCREEN_HEIGHT,
    }
  }

  if (mode === 'preview') {
    const size = Math.min(232, SCREEN_WIDTH * 0.62)
    return {
      size,
      faceSize: size,
      top: Math.max(128, SCREEN_HEIGHT * 0.18),
      rootHeight: SCREEN_HEIGHT,
    }
  }

  const size = Math.min(210, SCREEN_WIDTH * 0.56)
  return {
    size,
    faceSize: size,
    top: Math.max(116, SCREEN_HEIGHT * 0.16),
    rootHeight: SCREEN_HEIGHT,
  }
}

function getMoodIcon(id: string) {
  if (id === 'robot') return '🤖'
  if (id === 'black_sunglasses') return '😎'
  if (id === 'lion') return '🦁'
  if (id === 'elephant') return '🐘'
  if (id === 'dinosaur') return '🦖'
  if (id === 'astronaut') return '🚀'
  if (id === 'princess') return '👑'
  if (id === 'superhero') return '⚡'
  return '🎭'
}

const styles = StyleSheet.create({
  absoluteRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  pickerRoot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  guidePill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  guideText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  maskFrame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vectorMaskWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 5,
    fontSize: 27,
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
  sparkleLeft: {
    left: -8,
    top: 18,
  },
  sparkleRight: {
    right: -10,
    top: 34,
  },
  faceLockDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  faceLockDotTop: {
    top: 14,
    left: 24,
  },
  faceLockDotBottom: {
    right: 22,
    bottom: 18,
  },
  voiceBadge: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    minWidth: 116,
    maxWidth: 168,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  voiceBadgePicker: {
    bottom: -2,
  },
  voiceBadgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '900',
  },
})
