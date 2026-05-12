import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

export type CreatorVideoStatus =
  | 'uploading'
  | 'processing'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'blocked'

export interface CreatorVideo {
  id: string
  creator_id: string
  cloudflare_uid: string | null
  hls_url: string | null
  thumbnail_url: string | null
  preview_url: string | null
  duration_seconds: number | null
  ready_to_stream: boolean
  title: string
  description: string | null
  age_id: number | null
  interest_id: number | null
  tags: string[]
  status: CreatorVideoStatus
  moderation_score: number | null
  rejection_reason: string | null
  view_count: number
  like_count: number
  report_count: number
  is_active: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

/** List the current creator's videos */
export function useMyCreatorVideos() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['creator-videos', 'mine', userId],
    enabled: !!userId,
    queryFn: async (): Promise<CreatorVideo[]> => {
      const { data, error } = await supabase
        .from('creator_videos')
        .select('*')
        .eq('creator_id', userId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as CreatorVideo[]
    },
    // Re-fetch every 5s while there are "in-flight" videos so the UI updates
    // after Cloudflare's webhook fires.
    refetchInterval: (q) => {
      const list = (q.state.data || []) as CreatorVideo[]
      const hasPending = list.some((v) =>
        ['uploading', 'processing'].includes(v.status)
      )
      return hasPending ? 5000 : false
    },
  })
}

/** Subscribe to a single creator_videos row via realtime channel */
export function useCreatorVideoRealtime(id: string | undefined) {
  const [video, setVideo] = useState<CreatorVideo | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    if (!id) return

    let mounted = true
    supabase
      .from('creator_videos')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (mounted && data) setVideo(data as CreatorVideo)
      })

    const channel = supabase
      .channel(`creator_video:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'creator_videos', filter: `id=eq.${id}` },
        (payload) => {
          setVideo(payload.new as CreatorVideo)
          qc.invalidateQueries({ queryKey: ['creator-videos'] })
        }
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [id, qc])

  return video
}

interface EditCreatorVideoInput {
  title?: string
  description?: string | null
  age_id?: number | null
  interest_id?: number | null
  tags?: string[]
}

export function useEditCreatorVideo(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EditCreatorVideoInput) => {
      const { error } = await supabase
        .from('creator_videos')
        .update(input)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-videos'] })
    },
  })
}

export function useDeleteCreatorVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('creator_videos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['creator-videos'] }),
  })
}

// =============================================================
// Admin moderation hooks
// =============================================================

export function usePendingModeration() {
  return useQuery({
    queryKey: ['admin', 'pending-moderation'],
    queryFn: async (): Promise<CreatorVideo[]> => {
      const { data, error } = await supabase
        .from('creator_videos')
        .select('*')
        .in('status', ['pending_review', 'processing'])
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []) as CreatorVideo[]
    },
    refetchInterval: 15000,
  })
}

export function useModerateVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      id: string
      action: 'approve' | 'reject' | 'block'
      reason?: string
    }) => {
      const userId = (await supabase.auth.getUser()).data.user?.id
      const update: Record<string, unknown> = {
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
      }
      if (vars.action === 'approve') {
        update.status = 'approved'
        update.rejection_reason = null
      } else if (vars.action === 'reject') {
        update.status = 'rejected'
        update.rejection_reason = vars.reason || null
      } else {
        update.status = 'blocked'
        update.rejection_reason = vars.reason || null
      }
      const { error } = await supabase
        .from('creator_videos')
        .update(update)
        .eq('id', vars.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'pending-moderation'] })
      qc.invalidateQueries({ queryKey: ['creator-videos'] })
    },
  })
}

/** Lightweight role check helper */
export function useUserRole() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['user-role', userId],
    enabled: !!userId,
    queryFn: async (): Promise<'parent' | 'creator' | 'admin' | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId!)
        .single()
      if (error) return null
      return (data?.role || 'parent') as 'parent' | 'creator' | 'admin'
    },
  })
}

/** Self-upgrade to creator (Phase 1 — open enrollment for testing).
 *  Later we'll gate this behind verification/subscription. */
export function useBecomeCreator() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('profiles')
        .update({ role: 'creator' })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-role'] }),
  })
}
