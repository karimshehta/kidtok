import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  CheckCircle2,
  XCircle,
  Ban,
  Flag,
  Clock,
  ShieldCheck,
  Play,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import VideoPlayer from '@/components/VideoPlayer'
import {
  usePendingModeration,
  useModerateVideo,
  useAdminAllCreatorVideos,
  useAdminDeleteVideo,
  type CreatorVideo,
  type AdminCreatorVideoRow,
} from '@/hooks/useCreator'

type Tab = 'pending' | 'all'

export default function AdminModeration() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('pending')
  const [playing, setPlaying] = useState<CreatorVideo | AdminCreatorVideoRow | null>(null)

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            {t('admin.moderation.title')}
          </h1>
          <p className="text-sm text-neutral-700 mt-1">{t('admin.moderation.subtitle')}</p>
        </header>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-4 border-b">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === 'pending'
                ? 'text-primary border-primary'
                : 'text-neutral-500 border-transparent hover:text-neutral-800'
            }`}
          >
            Pending Review
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === 'all'
                ? 'text-primary border-primary'
                : 'text-neutral-500 border-transparent hover:text-neutral-800'
            }`}
          >
            All Videos
          </button>
        </div>

        {tab === 'pending' ? <PendingReviewTab onPlay={setPlaying} /> : <AllVideosTab onPlay={setPlaying} />}
      </div>

      <VideoPlayer
        open={!!playing}
        onClose={() => setPlaying(null)}
        cloudflareUid={playing?.cloudflare_uid || null}
        title={playing?.title}
      />
    </AdminLayout>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Pending Review — the original review queue (unchanged behaviour, just
// extracted into its own component so the two tabs can live side by side).
// ───────────────────────────────────────────────────────────────────────
function PendingReviewTab({ onPlay }: { onPlay: (v: CreatorVideo) => void }) {
  const { t } = useTranslation()
  const { data: videos = [], isLoading } = usePendingModeration()
  const moderateMut = useModerateVideo()

  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const handleApprove = async (id: string) => {
    try {
      await moderateMut.mutateAsync({ id, action: 'approve' })
      toast.success(t('admin.moderation.approveSuccess'))
    } catch (err) { toast.error((err as Error).message) }
  }
  const handleConfirmReject = async () => {
    if (!rejectingId) return
    try {
      await moderateMut.mutateAsync({ id: rejectingId, action: 'reject', reason: rejectReason.trim() || undefined })
      toast.success(t('admin.moderation.rejectSuccess'))
      setRejectingId(null)
      setRejectReason('')
    } catch (err) { toast.error((err as Error).message) }
  }
  const handleBlock = async (id: string) => {
    try {
      await moderateMut.mutateAsync({ id, action: 'block', reason: 'admin block' })
      toast.success(t('admin.moderation.rejectSuccess'))
    } catch (err) { toast.error((err as Error).message) }
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
  if (videos.length === 0) {
    return (
      <div className="card text-center py-12">
        <CheckCircle2 className="w-12 h-12 mx-auto text-primary mb-3" />
        <p className="text-neutral-700">{t('admin.moderation.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {videos.map((v) => (
        <div key={v.id} className="card flex flex-col sm:flex-row gap-4 p-4">
          <button
            type="button"
            onClick={() => v.cloudflare_uid && onPlay(v)}
            disabled={!v.cloudflare_uid}
            className="relative w-full sm:w-48 aspect-video bg-neutral-300 rounded-lg overflow-hidden flex-shrink-0 group"
          >
            {v.thumbnail_url ? (
              <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-700">
                <Clock className="w-8 h-8" />
              </div>
            )}
            {v.cloudflare_uid && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                  <Play className="w-5 h-5 text-primary ms-0.5" fill="currentColor" />
                </div>
              </div>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold mb-1">{v.title}</h3>
            {v.description && <p className="text-sm text-neutral-700 line-clamp-2 mb-2">{v.description}</p>}
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-700 mb-3">
              {v.duration_seconds && <span>{v.duration_seconds}s</span>}
              {v.report_count > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Flag className="w-3 h-3" />
                  {t('admin.moderation.reportCount', { count: v.report_count })}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {t(`creator.myVideos.status.${v.status}`)}
              </span>
            </div>

            {rejectingId === v.id ? (
              <div className="space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className="input-field text-sm"
                  placeholder={t('admin.moderation.reasonPlaceholder')}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={handleConfirmReject} disabled={moderateMut.isPending} className="btn-primary !bg-danger text-sm flex-1 inline-flex items-center justify-center gap-2">
                    <XCircle className="w-4 h-4" />
                    {t('admin.moderation.reject')}
                  </button>
                  <button onClick={() => { setRejectingId(null); setRejectReason('') }} className="btn-outline text-sm">
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => handleApprove(v.id)} disabled={moderateMut.isPending || v.status === 'processing'} className="btn-primary text-sm inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('admin.moderation.approve')}
                </button>
                <button onClick={() => setRejectingId(v.id)} disabled={moderateMut.isPending} className="btn-outline text-sm inline-flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  {t('admin.moderation.reject')}
                </button>
                <button onClick={() => handleBlock(v.id)} disabled={moderateMut.isPending} className="btn-outline text-sm inline-flex items-center gap-2 text-danger border-danger/30">
                  <Ban className="w-4 h-4" />
                  {t('admin.moderation.block')}
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// All Videos — admin global view with title search + hard delete.
// Triggers admin-delete-video edge function which cascades the mirror
// videos row and clears the Cloudflare asset in the same request.
// ───────────────────────────────────────────────────────────────────────
function AllVideosTab({ onPlay }: { onPlay: (v: AdminCreatorVideoRow) => void }) {
  const [searchInput, setSearchInput] = useState('')
  // Debounce search so each keystroke doesn't re-fetch
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Simple debounce — useState gives us a stable ref-like container
  const debounceRef = useState(() => ({ current: null as ReturnType<typeof setTimeout> | null }))[0]
  const onSearchChange = (val: string) => {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(val), 300)
  }

  const { data: videos = [], isLoading } = useAdminAllCreatorVideos(search)
  const deleteMut = useAdminDeleteVideo()

  const handleDelete = async (v: AdminCreatorVideoRow) => {
    const ok = confirm(
      `Delete "${v.title}" permanently?\n\n` +
      `This removes it from the app AND from Cloudflare Stream.\n` +
      `The creator (${v.creator?.name || v.creator?.username || v.creator_id?.slice(0, 8)}) will not be notified.`
    )
    if (!ok) return
    setDeletingId(v.id)
    try {
      await deleteMut.mutateAsync(v.id)
      toast.success('Video deleted')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4 relative">
        <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by title…"
          className="input-field !ps-9 w-full"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      ) : videos.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-neutral-700">
            {search ? `No videos match "${search}".` : 'No videos in the catalog.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((v) => (
            <div key={v.id} className="card flex gap-3 items-start p-3">
              <button
                type="button"
                onClick={() => v.cloudflare_uid && onPlay(v)}
                disabled={!v.cloudflare_uid}
                className="relative w-32 aspect-video bg-neutral-300 rounded-lg overflow-hidden flex-shrink-0 group"
              >
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-700"><Play className="w-6 h-6" /></div>
                )}
                {v.cloudflare_uid && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-5 h-5 text-white" />
                  </div>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{v.title}</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  by {v.creator?.name || v.creator?.username || v.creator_id?.slice(0, 8)}
                  <span className="mx-2">·</span>
                  {new Date(v.created_at).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(v.status)}`}>
                    {v.status}
                  </span>
                  {v.duration_seconds && <span className="text-xs text-neutral-500">{v.duration_seconds}s</span>}
                </div>
              </div>

              <button
                onClick={() => handleDelete(v)}
                disabled={deletingId === v.id}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-red-50 hover:bg-red-100 text-red-700 inline-flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                title="Delete video + Cloudflare asset"
              >
                {deletingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function statusColor(s: string) {
  switch (s) {
    case 'approved':       return 'bg-green-100 text-green-700'
    case 'pending_review': return 'bg-amber-100 text-amber-700'
    case 'processing':     return 'bg-blue-100 text-blue-700'
    case 'rejected':       return 'bg-red-100 text-red-700'
    case 'blocked':        return 'bg-neutral-300 text-neutral-700'
    case 'uploading':      return 'bg-purple-100 text-purple-700'
    default:               return 'bg-neutral-100 text-neutral-700'
  }
}
