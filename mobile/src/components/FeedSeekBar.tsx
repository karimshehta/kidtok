import { memo, useRef, useState } from 'react'
import { Dimensions, PanResponder, Text, View } from 'react-native'

import { colors } from '@/lib/theme'

const SCREEN_WIDTH = Dimensions.get('window').width

interface Props {
  current: number
  duration: number
  onSeek: (seconds: number) => void
  bottom: number
}

export default memo(function FeedSeekBar({ current, duration, onSeek, bottom }: Props) {
  const [seeking, setSeeking] = useState(false)
  const [seekFrac, setSeekFrac] = useState(0)
  const fracOf = (pageX: number) => Math.max(0, Math.min(1, pageX / SCREEN_WIDTH))

  const durationRef = useRef(duration)
  durationRef.current = duration
  const onSeekRef = useRef(onSeek)
  onSeekRef.current = onSeek

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        setSeeking(true)
        setSeekFrac(fracOf(e.nativeEvent.pageX))
      },
      onPanResponderMove: (e) => setSeekFrac(fracOf(e.nativeEvent.pageX)),
      onPanResponderRelease: (e) => {
        const fraction = fracOf(e.nativeEvent.pageX)
        const liveDuration = durationRef.current
        if (liveDuration > 0) onSeekRef.current(fraction * liveDuration)
        setSeeking(false)
      },
      onPanResponderTerminate: () => setSeeking(false),
    })
  ).current

  if (!duration || duration <= 0) return null
  const fraction = seeking ? seekFrac : Math.min(1, current / duration)

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom, direction: 'ltr' }} pointerEvents="box-none">
      {seeking && (
        <View style={{ alignItems: 'center', marginBottom: 12 }} pointerEvents="none">
          <View style={{ backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] }}>
              {formatTime(seekFrac * duration)}{' '}
              <Text style={{ color: 'rgba(255,255,255,0.55)' }}>/ {formatTime(duration)}</Text>
            </Text>
          </View>
        </View>
      )}
      <View {...pan.panHandlers} style={{ paddingVertical: 16, justifyContent: 'center' }}>
        <View style={{ height: seeking ? 5 : 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'visible' }}>
          <View style={{ height: '100%', width: `${fraction * 100}%`, backgroundColor: colors.primary }} />
          <View
            style={{
              position: 'absolute',
              left: `${fraction * 100}%`,
              top: '50%',
              width: seeking ? 16 : 12,
              height: seeking ? 16 : 12,
              borderRadius: 8,
              backgroundColor: colors.primary,
              marginLeft: seeking ? -8 : -6,
              marginTop: seeking ? -8 : -6,
            }}
          />
        </View>
      </View>
    </View>
  )
})

function formatTime(seconds: number) {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`
}
