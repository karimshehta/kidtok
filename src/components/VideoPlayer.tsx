import { useEffect, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getYouTubeEmbedUrl, getYouTubeWatchUrl } from '@/lib/youtube'

interface Props {
  open: boolean
  onClose: () => void
  youtubeId: string | null
  title?: string | null
  channel?: string | null
}

export default function VideoPlayer({ open, onClose, youtubeId, title, channel }: Props) {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)

  // Lock body scroll while player open and handle Escape
  useEffect(() => {
    if (!open) return
    setHasError(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || !youtubeId) return null

  // Use youtube-nocookie + JS API enabled. autoplay=1 starts immediately.
  // rel=0 hides related videos from other channels. modestbranding=1 reduces YT branding.
  // playsinline=1 plays inline on iOS instead of opening native player.
  const embedSrc = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-neutral-900 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 bg-neutral-900 text-white">
          <div className="flex-1 min-w-0 px-2">
            {title && <h3 className="font-semibold truncate">{title}</h3>}
            {channel && <p className="text-xs text-neutral-300 truncate">{channel}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full text-white flex-shrink-0"
            aria-label="close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Player */}
        <div className="relative aspect-video bg-black">
          {hasError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center">
              <p className="mb-4">{t('videos.embedBlocked')}</p>
              <a
                href={getYouTubeWatchUrl(youtubeId)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                {t('videos.openInYouTube')}
              </a>
            </div>
          ) : (
            <iframe
              key={youtubeId}
              src={embedSrc}
              title={title || 'YouTube video player'}
              className="absolute inset-0 w-full h-full"
              frameBorder={0}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              onError={() => setHasError(true)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Helper kept here so callers don't need to know the embed url structure
export { getYouTubeEmbedUrl }
