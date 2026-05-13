import { useRef, useState } from 'react'
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
} from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import { useAges, useInterests } from '@/hooks/useReference'
import {
  uploadCreatorVideo,
  validateVideoFile,
  uploadErrorMessage,
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_SIZE_MB,
} from '@/lib/creator-upload'
import { useUserRole, useBecomeCreator } from '@/hooks/useCreator'

type FormFields = {
  title: string
  description: string
  age_id: string
  interest_id: string
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; percent: number }
  | { phase: 'processing' }
  | { phase: 'done'; creatorVideoId: string }

export default function CreatorUpload() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const navigate = useNavigate()

  const { data: role } = useUserRole()
  const becomeCreator = useBecomeCreator()

  const { data: ages = [] } = useAges()
  const { data: interests = [] } = useInterests()

  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const [state, setState] = useState<UploadState>({ phase: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormFields>()

  const isUploading = state.phase === 'uploading' || state.phase === 'processing'

  // ============================================================
  // Not yet a creator? Show the upgrade card instead of the form.
  // ============================================================
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
                try {
                  await becomeCreator.mutateAsync()
                  toast.success(t('creator.becomeSuccess'))
                } catch (err) {
                  toast.error((err as Error).message)
                }
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

  const handleFilePicked = async (f: File) => {
    setFile(null)
    setDuration(null)
    setThumb(null)
    try {
      const { duration } = await validateVideoFile(f)
      setFile(f)
      setDuration(duration)
      // Capture a poster frame
      const url = URL.createObjectURL(f)
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.src = url
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(0.5, video.duration / 2)
      }
      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = (video.videoHeight / video.videoWidth) * 320
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          setThumb(canvas.toDataURL('image/jpeg', 0.7))
        }
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      toast.error(uploadErrorMessage(err, t))
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!file) return
    setState({ phase: 'uploading', percent: 0 })
    try {
      const res = await uploadCreatorVideo(
        file,
        {
          title: values.title.trim(),
          description: values.description.trim() || null,
          age_id: values.age_id ? Number(values.age_id) : null,
          interest_id: values.interest_id ? Number(values.interest_id) : null,
        },
        (percent) => setState({ phase: 'uploading', percent })
      )
      setState({ phase: 'processing' })
      // Small delay so the user sees the "processing" state before we navigate to success
      setTimeout(() => setState({ phase: 'done', creatorVideoId: res.creator_video_id }), 800)
    } catch (err) {
      setState({ phase: 'idle' })
      toast.error(uploadErrorMessage(err, t))
    }
  })

  // ============================================================
  // Success screen
  // ============================================================
  if (state.phase === 'done') {
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
              <Link to="/creator/videos" className="btn-primary text-sm">
                {t('creator.upload.goToMyVideos')}
              </Link>
              <button
                onClick={() => {
                  setFile(null)
                  setDuration(null)
                  setThumb(null)
                  setState({ phase: 'idle' })
                  navigate(0)
                }}
                className="btn-outline text-sm"
              >
                {t('creator.upload.uploadAnother')}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ============================================================
  // Upload form
  // ============================================================
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-xl">
        <h1 className="text-2xl font-bold mb-1">{t('creator.upload.title')}</h1>
        <p className="text-sm text-neutral-700 mb-4">{t('creator.upload.subtitle')}</p>

        {/* Setup reminder — visible only in dev or when env vars might be missing */}
        {import.meta.env.DEV && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Dev mode:</strong> Upload requires Cloudflare secrets in Supabase Edge Functions:
              CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_STREAM_API_TOKEN · CLOUDFLARE_STREAM_CUSTOMER_CODE.
              {' '}<a href="https://github.com/karimshehta/kidtok/blob/main/docs/cloudflare-setup.md"
                target="_blank" rel="noopener noreferrer"
                className="underline inline-flex items-center gap-0.5">
                Setup guide <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          {/* File picker / preview */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFilePicked(f)
              }}
              disabled={isUploading}
            />

            {!file ? (
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
                <div className="aspect-video bg-black flex items-center justify-center">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Film className="w-12 h-12 text-white/40" />
                  )}
                </div>
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-neutral-700">
                      {duration && `${duration.toFixed(1)}s • `}
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-primary hover:underline flex-shrink-0"
                    >
                      {t('creator.upload.replaceFile')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('creator.upload.fields.title')}
            </label>
            <input
              {...register('title', { required: t('common.required'), maxLength: 200 })}
              className="input-field"
              placeholder={t('creator.upload.fields.titlePlaceholder')}
              disabled={isUploading}
            />
            {errors.title && <p className="text-danger text-xs mt-1">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('creator.upload.fields.description')}
            </label>
            <textarea
              {...register('description')}
              rows={2}
              className="input-field"
              placeholder={t('creator.upload.fields.descriptionPlaceholder')}
              disabled={isUploading}
            />
          </div>

          {/* Age + Interest */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('creator.upload.fields.age')}
              </label>
              <select {...register('age_id')} className="input-field" disabled={isUploading}>
                <option value="">{t('creator.upload.fields.agePlaceholder')}</option>
                {ages.map((a) => (
                  <option key={a.id} value={a.id}>
                    {lang === 'ar' ? a.name_ar : a.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {t('creator.upload.fields.interest')}
              </label>
              <select {...register('interest_id')} className="input-field" disabled={isUploading}>
                <option value="">{t('creator.upload.fields.interestPlaceholder')}</option>
                {interests.map((i) => (
                  <option key={i.id} value={i.id}>
                    {lang === 'ar' ? i.name_ar : i.name_en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit / progress */}
          <button
            type="submit"
            disabled={!file || isUploading}
            className="btn-primary w-full inline-flex items-center justify-center gap-2"
          >
            {state.phase === 'uploading' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('creator.upload.uploadingPct', { pct: state.percent })}
              </>
            )}
            {state.phase === 'processing' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('creator.upload.processing')}
              </>
            )}
            {state.phase === 'idle' && (
              <>
                <UploadIcon className="w-4 h-4" />
                {t('creator.upload.submit')}
              </>
            )}
          </button>

          {state.phase === 'uploading' && (
            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${state.percent}%` }}
              />
            </div>
          )}
        </form>

        <p className="text-xs text-neutral-700 text-center mt-6">
          {MAX_VIDEO_DURATION_SEC}s • {MAX_VIDEO_SIZE_MB} MB max
        </p>
      </div>
    </AppLayout>
  )
}
