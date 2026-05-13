import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  X,
  ListMusic,
  Check,
  Loader2,
  Plus,
  Baby,
  ChevronRight,
} from 'lucide-react'
import { useChildren } from '@/hooks/useChildren'
import { usePlaylists, useAddVideoIdToPlaylist } from '@/hooks/usePlaylists'
import type { Video } from '@/types/db'
import { cn } from '@/lib/utils'

interface Props {
  video: Video | null
  onClose: () => void
}

export default function AddToPlaylistModal({ video, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const { data: children = [] } = useChildren()
  const { data: playlists = [], isLoading: plLoading } = usePlaylists(selectedChildId ?? undefined)
  const addMut = useAddVideoIdToPlaylist()

  if (!video) return null

  const handleAdd = async (playlistId: string) => {
    if (addedIds.has(playlistId)) return
    try {
      await addMut.mutateAsync({ playlist_id: playlistId, video_id: video.id })
      setAddedIds((prev) => new Set([...prev, playlistId]))
      toast.success(t('playlists.videoAdded'))
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('already')) toast(t('playlists.alreadyAdded'), { icon: 'ℹ️' })
      else toast.error(msg)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-primary" />
            <h2 className="font-bold">{t('feed.addToPlaylist')}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-neutral-200 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video info strip */}
        <div className="flex items-center gap-3 px-5 py-3 bg-neutral-50 border-b border-neutral-200">
          {video.thumbnail_url && (
            <img src={video.thumbnail_url} alt="" className="w-12 aspect-video rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium line-clamp-1">{video.title || 'Video'}</div>
            {video.channel_name && (
              <div className="text-xs text-neutral-700 truncate">{video.channel_name}</div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!selectedChildId ? (
            /* Step 1: Pick a child */
            <div className="p-3 space-y-1">
              <p className="text-xs text-neutral-700 px-2 py-2 font-medium">{t('children.title')}</p>
              {children.map((child) => {
                const ageName = (child as any).age
                  ? lang === 'ar' ? (child as any).age.name_ar : (child as any).age.name_en
                  : null
                return (
                  <button
                    key={child.id}
                    onClick={() => setSelectedChildId(child.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-neutral-100 text-start transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold flex-shrink-0">
                      {child.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{child.name}</div>
                      {ageName && <div className="text-xs text-neutral-700">{ageName}</div>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-700 rtl:rotate-180" />
                  </button>
                )
              })}
              {children.length === 0 && (
                <p className="text-sm text-neutral-700 text-center py-6">{t('children.empty')}</p>
              )}
            </div>
          ) : (
            /* Step 2: Pick a playlist */
            <div className="p-3">
              <button
                onClick={() => setSelectedChildId(null)}
                className="flex items-center gap-1 text-primary text-sm mb-3 hover:underline"
              >
                <ChevronRight className="w-4 h-4 rotate-180 rtl:rotate-0" />
                {children.find((c) => c.id === selectedChildId)?.name}
              </button>
              {plLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : playlists.length === 0 ? (
                <p className="text-sm text-neutral-700 text-center py-6">{t('playlists.empty')}</p>
              ) : (
                <div className="space-y-1">
                  {playlists.map((pl) => {
                    const added = addedIds.has(pl.id)
                    return (
                      <button
                        key={pl.id}
                        onClick={() => handleAdd(pl.id)}
                        disabled={added || addMut.isPending}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-start transition-colors',
                          added ? 'bg-primary/10' : 'hover:bg-neutral-100'
                        )}
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                          added ? 'bg-primary text-white' : 'bg-neutral-200 text-neutral-700'
                        )}>
                          {added
                            ? <Check className="w-5 h-5" />
                            : <ListMusic className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{pl.name}</div>
                          <div className="text-xs text-neutral-700">
                            {t('playlists.videoCount', { count: pl.video_count ?? 0 })}
                          </div>
                        </div>
                        {added && (
                          <span className="text-xs text-primary font-semibold">
                            {t('playlists.added')}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-neutral-200">
          <button onClick={onClose} className="btn-primary w-full">
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
