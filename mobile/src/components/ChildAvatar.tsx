import { Image, ImageSourcePropType, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

import { colors } from '@/lib/theme'

const boyAvatar = require('../../assets/images/boy_avatar.png')
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
  name: string
  imageUrl?: string | null
  gender?: 'male' | 'female' | null
  size?: keyof typeof SIZES
}

export default function ChildAvatar({ name, imageUrl, gender, size = 'md' }: Props) {
  const dimension = SIZES[size]
  const radius = dimension / 2
  const initial = name.trim().charAt(0).toUpperCase() || 'K'
  const fallback = FALLBACK_COLORS[getNameHash(name) % FALLBACK_COLORS.length]

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: dimension, height: dimension, borderRadius: radius, backgroundColor: colors.grey100 }}
        resizeMode="cover"
      />
    )
  }

  if (gender === 'male' || gender === 'female') {
    const source: ImageSourcePropType = gender === 'male' ? boyAvatar : girlAvatar
    return (
      <View
        style={{
          width: dimension,
          height: dimension,
          borderRadius: radius,
          backgroundColor: gender === 'male' ? colors.primaryLight : `${colors.secondary}20`,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </View>
    )
  }

  return (
    <LinearGradient
      colors={fallback}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.white, fontWeight: '900', fontSize: Math.round(dimension * 0.42) }}>
        {initial}
      </Text>
    </LinearGradient>
  )
}

function getNameHash(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return Math.abs(hash)
}
