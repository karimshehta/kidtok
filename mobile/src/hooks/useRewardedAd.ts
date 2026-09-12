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
  show:    (onRewarded: () => void | Promise<void>) => Promise<void>
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
        .in('key', ['admob_android_rewarded', 'admob_ios_rewarded', 'admob_rewarded_enabled'])
      const m: Record<string, string> = {}
      for (const row of data || []) m[row.key] = row.value || ''
      return {
        androidUnitId: m['admob_android_rewarded'] || '',
        iosUnitId:     m['admob_ios_rewarded']     || '',
        enabled:       m['admob_rewarded_enabled'] !== 'false',
      }
    },
  })
}

// ─── Google test IDs — always work in __DEV__ builds without device registration
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917'
const TEST_REWARDED_IOS     = 'ca-app-pub-3940256099942544/1712485313'

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useRewardedAd(): UseRewardedAdReturn {
  const { data: settings } = useRewardedSettings()

  // ✅ Always use admin IDs from Supabase — no test fallback
  const rewardedEnabled = settings?.enabled !== false
  const adUnitId = rewardedEnabled
    ? (Platform.OS === 'android' ? settings?.androidUnitId : settings?.iosUnitId)
    : ''
  const adModule  = useRef(getAdModule()).current
  const adRef     = useRef<any>(null)
  const unsubsRef = useRef<(() => void)[]>([])

  const [loaded,  setLoaded]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => { loadedRef.current = loaded }, [loaded])

  const cleanup = useCallback(() => {
    unsubsRef.current.forEach((fn) => { try { fn() } catch {} })
    unsubsRef.current = []
  }, [])

  const load = useCallback(() => {
    if (!adModule || !adUnitId) {
      setLoaded(false)
      setLoading(false)
      setError(!adModule ? 'AdMob module is unavailable in this build' : 'Rewarded ad unit id is missing')
      return
    }
    cleanup()
    setLoaded(false)
    setLoading(true)
    setError(null)

    try {
      const { RewardedAd, RewardedAdEventType, AdEventType } = adModule
      const ad = RewardedAd.createForAdRequest(adUnitId)
      adRef.current = ad

      unsubsRef.current.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          setLoaded(true)
          setLoading(false)
        }),
        ad.addAdEventListener(AdEventType.ERROR, (err: Error) => {
          if (__DEV__) {
            console.warn('[rewarded-ad] load failed', {
              platform: Platform.OS,
              unitId: adUnitId ? `${adUnitId.slice(0, 18)}...` : 'missing',
              message: err?.message || String(err),
            })
          }
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
  // NOTE: reward is ONLY granted if the user actually watched the ad to completion.
  // If no ad is available, we throw — the caller decides what to do (show error,
  // wait, etc.) instead of silently rewarding without an ad view.
  const show = useCallback(async (onRewarded: () => void | Promise<void>): Promise<void> => {
    if (!rewardedEnabled) throw new Error('AD_DISABLED')
    if (!adModule) throw new Error('AD_NOT_READY')
    if (!adUnitId) throw new Error('AD_UNIT_MISSING')

    if (!adRef.current || !loaded) {
      load()
      await new Promise<void>((resolve, reject) => {
        const started = Date.now()
        const timer = setInterval(() => {
          if (loadedRef.current) {
            clearInterval(timer)
            resolve()
          } else if (Date.now() - started > 8000) {
            clearInterval(timer)
            reject(new Error('AD_NOT_READY'))
          }
        }, 250)
      })
      if (!adRef.current) throw new Error('AD_NOT_READY')
    }

    return new Promise<void>((resolve, reject) => {
      const { RewardedAdEventType, AdEventType } = adModule
      let earned = false

      const unsubEarned = adRef.current.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => { earned = true }
      )
      const unsubClosed = adRef.current.addAdEventListener(
        AdEventType.CLOSED,
        async () => {
          unsubEarned()
          unsubClosed()
          if (earned) {
            try {
              await onRewarded()
              resolve()
            } catch (rewardError) {
              reject(rewardError)
            }
          } else {
            // User closed before earning — no reward
            reject(new Error('AD_DISMISSED'))
          }
          // Preload next ad
          setTimeout(() => load(), 1000)
        }
      )

      try {
        adRef.current.show()
      } catch {
        unsubEarned()
        unsubClosed()
        load()
        reject(new Error('AD_SHOW_FAILED'))
      }
    })
  }, [adUnitId, loaded, adModule, load, rewardedEnabled])

  return { ready: loaded, loading, error, show, reload: load }
}
