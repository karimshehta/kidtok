import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Flag, CheckCircle2, XCircle, Trash2, Play, Loader2 } from 'lucide-react'

import AdminLayout from '@/components/AdminLayout'
import VideoPlayer from '@/components/VideoPlayer'
import { supabase } from '@/lib/supabase'

type ReportRow = {
  id:                string
  reporter_id:       string
  creator_video_id:  string | null
  video_id:          string | null
  reason:            string
  notes:             string | null
  status:            'pending' | 'reviewed' | 'dismissed' | 'action_taken'
  created_at:        string
  reporter:          { id: string; name: string | null; username: string | null } | null
  // Nested video data — admin needs to see what's reported, no extra round-trip
  creator_video:     { id: string; title: string | null; cloudflare_uid: string | null; thumbnail_url: string | null; creator_id: string; status: string } | null
  video:             { id: string; title: string | null; hls_url: string | null; thumbnail_url: string | null; creator_id: string | null } | null
}

// Reason labels — keep in sync with the mobile sheet
const REASON_LABELS: Record<string, string> = {
  inappropriate_content: 'Inappropriate content',
  violence:              'Violence',
  sexual_content:        'Sexual content',
  hate_speech:           'Hate speech',
  misinformation:        'Misinformation',
  spam:                  'Spam',
  copyright:             'Copyright',
  other:                 'Other',
}

const STATUS_FILTERS = ['pending', 'reviewed', 'dismissed', 'action_taken'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export default function AdminReports() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [playing, setPlaying] = useState<ReportRow | null>(null)

  const { data: reports = [], isLoading, isError, error } = useQuery<ReportRow[]>({
    queryKey: ['admin-video-reports', statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('video_reports')
        .select(`
          id, reporter_id, creator_video_id, video_id, reason, notes, status, created_at,
          creator_video:creator_videos!creator_video_id (id, title, cloudflare_uid, thumbnail_url, creator_id, status),
          video:videos!video_id (id, title, hls_url, thumbnail_url, creator_id)
        `)
        .eq('status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      const rows = ((data as any) || []) as Omit<ReportRow, 'reporter'>[]
      const reporterIds = Array.from(new Set(rows.map((row) => row.reporter_id).filter(Boolean)))
      if (reporterIds.length === 0) {
        return rows.map((row) => ({ ...row, reporter: null }))
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, username')
        .in('id', reporterIds)
      if (profilesError) throw profilesError

      const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
      return rows.map((row) => ({
        ...row,
        reporter: profilesById.get(row.reporter_id) || null,
      })) as ReportRow[]
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-video-reports'] })

  // Mark report reviewed / dismissed (no content action)
  const updateStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReportRow['status'] }) => {
      const { error } = await supabase
        .from('video_reports')
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  // Take action: reject the creator_video (so it disappears from the feed)
  // AND mark the report as action_taken in a single flow.
  const takeActionMut = useMutation({
    mutationFn: async (report: ReportRow) => {
      // Prefer creator_video; falls back to mirror videos.creator_video_id
      const cv = report.creator_video
      if (cv) {
        const { error: e1 } = await supabase
          .from('creator_videos')
          .update({ status: 'rejected', rejection_reason: `Report: ${report.reason}` })
          .eq('id', cv.id)
        if (e1) throw e1
      }
      const { error: e2 } = await supabase
        .from('video_reports')
        .update({ status: 'action_taken', reviewed_at: new Date().toISOString() })
        .eq('id', report.id)
      if (e2) throw e2
    },
    onSuccess: invalidate,
  })

  const handleDismiss = async (id: string) => {
    try { await updateStatusMut.mutateAsync({ id, status: 'dismissed' }); toast.success('Report dismissed') }
    catch (err) { toast.error((err as Error).message) }
  }
  const handleAction = async (r: ReportRow) => {
    if (!confirm(`Reject the video and resolve this report?`)) return
    try { await takeActionMut.mutateAsync(r); toast.success('Video rejected & report closed') }
    catch (err) { toast.error((err as Error).message) }
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="w-7 h-7 text-primary" />
            {t('admin.nav.reports') || 'User reports'}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            User-submitted reports on videos. Review, dismiss, or take action.
          </p>
        </header>

        {/* Status tabs */}
        <div className="flex gap-2 mb-4 border-b">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
                statusFilter === s
                  ? 'text-primary border-primary'
                  : 'text-neutral-500 border-transparent hover:text-neutral-800'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="card text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : isError ? (
          <div className="card border-red-200 bg-red-50 text-red-700">
            {(error as Error)?.message || 'Failed to load reports'}
          </div>
        ) : reports.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-neutral-700">No {statusFilter.replace('_', ' ')} reports.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const thumb = r.creator_video?.thumbnail_url || r.video?.thumbnail_url
              const title = r.creator_video?.title || r.video?.title || '(no title)'
              const reporter = r.reporter?.name || r.reporter?.username || r.reporter_id.slice(0, 8)
              const canPlay = !!(r.video?.hls_url || r.creator_video?.cloudflare_uid)
              return (
                <div key={r.id} className="card flex gap-4 items-start">
                  {/* Thumbnail */}
                  <div
                    onClick={() => canPlay && setPlaying(r)}
                    className={`relative w-28 h-28 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0 ${canPlay ? 'cursor-pointer' : ''}`}
                  >
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-300">
                        <Play className="w-8 h-8" />
                      </div>
                    )}
                    {canPlay && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                        <Play className="w-8 h-8 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200">
                        {REASON_LABELS[r.reason] || r.reason}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-neutral-900 truncate">{title}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Reported by <span className="font-semibold">{reporter}</span>
                    </p>
                    {r.notes && (
                      <p className="text-sm text-neutral-700 mt-2 bg-neutral-50 rounded p-2 italic">
                        "{r.notes}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {r.status === 'pending' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAction(r)}
                        disabled={takeActionMut.isPending}
                        className="px-3 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        Reject video
                      </button>
                      <button
                        onClick={() => handleDismiss(r.id)}
                        disabled={updateStatusMut.isPending}
                        className="px-3 py-2 text-sm font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Dismiss
                      </button>
                    </div>
                  )}
                  {r.status !== 'pending' && (
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                      <CheckCircle2 className="w-4 h-4" />
                      Resolved
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Inline video player — VideoPlayer is itself a full modal */}
        <VideoPlayer
          open={!!playing}
          onClose={() => setPlaying(null)}
          hlsUrl={playing?.video?.hls_url || null}
          cloudflareUid={playing?.creator_video?.cloudflare_uid || null}
          title={playing?.creator_video?.title || playing?.video?.title || null}
        />
      </div>
    </AdminLayout>
  )
}
