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
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import VideoPlayer from '@/components/VideoPlayer'
import { usePendingModeration, useModerateVideo, type CreatorVideo } from '@/hooks/useCreator'

export default function AdminModeration() {
  const { t } = useTranslation()
  const { data: videos = [], isLoading } = usePendingModeration()
  const moderateMut = useModerateVideo()

  const [playing, setPlaying] = useState<CreatorVideo | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const handleApprove = async (id: string) => {
    try {
      await moderateMut.mutateAsync({ id, action: 'approve' })
      toast.success(t('admin.moderation.approveSuccess'))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectingId) return
    try {
      await moderateMut.mutateAsync({
        id: rejectingId,
        action: 'reject',
        reason: rejectReason.trim() || undefined,
      })
      toast.success(t('admin.moderation.rejectSuccess'))
      setRejectingId(null)
      setRejectReason('')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleBlock = async (id: string) => {
    try {
      await moderateMut.mutateAsync({ id, action: 'block', reason: 'admin block' })
      toast.success(t('admin.moderation.rejectSuccess'))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

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

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : videos.length === 0 ? (
          <div className="card text-center py-12">
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary mb-3" />
            <p className="text-neutral-700">{t('admin.moderation.empty')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {videos.map((v) => (
              <div key={v.id} className="card flex flex-col sm:flex-row gap-4 p-4">
                <button
                  type="button"
                  onClick={() => v.cloudflare_uid && setPlaying(v)}
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
                  {v.description && (
                    <p className="text-sm text-neutral-700 line-clamp-2 mb-2">{v.description}</p>
                  )}
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
                        <button
                          onClick={handleConfirmReject}
                          disabled={moderateMut.isPending}
                          className="btn-primary !bg-danger text-sm flex-1 inline-flex items-center justify-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          {t('admin.moderation.reject')}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(null)
                            setRejectReason('')
                          }}
                          className="btn-outline text-sm"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleApprove(v.id)}
                        disabled={moderateMut.isPending || v.status === 'processing'}
                        className="btn-primary text-sm inline-flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {t('admin.moderation.approve')}
                      </button>
                      <button
                        onClick={() => setRejectingId(v.id)}
                        disabled={moderateMut.isPending}
                        className="btn-outline text-sm inline-flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        {t('admin.moderation.reject')}
                      </button>
                      <button
                        onClick={() => handleBlock(v.id)}
                        disabled={moderateMut.isPending}
                        className="btn-outline text-sm inline-flex items-center gap-2 text-danger border-danger/30"
                      >
                        <Ban className="w-4 h-4" />
                        {t('admin.moderation.block')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
