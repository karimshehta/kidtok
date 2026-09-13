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
  storage_provider: string | null
  cloudflare_uid: string | null
  r2_bucket: string | null
  r2_key: string | null
  r2_public_url: string | null
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

// ────────────────────────────────────────────────────────────────────────
// Admin: All Creator Videos (with search) + hard-delete
// ────────────────────────────────────────────────────────────────────────
// usePendingModeration above only returns the *review queue*. Admins also
// need a global view of every creator video (approved, rejected, blocked
// included) with the ability to search by title and remove anything that
// should be off the platform — even after it was already approved.

export interface AdminCreatorVideoRow extends CreatorVideo {
  // Nested creator info so the admin can see who uploaded each video
  creator?: { id: string; name: string | null; username: string | null } | null
}

/**
 * Lists every creator_videos row, optionally filtered by a title search.
 * Sorted newest-first. Capped at 200 so the page stays responsive even
 * when the catalog grows; admins should use the search to drill down.
 */
export function useAdminAllCreatorVideos(search: string) {
  const term = search.trim()
  return useQuery({
    // Include `term` in the queryKey so each search has its own cache entry
    // instead of clobbering one another.
    queryKey: ['admin', 'all-creator-videos', term],
    queryFn: async (): Promise<AdminCreatorVideoRow[]> => {
      let q = supabase
        .from('creator_videos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (term) {
        // Postgres ILIKE search on title. `%${term}%` matches substrings.
        q = q.ilike('title', `%${term}%`)
      }
      const { data, error } = await q
      if (error) throw error
      const rows = (data || []) as CreatorVideo[]
      if (rows.length === 0) return []

      // Resolve creator profiles in a second round-trip. We can't do this as
      // an embedded join because creator_videos.creator_id references
      // auth.users(id), not public.profiles(id) — PostgREST has no FK to
      // follow. profiles.id === auth.users.id by Supabase convention, so the
      // merge by id is exact.
      const creatorIds = Array.from(new Set(rows.map((r) => r.creator_id).filter(Boolean)))
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, name, username')
        .in('id', creatorIds)
      if (pErr) throw pErr
      const byId = new Map((profiles || []).map((p: any) => [p.id, p]))

      return rows.map((r) => ({
        ...r,
        creator: byId.get(r.creator_id) ?? null,
      })) as AdminCreatorVideoRow[]
    },
    // 30s staleTime — admin browsing doesn't need real-time refresh
    staleTime: 30_000,
  })
}

/**
 * Hard-deletes a creator video via the admin-delete-video edge function.
 * The function verifies the caller has profiles.role='admin', cascades the
 * mirror videos row away, and drains the Cloudflare cleanup queue inline.
 */
export function useAdminDeleteVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (videoId: string) => {
      // Use direct fetch instead of supabase.functions.invoke so we can
      // read the JSON body on non-2xx responses — supabase-js wraps those
      // in FunctionsHttpError and hides the detail otherwise.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('not authenticated')
      const supabaseUrl = (supabase as any).supabaseUrl || (supabase as any).rest?.url?.replace(/\/rest\/.*$/, '') || ''
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-delete-video`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ video_id: videoId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.detail || body?.error || `HTTP ${res.status}`)
      }
      return body
    },
    onSuccess: () => {
      // Both the pending-review and the all-videos lists need to drop the row
      qc.invalidateQueries({ queryKey: ['admin', 'all-creator-videos'] })
      qc.invalidateQueries({ queryKey: ['admin', 'pending-moderation'] })
      qc.invalidateQueries({ queryKey: ['creator-videos'] })
    },
  })
}
