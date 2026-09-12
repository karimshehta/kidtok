import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

/**
 * Pings public.touch_last_active() so the admin dashboard's "Active Now"
 * counter reflects this user. Cheap fire-and-forget RPC.
 *
 * Cadence:
 *   • once on mount (after auth resolves)
 *   • once on every foreground transition
 *   • every 60s while the app is in foreground
 *
 * The interval is killed when the app backgrounds so a phone left
 * unlocked on the home screen doesn't generate idle traffic.
 */
export function useActivityHeartbeat() {
  const userId = useAuth((s) => s.user?.id)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!userId) return

    const ping = () => {
      // Fire-and-forget — we never block on this, and a 4xx/5xx doesn't
      // need to surface to the user.
      supabase.rpc('touch_last_active').then(() => {}, () => {})
      supabase.rpc('award_open_app_xp').then(() => {}, () => {})
    }

    const startInterval = () => {
      if (intervalRef.current) return
      intervalRef.current = setInterval(ping, 60_000)
    }
    const stopInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    // Initial ping
    ping()
    if (AppState.currentState === 'active') startInterval()

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        ping()
        startInterval()
      } else {
        stopInterval()
      }
    })

    return () => {
      sub.remove()
      stopInterval()
    }
  }, [userId])
}
