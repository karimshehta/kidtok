import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

/**
 * Listens for live changes to the current user's subscription row and
 * invalidates every plan/limit-dependent query the moment it changes.
 *
 * This is how the app reacts to *server-side* subscription activations
 * (e.g. when the Paymob webhook flips status to 'active' while the user
 * is somewhere else in the app). The mobile cache catches up in real time
 * — no app restart, no manual pull-to-refresh.
 *
 * Mount once at the root layout; safe to call when the user is null.
 */
export function useSubscriptionRealtimeSync() {
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`sub-sync-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Any change (insert/update/delete) to this user's subscriptions
          // could shift their entitlements — kick all the related queries.
          qc.invalidateQueries({
            predicate: (q) => {
              const k = String(q.queryKey?.[0] ?? '').toLowerCase()
              return (
                k.includes('subscription') ||
                k.includes('plan') ||
                k.includes('limit') ||
                k.includes('usage') ||
                k.includes('children') ||
                k.includes('playlist')
              )
            },
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, qc])
}
