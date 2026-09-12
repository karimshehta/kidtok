import { useEffect, useMemo, useState } from 'react'
import { Dimensions } from 'react-native'
import type { VideoPlayer } from 'expo-video'

import KidTrackedFaceMask, { type TrackedFace } from '@/components/KidTrackedFaceMask'
import { sampleAvatarTrack, scaleAvatarTrack, type AvatarTrack } from '@/lib/avatarTrack'

type Props = {
  avatarId?: string | null
  track?: AvatarTrack | null
  player?: VideoPlayer | null
  /** Late-bound player (feed items create their player after first render). */
  playerRef?: { current: VideoPlayer | null }
  /** Fallback clock (seconds) for players that expose progress differently. */
  currentTime?: number
  width?: number
  height?: number
  isActive?: boolean
}

const TICK_MS = 66

/**
 * Replays a recorded face-tracking timeline over a playing video so the mask
 * stays glued to the child's face in previews and in the feed. Reads the
 * player clock ~15×/s; KidTrackedFaceMask's own short animations smooth the
 * gaps between samples.
 */
export default function KidReplayFaceMask({
  avatarId,
  track,
  player,
  playerRef,
  currentTime,
  width,
  height,
  isActive = true,
}: Props) {
  const [face, setFace] = useState<TrackedFace | null>(null)

  const window = Dimensions.get('window')
  const targetW = width || window.width
  const targetH = height || window.height

  const scaledTrack = useMemo(
    () => (track ? scaleAvatarTrack(track, targetW, targetH) : null),
    [track, targetW, targetH],
  )

  useEffect(() => {
    if (!scaledTrack || !avatarId || !isActive) {
      setFace(null)
      return
    }

    const tick = () => {
      const activePlayer = playerRef?.current || player
      if (!activePlayer) {
        setFace(typeof currentTime === 'number' ? sampleAvatarTrack(scaledTrack, currentTime) : null)
        return
      }
      let t = 0
      try {
        t = activePlayer.currentTime || 0
      } catch {
        // Player was released while we were polling — hide until it returns.
        setFace(null)
        return
      }
      setFace(sampleAvatarTrack(scaledTrack, t))
    }

    tick()
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [avatarId, currentTime, isActive, player, playerRef, scaledTrack])

  if (!avatarId || !scaledTrack) return null

  return <KidTrackedFaceMask avatarId={avatarId} face={face} trackingAvailable showGuide={false} />
}
