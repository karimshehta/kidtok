import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import type { Playlist, PlaylistVideo, Video } from '@/types/db'
import { extractYouTubeId, fetchYouTubeOEmbed, getYouTubeThumbnail } from '@/lib/youtube'

export function usePlaylists(childId: string | undefined) {
  return useQuery({
    queryKey: ['playlists', childId],
    enabled: !!childId,
    queryFn: async (): Promise<Playlist[]> => {
      const { data, error } = await supabase
        .from('playlists')
        .select('*, playlist_videos(id)')
        .eq('child_id', childId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((p: any) => ({
        ...p,
        video_count: p.playlist_videos?.length || 0,
      }))
    },
  })
}

export function usePlaylist(id: string | undefined) {
  return useQuery({
    queryKey: ['playlist', id],
    enabled: !!id,
    queryFn: async (): Promise<Playlist> => {
      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Playlist
    },
  })
}

export function usePlaylistVideos(playlistId: string | undefined) {
  return useQuery({
    queryKey: ['playlist-videos', playlistId],
    enabled: !!playlistId,
    queryFn: async (): Promise<PlaylistVideo[]> => {
      const { data, error } = await supabase
        .from('playlist_videos')
        .select('*, video:videos(*)')
        .eq('playlist_id', playlistId!)
        .order('position', { ascending: true })
      if (error) throw error
      return data as PlaylistVideo[]
    },
  })
}

interface PlaylistInput {
  child_id: string
  name: string
  description?: string | null
}

export function useCreatePlaylist() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async (input: PlaylistInput) => {
      if (!userId) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('playlists')
        .insert({
          parent_id: userId,
          child_id: input.child_id,
          name: input.name,
          description: input.description ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as Playlist
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['playlists', data.child_id] })
    },
  })
}

export function useUpdatePlaylist(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string | null }) => {
      const { error } = await supabase
        .from('playlists')
        .update({ name: input.name, description: input.description ?? null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playlist', id] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useDeletePlaylist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('playlists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playlists'] }),
  })
}

interface AddVideoInput {
  playlist_id: string
  url: string
  title?: string
  channel_name?: string
}

export function useAddVideoToPlaylist() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async (input: AddVideoInput): Promise<PlaylistVideo> => {
      if (!userId) throw new Error('Not authenticated')

      const youtubeId = extractYouTubeId(input.url)
      if (!youtubeId) throw new Error('INVALID_URL')

      // 1. Find or create the video row
      let video: Video | null = null
      const { data: existing } = await supabase
        .from('videos')
        .select('*')
        .eq('youtube_id', youtubeId)
        .eq('source', 'youtube')
        .maybeSingle()

      if (existing) {
        video = existing as Video
      } else {
        // Try to fetch metadata from oembed if not provided
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
            title,
            channel_name: channel,
            thumbnail_url: getYouTubeThumbnail(youtubeId),
            source: 'youtube',
            added_by: userId,
            is_active: true,
          })
          .select()
          .single()
        if (error) throw error
        video = data as Video
      }

      // 2. Check if it's already in the playlist
      const { data: existingPV } = await supabase
        .from('playlist_videos')
        .select('id')
        .eq('playlist_id', input.playlist_id)
        .eq('video_id', video.id)
        .maybeSingle()
      if (existingPV) throw new Error('ALREADY_ADDED')

      // 3. Get next position
      const { data: lastPV } = await supabase
        .from('playlist_videos')
        .select('position')
        .eq('playlist_id', input.playlist_id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      const position = (lastPV?.position ?? -1) + 1

      // 4. Insert
      const { data: pv, error: e2 } = await supabase
        .from('playlist_videos')
        .insert({
          playlist_id: input.playlist_id,
          video_id: video.id,
          position,
        })
        .select('*, video:videos(*)')
        .single()
      if (e2) throw e2

      return pv as PlaylistVideo
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['playlist-videos', vars.playlist_id] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}

export function useRemoveVideoFromPlaylist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { playlist_video_id: string; playlist_id: string }) => {
      const { error } = await supabase
        .from('playlist_videos')
        .delete()
        .eq('id', vars.playlist_video_id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['playlist-videos', vars.playlist_id] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
    },
  })
}
