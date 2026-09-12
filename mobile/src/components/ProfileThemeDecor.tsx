import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

import type { KidTokTheme } from '@/lib/kidtokCollection'

type ThemeLike = Partial<Pick<KidTokTheme, 'id' | 'name_ar' | 'name_en' | 'emoji' | 'gradient' | 'accent_color' | 'animation_key'>> | null | undefined

type Motif = {
  main: string
  side: string
  sparkle: string
  label: string
  soft: string
}

function getThemeMotif(theme: ThemeLike): Motif {
  const key = `${theme?.id || ''} ${theme?.name_en || ''} ${theme?.animation_key || ''} ${theme?.emoji || ''}`.toLowerCase()

  if (key.includes('cat') || key.includes('kitty') || key.includes('paw') || key.includes('قطة')) {
    return { main: '🐱', side: '🐾', sparkle: '💖', label: 'Kitty style', soft: '#FCE7F3' }
  }
  if (key.includes('dino') || key.includes('roar') || key.includes('ديناص')) {
    return { main: '🦖', side: '🦕', sparkle: '🌿', label: 'Dino power', soft: '#DCFCE7' }
  }
  if (key.includes('dragon') || key.includes('fire')) {
    return { main: '🐉', side: '🔥', sparkle: '✨', label: 'Dragon fire', soft: '#FEE2E2' }
  }
  if (key.includes('space') || key.includes('star')) {
    return { main: '🚀', side: '🪐', sparkle: '⭐', label: 'Space hero', soft: '#EDE9FE' }
  }
  if (key.includes('ocean') || key.includes('bubble')) {
    return { main: '🐬', side: '🫧', sparkle: '🌊', label: 'Ocean waves', soft: '#CFFAFE' }
  }
  if (key.includes('royal') || key.includes('king') || key.includes('queen')) {
    return { main: '👑', side: '🏰', sparkle: '💎', label: 'Royal glow', soft: '#FEF3C7' }
  }
  if (key.includes('hero')) {
    return { main: '🦸', side: '⚡', sparkle: '💥', label: 'Hero city', soft: '#DBEAFE' }
  }
  if (key.includes('diamond')) {
    return { main: '💎', side: '✨', sparkle: '🔷', label: 'Diamond shine', soft: '#E0F2FE' }
  }
  if (key.includes('legend')) {
    return { main: '🏆', side: '👑', sparkle: '🌟', label: 'Legend mode', soft: '#FAE8FF' }
  }
  if (key.includes('dream') || key.includes('rainbow')) {
    return { main: '🌈', side: '☁️', sparkle: '💫', label: 'Dream world', soft: '#FCE7F3' }
  }

  return { main: theme?.emoji || '🎨', side: '✨', sparkle: '⭐', label: 'KidTok style', soft: '#E0F2FE' }
}

export function ProfileThemeDecor({
  theme,
  variant = 'header',
}: {
  theme: ThemeLike
  variant?: 'header' | 'card'
}) {
  if (!theme) return null

  const motif = getThemeMotif(theme)
  const card = variant === 'card'
  const colors = (theme.gradient?.length ? theme.gradient : ['#22D3EE', '#F96286']) as [string, string, ...string[]]

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Text style={[styles.floating, card ? styles.cardMain : styles.headerMain]}>
        {motif.main}
      </Text>
      <Text style={[styles.floating, card ? styles.cardSide : styles.headerSide]}>
        {motif.side}
      </Text>
      <Text style={[styles.floating, card ? styles.cardSparkle : styles.headerSparkle]}>
        {motif.sparkle}
      </Text>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.badge, card ? styles.cardBadge : styles.headerBadge]}
      >
        <Text numberOfLines={1} style={[styles.badgeText, card && styles.cardBadgeText]}>
          {motif.label}
        </Text>
      </LinearGradient>
      <View style={[styles.softBubble, { backgroundColor: motif.soft }, card ? styles.cardBubble : styles.headerBubble]} />
    </View>
  )
}

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    textShadowColor: 'rgba(2,6,23,0.16)',
    textShadowRadius: 10,
  },
  headerMain: {
    top: 18,
    left: 18,
    fontSize: 86,
    opacity: 0.24,
    transform: [{ rotate: '-16deg' }],
  },
  headerSide: {
    right: 22,
    top: 74,
    fontSize: 58,
    opacity: 0.28,
    transform: [{ rotate: '13deg' }],
  },
  headerSparkle: {
    left: 34,
    bottom: 28,
    fontSize: 42,
    opacity: 0.36,
    transform: [{ rotate: '10deg' }],
  },
  cardMain: {
    right: 42,
    top: 8,
    fontSize: 54,
    opacity: 0.28,
    transform: [{ rotate: '10deg' }],
  },
  cardSide: {
    left: 14,
    bottom: 12,
    fontSize: 36,
    opacity: 0.32,
    transform: [{ rotate: '-12deg' }],
  },
  cardSparkle: {
    right: 14,
    bottom: 20,
    fontSize: 26,
    opacity: 0.36,
  },
  softBubble: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    opacity: 0.22,
  },
  headerBubble: {
    right: -22,
    bottom: -22,
  },
  cardBubble: {
    left: -28,
    top: -28,
  },
  badge: {
    position: 'absolute',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
  },
  headerBadge: {
    right: 16,
    bottom: 18,
    opacity: 0.78,
  },
  cardBadge: {
    right: 12,
    top: 12,
    opacity: 0.82,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  cardBadgeText: {
    fontSize: 9,
  },
})
