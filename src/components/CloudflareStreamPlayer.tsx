/**
 * CloudflareStreamPlayer — direct <video> with HLS.js
 *
 * Bypasses Cloudflare iframe (which had silent audio issues) and plays HLS
 * directly. Full control over mute/volume/playback.
 *
 * Audio policy:
 *  - Browser requires `muted=true` for autoplay
 *  - We start muted, show "tap to unmute" overlay
 *  - On any user interaction, unmute the current video AND mark global flag
 *  - All subsequent videos start unmuted directly
 */
import { useEffect, useRef, useState } from 'react'
import { VolumeX } from 'lucide-react'

let userHasInteracted = false

// Lazy-load hls.js (only when needed)
let hlsModule: any = null
async function getHls() {
  if (hlsModule) return hlsModule
  hlsModule = await import('hls.js')
  return hlsModule.default
}

interface Props {
  uid:       string
  hlsUrl?:   string | null
  isActive:  boolean
  poster?:   string | null
  className?: string
}

export default function CloudflareStreamPlayer({ uid, hlsUrl, isActive, poster, className = '' }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const hlsInstance = useRef<any>(null)
  const [showUnmute, setShowUnmute] = useState(!userHasInteracted)

  // Build HLS URL — prefer prop, else use standard pattern
  // Cloudflare auto-redirects iframe.cloudflarestream.com to the correct customer endpoint
  const manifestUrl = hlsUrl || `https://videodelivery.net/${uid}/manifest/video.m3u8`

  useEffect(() => {
    if (!isActive || !videoRef.current) return
    const video = videoRef.current
    let cancelled = false

    const init = async () => {
      // Safari has native HLS — use it directly
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = manifestUrl
        await tryPlay(video)
        return
      }

      // Chrome/Firefox — need hls.js
      try {
        const Hls = await getHls()
        if (cancelled || !videoRef.current) return
        if (Hls.isSupported()) {
          const h = new Hls({ enableWorker: true, lowLatencyMode: false })
          h.loadSource(manifestUrl)
          h.attachMedia(video)
          hlsInstance.current = h
          h.on(Hls.Events.MANIFEST_PARSED, () => tryPlay(video))
          h.on(Hls.Events.ERROR, (_e: any, data: any) => {
            console.warn('HLS error:', data.type, data.details)
          })
        } else {
          // Final fallback — try as direct file
          video.src = manifestUrl
          await tryPlay(video)
        }
      } catch (e) {
        console.error('hls.js failed to load:', e)
        video.src = manifestUrl
        await tryPlay(video)
      }
    }

    init()

    return () => {
      cancelled = true
      if (hlsInstance.current) {
        try { hlsInstance.current.destroy() } catch {}
        hlsInstance.current = null
      }
    }
  }, [isActive, manifestUrl])

  // Try to play, respecting browser autoplay policy
  const tryPlay = async (video: HTMLVideoElement) => {
    video.muted = !userHasInteracted
    video.volume = 1
    try {
      await video.play()
    } catch {
      // Autoplay blocked — force muted and retry
      video.muted = true
      try { await video.play() } catch {}
    }
  }

  // Handle "tap to unmute"
  const enableSound = () => {
    userHasInteracted = true
    setShowUnmute(false)
    if (videoRef.current) {
      videoRef.current.muted = false
      videoRef.current.volume = 1
      videoRef.current.play().catch(() => {})
    }
  }

  // Global interaction listener — auto-unmute if user interacts elsewhere
  useEffect(() => {
    if (userHasInteracted) { setShowUnmute(false); return }
    const onInteract = () => {
      userHasInteracted = true
      setShowUnmute(false)
      if (videoRef.current) {
        videoRef.current.muted = false
        videoRef.current.volume = 1
      }
    }
    document.addEventListener('click',      onInteract, { once: true })
    document.addEventListener('touchstart', onInteract, { once: true })
    document.addEventListener('wheel',      onInteract, { once: true })
    return () => {
      document.removeEventListener('click',      onInteract)
      document.removeEventListener('touchstart', onInteract)
      document.removeEventListener('wheel',      onInteract)
    }
  }, [])

  if (!isActive) {
    return (
      <div className={`relative bg-black ${className}`}>
        {poster && <img src={poster} alt="" className="w-full h-full object-cover opacity-95" />}
      </div>
    )
  }

  return (
    <div className={`relative bg-black ${className}`}>
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        poster={poster || undefined}
        playsInline
        loop
        autoPlay
        controls={false}
      />

      {showUnmute && (
        <button
          onClick={(e) => { e.stopPropagation(); enableSound() }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-black/85 backdrop-blur text-white px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-2xl border border-white/20"
        >
          <VolumeX className="w-4 h-4" />
          اضغط لتفعيل الصوت
        </button>
      )}
    </div>
  )
}
