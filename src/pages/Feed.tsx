import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Play, Volume2, VolumeX, Sparkles, Plus, Loader2 } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import { FeedAdCard } from '@/components/AdSlot'
import { useFeedVideos } from '@/hooks/useFeed'
import { useAds, useAdSenseScript } from '@/hooks/useAds'
import { getYouTubeThumbnail } from '@/lib/youtube'
import type { Video } from '@/types/db'
import { cn } from '@/lib/utils'

type FeedItem =
  | { type: 'video'; video: Video; displayIdx: number }
  | { type: 'ad'; displayIdx: number }

export default function Feed() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: videos = [], isLoading } = useFeedVideos()
  const { showAds, publisherId, feedUnitId, adFrequency } = useAds()
  const [activeIdx, setActiveIdx] = useState(0)
  const [muted, setMuted] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  // Inject AdSense script once when enabled
  useAdSenseScript(publisherId, showAds)

  // Build interleaved feed: every adFrequency videos, insert an ad card
  const feedItems: FeedItem[] = []
  videos.forEach((video, i) => {
    feedItems.push({ type: 'video', video, displayIdx: feedItems.length })
    if (showAds && feedUnitId && adFrequency > 0 && (i + 1) % adFrequency === 0) {
      feedItems.push({ type: 'ad', displayIdx: feedItems.length })
    }
  })

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
    container.querySelectorAll('[data-feed-item]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [feedItems.length])

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (feedItems.length === 0) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-12 max-w-md text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-xl font-bold mb-2">{t('feed.emptyTitle')}</h1>
          <p className="text-sm text-neutral-700">{t('feed.emptyBody')}</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <div className="h-[100dvh] bg-black overflow-hidden">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={() => navigate('/feed')} className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">K</div>
          <span className="text-lg font-bold text-white">{t('common.appName')}</span>
        </button>
        <button
          onClick={() => setMuted((m) => !m)}
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
          aria-label="mute"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Scrollable feed */}
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {feedItems.map((item) =>
          item.type === 'ad' ? (
            <FeedAdCard
              key={`ad-${item.displayIdx}`}
              idx={item.displayIdx}
              unitId={feedUnitId}
              publisherId={publisherId}
              onSubscribeClick={() => navigate('/subscription')}
            />
          ) : (
            <FeedVideoItem
              key={item.video.id}
              video={item.video}
              idx={item.displayIdx}
              isActive={item.displayIdx === activeIdx}
              muted={muted}
            />
          )
        )}
      </div>

      {/* Pagination dots */}
      {feedItems.length > 1 && (
        <div className="fixed end-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
          {feedItems.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'w-1.5 rounded-full transition-all',
                idx === activeIdx ? 'h-8 bg-white' : 'h-1.5 bg-white/40'
              )}
            />
          ))}
        </div>
      )}

      <FeedBottomNav />
    </div>
  )
}

// ============================================================
// Single video snap item
// ============================================================
function FeedVideoItem({
  video,
  idx,
  isActive,
  muted,
}: {
  video: Video
  idx: number
  isActive: boolean
  muted: boolean
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'

  const isYouTube = video.source === 'youtube' && video.youtube_id
  const isCreator = video.source === 'creator'

  const ageName = (video as any).age
    ? lang === 'ar' ? (video as any).age.name_ar : (video as any).age.name_en
    : null
  const interestName = (video as any).interest
    ? lang === 'ar' ? (video as any).interest.name_ar : (video as any).interest.name_en
    : null

  const youtubeEmbed = isYouTube
    ? `https://www.youtube-nocookie.com/embed/${video.youtube_id}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${video.youtube_id}`
    : null
  const cloudflareUid = isCreator
    ? video.thumbnail_url?.match(/cloudflarestream\.com\/([^/]+)/)?.[1] || null
    : null
  const cloudflareEmbed = cloudflareUid
    ? `https://iframe.cloudflarestream.com/${cloudflareUid}?autoplay=true&muted=${muted ? 'true' : 'false'}&controls=false&loop=true`
    : null

  return (
    <div
      data-feed-item
      data-idx={idx}
      className="relative h-[100dvh] w-full snap-start snap-always flex items-center justify-center"
    >
      <div className="absolute inset-0">
        {isActive && (youtubeEmbed || cloudflareEmbed) ? (
          <iframe
            src={youtubeEmbed || cloudflareEmbed!}
            title={video.title || ''}
            className="absolute inset-0 w-full h-full"
            frameBorder={0}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0">
            <img
              src={video.thumbnail_url || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id, 'max') : '')}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                if (video.youtube_id) {
                  (e.currentTarget as HTMLImageElement).src = getYouTubeThumbnail(video.youtube_id, 'hq')
                }
              }}
            />
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Play className="w-10 h-10 text-white ms-1" fill="white" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 pb-24 pt-16 px-4 z-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0 text-white">
            {video.channel_name && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold">
                  {video.channel_name.charAt(0).toUpperCase()}
                </div>
                <span className="font-semibold text-sm truncate">{video.channel_name}</span>
                {isCreator && (
                  <span className="px-2 py-0.5 rounded-full bg-primary text-[10px] font-semibold">
                    {t('feed.creatorBadge')}
                  </span>
                )}
              </div>
            )}
            {video.title && <h3 className="text-base font-medium line-clamp-2 mb-2">{video.title}</h3>}
            <div className="flex flex-wrap gap-1.5">
              {ageName && (
                <span className="text-[10px] bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">{ageName}</span>
              )}
              {interestName && (
                <span className="text-[10px] bg-white/15 backdrop-blur px-2 py-0.5 rounded-full">{interestName}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 pointer-events-auto">
            <button
              type="button"
              className={cn(
                'w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur',
                'flex items-center justify-center text-white shadow-lg transition-colors'
              )}
              title={t('feed.addToPlaylist')}
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Bottom nav
// ============================================================
import { Link } from 'react-router-dom'

function FeedBottomNav() {
  const { t } = useTranslation()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-2 px-4 pointer-events-none">
      <div className="container mx-auto max-w-md flex items-center justify-around pointer-events-auto">
        <Link to="/feed" className="flex flex-col items-center gap-1 px-4 py-2 text-white">
          <Sparkles className="w-6 h-6" />
          <span className="text-[10px] font-medium">{t('nav.feed')}</span>
        </Link>
        <Link to="/children" className="flex flex-col items-center gap-1 px-4 py-2 text-white/70">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 100-8 4 4 0 000 8zm6 2a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          <span className="text-[10px] font-medium">{t('nav.children')}</span>
        </Link>
        <Link to="/profile" className="flex flex-col items-center gap-1 px-4 py-2 text-white/70">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[10px] font-medium">{t('nav.profile')}</span>
        </Link>
      </div>
    </nav>
  )
}
