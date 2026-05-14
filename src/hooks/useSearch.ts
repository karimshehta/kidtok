import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Video } from '@/types/db'

export interface CreatorResult {
  id: string
  name: string | null
  avatar_url: string | null
  bio: string | null
  role: string
  video_count?: number
  follower_count?: number
}

export interface SearchResults {
  videos: Video[]
  creators: CreatorResult[]
}

export function useSearch(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['search', q],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchResults> => {
      if (!q) return { videos: [], creators: [] }

      const [videosRes, creatorsRes] = await Promise.all([
        // Videos: full-text search
        supabase
          .from('videos')
          .select('*')
          .textSearch('search_vector', q, { type: 'websearch' })
          .eq('is_active', true)
          .order('like_count', { ascending: false })
          .limit(20),

        // Creators: name search
        supabase
          .from('creator_stats')
          .select('user_id, name, avatar_url, bio, role, video_count, follower_count')
          .ilike('name', `%${q}%`)
          .in('role', ['creator', 'admin'])
          .order('follower_count', { ascending: false })
          .limit(10),
      ])

      return {
        videos: (videosRes.data || []) as Video[],
        creators: (creatorsRes.data || []).map((c: any) => ({
          id: c.user_id,
          name: c.name,
          avatar_url: c.avatar_url,
          bio: c.bio,
          role: c.role,
          video_count: c.video_count,
          follower_count: c.follower_count,
        })),
      }
    },
  })
}

export function useFallbackSearch(query: string) {
  // Fallback: simple ilike if text search fails
  const q = query.trim()
  return useQuery({
    queryKey: ['search-fallback', q],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<SearchResults> => {
      const [videosRes, creatorsRes] = await Promise.all([
        supabase
          .from('videos')
          .select('*')
          .or(`title.ilike.%${q}%,channel_name.ilike.%${q}%`)
          .eq('is_active', true)
          .order('like_count', { ascending: false })
          .limit(20),

        supabase
          .from('creator_stats')
          .select('user_id, name, avatar_url, bio, role, video_count, follower_count')
          .ilike('name', `%${q}%`)
          .order('follower_count', { ascending: false })
          .limit(10),
      ])
      return {
        videos: (videosRes.data || []) as Video[],
        creators: (creatorsRes.data || []).map((c: any) => ({
          id: c.user_id,
          name: c.name,
          avatar_url: c.avatar_url,
          bio: c.bio,
          role: c.role,
          video_count: c.video_count,
          follower_count: c.follower_count,
        })),
      }
    },
  })
}
