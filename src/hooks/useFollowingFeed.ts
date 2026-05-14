import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import type { Video } from '@/types/db'

/** Videos from creators the current user follows, newest first. */
export function useFollowingFeed() {
  const userId = useAuth((s) => s.user?.id)

  return useQuery({
    queryKey: ['following-feed', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Video[]> => {
      // 1. Get the list of creator IDs the user follows
      const { data: follows } = await supabase
        .from('creator_follows')
        .select('following_id')
        .eq('follower_id', userId!)

      if (!follows || follows.length === 0) return []

      const creatorIds = follows.map((f: any) => f.following_id)

      // 2. Fetch their approved videos
      const { data, error } = await supabase
        .from('videos')
        .select('*, age:ages(name_ar,name_en), interest:interests(name_ar,name_en)')
        .in('creator_id', creatorIds)
        .eq('source', 'creator')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data || []) as Video[]
    },
  })
}
