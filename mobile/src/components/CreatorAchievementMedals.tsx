import type { ComponentProps } from 'react'
import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

type IoniconName = ComponentProps<typeof Ionicons>['name']

export type CreatorAchievementBadge = {
  id: string
  metric: 'total_likes' | 'followers' | 'total_views'
  threshold: number
  current_value: number
  name_ar: string
  name_en: string
  description_ar: string
  description_en: string
  purchasable: false
}

export type CreatorAchievementResponse = {
  success: boolean
  metrics: {
    total_likes: number
    followers: number
    total_views: number
  }
  badges: CreatorAchievementBadge[]
}

type MedalVisual = {
  icon: IoniconName
  colors: readonly [string, string]
  ribbon: string
}

const MEDAL_VISUALS: Record<string, MedalVisual> = {
  likes_200: {
    icon: 'heart',
    colors: ['#FDBA74', '#EA580C'],
    ribbon: '#9A3412',
  },
  likes_1000: {
    icon: 'trophy',
    colors: ['#FDE68A', '#F59E0B'],
    ribbon: '#B45309',
  },
  followers_200: {
    icon: 'people',
    colors: ['#C4B5FD', '#7C3AED'],
    ribbon: '#5B21B6',
  },
  views_200: {
    icon: 'eye',
    colors: ['#67E8F9', '#0284C7'],
    ribbon: '#075985',
  },
}

const EMPTY_RESPONSE: CreatorAchievementResponse = {
  success: false,
  metrics: { total_likes: 0, followers: 0, total_views: 0 },
  badges: [],
}

function asCount(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

export function creatorAchievementQueryKey(userId?: string | null) {
  return ['creator-achievements', userId || null] as const
}

export function useCreatorAchievements(userId?: string | null) {
  return useQuery<CreatorAchievementResponse>({
    queryKey: creatorAchievementQueryKey(userId),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!userId) return EMPTY_RESPONSE

      const { data, error } = await supabase.rpc('get_creator_achievement_badges', {
        p_user_id: userId,
      })

      // Older backends can keep running this mobile build until the additive
      // migration is deployed. The medals simply stay hidden in that window.
      if (error || !data || typeof data !== 'object') return EMPTY_RESPONSE

      const raw = data as any
      const badges = Array.isArray(raw.badges)
        ? raw.badges
            .filter((badge: any) => badge && typeof badge.id === 'string')
            .map((badge: any) => ({
              ...badge,
              threshold: asCount(badge.threshold),
              current_value: asCount(badge.current_value),
              purchasable: false as const,
            }))
        : []

      return {
        success: raw.success === true,
        metrics: {
          total_likes: asCount(raw.metrics?.total_likes),
          followers: asCount(raw.metrics?.followers),
          total_views: asCount(raw.metrics?.total_views),
        },
        badges,
      }
    },
  })
}

export default function CreatorAchievementMedals({
  badges,
  ar,
}: {
  badges: CreatorAchievementBadge[] | null | undefined
  ar: boolean
}) {
  if (!badges?.length) return null

  return (
    <View
      style={{
        marginTop: 8,
        maxWidth: 330,
        flexDirection: ar ? 'row-reverse' : 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {badges.map((badge) => {
        const visual = MEDAL_VISUALS[badge.id] || {
          icon: 'medal' as IoniconName,
          colors: ['#E2E8F0', '#64748B'] as const,
          ribbon: '#475569',
        }
        const name = ar ? badge.name_ar : badge.name_en
        const description = ar ? badge.description_ar : badge.description_en

        return (
          <View
            key={badge.id}
            accessible
            accessibilityLabel={`${name}. ${description}`}
            style={{ width: 70, alignItems: 'center' }}
          >
            <View style={{ width: 48, height: 54, alignItems: 'center' }}>
              <View
                style={{
                  position: 'absolute',
                  left: 13,
                  bottom: 0,
                  width: 9,
                  height: 19,
                  borderBottomLeftRadius: 3,
                  backgroundColor: visual.ribbon,
                  transform: [{ rotate: '8deg' }],
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  right: 13,
                  bottom: 0,
                  width: 9,
                  height: 19,
                  borderBottomRightRadius: 3,
                  backgroundColor: visual.ribbon,
                  transform: [{ rotate: '-8deg' }],
                }}
              />
              <LinearGradient
                colors={visual.colors as [string, string]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderWidth: 2,
                  borderColor: 'rgba(255,255,255,0.9)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#0F172A',
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                }}
              >
                <Ionicons name={visual.icon} size={21} color="#FFFFFF" />
              </LinearGradient>
            </View>
            <Text
              numberOfLines={2}
              style={{
                minHeight: 24,
                color: '#FFFFFF',
                fontSize: 9,
                lineHeight: 12,
                fontWeight: '900',
                textAlign: 'center',
                textShadowColor: 'rgba(15,23,42,0.35)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }}
            >
              {name}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
