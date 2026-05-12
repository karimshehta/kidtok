import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { Plus, Trash2, Search, Play, Sparkles, Filter, Loader2 } from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import Modal from '@/components/Modal'
import VideoPlayer from '@/components/VideoPlayer'
import { useAges, useInterests } from '@/hooks/useReference'
import {
  useAdminSuggestedVideos,
  useAddSuggestedVideo,
  useRemoveSuggestedVideo,
} from '@/hooks/useFeed'
import {
  extractYouTubeId,
  fetchYouTubeOEmbed,
  getYouTubeThumbnail,
} from '@/lib/youtube'
import type { Video } from '@/types/db'

export default function AdminContent() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'

  const [ageFilter, setAgeFilter] = useState<number | undefined>()
  const [interestFilter, setInterestFilter] = useState<number | undefined>()
  const [addOpen, setAddOpen] = useState(false)
  const [playing, setPlaying] = useState<Video | null>(null)

  const { data: ages = [] } = useAges()
  const { data: interests = [] } = useInterests()
  const { data: videos = [], isLoading } = useAdminSuggestedVideos({
    age_id: ageFilter,
    interest_id: interestFilter,
  })
  const removeMut = useRemoveSuggestedVideo()

  const handleRemove = async (id: string) => {
    if (!confirm(t('admin.content.removeConfirm'))) return
    try {
      await removeMut.mutateAsync(id)
      toast.success(t('admin.content.removeSuccess'))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-primary" />
              {t('admin.content.title')}
            </h1>
            <p className="text-neutral-700 text-sm mt-1">{t('admin.content.subtitle')}</p>
          </div>
          <button onClick={() => setAddOpen(true)} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {t('admin.content.addButton')}
          </button>
        </header>

        {/* Filters */}
        <div className="card mb-4 flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-neutral-700" />
          <select
            value={ageFilter ?? ''}
            onChange={(e) => setAgeFilter(e.target.value ? Number(e.target.value) : undefined)}
            className="input-field !py-1.5 !text-sm max-w-[180px]"
          >
            <option value="">{t('admin.content.filters.byAge')} — {t('admin.content.filters.all')}</option>
            {ages.map((a) => (
              <option key={a.id} value={a.id}>{lang === 'ar' ? a.name_ar : a.name_en}</option>
            ))}
          </select>
          <select
            value={interestFilter ?? ''}
            onChange={(e) => setInterestFilter(e.target.value ? Number(e.target.value) : undefined)}
            className="input-field !py-1.5 !text-sm max-w-[180px]"
          >
            <option value="">{t('admin.content.filters.byInterest')} — {t('admin.content.filters.all')}</option>
            {interests.map((i) => (
              <option key={i.id} value={i.id}>{lang === 'ar' ? i.name_ar : i.name_en}</option>
            ))}
          </select>
        </div>

        {/* Videos grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : videos.length === 0 ? (
          <div className="card text-center py-12">
            <Sparkles className="w-12 h-12 mx-auto text-neutral-700 mb-3" />
            <p className="text-neutral-700 mb-4">{t('admin.content.empty')}</p>
            <button onClick={() => setAddOpen(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('admin.content.addButton')}
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((v) => (
              <div key={v.id} className="card p-3 group flex flex-col">
                <button
                  type="button"
                  onClick={() => setPlaying(v)}
                  className="relative aspect-video bg-neutral-300 rounded-lg overflow-hidden mb-3"
                >
                  <img
                    src={v.thumbnail_url || (v.youtube_id ? getYouTubeThumbnail(v.youtube_id) : '')}
                    alt={v.title || ''}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      if (v.youtube_id) {
                        (e.currentTarget as HTMLImageElement).src = getYouTubeThumbnail(v.youtube_id, 'default')
                      }
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-primary ms-1" fill="currentColor" />
                    </div>
                  </div>
                </button>
                <h3 className="font-semibold line-clamp-2 mb-1">{v.title || 'Untitled'}</h3>
                {v.channel_name && (
                  <p className="text-xs text-neutral-700 mb-2 truncate">{v.channel_name}</p>
                )}
                <div className="flex flex-wrap gap-1 mb-3">
                  {(v as any).age && (
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {lang === 'ar' ? (v as any).age.name_ar : (v as any).age.name_en}
                    </span>
                  )}
                  {(v as any).interest && (
                    <span className="text-[10px] bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">
                      {lang === 'ar' ? (v as any).interest.name_ar : (v as any).interest.name_en}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(v.id)}
                  className="mt-auto text-xs text-danger hover:underline inline-flex items-center gap-1 self-start"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('admin.content.addTitle')} size="lg">
        <AddSuggestedForm onDone={() => setAddOpen(false)} />
      </Modal>

      <VideoPlayer
        open={!!playing}
        onClose={() => setPlaying(null)}
        youtubeId={playing?.youtube_id || null}
        title={playing?.title}
        channel={playing?.channel_name}
      />
    </AdminLayout>
  )
}

// ============================================================
// Add suggested video form
// ============================================================
function AddSuggestedForm({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const { data: ages = [] } = useAges()
  const { data: interests = [] } = useInterests()
  const addMut = useAddSuggestedVideo()

  type F = { url: string; title: string; channel: string; age_id: string; interest_id: string }
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<F>()
  const url = watch('url')

  const [preview, setPreview] = useState<{ id: string; title?: string; channel?: string } | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)

  const handleUrlBlur = async () => {
    const id = extractYouTubeId(url || '')
    if (!id) {
      setPreview(null)
      return
    }
    setPreview({ id })
    setFetchingMeta(true)
    try {
      const meta = await fetchYouTubeOEmbed(id)
      if (meta) {
        setPreview({ id, title: meta.title, channel: meta.author_name })
        setValue('title', meta.title)
        setValue('channel', meta.author_name)
      }
    } finally {
      setFetchingMeta(false)
    }
  }

  const onSubmit = handleSubmit(async (d) => {
    try {
      await addMut.mutateAsync({
        url: d.url,
        title: d.title || undefined,
        channel_name: d.channel || undefined,
        age_id: d.age_id ? Number(d.age_id) : null,
        interest_id: d.interest_id ? Number(d.interest_id) : null,
      })
      toast.success(t('admin.content.addSuccess'))
      onDone()
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'INVALID_URL') toast.error(t('videos.invalidUrl'))
      else if (msg === 'ALREADY_SUGGESTED') toast.error(t('videos.alreadyAdded'))
      else toast.error(msg || t('common.errorGeneric'))
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">{t('videos.pasteUrl')}</label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-700" />
          <input
            {...register('url', { required: t('common.required') })}
            onBlur={handleUrlBlur}
            className="input-field ps-10"
            placeholder={t('videos.urlPlaceholder')}
            dir="ltr"
          />
        </div>
        {errors.url && <p className="text-danger text-xs mt-1">{errors.url.message}</p>}
      </div>

      {preview && (
        <div className="border border-neutral-300 rounded-xl overflow-hidden">
          <div className="aspect-video bg-neutral-300">
            <img
              src={getYouTubeThumbnail(preview.id)}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getYouTubeThumbnail(preview.id, 'default')
              }}
            />
          </div>
          {fetchingMeta && (
            <div className="px-3 py-2 text-xs text-neutral-700 inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('videos.fetching')}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">{t('videos.titleLabel')}</label>
        <input
          {...register('title')}
          className="input-field"
          placeholder={t('videos.titlePlaceholder')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t('videos.channelLabel')}</label>
        <input
          {...register('channel')}
          className="input-field"
          placeholder={t('videos.channelPlaceholder')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('children.fields.age')}
          </label>
          <select {...register('age_id')} className="input-field">
            <option value="">{t('children.fields.agePlaceholder')}</option>
            {ages.map((a) => (
              <option key={a.id} value={a.id}>{lang === 'ar' ? a.name_ar : a.name_en}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('children.fields.interests')}
          </label>
          <select {...register('interest_id')} className="input-field">
            <option value="">{t('admin.content.filters.byInterest')}</option>
            {interests.map((i) => (
              <option key={i.id} value={i.id}>{lang === 'ar' ? i.name_ar : i.name_en}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onDone} className="btn-outline flex-1">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={addMut.isPending} className="btn-primary flex-1">
          {addMut.isPending ? t('common.saving') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
