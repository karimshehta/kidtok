import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  Plus,
  Loader2,
  ListMusic,
} from 'lucide-react'
import { usePlaylist, usePlaylistVideos } from '@/hooks/usePlaylists'
import AddToPlaylistModal from '@/components/AddToPlaylistModal'
import CloudflareStreamPlayer from '@/components/CloudflareStreamPlayer'
import { getYouTubeThumbnail } from '@/lib/youtube'
import type { PlaylistVideo } from '@/types/db'
import { cn } from '@/lib/utils'

export default function PlaylistFeed() {
  const { playlistId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'

  const startIndex = Math.max(0, parseInt(params.get('start') || '0', 10))

  const { data: playlist } = usePlaylist(playlistId)
  const { data: videos = [], isLoading } = usePlaylistVideos(playlistId)

  const [activeIdx, setActiveIdx] = useState(startIndex)
  const [muted, setMuted] = useState(false)
  const [showList, setShowList] = useState(false)
  const [addingVideo, setAddingVideo] = useState<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // Observe which snap card is visible
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.idx)
            if (!isNaN(idx)) setActiveIdx(idx)
          }
        })
      },
      { root: container, threshold: [0, 0.6, 1] }
    )
    container.querySelectorAll('[data-pv-item]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [videos.length])

  // Jump to the video the user clicked on first render
  useEffect(() => {
    if (!videos.length || !startIndex) return
    // Wait one frame for the DOM to paint, then scroll
    requestAnimationFrame(() => {
      const el = itemRefs.current[startIndex]
      el?.scrollIntoView({ behavior: 'instant' })
    })
  }, [videos.length, startIndex])

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-white" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      {/* ── Overlay header ── */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
            aria-label="back"
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
          </button>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate max-w-[160px]">
              {playlist?.name || '…'}
            </div>
            <div className="text-white/60 text-xs">
              {activeIdx + 1} / {videos.length}
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {/* Mute toggle */}
          <button
            onClick={() => setMuted((m) => !m)}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
            aria-label="mute"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          {/* Playlist list toggle */}
          <button
            onClick={() => setShowList((s) => !s)}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
            aria-label="playlist"
          >
            <ListMusic className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Main snap-scroll feed ── */}
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {videos.map((pv, idx) => (
          <PlaylistVideoItem
            key={pv.id}
            pv={pv}
            idx={idx}
            isActive={idx === activeIdx}
            muted={muted}
            onAddToPlaylist={setAddingVideo}
            ref={(el) => { itemRefs.current[idx] = el }}
          />
        ))}
      </div>

      {/* ── Pagination dots ── */}
      {videos.length > 1 && (
        <div className="fixed end-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 pointer-events-none">
          {videos.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'w-1 rounded-full transition-all',
                idx === activeIdx ? 'h-6 bg-white' : 'h-1 bg-white/35'
              )}
            />
          ))}
        </div>
      )}

      {/* ── Playlist drawer (slide in from side) ── */}
      {showList && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          onClick={() => setShowList(false)}
        >
          <div
            className="w-72 h-full bg-neutral-900/95 backdrop-blur overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-neutral-900/90 backdrop-blur px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-bold truncate">{playlist?.name}</h3>
              <p className="text-white/50 text-xs mt-0.5">{videos.length} {t('playlists.videoCount', { count: 0 }).replace('0', '')}</p>
            </div>
            <div className="p-2 space-y-1">
              {videos.map((pv, idx) => {
                const isPlaying = idx === activeIdx
                return (
                  <button
                    key={pv.id}
                    onClick={() => {
                      itemRefs.current[idx]?.scrollIntoView({ behavior: 'smooth' })
                      setShowList(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 p-2 rounded-xl text-start transition-colors',
                      isPlaying ? 'bg-primary/30' : 'hover:bg-white/10'
                    )}
                  >
                    <div className="relative w-16 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-neutral-700">
                      {pv.video?.youtube_id && (
                        <img
                          src={getYouTubeThumbnail(pv.video.youtube_id, 'default')}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                      {isPlaying && (
                        <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                          <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center">
                            <Play className="w-2.5 h-2.5 text-primary ms-0.5" fill="currentColor" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-xs font-medium line-clamp-2', isPlaying ? 'text-primary-light' : 'text-white')}>
                        {pv.video?.title || 'Video'}
                      </div>
                      {pv.video?.channel_name && (
                        <div className="text-white/40 text-[10px] truncate mt-0.5">{pv.video.channel_name}</div>
                      )}
                    </div>
                    <div className="text-white/30 text-xs flex-shrink-0">{idx + 1}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    <AddToPlaylistModal video={addingVideo} onClose={() => setAddingVideo(null)} />
    </div>
  )
}

// ============================================================
// Single video snap item
// ============================================================
import { forwardRef } from 'react'

const PlaylistVideoItem = forwardRef<
  HTMLDivElement,
  { pv: PlaylistVideo; idx: number; isActive: boolean; muted: boolean; onAddToPlaylist?: (v: any) => void }
>(function PlaylistVideoItem({ pv, idx, isActive, muted, onAddToPlaylist }, ref) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const video = pv.video
  if (!video) return null

  const ytId = video.youtube_id
  const isCreator = video.source === 'creator'

  // Cloudflare UID from thumbnail URL pattern
  const cfUid = isCreator
    ? video.thumbnail_url?.match(/cloudflarestream\.com\/([^/]+)/)?.[1] || null
    : null

  const embedSrc = isActive
    ? cfUid
      ? null /* handled by CloudflareStreamPlayer */
      : ytId
      ? `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${ytId}`
      : null
    : null

  const thumb = video.thumbnail_url || (ytId ? getYouTubeThumbnail(ytId, 'max') : '')

  const ageName = (video as any).age
    ? lang === 'ar' ? (video as any).age.name_ar : (video as any).age.name_en
    : null

  return (
    <div
      ref={ref}
      data-pv-item
      data-idx={idx}
      className="relative h-[100dvh] w-full snap-start snap-always flex items-center justify-center bg-black"
    >
      {/* Video or thumbnail */}
      <div className="absolute inset-0">
        {isActive && cfUid ? (
          <CloudflareStreamPlayer uid={cfUid} hlsUrl={video.hls_url || video.hls || null} isActive={isActive} poster={thumb} className="absolute inset-0 w-full h-full"
          />
        ) : embedSrc ? (
          <iframe
            key={`${pv.id}-${isActive}`}
            src={embedSrc}
            title={video.title || ''}
            className="absolute inset-0 w-full h-full"
            frameBorder={0}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <img
              src={thumb}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                if (ytId) (e.currentTarget as HTMLImageElement).src = getYouTubeThumbnail(ytId, 'default')
              }}
            />
            <div className="absolute inset-0 bg-black/30" />
            {!isActive && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Play className="w-8 h-8 text-white ms-1" fill="white" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Metadata overlay */}
      <div className="absolute inset-x-0 bottom-0 pb-6 pt-20 px-4 z-10 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none">
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0 text-white">
            {video.channel_name && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {video.channel_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold truncate">{video.channel_name}</span>
                {isCreator && (
                  <span className="text-[10px] bg-primary px-1.5 py-0.5 rounded-full font-semibold">
                    {t('feed.creatorBadge')}
                  </span>
                )}
              </div>
            )}
            {video.title && (
              <p className="text-sm font-medium line-clamp-2 mb-2">{video.title}</p>
            )}
            {ageName && (
              <span className="text-[10px] bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">
                {ageName}
              </span>
            )}
          </div>

          {/* Save button */}
          <div className="flex flex-col gap-3 pointer-events-auto flex-shrink-0">
            <button
              onClick={() => onAddToPlaylist?.(video)}
              className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
              title={t('feed.addToPlaylist')}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
