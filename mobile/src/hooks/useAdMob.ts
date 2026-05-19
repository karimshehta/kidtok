/**
 * useAdMob — Interstitial ads for free users
 *
 * All configuration (IDs, frequency) comes from Supabase app_settings.
 * No hardcoded production IDs — admin dashboard is the single source of truth.
 */
import { useEffect, useRef, useCallback } from 'react'
import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlanLimits } from './usePlanLimits'

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
          'ads_interstitial_after_videos',
        ])
      const m: Record<string, string> = {}
      for (const row of data || []) m[row.key] = row.value || ''
      return {
        androidUnitId: m['admob_android_interstitial'] || '',
        iosUnitId:     m['admob_ios_interstitial']     || '',
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

  const adUnitId     = Platform.OS === 'android' ? adSettings?.androidUnitId : adSettings?.iosUnitId
  const afterVideos  = adSettings?.afterVideos ?? 5
  // Only show ads when: plan has ads, AdMob module available, unit ID configured
  const shouldShowAds = !!(planLimits?.has_ads !== false && adModule && adUnitId)

  const loadAd = useCallback(() => {
    if (!adModule || !adUnitId) return
    try {
      const { InterstitialAd, AdEventType } = adModule
      const interstitial = InterstitialAd.createForAdRequest(adUnitId)

      const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        isLoadedRef.current = true
      })
      const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        isLoadedRef.current = false
        setTimeout(() => loadAd(), 1000)
      })

      interstitial.load()
      interstitialRef.current = interstitial
      return () => { unsubLoaded(); unsubClosed() }
    } catch {}
  }, [adModule, adUnitId])

  useEffect(() => {
    if (shouldShowAds) return loadAd()
  }, [shouldShowAds, adUnitId])

  // Called after every video swipe in the feed
  const onVideoSwiped = useCallback(() => {
    if (!shouldShowAds || afterVideos <= 0) return
    videoCountRef.current += 1
    if (videoCountRef.current >= afterVideos) {
      videoCountRef.current = 0
      if (isLoadedRef.current && interstitialRef.current) {
        try { interstitialRef.current.show() } catch {}
      }
    }
  }, [shouldShowAds, afterVideos])

  return { onVideoSwiped, shouldShowAds, adMobReady: !!adModule }
}
