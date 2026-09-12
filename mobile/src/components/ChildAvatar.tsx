import { useState } from 'react'
import { Image, ImageSourcePropType, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

import { colors } from '@/lib/theme'

const boyAvatar  = require('../../assets/images/boy_avatar.png')
const girlAvatar = require('../../assets/images/girl_avatar.png')

const FALLBACK_COLORS = [
  ['#F472B6', '#F43F5E'],
  ['#60A5FA', '#06B6D4'],
  ['#FBBF24', '#F97316'],
  ['#A78BFA', '#8B5CF6'],
  ['#34D399', '#14B8A6'],
  ['#E879F9', '#EC4899'],
  ['#38BDF8', '#6366F1'],
  ['#A3E635', '#22C55E'],
] as const

const SIZES = {
  sm: 32,
  md: 48,
  lg: 80,
  xl: 128,
} as const

type Props = {
  name:     string
  imageUrl?: string | null
  gender?:  'male' | 'female' | null
  size?:    keyof typeof SIZES
}

/**
 * Renders a child's avatar with a layered fallback chain so we NEVER end up
 * with a missing/broken image:
 *   0. If neither `name` nor `gender` is known yet → show a neutral gray
 *      skeleton circle. This is the LOADING state — it prevents a brief
 *      flash of the wrong-gender avatar while the child query is in flight.
 *      Without it, a girl's screen would flicker boy → girl on first render.
 *   1. `imageUrl` is set AND loads → show that image.
 *   2. Else if `gender` is 'female' → show girlAvatar PNG.
 *   3. Else (gender is 'male', null, or anything else) → show boyAvatar PNG.
 *      (The previous version used a letter-gradient fallback here, which
 *      looked broken for legacy children whose gender was never set.)
 *   4. Last-resort if a PNG asset itself fails to load → letter gradient.
 */
export default function ChildAvatar({ name, imageUrl, gender, size = 'md' }: Props) {
  const dimension = SIZES[size]
  const radius = dimension / 2
  const initial = (name?.trim().charAt(0) || 'K').toUpperCase()
  const fallback = FALLBACK_COLORS[getNameHash(name || '') % FALLBACK_COLORS.length]

  // Track if the remote imageUrl errored so we can fall through to the PNG
  // avatar instead of leaving an empty/broken image box.
  const [remoteFailed, setRemoteFailed] = useState(false)

  // Layer 0 — loading skeleton. If we have ZERO data (no name, no image,
  // no gender), the query is still in flight. Showing the male PNG here
  // makes a girl's avatar flash boy → girl on first render. A neutral
  // gray circle is the honest answer until data arrives.
  const isLoading = !imageUrl && !gender && (!name || name.trim() === '')
  if (isLoading) {
    return (
      <View
        style={{
          width: dimension, height: dimension,
          borderRadius: radius,
          backgroundColor: colors.grey100,
        }}
      />
    )
  }

  // Layer 1 — remote image (only if not known-failed)
  if (imageUrl && !remoteFailed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        onError={() => setRemoteFailed(true)}
        style={{
          width: dimension, height: dimension,
          borderRadius: radius,
          backgroundColor: colors.grey100,
        }}
        resizeMode="cover"
      />
    )
  }

  // Layer 2/3 — PNG avatar (always shows for any child, gender drives art)
  const isGirl = gender === 'female'
  const source: ImageSourcePropType = isGirl ? girlAvatar : boyAvatar
  return (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        backgroundColor: isGirl ? `${colors.secondary}20` : colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
        onError={() => { /* if even the bundled PNG fails, fall through to text below */ }}
      />
      {/* Letter fallback layered behind so if the PNG fails to render the
          tile is never totally blank. The PNG covers it on success. */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center', zIndex: -1,
      }}>
        <LinearGradient
          colors={fallback}
          style={{
            width: '100%', height: '100%',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.white, fontWeight: '900', fontSize: Math.round(dimension * 0.42) }}>
            {initial}
          </Text>
        </LinearGradient>
      </View>
    </View>
  )
}

function getNameHash(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return Math.abs(hash)
}
