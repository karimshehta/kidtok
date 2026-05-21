/**
 * Full-screen TikTok-style feed used INSIDE child mode.
 * Mounted as an overlay on top of ChildMode (no routing, no nav bar).
 * Keeps the parent's timer visible and stays within the kiosk lock.
 */
import { useEffect, useRef, useState, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Play, Volume2, VolumeX, Loader2, Clock } from 'lucide-react'
import { usePlaylistVideos } from '@/hooks/usePlaylists'
import { formatTime } from '@/hooks/useChildMode'
import { getYouTubeThumbnail } from '@/lib/youtube'
import type { Playlist, PlaylistVideo } from '@/types/db'
import { cn } from '@/lib/utils'

interface Props {
  playlist: Playlist
  startIndex: number
  onClose: () => void
  secondsLeft: number
  limitSeconds: number
}

export default function ChildModePlaylistFeed({
  playlist,
  startIndex,
  onClose,
  secondsLeft,
  limitSeconds,
}: Props) {
  const { t } = useTranslation()
  const { data: videos = [], isLoading } = usePlaylistVideos(playlist.id)

  const [activeIdx, setActiveIdx] = useState(startIndex)
  const [muted, setMuted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // Intersection-based active tracking
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.idx)
            if (!isNaN(idx)) setActiveIdx(idx)
          }
        })
      },
      { root: container, threshold: [0, 0.6, 1] }
    )
    container.querySelectorAll('[data-cf-item]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [videos.length])

  // Scroll to the initially selected video
  useEffect(() => {
    if (!videos.length) return
    requestAnimationFrame(() => {
      itemRefs.current[startIndex]?.scrollIntoView({ behavior: 'instant' })
    })
  }, [videos.length, startIndex])

  const isCritical = secondsLeft <= 60
  const isWarning = secondsLeft > 60 && secondsLeft <= 300

  return (
    <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
          aria-label="back"
        >
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </button>

        <div className="flex items-center gap-2">
          {/* Timer chip */}
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur text-sm font-bold',
            isCritical ? 'bg-red-500/80 text-white' :
            isWarning ? 'bg-amber-500/80 text-white' :
            'bg-black/50 text-white'
          )}>
            <Clock className="w-4 h-4" />
            {formatTime(secondsLeft)}
          </div>

          {/* Mute */}
          <button
            onClick={() => setMuted((m) => !m)}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
            aria-label="mute"
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex-1 bg-black flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-white" />
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-full overflow-y-scroll snap-y snap-mandatory bg-black"
          style={{ scrollbarWidth: 'none' }}
        >
          {videos.map((pv, idx) => (
            <ChildVideoItem
              key={pv.id}
              pv={pv}
              idx={idx}
              isActive={idx === activeIdx}
              muted={muted}
              ref={(el) => { itemRefs.current[idx] = el }}
            />
          ))}
        </div>
      )}

      {/* Pagination dots */}
      {videos.length > 1 && (
        <div className="fixed end-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-1.5 pointer-events-none">
          {videos.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'w-1.5 rounded-full transition-all',
                idx === activeIdx ? 'h-7 bg-white' : 'h-1.5 bg-white/35'
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Single video item (kid-friendly)
// ============================================================
const ChildVideoItem = forwardRef<
  HTMLDivElement,
  { pv: PlaylistVideo; idx: number; isActive: boolean; muted: boolean }
>(function ChildVideoItem({ pv, idx, isActive, muted }, ref) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const video = pv.video
  if (!video) return null

  const ytId = video.youtube_id
  const isCreator = video.source === 'creator'
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
      data-cf-item
      data-idx={idx}
      className="relative h-[100dvh] w-full snap-start snap-always bg-black flex items-center justify-center"
    >
      {/* Video or thumbnail */}
      <div className="absolute inset-0">
        {isActive && cfUid ? (
          <CloudflareStreamPlayer uid={cfUid} hlsUrl={video.hls_url || video.hls || null} isActive={isActive} poster={thumb} className="absolute inset-0 w-full h-full"
          />
        ) : embedSrc ? (
          <iframe
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
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Play className="w-10 h-10 text-white ms-1" fill="white" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Metadata overlay — kid-friendly, big text */}
      <div className="absolute inset-x-0 bottom-0 pb-8 pt-20 px-5 z-10 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none">
        {video.title && (
          <h3 className="text-white text-xl font-extrabold line-clamp-2 mb-2 drop-shadow-lg">
            {video.title}
          </h3>
        )}
        <div className="flex flex-wrap gap-1.5">
          {ageName && (
            <span className="text-xs bg-white/20 backdrop-blur text-white px-2 py-1 rounded-full font-medium">
              {ageName}
            </span>
          )}
          {video.channel_name && (
            <span className="text-xs bg-primary/50 backdrop-blur text-white px-2 py-1 rounded-full font-medium">
              {video.channel_name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
})
