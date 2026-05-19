/**
 * useRewardedAd — Production-ready rewarded ads hook
 *
 * All IDs come from Supabase app_settings.
 * No hardcoded production IDs — admin dashboard is the single source of truth.
 *
 * Usage:
 *   const { ready, loading, show } = useRewardedAd()
 *   await show(() => { // grant reward })
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UseRewardedAdReturn {
  ready:   boolean
  loading: boolean
  error:   string | null
  show:    (onRewarded: () => void) => Promise<void>
  reload:  () => void
}

// ─── Safe module loader ────────────────────────────────────────────────────────
function getAdModule() {
  try { return require('react-native-google-mobile-ads') }
  catch { return null }
}

// ─── Fetch rewarded unit IDs from Supabase ────────────────────────────────────
function useRewardedSettings() {
  return useQuery({
    queryKey: ['rewarded-ad-settings'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['admob_android_rewarded', 'admob_ios_rewarded'])
      const m: Record<string, string> = {}
      for (const row of data || []) m[row.key] = row.value || ''
      return {
        androidUnitId: m['admob_android_rewarded'] || '',
        iosUnitId:     m['admob_ios_rewarded']     || '',
      }
    },
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useRewardedAd(): UseRewardedAdReturn {
  const { data: settings } = useRewardedSettings()
  const adUnitId  = Platform.OS === 'android' ? settings?.androidUnitId : settings?.iosUnitId
  const adModule  = useRef(getAdModule()).current
  const adRef     = useRef<any>(null)
  const unsubsRef = useRef<(() => void)[]>([])

  const [loaded,  setLoaded]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const cleanup = useCallback(() => {
    unsubsRef.current.forEach((fn) => { try { fn() } catch {} })
    unsubsRef.current = []
  }, [])

  const load = useCallback(() => {
    if (!adModule || !adUnitId) return
    cleanup()
    setLoaded(false)
    setLoading(true)
    setError(null)

    try {
      const { RewardedAd, RewardedAdEventType } = adModule
      const ad = RewardedAd.createForAdRequest(adUnitId)
      adRef.current = ad

      unsubsRef.current.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          setLoaded(true)
          setLoading(false)
        }),
        ad.addAdEventListener(RewardedAdEventType.ERROR, (err: Error) => {
          setLoaded(false)
          setLoading(false)
          setError(err?.message || 'Ad failed to load')
        })
      )

      ad.load()
    } catch (err: any) {
      setLoaded(false)
      setLoading(false)
      setError(err?.message || 'AdMob unavailable')
    }
  }, [adModule, adUnitId, cleanup])

  // Load when unit ID is ready
  useEffect(() => {
    if (adUnitId) load()
    return cleanup
  }, [adUnitId])

  // Show ad and trigger reward callback
  const show = useCallback(async (onRewarded: () => void): Promise<void> => {
    // Fallback: no ad available → grant reward directly
    if (!adModule || !adRef.current || !loaded) {
      await onRewarded()
      return
    }

    return new Promise<void>((resolve) => {
      const { RewardedAdEventType } = adModule
      let earned = false

      const unsubEarned = adRef.current.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => { earned = true }
      )
      const unsubClosed = adRef.current.addAdEventListener(
        RewardedAdEventType.CLOSED,
        async () => {
          unsubEarned()
          unsubClosed()
          if (earned) await onRewarded()
          resolve()
          // Preload next ad
          setTimeout(() => load(), 1000)
        }
      )

      try {
        adRef.current.show()
      } catch {
        unsubEarned()
        unsubClosed()
        // Show failed → grant reward anyway
        onRewarded().then(resolve)
        load()
      }
    })
  }, [loaded, adModule, load])

  return { ready: loaded, loading, error, show, reload: load }
}
