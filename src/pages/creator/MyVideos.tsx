import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Plus,
  Trash2,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Heart,
  AlertCircle,
  Ban,
  Play,
} from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import VideoPlayer from '@/components/VideoPlayer'
import {
  useMyCreatorVideos,
  useDeleteCreatorVideo,
  type CreatorVideo,
  type CreatorVideoStatus,
} from '@/hooks/useCreator'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<CreatorVideoStatus, { color: string; bg: string; icon: typeof Clock }> = {
  uploading:      { color: 'text-blue-700',   bg: 'bg-blue-100',   icon: Loader2 },
  processing:     { color: 'text-blue-700',   bg: 'bg-blue-100',   icon: Loader2 },
  pending_review: { color: 'text-amber-700',  bg: 'bg-amber-100',  icon: Clock },
  approved:       { color: 'text-green-700',  bg: 'bg-green-100',  icon: CheckCircle2 },
  rejected:       { color: 'text-red-700',    bg: 'bg-red-100',    icon: XCircle },
  blocked:        { color: 'text-neutral-900', bg: 'bg-neutral-300', icon: Ban },
}

export default function CreatorMyVideos() {
  const { t } = useTranslation()
  const { data: videos = [], isLoading } = useMyCreatorVideos()
  const deleteMut = useDeleteCreatorVideo()
  const [playing, setPlaying] = useState<CreatorVideo | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm(t('creator.myVideos.deleteConfirm'))) return
    try {
      await deleteMut.mutateAsync(id)
      toast.success(t('creator.myVideos.deleteSuccess'))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('creator.myVideos.title')}</h1>
          <Link to="/creator/upload" className="btn-primary text-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t('creator.nav.upload')}
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-5xl mb-3">🎬</div>
            <p className="text-neutral-700 mb-4">{t('creator.myVideos.empty')}</p>
            <Link to="/creator/upload" className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('creator.myVideos.uploadFirst')}
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {videos.map((v) => {
              const s = STATUS_STYLES[v.status]
              const Icon = s.icon
              const canDelete = ['uploading', 'processing', 'rejected'].includes(v.status)
              const canPlay = v.status === 'approved' && v.cloudflare_uid

              return (
                <div key={v.id} className="card p-3 group">
                  <div className="relative aspect-video bg-neutral-300 rounded-lg overflow-hidden mb-3">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 text-neutral-700 animate-spin" />
                      </div>
                    )}
                    <div className={cn(
                      'absolute top-2 start-2 px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1',
                      s.bg, s.color
                    )}>
                      <Icon className={cn('w-3 h-3', ['uploading','processing'].includes(v.status) && 'animate-spin')} />
                      {t(`creator.myVideos.status.${v.status}`)}
                    </div>
                    {canPlay && (
                      <button
                        type="button"
                        onClick={() => setPlaying(v)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                          <Play className="w-6 h-6 text-primary ms-1" fill="currentColor" />
                        </div>
                      </button>
                    )}
                  </div>

                  <h3 className="font-semibold line-clamp-1 mb-1">{v.title}</h3>

                  {v.status === 'rejected' && v.rejection_reason && (
                    <div className="bg-red-50 text-red-700 text-xs rounded-lg px-2 py-1 mb-2 flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{v.rejection_reason}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-xs text-neutral-700">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> {v.view_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5" /> {v.like_count}
                      </span>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(v.id)}
                        className="text-xs text-danger hover:underline inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('common.delete')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <VideoPlayer
        open={!!playing}
        onClose={() => setPlaying(null)}
        cloudflareUid={playing?.cloudflare_uid || null}
        hlsUrl={playing?.hls_url || null}
        title={playing?.title}
      />
    </AppLayout>
  )
}
