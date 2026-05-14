import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ArrowRight, Plus, Trash2, Play, ExternalLink, Search } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import Modal from '@/components/Modal'
import { usePlaylist, usePlaylistVideos, useAddVideoToPlaylist, useRemoveVideoFromPlaylist } from '@/hooks/usePlaylists'
import { extractYouTubeId, getYouTubeThumbnail, getYouTubeWatchUrl, fetchYouTubeOEmbed } from '@/lib/youtube'

export default function PlaylistDetail() {
  const { playlistId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: playlist, isLoading: plLoading } = usePlaylist(playlistId)
  const { data: videos = [], isLoading: vLoading } = usePlaylistVideos(playlistId)
  const removeMut = useRemoveVideoFromPlaylist()

  const [addOpen, setAddOpen] = useState(false)

  const handleRemove = async (e: React.MouseEvent, pvId: string) => {
    e.stopPropagation()
    if (!confirm(t('videos.removeConfirm'))) return
    try {
      await removeMut.mutateAsync({ playlist_video_id: pvId, playlist_id: playlistId! })
      toast.success(t('videos.removeSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorGeneric'))
    }
  }

  if (plLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!playlist) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="text-neutral-700">{t('common.empty')}</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Link
          to={`/children/${playlist.child_id}`}
          className="inline-flex items-center gap-1 text-primary text-sm mb-4 hover:underline"
        >
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          {t('common.back')}
        </Link>

        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-neutral-700 text-sm mt-1">{playlist.description}</p>
            )}
            <p className="text-xs text-neutral-700 mt-2">
              {t('playlists.videoCount', { count: videos.length })}
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} className="btn-primary text-sm inline-flex items-center gap-2 flex-shrink-0">
            <Plus className="w-4 h-4" />
            {t('videos.addVideo')}
          </button>
        </div>

        {vLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="card text-center py-10">
            <img src="/assets/playlistplaceholder.svg" alt="" className="w-32 h-32 mx-auto mb-3 opacity-80" />
            <p className="text-neutral-700 text-sm mb-4">{t('videos.emptyVideos')}</p>
            <button onClick={() => setAddOpen(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('videos.addVideo')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map((pv, idx) => {
              if (!pv.video) return null
              const ytId = pv.video.youtube_id
              return (
                <button
                  type="button"
                  key={pv.id}
                  onClick={() => navigate(`/playlists/${playlistId}/play?start=${idx}`)}
                  className="card flex gap-3 group p-3 w-full text-start hover:shadow-md transition-shadow"
                >
                  <div className="relative w-32 sm:w-40 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-neutral-300">
                    <img
                      src={pv.video.thumbnail_url || getYouTubeThumbnail(ytId || "")}
                      alt={pv.video.title || ''}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = getYouTubeThumbnail(ytId || "", 'default')
                      }}
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="w-6 h-6 text-primary ms-1" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <h3 className="font-semibold line-clamp-2 mb-1">
                      {pv.video.title || 'Untitled'}
                    </h3>
                    {pv.video.channel_name && (
                      <p className="text-xs text-neutral-700 mb-2">{pv.video.channel_name}</p>
                    )}
                    <div className="mt-auto flex gap-3 items-center">
                      <a
                        href={getYouTubeWatchUrl(ytId || "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        YouTube
                      </a>
                      <button
                        type="button"
                        onClick={(e) => handleRemove(e, pv.id)}
                        className="text-xs text-danger hover:underline inline-flex items-center gap-1 ms-auto"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('videos.addVideoTitle')} size="lg">
        <AddVideoForm
          playlistId={playlistId!}
          onDone={() => setAddOpen(false)}
        />
      </Modal>


    </AppLayout>
  )
}

interface AddProps {
  playlistId: string
  onDone: () => void
}

function AddVideoForm({ playlistId, onDone }: AddProps) {
  const { t } = useTranslation()
  const addMut = useAddVideoToPlaylist()

  type F = { url: string; title: string; channel: string }
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<F>()
  const [preview, setPreview] = useState<{ id: string; title?: string; channel?: string } | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)

  const url = watch('url')

  const handleUrlBlur = async () => {
    const id = extractYouTubeId(url || '')
    if (!id) {
      setPreview(null)
      return
    }
    setPreview({ id })
    setFetchingMeta(true)
    try {
      const meta = await fetchYouTubeOEmbed(id)
      if (meta) {
        setPreview({ id, title: meta.title, channel: meta.author_name })
        setValue('title', meta.title)
        setValue('channel', meta.author_name)
      }
    } finally {
      setFetchingMeta(false)
    }
  }

  const onSubmit = handleSubmit(async (d) => {
    try {
      await addMut.mutateAsync({
        playlist_id: playlistId,
        url: d.url,
        title: d.title,
        channel_name: d.channel,
      })
      toast.success(t('videos.addSuccess'))
      onDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'INVALID_URL') toast.error(t('videos.invalidUrl'))
      else if (msg === 'ALREADY_ADDED') toast.error(t('videos.alreadyAdded'))
      else toast.error(msg || t('common.errorGeneric'))
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">{t('videos.pasteUrl')}</label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-700" />
          <input
            {...register('url', { required: t('common.required') })}
            onBlur={handleUrlBlur}
            className="input-field ps-10"
            placeholder={t('videos.urlPlaceholder')}
            dir="ltr"
          />
        </div>
        {errors.url && <p className="text-danger text-xs mt-1">{errors.url.message}</p>}
      </div>

      {preview && (
        <div className="border border-neutral-300 rounded-xl overflow-hidden">
          <div className="aspect-video bg-neutral-300">
            <img
              src={getYouTubeThumbnail(preview.id)}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getYouTubeThumbnail(preview.id, 'default')
              }}
            />
          </div>
          {fetchingMeta && (
            <div className="px-3 py-2 text-xs text-neutral-700">{t('videos.fetching')}</div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">{t('videos.titleLabel')}</label>
        <input
          {...register('title')}
          className="input-field"
          placeholder={t('videos.titlePlaceholder')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t('videos.channelLabel')}</label>
        <input
          {...register('channel')}
          className="input-field"
          placeholder={t('videos.channelPlaceholder')}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onDone} className="btn-outline flex-1">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={addMut.isPending} className="btn-primary flex-1">
          {addMut.isPending ? t('common.saving') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
