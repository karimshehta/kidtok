/**
 * CloudflareStreamPlayer — iframe + SDK control
 *
 * Uses the Cloudflare Stream Player SDK to control the iframe player
 * via postMessage WITHOUT reloading on mute toggle.
 *
 * Solves the autoplay/audio chicken-and-egg problem:
 *  1. Initial load uses muted=true (browser policy requires this for autoplay)
 *  2. On any user interaction (click/touch/scroll/swipe), we unmute via SDK
 *  3. Subsequent videos load with muted=false directly
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Volume2, VolumeX } from 'lucide-react'

let sdkPromise: Promise<any> | null = null

function loadStreamSDK(): Promise<any> {
  if (sdkPromise) return sdkPromise
  if ((window as any).Stream) return Promise.resolve((window as any).Stream)
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js'
    s.onload  = () => resolve((window as any).Stream)
    s.onerror = reject
    document.head.appendChild(s)
  })
  return sdkPromise
}

interface Props {
  uid:       string
  isActive:  boolean
  poster?:   string | null
  className?: string
}

// Global flag: once user interacts with page, all videos can have audio
let userHasInteracted = false

function setupGlobalInteractionListener() {
  if (userHasInteracted) return
  const onInteract = () => {
    userHasInteracted = true
    document.removeEventListener('click',      onInteract)
    document.removeEventListener('touchstart', onInteract)
    document.removeEventListener('keydown',    onInteract)
    document.removeEventListener('wheel',      onInteract)
  }
  document.addEventListener('click',      onInteract, { once: true })
  document.addEventListener('touchstart', onInteract, { once: true })
  document.addEventListener('keydown',    onInteract, { once: true })
  document.addEventListener('wheel',      onInteract, { once: true })
}

export default function CloudflareStreamPlayer({ uid, isActive, poster, className = '' }: Props) {
  const iframeRef    = useRef<HTMLIFrameElement>(null)
  const playerRef    = useRef<any>(null)
  const [muted, setMuted]               = useState(!userHasInteracted)
  const [showUnmute, setShowUnmute]     = useState(!userHasInteracted)

  useEffect(() => { setupGlobalInteractionListener() }, [])

  // Init Stream SDK when iframe mounts
  useEffect(() => {
    if (!isActive || !iframeRef.current) return
    let cancelled = false
    loadStreamSDK().then((Stream: any) => {
      if (cancelled || !iframeRef.current) return
      try {
        const p = Stream(iframeRef.current)
        playerRef.current = p
        p.muted = muted
        p.play().catch(() => {})
      } catch {}
    }).catch(() => {})
    return () => { cancelled = true; playerRef.current = null }
  }, [isActive])

  // Enable sound — called on user click
  const enableSound = useCallback(() => {
    userHasInteracted = true
    setMuted(false)
    setShowUnmute(false)
    try { if (playerRef.current) playerRef.current.muted = false } catch {}
  }, [])

  // If user interacted globally (e.g. from another video), unmute this one too
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      if (userHasInteracted && muted) {
        setMuted(false)
        setShowUnmute(false)
        try { if (playerRef.current) playerRef.current.muted = false } catch {}
      }
    }, 200)
    return () => clearInterval(id)
  }, [isActive, muted])

  if (!isActive) {
    return (
      <div className={`relative bg-black ${className}`}>
        {poster && <img src={poster} alt="" className="w-full h-full object-cover opacity-95" />}
      </div>
    )
  }

  // Initial muted state for autoplay (browser policy)
  const initialMuted = !userHasInteracted ? 'true' : 'false'
  const src = `https://iframe.cloudflarestream.com/${uid}?autoplay=true&muted=${initialMuted}&controls=false&loop=true&preload=auto`

  return (
    <div className={`relative bg-black ${className}`}>
      <iframe
        ref={iframeRef}
        src={src}
        title="Video"
        className="absolute inset-0 w-full h-full"
        frameBorder={0}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      />

      {/* Tap-to-unmute overlay (only when muted on first video) */}
      {showUnmute && (
        <button
          onClick={(e) => { e.stopPropagation(); enableSound() }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-black/80 backdrop-blur text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-xl animate-pulse"
        >
          <VolumeX className="w-4 h-4" />
          اضغط لتفعيل الصوت
        </button>
      )}
    </div>
  )
}
