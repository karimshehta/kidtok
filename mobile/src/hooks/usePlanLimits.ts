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
