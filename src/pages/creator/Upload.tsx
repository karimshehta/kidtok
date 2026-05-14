/**
 * Creator upload flow:
 *
 * 1. Pick file  →  validate (type, size)
 * 2. If duration > 30s  →  Trimmer screen (WhatsApp-style)
 * 3. Compress (FFmpeg.wasm: trim + re-encode to 720p)
 * 4. Upload the processed file directly to Cloudflare Stream
 * 5. Success screen
 */
import { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  Upload as UploadIcon,
  Film,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Scissors,
  Zap,
} from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import VideoTrimmer, { MAX_CLIP_SEC } from '@/components/VideoTrimmer'
import { useAges, useInterests } from '@/hooks/useReference'
import { useUserRole, useBecomeCreator } from '@/hooks/useCreator'
import {
  validateVideoFile,
  getVideoDuration,
  uploadErrorMessage,
  MAX_VIDEO_SIZE_MB,
  ACCEPTED_VIDEO_TYPES,
} from '@/lib/creator-upload'
import { processVideo, type ProgressCallback } from '@/lib/video-processor'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type FormFields = { title: string; description: string; age_id: string; interest_id: string }

type Stage =
  | 'idle'          // file not picked yet
  | 'trimming'      // duration > 30s → show WhatsApp trimmer
  | 'confirming'    // metadata form (after trim or if ≤ 30s)
  | 'processing'    // FFmpeg compress + trim running
  | 'uploading'     // pushing to Cloudflare
  | 'done'          // success

interface FileState {
  raw: File            // original file
  duration: number     // seconds
  thumb: string | null // poster frame data-url
  startSec: number     // chosen trim start
  clipSec: number      // chosen clip length (≤ 30)
}

export default function CreatorUpload() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const navigate = useNavigate()

  const { data: role } = useUserRole()
  const becomeCreator = useBecomeCreator()
  const { data: ages = [] } = useAges()
  const { data: interests = [] } = useInterests()

  const [stage, setStage] = useState<Stage>('idle')
  const [fileState, setFileState] = useState<FileState | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState<'loading' | 'trimming' | 'compressing'>('loading')
  const [progressFile, setProgressFile] = useState<File | null>(null) // after processing
  const [creatorVideoId, setCreatorVideoId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const { register, handleSubmit, formState: { errors } } = useForm<FormFields>()

  // ── Become creator card ──
  if (role === 'parent') {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8 max-w-md">
          <div className="card text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold mb-2">{t('creator.becomeTitle')}</h1>
            <p className="text-sm text-neutral-700 mb-6">{t('creator.becomeBody')}</p>
            <button
              onClick={async () => {
                try { await becomeCreator.mutateAsync(); toast.success(t('creator.becomeSuccess')) }
                catch (err) { toast.error((err as Error).message) }
              }}
              disabled={becomeCreator.isPending}
              className="btn-primary w-full"
            >
              {becomeCreator.isPending ? t('common.saving') : t('creator.becomeButton')}
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── Handlers ──

  const handleFilePicked = async (f: File) => {
    // Validate type + size (not duration yet for > 30s — we want to allow trimming)
    if (!ACCEPTED_VIDEO_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|webm|mkv)$/i)) {
      toast.error(t('creator.upload.errors.invalidType')); return
    }
    if (f.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      toast.error(t('creator.upload.errors.fileTooLarge')); return
    }

    let duration = 0
    try { duration = await getVideoDuration(f) }
    catch { toast.error(t('creator.upload.errors.unreadable')); return }

    // Generate poster frame
    let thumb: string | null = null
    try {
      thumb = await getPosterFrame(f)
    } catch { /* non-fatal */ }

    setFileState({ raw: f, duration, thumb, startSec: 0, clipSec: Math.min(duration, MAX_CLIP_SEC) })

    if (duration > MAX_CLIP_SEC + 0.5) {
      setStage('trimming')
    } else {
      setStage('confirming')
    }
  }

  const handleTrimConfirm = (startSec: number, clipSec: number) => {
    setFileState((prev) => prev ? { ...prev, startSec, clipSec } : null)
    setStage('confirming')
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!fileState) return
    setStage('processing')
    setProgress(0)

    // ── 1. Process: trim + compress ──
    let processed: File
    try {
      const onProgress: ProgressCallback = (pct, stageName) => {
        setProgress(pct)
        setProgressStage(stageName)
      }
      const result = await processVideo(
        fileState.raw,
        fileState.startSec,
        fileState.clipSec,
        onProgress
      )
      processed = result.file
      setProgressFile(result.file)
      console.info(
        `[upload] Original ${result.originalSizeMB.toFixed(1)}MB → Processed ${result.outputSizeMB.toFixed(1)}MB (${result.compressionRatio.toFixed(1)}× smaller)`
      )
    } catch (err) {
      setStage('confirming')
      toast.error(`Processing failed: ${(err as Error).message}`)
      return
    }

    // ── 2. Get Cloudflare upload URL ──
    setStage('uploading')
    setProgress(0)
    try {
      const { data, error } = await supabase.functions.invoke('creator-upload-url', {
        body: {
          title: values.title.trim(),
          description: values.description.trim() || null,
          age_id: values.age_id ? Number(values.age_id) : null,
          interest_id: values.interest_id ? Number(values.interest_id) : null,
          max_duration_seconds: MAX_CLIP_SEC,
        },
      })

      if (error) {
        let msg = (error as Error).message
        const ctx = (error as any)?.context
        if (ctx && typeof ctx.json === 'function') {
          try { const b = await ctx.json(); msg = b?.error?.message || msg } catch {}
        }
        throw new Error(msg)
      }
      if (!data?.upload_url) throw new Error('BAD_EDGE_RESPONSE')

      setCreatorVideoId(data.creator_video_id)

      // ── 3. Upload directly to Cloudflare with progress ──
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        })
        xhr.addEventListener('load', () => xhr.status < 400 ? resolve() : reject(new Error(`CF ${xhr.status}`)))
        xhr.addEventListener('error', () => reject(new Error('Network error')))
        const fd = new FormData()
        fd.append('file', processed)
        xhr.open('POST', data.upload_url)
        xhr.send(fd)
      })

      setStage('done')
    } catch (err) {
      setStage('confirming')
      toast.error(uploadErrorMessage(err, t))
    }
  })

  // ── SUCCESS screen ──
  if (stage === 'done') {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-12 max-w-md">
          <div className="card text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-xl font-bold mb-2">{t('creator.upload.successTitle')}</h1>
            <p className="text-sm text-neutral-700 mb-6">{t('creator.upload.successBody')}</p>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/creator/videos" className="btn-primary text-sm">{t('creator.upload.goToMyVideos')}</Link>
              <button onClick={() => { setStage('idle'); setFileState(null); navigate(0) }} className="btn-outline text-sm">
                {t('creator.upload.uploadAnother')}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── PROCESSING screen ──
  if (stage === 'processing') {
    const stageLabel = t(`creator.trim.processingStage.${progressStage}`)
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-12 max-w-md text-center">
          <div className="card">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="font-bold mb-2">{stageLabel}</h2>
            <p className="text-sm text-neutral-700 mb-4">{t('creator.trim.processing', { pct: progress })}</p>
            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {progressFile && progress === 100 && (
              <p className="text-xs text-neutral-700">
                {(progressFile.size / 1024 / 1024).toFixed(1)} MB processed
              </p>
            )}
            {progressStage === 'loading' && (
              <p className="text-xs text-neutral-700 mt-2">
                Loading FFmpeg engine (~24MB). This is a one-time download per session.
              </p>
            )}
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── UPLOADING screen ──
  if (stage === 'uploading') {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-12 max-w-md text-center">
          <div className="card">
            <UploadIcon className="w-12 h-12 text-primary mx-auto mb-4 animate-bounce" />
            <h2 className="font-bold mb-2">{t('creator.upload.uploading')}</h2>
            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-neutral-700 mt-2">{progress}%</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── TRIMMER screen ──
  if (stage === 'trimming' && fileState) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6 max-w-xl">
          <h1 className="text-2xl font-bold mb-1">{t('creator.trim.title')}</h1>
          <p className="text-sm text-neutral-700 mb-4">{t('creator.trim.subtitle')}</p>
          <VideoTrimmer
            file={fileState.raw}
            videoDuration={fileState.duration}
            onConfirm={handleTrimConfirm}
            onCancel={() => { setStage('idle'); setFileState(null) }}
          />
        </div>
      </AppLayout>
    )
  }

  // ── IDLE + CONFIRM form ──
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-xl">
        <h1 className="text-2xl font-bold mb-1">{t('creator.upload.title')}</h1>
        <p className="text-sm text-neutral-700 mb-4">{t('creator.upload.subtitle')}</p>

        {import.meta.env.DEV && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Dev:</strong> Upload requires Cloudflare secrets in Supabase Edge Functions.{' '}
              <a href="https://github.com/karimshehta/kidtok/blob/main/docs/cloudflare-setup.md"
                target="_blank" rel="noopener noreferrer"
                className="underline inline-flex items-center gap-0.5">
                Setup guide <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePicked(f) }}
          />

          {!fileState ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-neutral-300 hover:border-primary rounded-2xl py-10 px-4 text-center transition-colors"
            >
              <Film className="w-10 h-10 mx-auto text-neutral-700 mb-2" />
              <div className="font-medium mb-1">{t('creator.upload.pickFile')}</div>
              <div className="text-xs text-neutral-700">{t('creator.upload.pickFileHint')}</div>
            </button>
          ) : (
            <div className="border border-neutral-300 rounded-2xl overflow-hidden">
              <div className="aspect-video bg-black relative">
                {fileState.thumb ? (
                  <img src={fileState.thumb} alt="" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-10 h-10 text-white/40" />
                  </div>
                )}
                {/* Trim info badge */}
                {fileState.duration > MAX_CLIP_SEC && (
                  <div className="absolute top-2 end-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                    <Scissors className="w-3 h-3" />
                    {Math.round(fileState.startSec)}s - {Math.round(fileState.startSec + fileState.clipSec)}s
                  </div>
                )}
              </div>
              <div className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{fileState.raw.name}</div>
                  <div className="text-xs text-neutral-700 flex items-center gap-2 mt-0.5">
                    <span>{fileState.clipSec.toFixed(1)}s selected</span>
                    <span>-</span>
                    <span>{(fileState.raw.size / 1024 / 1024).toFixed(1)} MB raw</span>
                    <Zap className="w-3 h-3 text-primary" />
                    <span className="text-primary">will compress</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {fileState.duration > MAX_CLIP_SEC && (
                    <button
                      type="button"
                      onClick={() => setStage('trimming')}
                      className="text-xs text-amber-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Scissors className="w-3 h-3" />
                      {t('creator.upload.editTrim')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setStage('idle'); setFileState(null) }}
                    className="text-xs text-neutral-700 hover:underline"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Metadata (only show when a file is selected) */}
          {fileState && stage === 'confirming' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">{t('creator.upload.fields.title')}</label>
                <input
                  {...register('title', { required: t('common.required'), maxLength: 200 })}
                  className="input-field"
                  placeholder={t('creator.upload.fields.titlePlaceholder')}
                />
                {errors.title && <p className="text-danger text-xs mt-1">{errors.title.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('creator.upload.fields.description')}</label>
                <textarea
                  {...register('description')}
                  rows={2}
                  className="input-field"
                  placeholder={t('creator.upload.fields.descriptionPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('creator.upload.fields.age')}</label>
                  <select {...register('age_id')} className="input-field">
                    <option value="">{t('creator.upload.fields.agePlaceholder')}</option>
                    {ages.map((a) => (
                      <option key={a.id} value={a.id}>{lang === 'ar' ? a.name_ar : a.name_en}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('creator.upload.fields.interest')}</label>
                  <select {...register('interest_id')} className="input-field">
                    <option value="">{t('creator.upload.fields.interestPlaceholder')}</option>
                    {interests.map((i) => (
                      <option key={i.id} value={i.id}>{lang === 'ar' ? i.name_ar : i.name_en}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary w-full inline-flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" />
                {t('creator.upload.submit')}
              </button>
            </>
          )}
        </form>

        <p className="text-xs text-neutral-700 text-center mt-6">
          Max {MAX_CLIP_SEC}s - {MAX_VIDEO_SIZE_MB} MB - Auto-compressed to 720p
        </p>
      </div>
    </AppLayout>
  )
}

// ── Helper: capture a poster frame ──
async function getPosterFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = url
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, video.duration / 4)
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = (video.videoHeight / video.videoWidth) * 640
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('failed')) }
  })
}
