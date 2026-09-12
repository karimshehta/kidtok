/**
 * ReelNativeVideo — Native HLS player for Cloudflare Stream
 *
 * Replaces the WebView+iframe approach which caused audio playback issues:
 *  - Mobile autoplay policy forced muted=true regardless of URL params
 *  - WebView audio session wasn't configured for media playback
 *  - iframe reload on muted toggle re-applied autoplay restriction
 *
 * Using expo-video gives us:
 *  - Native HLS playback (works with Cloudflare HLS manifest)
 *  - Proper iOS audio session (plays in silent mode if configured)
 *  - Programmatic mute/unmute without reload
 *  - Better performance (no WebView overhead)
 *  - Adaptive bitrate streaming
 */
import { useEffect, useRef, memo } from 'react'
import { View, Image } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/lib/theme'

interface Props {
  isActive: boolean
  hlsUrl:   string
  poster:   string | null
  /**
   * Optional pause override. When isActive=true and paused=true, the player
   * stops at the current frame (single-tap-to-pause UX from feed). When
   * isActive flips false (swipe to another video), the parent resets this
   * to false so the next view starts playing from scratch.
   */
  paused?:  boolean
  /**
   * Show the system video controls (seek bar / play / fullscreen).
   * Used in kid-mode playlist so kids can scrub. Off in feed.
   */
  nativeControls?: boolean
  onProgress?: (current: number, duration: number) => void
  onEnded?: () => void
  seekRef?: { current: ((seconds: number) => void) | null }
  /** Exposes the underlying player (e.g. for the avatar mask replay clock). */
  playerRef?: { current: ReturnType<typeof useVideoPlayer> | null }
}

export default memo(function ReelNativeVideo({ isActive, hlsUrl, poster, paused = false, nativeControls = false, onProgress, onEnded, seekRef, playerRef }: Props) {
  const player = useVideoPlayer({ uri: hlsUrl }, (p) => {
    // Keep Cloudflare Stream videos from auto-replaying in the feed.
    // Each replay can deliver the video segments again, which may increase
    // Cloudflare Stream minutes delivered. Users can still swipe away/back
    // to start the video again intentionally.
    p.loop = false
    p.muted = false
    p.volume = 1.0
    p.timeUpdateEventInterval = 0.25
    // iOS-only impact: 'auto' selects AVAudioSessionCategoryAmbient which
    // iOS treats as background-music-friendly but ALSO silences with the
    // ringer switch and rejects programmatic play() right after view
    // activation in some states — that's the "have to double-tap to play
    // on iPhone" bug. 'doNotMix' maps to AVAudioSessionCategoryPlayback,
    // the standard category for video apps, where autoplay works
    // reliably. Android is unaffected.
    p.audioMixingMode = 'doNotMix'
  })

  // Track whether we've already done the "first activation" reset to start.
  // Without this, every pause/resume would seek back to 0.
  const hasStartedRef = useRef(false)

  // Share the player with the parent (avatar mask replay reads its clock).
  useEffect(() => {
    if (!playerRef) return
    playerRef.current = player
    return () => { if (playerRef) playerRef.current = null }
  }, [player, playerRef])

  // Expose a seek function to the parent (custom seek bar).
  useEffect(() => {
    if (!seekRef) return
    seekRef.current = (seconds: number) => {
      try { player.currentTime = seconds } catch {}
      try { if (isActive && !paused) player.play() } catch {}
    }
    return () => { if (seekRef) seekRef.current = null }
  }, [seekRef, player, isActive, paused])

  // Report playback progress to the parent for the custom seek bar.
  useEffect(() => {
    if (!player) return
    const sub = player.addListener('timeUpdate', (e: any) => {
      const dur = player.duration || 0
      if (dur > 0) onProgress?.(e.currentTime, dur)
    })
    return () => { try { sub.remove() } catch {} }
  }, [player, onProgress])

  useEffect(() => {
    if (!player) return
    const sub = player.addListener('playToEnd', () => {
      const dur = player.duration || 0
      if (dur > 0) onProgress?.(dur, dur)
      onEnded?.()
    })
    return () => { try { sub.remove() } catch {} }
  }, [player, onEnded, onProgress])

  // Diagnostic logging — helps identify if hlsUrl is valid
  useEffect(() => {
    if (__DEV__) console.log('[ReelNativeVideo] hlsUrl:', hlsUrl)
    if (!player) return
    const sub = player.addListener('statusChange', (e: any) => {
      if (__DEV__) console.log('[ReelNativeVideo] status:', e.status, 'error:', e.error)
    })
    return () => { try { sub.remove() } catch {} }
  }, [player, hlsUrl])

  // Play / pause based on active+paused state.
  //  - On first activation: seek to 0 and unmute, then play
  //  - On subsequent pause toggles: just play/pause without re-seeking
  //  - On deactivation (swipe away): pause and reset the first-activation flag
  useEffect(() => {
    if (!player) return
    if (isActive) {
      if (!hasStartedRef.current) {
        try { player.currentTime = 0 } catch {}
        try { player.muted = false; player.volume = 1.0 } catch {}
        hasStartedRef.current = true
      }
      if (paused) {
        try { player.pause() } catch {}
      } else {
        try { player.play() } catch {}
      }
    } else {
      hasStartedRef.current = false
      try { player.pause() } catch {}
    }
    return () => { try { player.pause() } catch {} }
  }, [isActive, paused, player])

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Poster — cover-fills the slot; dims when video is active (loading state) */}
      {poster && (
        <Image
          source={{ uri: poster }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: isActive ? 0.3 : 0.95 }}
          resizeMode="cover"
          blurRadius={isActive ? 0 : 2}
        />
      )}

      {/* Native player — cover fills container like TikTok (no black bars) */}
      {isActive && (
        <VideoView
          player={player}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          nativeControls={nativeControls}
        />
      )}

      {/* Idle play indicator (when item is not the active one) */}
      {!isActive && (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={34} color={colors.white} style={{ marginLeft: 4 }} />
          </View>
        </View>
      )}
    </View>
  )
})
