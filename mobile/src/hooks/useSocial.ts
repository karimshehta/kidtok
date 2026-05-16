import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

export type VideoInteraction = 'like' | 'dislike' | null

/** Get current user's interaction on a video */
export function useMyVideoInteraction(videoId: string) {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['my-interaction', videoId, userId],
    enabled: !!userId && !!videoId,
    queryFn: async (): Promise<VideoInteraction> => {
      const { data } = await supabase
        .from('video_interactions')
        .select('type')
        .eq('video_id', videoId)
        .eq('user_id', userId)
        .maybeSingle()
      return (data?.type as VideoInteraction) || null
    },
  })
}

/** Toggle like/dislike on a video */
export function useToggleVideoInteraction() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async ({ videoId, type }: { videoId: string; type: 'like' | 'dislike' }) => {
      if (!userId) throw new Error('UNAUTHENTICATED')

      const { data: existing } = await supabase
        .from('video_interactions')
        .select('id, type')
        .eq('video_id', videoId)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing) {
        if (existing.type === type) {
          // remove (toggle off)
          await supabase.from('video_interactions').delete().eq('id', existing.id)
          return null
        } else {
          await supabase.from('video_interactions').update({ type }).eq('id', existing.id)
          return type
        }
      } else {
        await supabase.from('video_interactions').insert({
          user_id: userId,
          video_id: videoId,
          type,
        })
        return type
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['my-interaction', vars.videoId] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })
}

/** Whether current user follows a creator */
export function useIsFollowing(creatorId: string) {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['is-following', creatorId, userId],
    enabled: !!userId && !!creatorId,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from('creator_follows')
        .select('id')
        .eq('following_id', creatorId)
        .eq('follower_id', userId)
        .maybeSingle()
      return !!data
    },
  })
}

/** Toggle follow/unfollow on a creator */
export function useToggleFollow() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async (creatorId: string) => {
      if (!userId) throw new Error('UNAUTHENTICATED')
      const { data: existing } = await supabase
        .from('creator_follows')
        .select('id')
        .eq('following_id', creatorId)
        .eq('follower_id', userId)
        .maybeSingle()
      if (existing) {
        await supabase.from('creator_follows').delete().eq('id', existing.id)
        return false
      } else {
        await supabase.from('creator_follows').insert({ following_id: creatorId, follower_id: userId })
        return true
      }
    },
    onSuccess: (_, creatorId) => {
      qc.invalidateQueries({ queryKey: ['is-following', creatorId] })
      qc.invalidateQueries({ queryKey: ['creator-stats', creatorId] })
    },
  })
}

/** Get comments for a video */
export function useComments(videoId: string) {
  return useQuery({
    queryKey: ['comments', videoId],
    enabled: !!videoId,
    queryFn: async () => {
      const { data } = await supabase
        .from('video_comments')
        .select('id, content, created_at, profiles(name, avatar_url)')
        .eq('video_id', videoId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50)
      return data || []
    },
  })
}

/** Add a comment */
export function useAddComment() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async ({ videoId, comment }: { videoId: string; comment: string }) => {
      if (!userId) throw new Error('UNAUTHENTICATED')
      const { error } = await supabase.from('video_comments').insert({
        video_id: videoId,
        user_id: userId,
        content: comment,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['comments', vars.videoId] })
    },
  })
}
