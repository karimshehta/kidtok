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
const MIN_CLIP_SEC = 1

interface Props {
  file: File
  videoDuration: number
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

  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  const [thumbs, setThumbs] = useState<string[]>([])
  useEffect(() => {
    extractThumbnails(file, 14).then(setThumbs)
  }, [file])

  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(Math.min(MAX_CLIP_SEC, videoDuration))
  const clipDuration = Math.max(MIN_CLIP_SEC, endSec - startSec)

  useEffect(() => {
    setStartSec(0)
    setEndSec(Math.min(MAX_CLIP_SEC, videoDuration))
  }, [file, videoDuration])

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

  const dragging = useRef<false | 'window' | 'start' | 'end'>(false)
  const pointerStart = useRef(0)
  const startAtPointerStart = useRef(0)
  const endAtPointerStart = useRef(0)

  const trackWidthToSec = useCallback((dx: number): number => {
    const track = trackRef.current
    if (!track) return 0
    const ratio = dx / track.getBoundingClientRect().width
    return ratio * videoDuration
  }, [videoDuration])

  const beginDrag = (e: React.PointerEvent, handle: 'window' | 'start' | 'end') => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = handle
    pointerStart.current = e.clientX
    startAtPointerStart.current = startSec
    endAtPointerStart.current = endSec
    videoRef.current?.pause()
    setPlaying(false)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = trackWidthToSec(e.clientX - pointerStart.current)
    const initialStart = startAtPointerStart.current
    const initialEnd = endAtPointerStart.current
    const initialClip = initialEnd - initialStart

    if (dragging.current === 'window') {
      const newStart = clamp(initialStart + delta, 0, videoDuration - initialClip)
      setStartSec(newStart)
      setEndSec(newStart + initialClip)
      if (videoRef.current) videoRef.current.currentTime = newStart
      return
    }

    if (dragging.current === 'start') {
      const newStart = clamp(initialStart + delta, Math.max(0, initialEnd - MAX_CLIP_SEC), initialEnd - MIN_CLIP_SEC)
      setStartSec(newStart)
      if (videoRef.current) videoRef.current.currentTime = newStart
      return
    }

    const newEnd = clamp(initialEnd + delta, initialStart + MIN_CLIP_SEC, Math.min(videoDuration, initialStart + MAX_CLIP_SEC))
    setEndSec(newEnd)
  }

  const endDrag = () => { dragging.current = false }

  const clipProgress =
    endSec > startSec
      ? clamp((currentSec - startSec) / (endSec - startSec), 0, 1)
      : 0

  const leftPct = (startSec / videoDuration) * 100
  const rightPct = (endSec / videoDuration) * 100
  const clipWidthPct = rightPct - leftPct

  return (
    <div className="flex flex-col gap-4">
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          muted={false}
          onEnded={() => setPlaying(false)}
        />
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

      <div className="flex justify-between text-xs font-mono text-neutral-700 px-1">
        <span>{fmtSec(startSec)}</span>
        <span className="font-bold text-amber-500">
          {fmtSec(clipDuration)} / {MAX_CLIP_SEC}s
        </span>
        <span>{fmtSec(endSec)}</span>
      </div>

      <div className="relative select-none">
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

        <div
          className="absolute inset-y-0 left-0 bg-black/55 rounded-s-xl pointer-events-none"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/55 rounded-e-xl pointer-events-none"
          style={{ width: `${100 - rightPct}%` }}
        />

        <div
          className="absolute inset-y-0 border-2 border-amber-400 rounded pointer-events-none"
          style={{ left: `${leftPct}%`, width: `${clipWidthPct}%` }}
        >
          <div
            className="absolute inset-y-0 left-0 z-20 w-3 bg-amber-400 rounded-s flex items-center justify-center pointer-events-auto touch-none cursor-ew-resize"
            onPointerDown={(e) => beginDrag(e, 'start')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="w-0.5 h-5 bg-white/70 rounded" />
          </div>
          <div
            className="absolute inset-y-0 right-0 z-20 w-3 bg-amber-400 rounded-e flex items-center justify-center pointer-events-auto touch-none cursor-ew-resize"
            onPointerDown={(e) => beginDrag(e, 'end')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="w-0.5 h-5 bg-white/70 rounded" />
          </div>
        </div>

        {playing && (
          <div
            className="absolute inset-y-0 w-0.5 bg-white/90 shadow pointer-events-none"
            style={{ left: `${leftPct + clipProgress * clipWidthPct}%` }}
          />
        )}

        <div
          className="absolute inset-y-0 z-10 touch-none cursor-grab active:cursor-grabbing"
          style={{ left: `${leftPct}%`, width: `${clipWidthPct}%` }}
          onPointerDown={(e) => beginDrag(e, 'window')}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>

      <p className="text-xs text-neutral-700 text-center">
        {t('creator.trim.dragHint')}
      </p>

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
