import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { ArrowRight, Plus, Trash2, Play, Search, Loader2, Clock, Link as LinkIcon } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import Modal from '@/components/Modal'
import { usePlaylist, usePlaylistVideos, useAddVideoToPlaylist, useRemoveVideoFromPlaylist, useYouTubeSearch, useYouTubeVideoLookup, type YouTubeSearchResult } from '@/hooks/usePlaylists'
import { extractYouTubeId, fetchYouTubeOEmbed, getYouTubeThumbnail } from '@/lib/youtube'
import { cn } from '@/lib/utils'

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
                      <span className="text-xs text-neutral-700">
                        {t('videos.safeEmbedOnly')}
                      </span>
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
  const searchMut = useYouTubeSearch()
  const lookupMut = useYouTubeVideoLookup()
  const [mode, setMode] = useState<'search' | 'link'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YouTubeSearchResult[]>([])
  const [addingId, setAddingId] = useState<string | null>(null)

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState('')
  const [preview, setPreview] = useState<{ id: string; title?: string; channel?: string } | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = query.trim()
    if (q.length < 2) {
      toast.error(t('videos.searchTooShort'))
      return
    }
    try {
      const rows = await searchMut.mutateAsync(q)
      setResults(rows)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('videos.searchFailed'))
    }
  }

  const addSearchResult = async (item: YouTubeSearchResult) => {
    setAddingId(item.youtube_id)
    try {
      await addMut.mutateAsync({
        playlist_id: playlistId,
        url: item.youtube_id,
        youtube_id: item.youtube_id,
        title: item.title,
        channel_name: item.channel_name,
        channel_id: item.channel_id,
        thumbnail_url: item.thumbnail_url,
        duration_seconds: item.duration_seconds,
      })
      toast.success(t('videos.addSuccess'))
      onDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'ALREADY_ADDED') toast.error(t('videos.alreadyAdded'))
      else toast.error(msg || t('common.errorGeneric'))
    } finally {
      setAddingId(null)
    }
  }

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
        setTitle(meta.title)
        setChannel(meta.author_name)
      }
    } finally {
      setFetchingMeta(false)
    }
  }

  const addDirectLink = async (e: React.FormEvent) => {
    e.preventDefault()
    const youtubeId = extractYouTubeId(url)
    if (!youtubeId) {
      toast.error(t('videos.invalidUrl'))
      return
    }
    try {
      const item = await lookupMut.mutateAsync(youtubeId)
      if (!item) {
        toast.error(t('videos.filteredOut'))
        return
      }
      await addMut.mutateAsync({
        playlist_id: playlistId,
        url: youtubeId,
        youtube_id: youtubeId,
        title: title || item.title,
        channel_name: channel || item.channel_name,
        channel_id: item.channel_id,
        thumbnail_url: item.thumbnail_url,
        duration_seconds: item.duration_seconds,
      })
      toast.success(t('videos.addSuccess'))
      onDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'INVALID_URL') toast.error(t('videos.invalidUrl'))
      else if (msg === 'ALREADY_ADDED') toast.error(t('videos.alreadyAdded'))
      else toast.error(msg || t('common.errorGeneric'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={cn('rounded-xl py-2 text-sm font-semibold transition-colors', mode === 'search' ? 'bg-white shadow-sm text-primary' : 'text-neutral-700')}
        >
          {t('videos.searchMode')}
        </button>
        <button
          type="button"
          onClick={() => setMode('link')}
          className={cn('rounded-xl py-2 text-sm font-semibold transition-colors', mode === 'link' ? 'bg-white shadow-sm text-primary' : 'text-neutral-700')}
        >
          {t('videos.linkMode')}
        </button>
      </div>

      {mode === 'search' ? (
        <>
          <form onSubmit={handleSearch} className="space-y-3">
            <label className="block text-sm font-medium">{t('videos.searchLabel')}</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-700" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="input-field ps-10"
                  placeholder={t('videos.searchPlaceholder')}
                />
              </div>
              <button type="submit" disabled={searchMut.isPending} className="btn-primary px-4 inline-flex items-center gap-2">
                {searchMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {t('common.search')}
              </button>
            </div>
            <p className="text-xs text-neutral-700">{t('videos.safeSearchHint')}</p>
          </form>

          <div className="max-h-[48vh] overflow-y-auto space-y-2 pe-1">
            {searchMut.isPending ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-700">
                {t('videos.searchEmpty')}
              </div>
            ) : (
              results.map((item) => (
                <button
                  type="button"
                  key={item.youtube_id}
                  onClick={() => addSearchResult(item)}
                  disabled={!!addingId || addMut.isPending}
                  className="w-full rounded-2xl border border-neutral-200 p-2 text-start hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-70"
                >
                  <div className="flex gap-3">
                    <div className="relative w-28 aspect-video rounded-xl overflow-hidden bg-neutral-200 flex-shrink-0">
                      <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute end-1 bottom-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white">
                        {formatDuration(item.duration_seconds)}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm line-clamp-2">{item.title}</div>
                      <div className="mt-1 text-xs text-neutral-700 line-clamp-1">{item.channel_name}</div>
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-neutral-700">
                        <Clock className="w-3 h-3" />
                        {formatDuration(item.duration_seconds)}
                      </div>
                    </div>
                    <div className="self-center">
                      <span className="btn-primary py-2 px-3 text-xs inline-flex items-center gap-1">
                        {addingId === item.youtube_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        {t('common.add')}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        <form onSubmit={addDirectLink} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('videos.pasteUrl')}</label>
            <div className="relative">
              <LinkIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-700" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={handleUrlBlur}
                className="input-field ps-10"
                placeholder={t('videos.urlPlaceholder')}
                dir="ltr"
              />
            </div>
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder={t('videos.titlePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('videos.channelLabel')}</label>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="input-field"
              placeholder={t('videos.channelPlaceholder')}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onDone} className="btn-outline flex-1">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={addMut.isPending || lookupMut.isPending} className="btn-primary flex-1">
              {addMut.isPending || lookupMut.isPending ? t('common.saving') : t('common.add')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function formatDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
