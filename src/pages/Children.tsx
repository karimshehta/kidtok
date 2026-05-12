import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Plus, ListMusic, BarChart3, Edit2, Trash2, MoreVertical } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import ChildAvatar from '@/components/ChildAvatar'
import Modal from '@/components/Modal'
import ChildForm from '@/components/ChildForm'
import { useChildren, useCreateChild, useUpdateChild, useDeleteChild } from '@/hooks/useChildren'
import type { Child } from '@/types/db'

export default function Children() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const { data: children = [], isLoading } = useChildren()

  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Child | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const createMut = useCreateChild()
  const deleteMut = useDeleteChild()

  const handleDelete = async (child: Child) => {
    if (!confirm(t('children.deleteConfirm'))) return
    try {
      await deleteMut.mutateAsync(child.id)
      toast.success(t('children.deleteSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorGeneric'))
    }
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{t('children.title')}</h1>
          {children.length > 0 && (
            <button onClick={() => setAddOpen(true)} className="btn-primary text-sm inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {t('children.addChild')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : children.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-6xl mb-4">👶</div>
            <h2 className="text-lg font-bold mb-2">{t('children.emptyTitle')}</h2>
            <p className="text-neutral-700 text-sm mb-6 max-w-sm mx-auto">{t('children.emptyBody')}</p>
            <button onClick={() => setAddOpen(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {t('children.addFirst')}
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {children.map((child) => (
              <div key={child.id} className="card relative">
                <div className="flex items-center gap-4">
                  <ChildAvatar name={child.name} imageUrl={child.image_url} size="lg" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg truncate">{child.name}</h3>
                    {child.age && (
                      <p className="text-sm text-neutral-700">
                        {lang === 'ar' ? child.age.name_ar : child.age.name_en}
                      </p>
                    )}
                    {child.interests && child.interests.length > 0 && (
                      <p className="text-xs text-neutral-700 mt-1 truncate">
                        {child.interests.map((i) => (lang === 'ar' ? i.name_ar : i.name_en)).join(' • ')}
                      </p>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === child.id ? null : child.id)}
                      className="p-2 hover:bg-neutral-200 rounded-full"
                      aria-label="menu"
                    >
                      <MoreVertical className="w-5 h-5 text-neutral-700" />
                    </button>
                    {menuOpenId === child.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute end-0 top-full mt-1 bg-white border border-neutral-300 rounded-xl shadow-lg overflow-hidden z-20 min-w-[140px]">
                          <button
                            onClick={() => {
                              setMenuOpenId(null)
                              setEditing(child)
                            }}
                            className="w-full text-start px-3 py-2 text-sm hover:bg-neutral-200 flex items-center gap-2"
                          >
                            <Edit2 className="w-4 h-4" />
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpenId(null)
                              handleDelete(child)
                            }}
                            className="w-full text-start px-3 py-2 text-sm text-danger hover:bg-danger/5 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            {t('common.delete')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  <Link
                    to={`/children/${child.id}`}
                    className="btn-outline text-sm inline-flex items-center justify-center gap-1 !py-2"
                  >
                    <ListMusic className="w-4 h-4" />
                    {t('children.viewPlaylists')}
                  </Link>
                  <Link
                    to={`/statistics/${child.id}`}
                    className="btn-outline text-sm inline-flex items-center justify-center gap-1 !py-2"
                  >
                    <BarChart3 className="w-4 h-4" />
                    {t('children.viewStats')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={t('children.addChild')}>
        <ChildForm
          loading={createMut.isPending}
          onSubmit={async (data) => {
            await createMut.mutateAsync(data)
            toast.success(t('children.saveSuccess'))
            setAddOpen(false)
          }}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('children.editChild')}>
        {editing && <EditChildFormWrapper child={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </AppLayout>
  )
}

function EditChildFormWrapper({ child, onDone }: { child: Child; onDone: () => void }) {
  const { t } = useTranslation()
  const updateMut = useUpdateChild(child.id)
  return (
    <ChildForm
      initial={child}
      loading={updateMut.isPending}
      onSubmit={async (data) => {
        await updateMut.mutateAsync(data)
        toast.success(t('children.saveSuccess'))
        onDone()
      }}
      onCancel={onDone}
    />
  )
}
