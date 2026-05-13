import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Pause, Scissors, ChevronRight } from 'lucide-react'
import { extractThumbnails } from '@/lib/video-processor'
import { cn } from '@/lib/utils'

export const MAX_CLIP_SEC = 30

interface Props {
  file: File
  videoDuration: number   // seconds
  onConfirm: (startSec: number, durationSec: number) => void
  onCancel: () => void
}

export default function VideoTrimmer({
  file,
  videoDuration,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation()

  /* ── Video preview ref ── */
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  /* ── Thumbnails ── */
  const [thumbs, setThumbs] = useState<string[]>([])
  useEffect(() => {
    extractThumbnails(file, 14).then(setThumbs)
  }, [file])

  /* ── Trim handles (in seconds) ── */
  const clipSec = Math.min(MAX_CLIP_SEC, videoDuration)
  const [startSec, setStartSec] = useState(0)
  const endSec = Math.min(startSec + clipSec, videoDuration)

  /* ── Playback ── */
  const [playing, setPlaying] = useState(false)
  const [currentSec, setCurrentSec] = useState(0)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.src = objectUrl
    v.load()
    v.currentTime = startSec
  }, [objectUrl, startSec])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      setCurrentSec(v.currentTime)
      if (v.currentTime >= endSec) {
        v.pause()
        v.currentTime = startSec
        setPlaying(false)
      }
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [startSec, endSec])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (playing) {
      v.pause()
      setPlaying(false)
    } else {
      v.currentTime = startSec
      v.play()
      setPlaying(true)
    }
  }

  /* ── Drag logic ── */
  const dragging = useRef<false | 'start'>(false)
  const pointerStart = useRef(0)
  const secAtPointerStart = useRef(0)

  const trackWidthToSec = useCallback((dx: number): number => {
    const track = trackRef.current
    if (!track) return 0
    const ratio = dx / track.getBoundingClientRect().width
    return ratio * videoDuration
  }, [videoDuration])

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = 'start'
    pointerStart.current = e.clientX
    secAtPointerStart.current = startSec
    videoRef.current?.pause()
    setPlaying(false)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - pointerStart.current
    const delta = trackWidthToSec(dx)
    const newStart = Math.max(0, Math.min(
      secAtPointerStart.current + delta,
      videoDuration - clipSec
    ))
    setStartSec(newStart)
    if (videoRef.current) {
      videoRef.current.currentTime = newStart
    }
  }

  const onPointerUp = () => { dragging.current = false }

  /* ── Progress of the playhead inside the clip ── */
  const clipProgress =
    endSec > startSec
      ? Math.max(0, Math.min(1, (currentSec - startSec) / (endSec - startSec)))
      : 0

  /* ── Left/right percentages for the yellow window ── */
  const leftPct = (startSec / videoDuration) * 100
  const rightPct = (endSec / videoDuration) * 100
  const clipWidthPct = rightPct - leftPct

  const clipDuration = endSec - startSec

  return (
    <div className="flex flex-col gap-4">
      {/* Video preview */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          muted={false}
          onEnded={() => setPlaying(false)}
        />
        {/* Play/pause button */}
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center group"
        >
          <div className={cn(
            'w-14 h-14 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white transition-opacity',
            playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          )}>
            {playing
              ? <Pause className="w-7 h-7" fill="white" />
              : <Play className="w-7 h-7 ms-1" fill="white" />}
          </div>
        </button>
      </div>

      {/* Timecode */}
      <div className="flex justify-between text-xs font-mono text-neutral-700 px-1">
        <span>{fmtSec(startSec)}</span>
        <span className="font-bold text-amber-500">
          {fmtSec(clipDuration)} / {MAX_CLIP_SEC}s
        </span>
        <span>{fmtSec(endSec)}</span>
      </div>

      {/* WhatsApp-style filmstrip + trim window */}
      <div className="relative select-none">
        {/* Thumbnail strip */}
        <div
          ref={trackRef}
          className="flex h-14 rounded-xl overflow-hidden relative"
        >
          {thumbs.length > 0
            ? thumbs.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  draggable={false}
                  className="h-full object-cover flex-1"
                  style={{ minWidth: 0 }}
                />
              ))
            : <div className="w-full h-full bg-neutral-300 animate-pulse rounded-xl" />}
        </div>

        {/* Dark overlay: left of clip */}
        <div
          className="absolute inset-y-0 left-0 bg-black/55 rounded-s-xl pointer-events-none"
          style={{ width: `${leftPct}%` }}
        />

        {/* Dark overlay: right of clip */}
        <div
          className="absolute inset-y-0 right-0 bg-black/55 rounded-e-xl pointer-events-none"
          style={{ width: `${100 - rightPct}%` }}
        />

        {/* Yellow selection border */}
        <div
          className="absolute inset-y-0 border-2 border-amber-400 rounded pointer-events-none"
          style={{ left: `${leftPct}%`, width: `${clipWidthPct}%` }}
        >
          {/* Corner handles */}
          <div className="absolute inset-y-0 left-0 w-2 bg-amber-400 rounded-s flex items-center justify-center">
            <div className="w-0.5 h-5 bg-white/70 rounded" />
          </div>
          <div className="absolute inset-y-0 right-0 w-2 bg-amber-400 rounded-e flex items-center justify-center">
            <div className="w-0.5 h-5 bg-white/70 rounded" />
          </div>
        </div>

        {/* Playhead */}
        {playing && (
          <div
            className="absolute inset-y-0 w-0.5 bg-white/90 shadow pointer-events-none"
            style={{ left: `${leftPct + clipProgress * clipWidthPct}%` }}
          />
        )}

        {/* Drag zone — covers the whole clip window */}
        <div
          className="absolute inset-y-0 touch-none cursor-ew-resize"
          style={{ left: `${leftPct}%`, width: `${clipWidthPct}%` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <p className="text-xs text-neutral-700 text-center">
        {t('creator.trim.dragHint')}
      </p>

      {/* Actions */}
      <div className="flex gap-3 mt-2">
        <button type="button" onClick={onCancel} className="btn-outline flex-1">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(startSec, clipDuration)}
          className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
        >
          <Scissors className="w-4 h-4" />
          {t('creator.trim.confirm', { sec: Math.round(clipDuration) })}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
