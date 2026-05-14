import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

// ============================================================
// LIKES / DISLIKES
// ============================================================
export type InteractionType = 'like' | 'dislike' | null

/** Current user's interaction on a specific video */
export function useMyInteraction(videoId: string | undefined) {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['interaction', videoId, userId],
    enabled: !!videoId && !!userId,
    queryFn: async (): Promise<InteractionType> => {
      const { data } = await supabase
        .from('video_interactions')
        .select('type')
        .eq('video_id', videoId!)
        .eq('user_id', userId!)
        .maybeSingle()
      return (data?.type as InteractionType) || null
    },
  })
}

/** Set or toggle like/dislike on a video (optimistic) */
export function useSetInteraction(videoId: string) {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)

  return useMutation({
    mutationFn: async (type: InteractionType) => {
      if (!userId) throw new Error('Not authenticated')
      if (!type) {
        // Remove interaction
        await supabase
          .from('video_interactions')
          .delete()
          .eq('video_id', videoId)
          .eq('user_id', userId)
        return null
      }
      // Upsert
      const { error } = await supabase
        .from('video_interactions')
        .upsert({ video_id: videoId, user_id: userId, type }, { onConflict: 'user_id,video_id' })
      if (error) throw error
      return type
    },
    onMutate: async (newType) => {
      await qc.cancelQueries({ queryKey: ['interaction', videoId, userId] })
      const prev = qc.getQueryData<InteractionType>(['interaction', videoId, userId])
      qc.setQueryData(['interaction', videoId, userId], newType)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      qc.setQueryData(['interaction', videoId, userId], ctx?.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['interaction', videoId] })
      qc.invalidateQueries({ queryKey: ['feed-videos'] })
    },
  })
}

// ============================================================
// COMMENTS
// ============================================================
export interface VideoComment {
  id: string
  user_id: string
  content: string
  created_at: string
  is_deleted: boolean
  profile: { name: string | null; avatar_url: string | null }
}

export function useComments(videoId: string | undefined) {
  return useQuery({
    queryKey: ['comments', videoId],
    enabled: !!videoId,
    queryFn: async (): Promise<VideoComment[]> => {
      const { data, error } = await supabase
        .from('video_comments')
        .select('id, user_id, content, created_at, is_deleted, profile:profiles(name, avatar_url)')
        .eq('video_id', videoId!)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return (data || []) as unknown as VideoComment[]
    },
  })
}

export function useAddComment(videoId: string) {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async (content: string) => {
      if (!userId) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('video_comments')
        .insert({ video_id: videoId, user_id: userId, content: content.trim() })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', videoId] }),
  })
}

export function useDeleteComment(videoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('video_comments')
        .update({ is_deleted: true })
        .eq('id', commentId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', videoId] }),
  })
}

// ============================================================
// FOLLOW / UNFOLLOW
// ============================================================
export function useIsFollowing(creatorId: string | undefined) {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['following', creatorId, userId],
    enabled: !!creatorId && !!userId && creatorId !== userId,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from('creator_follows')
        .select('id')
        .eq('follower_id', userId!)
        .eq('following_id', creatorId!)
        .maybeSingle()
      return !!data
    },
  })
}

export function useToggleFollow(creatorId: string) {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async (currentlyFollowing: boolean) => {
      if (!userId) throw new Error('Not authenticated')
      if (currentlyFollowing) {
        await supabase
          .from('creator_follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', creatorId)
      } else {
        await supabase
          .from('creator_follows')
          .insert({ follower_id: userId, following_id: creatorId })
      }
    },
    onMutate: async (currentlyFollowing) => {
      await qc.cancelQueries({ queryKey: ['following', creatorId, userId] })
      qc.setQueryData(['following', creatorId, userId], !currentlyFollowing)
      return { prev: currentlyFollowing }
    },
    onError: (_err, _vars, ctx) => {
      qc.setQueryData(['following', creatorId, userId], ctx?.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['following', creatorId] })
      qc.invalidateQueries({ queryKey: ['creator-profile', creatorId] })
    },
  })
}

// ============================================================
// CREATOR PROFILE
// ============================================================
export interface CreatorProfile {
  user_id: string
  name: string | null
  avatar_url: string | null
  bio: string | null
  role: string
  video_count: number
  total_likes: number
  total_views: number
  follower_count: number
  following_count: number
}

export function useCreatorProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<CreatorProfile | null> => {
      const { data, error } = await supabase
        .from('creator_stats')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      // Also fetch bio from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('bio')
        .eq('id', userId!)
        .maybeSingle()
      return { ...data, bio: (profile as any)?.bio || null } as CreatorProfile
    },
  })
}

export function useCreatorVideos(userId: string | undefined) {
  return useQuery({
    queryKey: ['creator-videos-public', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('creator_id', userId!)
        .eq('source', 'creator')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })
}

/** Increment view count (fire-and-forget) */
export function useIncrementView() {
  return useMutation({
    mutationFn: async (videoId: string) => {
      await supabase.rpc('increment_video_view', { p_video_id: videoId })
    },
  })
}
