/**
 * useRewardedAdSwipes
 *
 * Admin sets `rewarded_ad_after_swipes` in app_settings.
 * After a free user swipes through that many feed videos, we show a
 * rewarded-ad prompt. Set the value to 0 to disable.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlanLimits } from '@/hooks/usePlanLimits'

type SwipeRewardSettings = {
  enabled: boolean
  afterSwipes: number
}

export function useRewardedAdSwipes() {
  const { data: planLimits } = usePlanLimits()
  const isFreeUser = planLimits?.has_ads !== false
  const swipeCountRef = useRef(0)
  const [shouldShow, setShouldShow] = useState(false)

  const { data: settings } = useQuery<SwipeRewardSettings>({
    queryKey: ['rewarded-ad-after-swipes'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['rewarded_ad_after_swipes', 'admob_rewarded_enabled'])

      const map: Record<string, string> = {}
      for (const row of data || []) map[row.key] = row.value || ''

      const rawAfterSwipes = parseInt(map.rewarded_ad_after_swipes || '0', 10)
      return {
        enabled: map.admob_rewarded_enabled !== 'false',
        afterSwipes: Number.isFinite(rawAfterSwipes) ? Math.max(0, rawAfterSwipes) : 0,
      }
    },
  })

  const afterSwipes = settings?.afterSwipes ?? 0
  const enabled = isFreeUser && settings?.enabled !== false && afterSwipes > 0

  useEffect(() => {
    swipeCountRef.current = 0
    setShouldShow(false)
  }, [afterSwipes, enabled])

  const onVideoSwiped = useCallback(() => {
    if (!enabled || shouldShow) return

    swipeCountRef.current += 1
    if (swipeCountRef.current >= afterSwipes) {
      swipeCountRef.current = 0
      setShouldShow(true)
    }
  }, [afterSwipes, enabled, shouldShow])

  const dismiss = useCallback(() => {
    setShouldShow(false)
  }, [])

  return {
    shouldShow,
    onVideoSwiped,
    dismiss,
    afterSwipes,
    enabled,
  }
}
