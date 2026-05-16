import { useEffect, useState } from 'react'
import { Linking, Platform } from 'react-native'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

interface AppConfig {
  force_update: boolean
  maintenance_mode: boolean
  message_ar: string
  message_en: string
  store_url: string
  current_version: string
  min_version: string
}

const APP_VERSION = (Constants.expoConfig?.version || '1.0.0')

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n) || 0)
  const pb = b.split('.').map((n) => parseInt(n) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x - y
  }
  return 0
}

export function useAppVersionCheck() {
  const [state, setState] = useState<{
    ready: boolean
    forceUpdate: boolean
    maintenance: boolean
    messageAr: string
    messageEn: string
    storeUrl: string
  }>({ ready: false, forceUpdate: false, maintenance: false, messageAr: '', messageEn: '', storeUrl: '' })

  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('app-config', {
          body: { platform: Platform.OS, version: APP_VERSION },
        })
        if (error) {
          setState((s) => ({ ...s, ready: true }))
          return
        }
        const cfg = (data?.config || data || {}) as Partial<AppConfig>
        const minVersion = cfg.min_version || '1.0.0'
        const forceUpdate = compareVersions(APP_VERSION, minVersion) < 0
        setState({
          ready: true,
          forceUpdate,
          maintenance: !!cfg.maintenance_mode,
          messageAr: cfg.message_ar || 'يرجى تحديث التطبيق للمتابعة',
          messageEn: cfg.message_en || 'Please update the app to continue',
          storeUrl: cfg.store_url || 'https://play.google.com/store/apps/details?id=com.kidtok.app',
        })
      } catch {
        setState((s) => ({ ...s, ready: true }))
      }
    })()
  }, [])

  return state
}
