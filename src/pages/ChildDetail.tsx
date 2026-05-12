import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { ArrowRight, Plus, Trash2, ListMusic } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import ChildAvatar from '@/components/ChildAvatar'
import Modal from '@/components/Modal'
import { useChild } from '@/hooks/useChildren'
import { usePlaylists, useCreatePlaylist, useDeletePlaylist } from '@/hooks/usePlaylists'

export default function ChildDetail() {
  const { childId } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'

  const { data: child, isLoading: childLoading } = useChild(childId)
  const { data: playlists = [], isLoading: plLoading } = usePlaylists(childId)
  const createMut = useCreatePlaylist()
  const deleteMut = useDeletePlaylist()

  const [addOpen, setAddOpen] = useState(false)

  const handleDelete = async (id: string) => {
    if (!confirm(t('playlists.deleteConfirm'))) return
    try {
      await deleteMut.mutateAsync(id)
      toast.success(t('playlists.deleteSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorGeneric'))
    }
  }

  if (childLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!child) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="text-neutral-700">{t('common.empty')}</p>
          <Link to="/children" className="text-primary font-semibold mt-2 inline-block">
            {t('common.back')}
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Link to="/children" className="inline-flex items-center gap-1 text-primary text-sm mb-4 hover:underline">
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          {t('common.back')}
        </Link>

        {/* Child header */}
        <div className="card mb-6 flex items-center gap-4">
          <ChildAvatar name={child.name} imageUrl={child.image_url} size="xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{child.name}</h1>
            {child.age && (
              <p className="text-neutral-700">{lang === 'ar' ? child.age.name_ar : child.age.name_en}</p>
            )}
            {child.interests && child.interests.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {child.interests.map((i) => (
                  <span key={i.id} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    {lang === 'ar' ? i.name_ar : i.name_en}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{t('playlists.titleFor', { name: child.name })}</h2>
          {playlists.length > 0 && (
            <button onClick={() => setAddOpen(true)} className="btn-primary text-sm inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('playlists.addPlaylist')}
            </button>
          )}
        </div>

        {plLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : playlists.length === 0 ? (
          <div className="card text-center py-10">
            <div className="text-5xl mb-3">🎬</div>
            <h3 className="font-bold mb-1">{t('playlists.emptyTitle')}</h3>
            <p className="text-neutral-700 text-sm mb-4 max-w-sm mx-auto">{t('playlists.emptyBody')}</p>
            <button onClick={() => setAddOpen(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('playlists.createFirst')}
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {playlists.map((p) => (
              <div key={p.id} className="card flex items-center gap-3 group">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white flex-shrink-0">
                  <ListMusic className="w-7 h-7" />
                </div>
                <Link to={`/playlists/${p.id}`} className="flex-1 min-w-0">
                  <h3 className="font-bold truncate">{p.name}</h3>
                  <p className="text-xs text-neutral-700">
                    {t('playlists.videoCount', { count: p.video_count || 0 })}
                  </p>
                </Link>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-2 hover:bg-danger/10 rounded-full text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add playlist modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('playlists.addPlaylist')}>
        <CreatePlaylistForm
          childId={child.id}
          loading={createMut.isPending}
          onSubmit={async (vals) => {
            await createMut.mutateAsync({ child_id: child.id, ...vals })
            toast.success(t('playlists.saveSuccess'))
            setAddOpen(false)
          }}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>
    </AppLayout>
  )
}

interface FormProps {
  childId: string
  loading: boolean
  onSubmit: (vals: { name: string; description?: string }) => Promise<void>
  onCancel: () => void
}

function CreatePlaylistForm({ loading, onSubmit, onCancel }: FormProps) {
  const { t } = useTranslation()
  type F = { name: string; description: string }
  const { register, handleSubmit, formState: { errors } } = useForm<F>()

  return (
    <form
      onSubmit={handleSubmit(async (d) => {
        await onSubmit({ name: d.name.trim(), description: d.description.trim() || undefined })
      })}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium mb-1">{t('playlists.fields.name')}</label>
        <input
          {...register('name', { required: t('common.required') })}
          className="input-field"
          placeholder={t('playlists.fields.namePlaceholder')}
        />
        {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('playlists.fields.description')}</label>
        <textarea
          {...register('description')}
          className="input-field"
          rows={3}
          placeholder={t('playlists.fields.descriptionPlaceholder')}
        />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-outline flex-1">{t('common.cancel')}</button>
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}
