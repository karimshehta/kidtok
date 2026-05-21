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
import { useEffect, memo } from 'react'
import { View, Image, ActivityIndicator } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/lib/theme'

interface Props {
  isActive: boolean
  hlsUrl:   string
  poster:   string | null
}

export default memo(function ReelNativeVideo({ isActive, hlsUrl, poster }: Props) {
  const player = useVideoPlayer({ uri: hlsUrl }, (p) => {
    p.loop = true
    p.muted = false
    p.audioMixingMode = 'auto'
  })

  // Play / pause based on active state (FlatList recycling)
  useEffect(() => {
    if (!player) return
    try {
      if (isActive) {
        player.muted = false
        player.currentTime = 0
        player.play()
      } else {
        player.pause()
      }
    } catch {}
  }, [isActive, player])

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Poster — visible until video plays */}
      {poster && (
        <Image
          source={{ uri: poster }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: isActive ? 0.3 : 0.95 }}
          resizeMode="cover"
          blurRadius={isActive ? 0 : 2}
        />
      )}

      {/* Native player — only mounted while active to save memory & avoid audio bleeding */}
      {isActive && (
        <VideoView
          player={player}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          nativeControls={false}
        />
      )}

      {/* Idle play indicator */}
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
