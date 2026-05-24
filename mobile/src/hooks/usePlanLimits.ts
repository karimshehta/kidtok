import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

export interface PlanLimits {
  plan_code: string
  max_children: number
  max_playlists: number
  max_videos_per_playlist: number
  has_ads: boolean
  has_insights: boolean
  has_games: boolean
  daily_time_minutes: number
}

const FREE_DEFAULTS: PlanLimits = {
  plan_code: 'free',
  max_children: 2,
  max_playlists: 3,
  max_videos_per_playlist: 20,
  has_ads: true,
  has_insights: false,
  has_games: false,
  daily_time_minutes: 60,
}

export function usePlanLimits() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery<PlanLimits>({
    queryKey: ['plan-limits', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,  // 5 min cache
    queryFn: async () => {
      const { data } = await supabase.rpc('my_plan_limits')
      return (data?.[0] as PlanLimits) ?? FREE_DEFAULTS
    },
  })
}

/** Parse DB error to get plan limit type */
export function parsePlanLimitError(error: any): 'children' | 'playlists' | null {
  const msg = error?.message || ''
  if (msg.includes('PLAN_LIMIT_CHILDREN')) return 'children'
  if (msg.includes('PLAN_LIMIT_PLAYLISTS')) return 'playlists'
  return null
}

// ─── Plan status: includes lock counts ────────────────────────────────────────
export interface PlanStatus extends PlanLimits {
  is_premium: boolean
  expires_at: string | null
  children_count: number
  locked_children_count: number
}

export function usePlanStatus() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery<PlanStatus>({
    queryKey: ['plan-status', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_plan_status')
      if (error) throw error
      return data as PlanStatus
    },
  })
}

// ─── Lock helper for children list ────────────────────────────────────────────
// Returns the set of IDs that are locked (beyond plan limit).
// First N children (ordered by created_at asc) are active, rest are locked.
export function useLockedChildrenIds() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery<Set<string>>({
    queryKey: ['locked-children', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_locked_children_ids')
      if (error) throw error
      return new Set((data || []).map((row: any) => row.id))
    },
  })
}

// ─── Lock helper for playlists per child ──────────────────────────────────────
export function useLockedPlaylistsIds(childId: string | undefined) {
  return useQuery<Set<string>>({
    queryKey: ['locked-playlists', childId],
    enabled: !!childId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_locked_playlists_ids', {
        p_child_id: childId,
      })
      if (error) throw error
      return new Set((data || []).map((row: any) => row.id))
    },
  })
}
