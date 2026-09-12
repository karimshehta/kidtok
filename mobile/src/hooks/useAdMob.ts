/**
 * useAdMob — Interstitial ads for free users
 *
 * All configuration (IDs, frequency) comes from Supabase app_settings.
 * No hardcoded production IDs — admin dashboard is the single source of truth.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlanLimits } from './usePlanLimits'

const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712'
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910'

// ─── Safe module loader ────────────────────────────────────────────────────────
function getAdModule() {
  try { return require('react-native-google-mobile-ads') }
  catch { return null }
}

// ─── Fetch all AdMob settings from Supabase ───────────────────────────────────
function useAdSettings() {
  return useQuery({
    queryKey: ['admob-settings'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'admob_android_interstitial',
          'admob_ios_interstitial',
          'admob_interstitial_enabled',
          'ads_interstitial_after_videos',
        ])
      const m: Record<string, string> = {}
      for (const row of data || []) m[row.key] = row.value || ''
      return {
        androidUnitId: m['admob_android_interstitial'] || '',
        iosUnitId:     m['admob_ios_interstitial']     || '',
        // Default enabled=true — only disabled when admin explicitly sets 'false'
        enabled:       m['admob_interstitial_enabled'] !== 'false',
        afterVideos:   parseInt(m['ads_interstitial_after_videos'] || '5', 10),
      }
    },
  })
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAdMob() {
  const { data: adSettings }   = useAdSettings()
  const { data: planLimits }   = usePlanLimits()
  const adModule               = useRef(getAdModule()).current
  const videoCountRef          = useRef(0)
  const interstitialRef        = useRef<any>(null)
  const isLoadedRef            = useRef(false)
  const [isInterstitialShowing, setIsInterstitialShowing] = useState(false)

  // ✅ Always use admin IDs from Supabase — no test fallback
  const adUnitId = Platform.OS === 'android' ? adSettings?.androidUnitId : adSettings?.iosUnitId

  const afterVideos = adSettings?.afterVideos ?? 5

  // Show ads when: plan allows ads, feature enabled, module present, unit ID set
  const shouldShowAds = !!(
    planLimits?.has_ads !== false &&
    adSettings?.enabled !== false &&
    adModule &&
    adUnitId
  )

  const loadAd = useCallback(() => {
    if (!adModule || !adUnitId) return
    // Reset loaded flag so we don't try to show the old instance
    isLoadedRef.current = false
    try {
      const { InterstitialAd, AdEventType } = adModule
      const interstitial = InterstitialAd.createForAdRequest(adUnitId)

      const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        isLoadedRef.current = true
      })
      const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        isLoadedRef.current = false
        setIsInterstitialShowing(false)
        // Pre-load next ad 1s after this one closes
        setTimeout(() => loadAd(), 1000)
      })
      const unsubFailed = interstitial.addAdEventListener(AdEventType.ERROR, () => {
        isLoadedRef.current = false
        setIsInterstitialShowing(false)
        // Retry after 30s on failure to avoid rapid retries
        setTimeout(() => loadAd(), 30_000)
      })

      interstitial.load()
      interstitialRef.current = interstitial
      return () => { try { unsubLoaded(); unsubClosed(); unsubFailed() } catch {} }
    } catch {}
  }, [adModule, adUnitId])

  // Load on first eligible render
  useEffect(() => {
    if (shouldShowAds) return loadAd()
  }, [shouldShowAds, adUnitId])

  /**
   * Call after every video swipe.
   *
   * Counter only resets on a successful show. If the ad isn't ready at the
   * threshold we keep counting and try again the next swipe — this way slow
   * ad loads or temporary failures don't cause us to silently swallow whole
   * 5-swipe cycles.
   */
  const onVideoSwiped = useCallback(() => {
    if (!shouldShowAds || afterVideos <= 0) return

    videoCountRef.current += 1

    if (videoCountRef.current >= afterVideos) {
      if (isLoadedRef.current && interstitialRef.current) {
        try {
          setIsInterstitialShowing(true)
          interstitialRef.current.show()
          // Only reset on successful show — if the ad wasn't ready we keep the
          // counter at threshold so the next swipe immediately retries instead
          // of waiting another full `afterVideos` cycle (the old bug: a missed
          // cycle would silently swallow 5 more swipes).
          videoCountRef.current = 0
        } catch {
          setIsInterstitialShowing(false)
          loadAd()
        }
      } else if (!interstitialRef.current) {
        // No ad instance pending at all — kick off a load now.
        loadAd()
      }
      // If an instance exists but isn't loaded yet, keep the counter at
      // threshold and try again on the next swipe.
    }
  }, [shouldShowAds, afterVideos, loadAd])

  return { onVideoSwiped, shouldShowAds, adMobReady: !!adModule, isInterstitialShowing }
}
