/**
 * useAdMob — Interstitial ads for free users
 *
 * ⚠️  Requires a Development Build (EAS / bare workflow).
 *     Will no-op silently in Expo Go.
 *
 * Admin controls (app_settings):
 *   ads_interstitial_after_videos  → how many videos before showing ad (default: 5)
 *   admob_android_interstitial     → Android ad unit ID
 *   admob_ios_interstitial         → iOS ad unit ID
 */
import { useEffect, useRef, useCallback } from 'react'
import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlanLimits } from './usePlanLimits'

// Dynamic import — won't crash in Expo Go
let AdMobModule: any = null
try {
  AdMobModule = require('react-native-google-mobile-ads')
} catch {
  // Expo Go — silently skip
}

function useAdSettings() {
  return useQuery({
    queryKey: ['ad-settings'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'ads_interstitial_after_videos',
          'admob_android_interstitial',
          'admob_ios_interstitial',
        ])
      const map: Record<string, string> = {}
      for (const row of data || []) map[row.key] = row.value || ''
      return {
        afterVideos: parseInt(map['ads_interstitial_after_videos'] || '5', 10),
        androidUnitId: map['admob_android_interstitial'] || '',
        iosUnitId: map['admob_ios_interstitial'] || '',
      }
    },
  })
}

export function useAdMob() {
  const { data: adSettings } = useAdSettings()
  const { data: planLimits } = usePlanLimits()
  const videoCountRef = useRef(0)
  const interstitialRef = useRef<any>(null)
  const isLoadedRef = useRef(false)

  const adUnitId = Platform.OS === 'android'
    ? adSettings?.androidUnitId
    : adSettings?.iosUnitId

  const afterVideos = adSettings?.afterVideos ?? 5
  // Only show ads to free users (has_ads = true in their plan)
  const shouldShowAds = planLimits?.has_ads !== false

  const loadAd = useCallback(() => {
    if (!AdMobModule || !adUnitId || !shouldShowAds) return

    try {
      const { InterstitialAd, AdEventType } = AdMobModule

      const interstitial = InterstitialAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: false,
      })

      const unsubLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        isLoadedRef.current = true
      })

      const unsubClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        isLoadedRef.current = false
        // Pre-load next ad
        setTimeout(() => loadAd(), 2000)
      })

      interstitial.load()
      interstitialRef.current = interstitial

      return () => { unsubLoaded(); unsubClosed() }
    } catch (e) {
      // Expo Go — silently skip
    }
  }, [adUnitId, shouldShowAds])

  // Load first ad when settings are ready
  useEffect(() => {
    if (adUnitId && shouldShowAds) {
      return loadAd()
    }
  }, [adUnitId, shouldShowAds])

  /**
   * Call this every time the user swipes to the next video.
   * The hook tracks the count and shows an ad when needed.
   */
  const onVideoSwiped = useCallback(() => {
    if (!shouldShowAds || afterVideos <= 0) return

    videoCountRef.current += 1

    if (videoCountRef.current >= afterVideos) {
      videoCountRef.current = 0  // reset counter

      if (isLoadedRef.current && interstitialRef.current) {
        try {
          interstitialRef.current.show()
        } catch {
          // Expo Go or ad not ready
        }
      }
    }
  }, [shouldShowAds, afterVideos])

  return { onVideoSwiped, shouldShowAds }
}
