/**
 * BannerAd — Reusable banner ad component
 *
 * - All IDs from Supabase (admob_android_banner / admob_ios_banner)
 * - Hidden when ad fails to load or user is on premium plan
 * - Reserves consistent height to prevent layout shift
 * - Safe in any screen (parent mode only — never in kid mode)
 *
 * Usage:
 *   <BannerAd />              ← inline (default)
 *   <BannerAd variant="sticky" /> ← absolutely positioned at bottom
 */
import { useRef, useState, memo } from 'react'
import { View, Platform, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlanLimits } from '@/hooks/usePlanLimits'

const RESERVED_HEIGHT = 60   // reserve space so layout never shifts
const TEST_BANNER_ANDROID = 'ca-app-pub-3940256099942544/6300978111'
const TEST_BANNER_IOS = 'ca-app-pub-3940256099942544/2934735716'

function getAdModule() {
  try { return require('react-native-google-mobile-ads') }
  catch { return null }
}

function useBannerSettings() {
  return useQuery({
    queryKey: ['banner-settings'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['admob_android_banner', 'admob_ios_banner', 'admob_banner_enabled'])
      const m: Record<string, string> = {}
      for (const row of data || []) m[row.key] = row.value || ''
      return {
        androidUnitId: m['admob_android_banner'] || '',
        iosUnitId:     m['admob_ios_banner']     || '',
        // Default enabled=true — only disabled when admin explicitly sets 'false'
        enabled:       m['admob_banner_enabled'] !== 'false',
      }
    },
  })
}

interface Props {
  /** 'inline' (default) flows with content. 'sticky' is absolutely positioned at bottom. */
  variant?: 'inline' | 'sticky'
  /** Extra spacing around the banner */
  margin?: number
  /** For sticky variant — pixels to lift the banner off the screen edge
   *  (e.g. tab bar height when rendered above a bottom tab bar). */
  bottomOffset?: number
}

function BannerAdImpl({ variant = 'inline', margin = 0, bottomOffset = 0 }: Props) {
  const { data: settings }   = useBannerSettings()
  const { data: planLimits } = usePlanLimits()
  const insets               = useSafeAreaInsets()
  const adModule             = useRef(getAdModule()).current
  const [loaded, setLoaded]  = useState(false)
  const [failed, setFailed]  = useState(false)
  // Forces remount of the inner <BannerAd> when we want a retry. Each
  // change of this counter is a fresh ad request from AdMob — needed
  // because the SDK won't auto-retry once setFailed has hidden it.
  const [retryKey, setRetryKey] = useState(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ✅ Always use admin IDs from Supabase — no test fallback
  const adUnitId   = Platform.OS === 'android' ? settings?.androidUnitId : settings?.iosUnitId
  const eligible   = !!(
    settings?.enabled &&
    planLimits?.has_ads !== false &&
    adModule &&
    adUnitId &&
    !adUnitId.includes('REPLACE')
  )

  // Diagnostic logs — kept behind __DEV__ so prod console isn't noisy.
  if (__DEV__) {
    if (!eligible) {
      console.log('[banner] not eligible', {
        enabled:        settings?.enabled,
        has_ads:        planLimits?.has_ads,
        hasAdModule:    !!adModule,
        adUnitId:       adUnitId || null,
        platform:       Platform.OS,
        settingsLoaded: settings !== undefined,
        planLoaded:     planLimits !== undefined,
      })
    }
    if (failed) console.warn('[banner] AdMob load failed earlier for', adUnitId)
  }

  if (!eligible || failed) return null

  let banner: any = null
  try {
    const { BannerAd, BannerAdSize } = adModule
    banner = (
      <BannerAd
        key={retryKey}            /* remount forces a new ad request */
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => {
          if (__DEV__) console.log('[banner] ad LOADED for', adUnitId)
          setLoaded(true)
        }}
        onAdFailedToLoad={(err: any) => {
          if (__DEV__) {
            console.warn('[banner] AdMob onAdFailedToLoad', {
              unitId:  adUnitId,
              code:    err?.code,
              message: err?.message,
            })
          }
          setFailed(true)

          // 'no-fill' is transient — AdMob's inventory comes and goes,
          // especially for kid-directed + G-rated + non-personalized
          // requests in markets with thin advertiser pools. Schedule
          // a remount in 60s so the banner gets another shot at filling.
          // Hard errors (invalid request, network down) won't self-heal,
          // so we don't retry those — the load will fail again.
          const code = typeof err?.code === 'string' ? err.code : ''
          if (code.includes('no-fill')) {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
            retryTimerRef.current = setTimeout(() => {
              setFailed(false)
              setLoaded(false)
              setRetryKey((k) => k + 1)
            }, 60_000)
          }
        }}
      />
    )
  } catch (e) {
    if (__DEV__) console.warn('[banner] render threw', e)
    return null
  }

  // ── Sticky variant: absolute bottom with safe area ──────────────────────────
  if (variant === 'sticky') {
    return (
      <View
        style={[
          styles.sticky,
          {
            bottom:        bottomOffset,
            paddingBottom: bottomOffset > 0 ? 0 : insets.bottom,
            minHeight:     RESERVED_HEIGHT + (bottomOffset > 0 ? 0 : insets.bottom),
          },
        ]}
        pointerEvents="box-none"
      >
        {banner}
      </View>
    )
  }

  // ── Inline variant: flows naturally with content ────────────────────────────
  return (
    <View
      style={{
        minHeight: loaded ? undefined : RESERVED_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: margin,
      }}
    >
      {banner}
    </View>
  )
}

const styles = StyleSheet.create({
  sticky: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 0.5,
    borderTopColor: '#E5E7EB',
  },
})

export default memo(BannerAdImpl)
