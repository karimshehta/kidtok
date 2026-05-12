import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Video } from '@/types/db'
import { extractYouTubeId, fetchYouTubeOEmbed, getYouTubeThumbnail } from '@/lib/youtube'
import { useAuth } from '@/stores/auth'

interface FeedFilters {
  age_id?: number
  interest_id?: number
}

/**
 * Mixed feed: admin-curated suggested YouTube videos + approved creator uploads.
 * Sorted by recency. Used on the main /feed page.
 */
export function useFeedVideos(filters: FeedFilters = {}) {
  return useQuery({
    queryKey: ['feed-videos', filters],
    queryFn: async (): Promise<Video[]> => {
      let query = supabase
        .from('videos')
        .select('*, age:ages(*), interest:interests(*)')
        .eq('is_active', true)
        .or('is_suggested.eq.true,source.eq.creator')
        .order('created_at', { ascending: false })
        .limit(50)

      if (filters.age_id) query = query.eq('age_id', filters.age_id)
      if (filters.interest_id) query = query.eq('interest_id', filters.interest_id)

      const { data, error } = await query
      if (error) throw error
      return (data || []) as Video[]
    },
  })
}

// ============================================================
// Admin-side content management (suggested YouTube videos)
// ============================================================

/** Admin: list all suggested YouTube videos */
export function useAdminSuggestedVideos(filters: FeedFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'suggested-videos', filters],
    queryFn: async (): Promise<Video[]> => {
      let query = supabase
        .from('videos')
        .select('*, age:ages(*), interest:interests(*)')
        .eq('source', 'youtube')
        .eq('is_suggested', true)
        .order('created_at', { ascending: false })

      if (filters.age_id) query = query.eq('age_id', filters.age_id)
      if (filters.interest_id) query = query.eq('interest_id', filters.interest_id)

      const { data, error } = await query
      if (error) throw error
      return (data || []) as Video[]
    },
  })
}

interface AddSuggestedVideoInput {
  url: string
  title?: string
  channel_name?: string
  age_id?: number | null
  interest_id?: number | null
}

export function useAddSuggestedVideo() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)

  return useMutation({
    mutationFn: async (input: AddSuggestedVideoInput): Promise<Video> => {
      if (!userId) throw new Error('Not authenticated')

      const youtubeId = extractYouTubeId(input.url)
      if (!youtubeId) throw new Error('INVALID_URL')

      // Check if the video already exists in the catalog
      const { data: existing } = await supabase
        .from('videos')
        .select('*')
        .eq('youtube_id', youtubeId)
        .eq('source', 'youtube')
        .maybeSingle()

      if (existing) {
        // Flip is_suggested if it's not already set
        if (!existing.is_suggested) {
          const { data, error } = await supabase
            .from('videos')
            .update({
              is_suggested: true,
              age_id: input.age_id ?? existing.age_id,
              interest_id: input.interest_id ?? existing.interest_id,
              is_active: true,
            })
            .eq('id', existing.id)
            .select()
            .single()
          if (error) throw error
          return data as Video
        }
        throw new Error('ALREADY_SUGGESTED')
      }

      // Fetch metadata if title/channel weren't passed in
      let title = input.title
      let channel = input.channel_name
      if (!title || !channel) {
        const meta = await fetchYouTubeOEmbed(youtubeId)
        title = title || meta?.title || 'YouTube Video'
        channel = channel || meta?.author_name || ''
      }

      const { data, error } = await supabase
        .from('videos')
        .insert({
          youtube_id: youtubeId,
          source: 'youtube',
          title,
          channel_name: channel,
          thumbnail_url: getYouTubeThumbnail(youtubeId),
          age_id: input.age_id ?? null,
          interest_id: input.interest_id ?? null,
          is_suggested: true,
          is_active: true,
          added_by: userId,
        })
        .select()
        .single()
      if (error) throw error
      return data as Video
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'suggested-videos'] })
      qc.invalidateQueries({ queryKey: ['feed-videos'] })
    },
  })
}

export function useUpdateSuggestedVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      id: string
      patch: { title?: string; channel_name?: string; age_id?: number | null; interest_id?: number | null; is_active?: boolean }
    }) => {
      const { error } = await supabase.from('videos').update(vars.patch).eq('id', vars.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'suggested-videos'] })
      qc.invalidateQueries({ queryKey: ['feed-videos'] })
    },
  })
}

export function useRemoveSuggestedVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Don't hard-delete (could break existing playlists). Just unsuggest.
      const { error } = await supabase
        .from('videos')
        .update({ is_suggested: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'suggested-videos'] })
      qc.invalidateQueries({ queryKey: ['feed-videos'] })
    },
  })
}

// ============================================================
// Admin overview stats
// ============================================================

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      // Run queries in parallel
      const [
        { count: totalUsers },
        { count: totalCreators },
        { count: totalChildren },
        { count: pendingReview },
        { count: approvedCreatorVideos },
        { count: suggestedYTVideos },
        { count: totalPlaylists },
        { count: pendingReports },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'creator'),
        supabase.from('children').select('*', { count: 'exact', head: true }),
        supabase.from('creator_videos').select('*', { count: 'exact', head: true }).eq('status', 'pending_review'),
        supabase.from('creator_videos').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('videos').select('*', { count: 'exact', head: true }).eq('source', 'youtube').eq('is_suggested', true),
        supabase.from('playlists').select('*', { count: 'exact', head: true }),
        supabase.from('video_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ])

      return {
        totalUsers: totalUsers || 0,
        totalCreators: totalCreators || 0,
        totalChildren: totalChildren || 0,
        pendingReview: pendingReview || 0,
        approvedCreatorVideos: approvedCreatorVideos || 0,
        suggestedYTVideos: suggestedYTVideos || 0,
        totalPlaylists: totalPlaylists || 0,
        pendingReports: pendingReports || 0,
      }
    },
    refetchInterval: 30000,
  })
}

// ============================================================
// Admin users management
// ============================================================

export function useAdminUsers(filters: { search?: string; role?: 'parent' | 'creator' | 'admin' | 'all' } = {}) {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters.role && filters.role !== 'all') {
        query = query.eq('role', filters.role)
      }
      if (filters.search?.trim()) {
        query = query.ilike('name', `%${filters.search.trim()}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { user_id: string; role: 'parent' | 'creator' | 'admin' }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role: vars.role })
        .eq('id', vars.user_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] })
    },
  })
}
