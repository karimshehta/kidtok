/**
 * useAdMob — Interstitial ads for free users
 *
 * ⚠️  Requires a new Development Build with react-native-google-mobile-ads.
 *     Silently no-ops in current build without crashing.
 *
 * WHY ADS DON'T SHOW:
 * react-native-google-mobile-ads is a NATIVE module — it's NOT in the
 * current dev build. A new build is needed to activate it.
 * 
 * TO ENABLE: rebuild with EAS:
 *   npx eas build --profile development --platform android
 */
import { useEffect, useRef, useCallback } from 'react'
import { Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlanLimits } from './usePlanLimits'

// Safe dynamic import — won't crash if native module missing
function tryLoadAdMob() {
  try {
    return require('react-native-google-mobile-ads')
  } catch {
    return null
  }
}

function useAdSettings() {
  return useQuery({
    queryKey: ['ad-settings'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['ads_interstitial_after_videos', 'admob_android_interstitial', 'admob_ios_interstitial'])
      const map: Record<string, string> = {}
      for (const row of data || []) map[row.key] = row.value || ''
      return {
        afterVideos: parseInt(map['ads_interstitial_after_videos'] || '5', 10),
        androidUnitId: map['admob_android_interstitial'] || 'ca-app-pub-9534911590158193/5508176579',
        iosUnitId: map['admob_ios_interstitial'] || 'ca-app-pub-9534911590158193/8731979368',
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
  const AdMobModule = useRef(tryLoadAdMob()).current

  const adUnitId = Platform.OS === 'android' ? adSettings?.androidUnitId : adSettings?.iosUnitId
  const afterVideos = adSettings?.afterVideos ?? 5
  const shouldShowAds = !!(planLimits?.has_ads !== false && AdMobModule && adUnitId)

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
        setTimeout(() => loadAd(), 2000)
      })
      interstitial.load()
      interstitialRef.current = interstitial
      return () => { unsubLoaded(); unsubClosed() }
    } catch {}
  }, [adUnitId, shouldShowAds])

  useEffect(() => {
    if (shouldShowAds) return loadAd()
  }, [shouldShowAds])

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

  return { onVideoSwiped, shouldShowAds, adMobAvailable: !!AdMobModule }
}
