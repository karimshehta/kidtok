import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMySubscription } from '@/hooks/useSubscription'

// ============================================================
// Settings types
// ============================================================
export interface AdConfig {
  adsenseEnabled: boolean
  publisherId: string       // ca-pub-xxxx
  feedUnitId: string        // in-feed snap card
  bannerUnitId: string      // thin banner in AppLayout
  adFrequency: number       // every N videos (0 = off)
}

export interface AdMobConfig {
  androidAppId: string
  iosAppId: string
  androidInterstitial: string
  iosInterstitial: string
  androidRewarded: string
  iosRewarded: string
  rewardedSkipMinutes: number
}

// ============================================================
// Read all public app_settings in one query
// ============================================================
function useAppSettings() {
  return useQuery({
    queryKey: ['app-settings', 'public'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .eq('is_public', true)
      if (error) throw error
      return Object.fromEntries((data || []).map((r: any) => [r.key, r.value || '']))
    },
    staleTime: 1000 * 60 * 5, // 5-minute cache
  })
}

function useAllAppSettings() {
  return useQuery({
    queryKey: ['app-settings', 'all'],
    queryFn: async (): Promise<Array<{ key: string; value: string | null; description: string | null; is_public: boolean }>> => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .order('key')
      if (error) throw error
      return (data || []) as any[]
    },
  })
}

// ============================================================
// Main useAds hook (used in Feed, AppLayout, anywhere ads appear)
// ============================================================
export function useAds() {
  const { data: settings } = useAppSettings()
  const { data: sub } = useMySubscription()

  const adsenseEnabled = settings?.['adsense_enabled'] === 'true'
  const publisherId = settings?.['adsense_publisher_id'] || ''
  const feedUnitId = settings?.['adsense_feed_unit_id'] || ''
  const bannerUnitId = settings?.['adsense_banner_unit_id'] || ''
  const adFrequency = parseInt(settings?.['ads_frequency'] || '5', 10) || 5

  // Show ads only if user doesn't have an active paid sub with has_ads=false.
  // If there's no sub (free), always show ads.
  const hasPaidSub = !!sub && sub.plan_code !== 'free'
  const showAds = adsenseEnabled && !hasPaidSub

  return {
    showAds,
    adsenseEnabled,
    publisherId,
    feedUnitId,
    bannerUnitId,
    adFrequency,
    hasPaidSub,
  }
}

// ============================================================
// AdSense script injector (call once at app root, after settings load)
// ============================================================
export function useAdSenseScript(publisherId: string, enabled: boolean) {
  const injected = useRef(false)

  useEffect(() => {
    if (!enabled || !publisherId || injected.current) return
    if (document.querySelector(`script[data-adsense="${publisherId}"]`)) {
      injected.current = true
      return
    }
    const script = document.createElement('script')
    script.async = true
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`
    script.crossOrigin = 'anonymous'
    script.setAttribute('data-adsense', publisherId)
    document.head.appendChild(script)
    injected.current = true
  }, [publisherId, enabled])
}

// ============================================================
// Admin: read + update settings
// ============================================================
export function useAdminSettings() {
  return useAllAppSettings()
}

export function useUpdateSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { key: string; value: string }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: vars.value, updated_at: new Date().toISOString() })
        .eq('key', vars.key)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] })
    },
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patches: Record<string, string>) => {
      // Update existing settings and create the mobile-native setting on first save.
      // The native frequency is public runtime configuration, not a secret.
      const now = new Date().toISOString()
      const ops = Object.entries(patches).map(([key, value]) => {
        if (key === 'mobile_native_ad_frequency') {
          return supabase
            .from('app_settings')
            .upsert({
              key,
              value,
              description: 'Show one native AdMob feed ad after every N real mobile videos (0 = disabled)',
              is_public: true,
              updated_at: now,
            }, { onConflict: 'key' })
        }
        return supabase
          .from('app_settings')
          .update({ value, updated_at: now })
          .eq('key', key)
      })
      const results = await Promise.all(ops)
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-settings'] })
    },
  })
}
