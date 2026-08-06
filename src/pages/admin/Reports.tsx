import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Flag,
  MessageSquareWarning,
  CheckCircle2,
  XCircle,
  Trash2,
  Play,
  Loader2,
} from 'lucide-react'

import AdminLayout from '@/components/AdminLayout'
import VideoPlayer from '@/components/VideoPlayer'
import { supabase } from '@/lib/supabase'

type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken'

type VideoReportRow = {
  id: string
  reporter_id: string
  creator_video_id: string | null
  video_id: string | null
  reason: string
  notes: string | null
  status: ReportStatus
  created_at: string
  reporter: { id: string; name: string | null; username: string | null } | null
  creator_video: {
    id: string
    title: string | null
    cloudflare_uid: string | null
    thumbnail_url: string | null
    creator_id: string
    status: string
  } | null
  video: {
    id: string
    title: string | null
    hls_url: string | null
    thumbnail_url: string | null
    creator_id: string | null
  } | null
}

type CommentReportRow = {
  id: string
  comment_id: string
  reporter_id: string
  reason: string
  description: string | null
  status: ReportStatus
  created_at: string
  reporter: { id: string; name: string | null; username: string | null } | null
  comment_owner: { id: string; name: string | null; username: string | null } | null
  comment: {
    id: string
    user_id: string
    video_id: string
    content: string
    created_at: string
    is_deleted: boolean | null
  } | null
}

const VIDEO_REASON_LABELS: Record<string, string> = {
  inappropriate_content: 'Inappropriate content',
  violence: 'Violence',
  sexual_content: 'Sexual content',
  hate_speech: 'Hate speech',
  misinformation: 'Misinformation',
  spam: 'Spam',
  copyright: 'Copyright',
  other: 'Other',
}

const COMMENT_REASON_LABELS: Record<string, string> = {
  unsafe_comment: 'Unsafe comment',
  bullying: 'Bullying',
  hate_speech: 'Hate speech',
  spam: 'Spam',
  personal_info: 'Personal information',
  other: 'Other',
}

const STATUS_FILTERS = ['pending', 'reviewed', 'dismissed', 'action_taken'] as const
type StatusFilter = typeof STATUS_FILTERS[number]
type ReportKind = 'videos' | 'comments'

export default function AdminReports() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [kind, setKind] = useState<ReportKind>('videos')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [playing, setPlaying] = useState<VideoReportRow | null>(null)

  const videoReportsQuery = useQuery<VideoReportRow[]>({
    queryKey: ['admin-video-reports', statusFilter],
    enabled: kind === 'videos',
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

      const rows = ((data as any) || []) as Omit<VideoReportRow, 'reporter'>[]
      const reporterIds = Array.from(new Set(rows.map((row) => row.reporter_id).filter(Boolean)))
      const profilesById = await fetchProfilesMap(reporterIds)

      return rows.map((row) => ({
        ...row,
        reporter: profilesById.get(row.reporter_id) || null,
      })) as VideoReportRow[]
    },
  })

  const commentReportsQuery = useQuery<CommentReportRow[]>({
    queryKey: ['admin-comment-reports', statusFilter],
    enabled: kind === 'comments',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('video_comment_reports')
        .select(`
          id, comment_id, reporter_id, reason, description, status, created_at,
          comment:video_comments!comment_id (id, user_id, video_id, content, created_at, is_deleted)
        `)
        .eq('status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      const rows = ((data as any) || []) as Omit<CommentReportRow, 'reporter' | 'comment_owner'>[]
      const profileIds = Array.from(new Set([
        ...rows.map((row) => row.reporter_id),
        ...rows.map((row) => row.comment?.user_id).filter(Boolean),
      ] as string[]))
      const profilesById = await fetchProfilesMap(profileIds)

      return rows.map((row) => ({
        ...row,
        reporter: profilesById.get(row.reporter_id) || null,
        comment_owner: row.comment?.user_id ? profilesById.get(row.comment.user_id) || null : null,
      })) as CommentReportRow[]
    },
  })

  const invalidateVideoReports = () => qc.invalidateQueries({ queryKey: ['admin-video-reports'] })
  const invalidateCommentReports = () => qc.invalidateQueries({ queryKey: ['admin-comment-reports'] })

  const updateVideoStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReportStatus }) => {
      const { error } = await supabase
        .from('video_reports')
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateVideoReports,
  })

  const takeVideoActionMut = useMutation({
    mutationFn: async (report: VideoReportRow) => {
      if (report.creator_video) {
        const { error } = await supabase
          .from('creator_videos')
          .update({ status: 'rejected', rejection_reason: `Report: ${report.reason}` })
          .eq('id', report.creator_video.id)
        if (error) throw error
      }

      if (report.video_id) {
        const { error } = await supabase
          .from('videos')
          .update({ is_active: false })
          .eq('id', report.video_id)
        if (error) throw error
      }

      const { error } = await supabase
        .from('video_reports')
        .update({ status: 'action_taken', reviewed_at: new Date().toISOString() })
        .eq('id', report.id)
      if (error) throw error
    },
    onSuccess: invalidateVideoReports,
  })

  const updateCommentReportMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReportStatus }) => {
      const { error } = await supabase
        .from('video_comment_reports')
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidateCommentReports,
  })

  const deleteCommentMut = useMutation({
    mutationFn: async (report: CommentReportRow) => {
      const { error: deleteError } = await supabase.rpc('delete_video_comment', {
        p_comment_id: report.comment_id,
      })
      if (deleteError) throw deleteError

      const { error: reportError } = await supabase
        .from('video_comment_reports')
        .update({ status: 'action_taken', reviewed_at: new Date().toISOString() })
        .eq('id', report.id)
      if (reportError) throw reportError
    },
    onSuccess: invalidateCommentReports,
  })

  const handleVideoDismiss = async (id: string) => {
    try {
      await updateVideoStatusMut.mutateAsync({ id, status: 'dismissed' })
      toast.success('Report dismissed')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleVideoAction = async (report: VideoReportRow) => {
    if (!confirm('Reject/hide the video and resolve this report?')) return
    try {
      await takeVideoActionMut.mutateAsync(report)
      toast.success('Video hidden & report closed')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleCommentDismiss = async (id: string) => {
    try {
      await updateCommentReportMut.mutateAsync({ id, status: 'dismissed' })
      toast.success('Comment report dismissed')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDeleteComment = async (report: CommentReportRow) => {
    if (!confirm('Delete this comment and close the report?')) return
    try {
      await deleteCommentMut.mutateAsync(report)
      toast.success('Comment deleted & report closed')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const activeQuery = kind === 'videos' ? videoReportsQuery : commentReportsQuery
  const reports = kind === 'videos'
    ? videoReportsQuery.data || []
    : commentReportsQuery.data || []

  return (
    <AdminLayout>
      <div className="max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="w-7 h-7 text-primary" />
            {t('admin.nav.reports') || 'User reports'}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Review video reports and comment reports from one moderation queue.
          </p>
        </header>

        <div className="flex flex-wrap gap-2 mb-4">
          <KindButton
            active={kind === 'videos'}
            icon={<Play className="w-4 h-4" />}
            label="Video reports"
            onClick={() => setKind('videos')}
          />
          <KindButton
            active={kind === 'comments'}
            icon={<MessageSquareWarning className="w-4 h-4" />}
            label="Comment reports"
            onClick={() => setKind('comments')}
          />
        </div>

        <div className="flex gap-2 mb-4 border-b overflow-x-auto">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px whitespace-nowrap ${
                statusFilter === status
                  ? 'text-primary border-primary'
                  : 'text-neutral-500 border-transparent hover:text-neutral-800'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        {activeQuery.isLoading ? (
          <div className="card text-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : activeQuery.isError ? (
          <div className="card border-red-200 bg-red-50 text-red-700">
            {(activeQuery.error as Error)?.message || 'Failed to load reports'}
          </div>
        ) : reports.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-neutral-700">
              No {statusFilter.replace('_', ' ')} {kind === 'videos' ? 'video' : 'comment'} reports.
            </p>
          </div>
        ) : kind === 'videos' ? (
          <div className="space-y-3">
            {(reports as VideoReportRow[]).map((report) => (
              <VideoReportCard
                key={report.id}
                report={report}
                onPlay={setPlaying}
                onDismiss={handleVideoDismiss}
                onAction={handleVideoAction}
                busy={updateVideoStatusMut.isPending || takeVideoActionMut.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(reports as CommentReportRow[]).map((report) => (
              <CommentReportCard
                key={report.id}
                report={report}
                onDismiss={handleCommentDismiss}
                onDelete={handleDeleteComment}
                busy={updateCommentReportMut.isPending || deleteCommentMut.isPending}
              />
            ))}
          </div>
        )}

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

function KindButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border transition ${
        active
          ? 'bg-primary text-white border-primary shadow-sm'
          : 'bg-white text-neutral-700 border-neutral-200 hover:border-primary/40'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function VideoReportCard({
  report,
  onPlay,
  onDismiss,
  onAction,
  busy,
}: {
  report: VideoReportRow
  onPlay: (report: VideoReportRow) => void
  onDismiss: (id: string) => void
  onAction: (report: VideoReportRow) => void
  busy: boolean
}) {
  const thumb = report.creator_video?.thumbnail_url || report.video?.thumbnail_url
  const title = report.creator_video?.title || report.video?.title || '(no title)'
  const reporter = report.reporter?.name || report.reporter?.username || report.reporter_id.slice(0, 8)
  const canPlay = !!(report.video?.hls_url || report.creator_video?.cloudflare_uid)

  return (
    <div className="card flex gap-4 items-start">
      <div
        onClick={() => canPlay && onPlay(report)}
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

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-50 text-red-700 border border-red-200">
            {VIDEO_REASON_LABELS[report.reason] || report.reason}
          </span>
          <span className="text-xs text-neutral-400">
            {new Date(report.created_at).toLocaleString()}
          </span>
        </div>
        <h3 className="font-semibold text-neutral-900 truncate">{title}</h3>
        <p className="text-xs text-neutral-500 mt-0.5">
          Reported by <span className="font-semibold">{reporter}</span>
        </p>
        {report.notes && (
          <p className="text-sm text-neutral-700 mt-2 bg-neutral-50 rounded p-2 italic">
            "{report.notes}"
          </p>
        )}
      </div>

      <ModerationActions
        status={report.status}
        busy={busy}
        primaryLabel="Reject/hide video"
        onPrimary={() => onAction(report)}
        onDismiss={() => onDismiss(report.id)}
      />
    </div>
  )
}

function CommentReportCard({
  report,
  onDismiss,
  onDelete,
  busy,
}: {
  report: CommentReportRow
  onDismiss: (id: string) => void
  onDelete: (report: CommentReportRow) => void
  busy: boolean
}) {
  const reporter = report.reporter?.name || report.reporter?.username || report.reporter_id.slice(0, 8)
  const owner = report.comment_owner?.name || report.comment_owner?.username || report.comment?.user_id?.slice(0, 8) || 'Unknown'
  const commentDeleted = report.comment?.is_deleted

  return (
    <div className="card flex gap-4 items-start">
      <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0">
        <MessageSquareWarning className="w-7 h-7" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-orange-50 text-orange-700 border border-orange-200">
            {COMMENT_REASON_LABELS[report.reason] || report.reason}
          </span>
          {commentDeleted && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-neutral-100 text-neutral-500 border border-neutral-200">
              Already deleted
            </span>
          )}
          <span className="text-xs text-neutral-400">
            {new Date(report.created_at).toLocaleString()}
          </span>
        </div>

        <p className="text-sm text-neutral-500">
          Reported by <span className="font-semibold text-neutral-700">{reporter}</span>
          {' '}against comment by <span className="font-semibold text-neutral-700">{owner}</span>
        </p>

        <div className="mt-3 rounded-xl bg-neutral-50 border border-neutral-100 p-3">
          <p className="text-sm font-semibold text-neutral-500 mb-1">Comment</p>
          <p className="text-neutral-900 whitespace-pre-wrap">
            {report.comment?.content || '(comment unavailable)'}
          </p>
        </div>

        {report.description && (
          <p className="text-sm text-neutral-700 mt-2 bg-red-50 rounded p-2 italic">
            "{report.description}"
          </p>
        )}
      </div>

      <ModerationActions
        status={report.status}
        busy={busy || !!commentDeleted}
        primaryLabel={commentDeleted ? 'Deleted' : 'Delete comment'}
        onPrimary={() => onDelete(report)}
        onDismiss={() => onDismiss(report.id)}
      />
    </div>
  )
}

function ModerationActions({
  status,
  busy,
  primaryLabel,
  onPrimary,
  onDismiss,
}: {
  status: ReportStatus
  busy: boolean
  primaryLabel: string
  onPrimary: () => void
  onDismiss: () => void
}) {
  if (status !== 'pending') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        <CheckCircle2 className="w-4 h-4" />
        Resolved
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 flex-shrink-0">
      <button
        onClick={onPrimary}
        disabled={busy}
        className="px-3 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 disabled:opacity-50"
      >
        <Trash2 className="w-4 h-4" />
        {primaryLabel}
      </button>
      <button
        onClick={onDismiss}
        disabled={busy}
        className="px-3 py-2 text-sm font-semibold rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center gap-1.5 disabled:opacity-50"
      >
        <XCircle className="w-4 h-4" />
        Dismiss
      </button>
    </div>
  )
}

async function fetchProfilesMap(profileIds: string[]) {
  const ids = Array.from(new Set(profileIds.filter(Boolean)))
  if (ids.length === 0) return new Map<string, { id: string; name: string | null; username: string | null }>()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, username')
    .in('id', ids)
  if (error) throw error

  return new Map((data || []).map((profile: any) => [profile.id, profile]))
}
