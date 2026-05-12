import { useEffect, useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getYouTubeEmbedUrl, getYouTubeWatchUrl } from '@/lib/youtube'

interface Props {
  open: boolean
  onClose: () => void
  // YouTube source (one path)
  youtubeId?: string | null
  // Cloudflare Stream source (another path) — pass either the UID or full HLS URL
  cloudflareUid?: string | null
  hlsUrl?: string | null
  // Metadata
  title?: string | null
  channel?: string | null
}

/**
 * Universal video player modal supporting both YouTube and Cloudflare Stream.
 * Cloudflare's <iframe> embed bundles HLS.js so it works in every browser.
 */
export default function VideoPlayer({
  open,
  onClose,
  youtubeId,
  cloudflareUid,
  hlsUrl,
  title,
  channel,
}: Props) {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)

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

  if (!open) return null

  // Pick the right embed source
  let embedSrc: string | null = null
  let allowList = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'

  if (cloudflareUid) {
    // Cloudflare Stream iframe embed handles HLS automatically.
    // The customer code is part of the HLS URL pattern but the iframe URL is at videodelivery.net (works without customer-code too).
    embedSrc = `https://iframe.cloudflarestream.com/${cloudflareUid}?autoplay=true&controls=true`
  } else if (hlsUrl) {
    // Extract the UID from the HLS URL pattern: https://customer-xxx.cloudflarestream.com/{uid}/manifest/video.m3u8
    const m = hlsUrl.match(/cloudflarestream\.com\/([^/]+)/)
    if (m) {
      embedSrc = `https://iframe.cloudflarestream.com/${m[1]}?autoplay=true&controls=true`
    }
  } else if (youtubeId) {
    embedSrc = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`
  }

  if (!embedSrc) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-neutral-900 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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

        <div className="relative aspect-video bg-black">
          {hasError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center">
              <p className="mb-4">{t('videos.embedBlocked')}</p>
              {youtubeId && (
                <a
                  href={getYouTubeWatchUrl(youtubeId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('videos.openInYouTube')}
                </a>
              )}
            </div>
          ) : (
            <iframe
              key={embedSrc}
              src={embedSrc}
              title={title || 'Video player'}
              className="absolute inset-0 w-full h-full"
              frameBorder={0}
              allow={allowList}
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

export { getYouTubeEmbedUrl }
