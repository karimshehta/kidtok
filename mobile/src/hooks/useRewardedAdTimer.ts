/**
 * useRewardedAdTimer
 *
 * Admin sets `rewarded_ad_after_minutes` in the dashboard.
 * After the user has been in the app for that many minutes (free users only),
 * this hook sets `shouldShow = true` so the caller can display a prompt.
 *
 * Rules:
 *   - Only for free users (has_ads = true from plan limits)
 *   - Only once per app session (resets when app restarts)
 *   - Admin can set to 0 to disable
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlanLimits } from '@/hooks/usePlanLimits'

export function useRewardedAdTimer() {
  const { data: planLimits } = usePlanLimits()
  const isFreeUser = planLimits?.has_ads !== false
  const [shouldShow, setShouldShow] = useState(false)
  const shownThisSession = useRef(false)

  const { data: settings } = useQuery({
    queryKey: ['rewarded-ad-timer-settings'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['rewarded_ad_after_minutes', 'admob_rewarded_enabled'])

      const map: Record<string, string> = {}
      for (const row of data || []) map[row.key] = row.value || ''
      return {
        enabled: map.admob_rewarded_enabled !== 'false',
        minutes: parseInt(map.rewarded_ad_after_minutes || '0', 10),
      }
    },
  })

  useEffect(() => {
    if (!isFreeUser) return
    if (settings?.enabled === false) return
    if (shownThisSession.current) return
    const minutes = settings?.minutes || 0
    if (minutes <= 0) return

    const ms = minutes * 60 * 1000
    const timer = setTimeout(() => {
      if (!shownThisSession.current) {
        shownThisSession.current = true
        setShouldShow(true)
      }
    }, ms)

    return () => clearTimeout(timer)
  }, [isFreeUser, settings])

  const dismiss = () => setShouldShow(false)

  return { shouldShow, dismiss }
}
