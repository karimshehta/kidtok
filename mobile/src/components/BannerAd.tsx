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
        enabled:       m['admob_banner_enabled'] === 'true',
      }
    },
  })
}

interface Props {
  /** 'inline' (default) flows with content. 'sticky' is absolutely positioned at bottom. */
  variant?: 'inline' | 'sticky'
  /** Extra spacing around the banner */
  margin?: number
}

function BannerAdImpl({ variant = 'inline', margin = 0 }: Props) {
  const { data: settings }   = useBannerSettings()
  const { data: planLimits } = usePlanLimits()
  const insets               = useSafeAreaInsets()
  const adModule             = useRef(getAdModule()).current
  const [loaded, setLoaded]  = useState(false)
  const [failed, setFailed]  = useState(false)

  const adUnitId   = Platform.OS === 'android' ? settings?.androidUnitId : settings?.iosUnitId
  const eligible   = !!(
    settings?.enabled &&
    planLimits?.has_ads !== false &&
    adModule &&
    adUnitId &&
    !adUnitId.includes('REPLACE')
  )

  if (!eligible || failed) return null

  let banner: any = null
  try {
    const { BannerAd, BannerAdSize } = adModule
    banner = (
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    )
  } catch {
    return null
  }

  // ── Sticky variant: absolute bottom with safe area ──────────────────────────
  if (variant === 'sticky') {
    return (
      <View
        style={[
          styles.sticky,
          { paddingBottom: insets.bottom, minHeight: RESERVED_HEIGHT + insets.bottom },
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
