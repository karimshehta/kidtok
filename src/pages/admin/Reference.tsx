import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tags, Baby, Sparkles, Loader2, Plus, Pencil, Trash2, X, Save } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import AdminLayout from '@/components/AdminLayout'
import { useAges, useInterests } from '@/hooks/useReference'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'
import type { Age } from '@/types/db'

type AgeForm = {
  id?:         number
  name_ar:     string
  name_en:     string
  min_age:     number
  max_age:     number
  sort_order:  number
}

const emptyAge: AgeForm = { name_ar: '', name_en: '', min_age: 0, max_age: 0, sort_order: 0 }

export default function AdminReference() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const ar = lang === 'ar'
  const qc = useQueryClient()
  const { data: ages = [], isLoading: agesLoading } = useAges()
  const { data: interests = [], isLoading: interestsLoading } = useInterests()

  const [editingAge, setEditingAge] = useState<AgeForm | null>(null)

  const saveAge = useMutation({
    mutationFn: async (form: AgeForm) => {
      if (!form.name_ar.trim() || !form.name_en.trim()) {
        throw new Error(ar ? 'الاسم بالعربية والإنجليزية مطلوبان' : 'Arabic and English names are required')
      }
      if (form.max_age < form.min_age) {
        throw new Error(ar ? 'العمر الأعلى لا يصح أن يكون أقل من الأدنى' : 'Max age cannot be less than min age')
      }
      const payload = {
        name_ar:    form.name_ar.trim(),
        name_en:    form.name_en.trim(),
        min_age:    Math.max(0, Math.floor(form.min_age)),
        max_age:    Math.max(0, Math.floor(form.max_age)),
        sort_order: Math.floor(form.sort_order || 0),
      }
      if (form.id) {
        const { error } = await supabase.from('ages').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ages').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ages'] })
      setEditingAge(null)
      toast.success(ar ? 'تم الحفظ' : 'Saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteAge = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('ages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ages'] })
      toast.success(ar ? 'تم الحذف' : 'Deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleDelete = (age: Age) => {
    const label = lang === 'ar' ? age.name_ar : age.name_en
    if (!window.confirm(ar ? `حذف "${label}"؟` : `Delete "${label}"?`)) return
    deleteAge.mutate(age.id)
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tags className="w-7 h-7 text-primary" />
            {t('admin.nav.reference')}
          </h1>
        </header>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold flex items-center gap-2">
                <Baby className="w-5 h-5 text-primary" />
                {t('children.fields.age')}
              </h2>
              <button
                type="button"
                onClick={() => setEditingAge({ ...emptyAge })}
                className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                {ar ? 'إضافة' : 'Add'}
              </button>
            </div>

            {agesLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-neutral-700" />
            ) : ages.length === 0 ? (
              <p className="text-sm text-neutral-700">{ar ? 'لا توجد أعمار' : 'No ages yet'}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ages.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-neutral-300 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{lang === 'ar' ? a.name_ar : a.name_en}</div>
                      <div className="text-xs text-neutral-700">{a.min_age}–{a.max_age}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingAge({
                        id: a.id, name_ar: a.name_ar, name_en: a.name_en,
                        min_age: a.min_age, max_age: a.max_age, sort_order: a.sort_order || 0,
                      })}
                      className="p-1.5 hover:bg-neutral-200 rounded"
                      title={ar ? 'تعديل' : 'Edit'}
                    >
                      <Pencil className="w-4 h-4 text-neutral-700" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      className="p-1.5 hover:bg-red-100 rounded"
                      disabled={deleteAge.isPending}
                      title={ar ? 'حذف' : 'Delete'}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-secondary" />
              {t('children.fields.interests')}
            </h2>
            {interestsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-neutral-700" />
            ) : (
              <ul className="space-y-1 text-sm">
                {interests.map((i) => (
                  <li key={i.id} className="py-1 border-b border-neutral-300 last:border-0">
                    {lang === 'ar' ? i.name_ar : i.name_en}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-neutral-700 mt-3">
              {ar ? 'إدارة الاهتمامات لاحقاً' : 'Interests management coming soon'}
            </p>
          </div>
        </div>
      </div>

      {/* Age edit modal */}
      {editingAge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">
                {editingAge.id ? (ar ? 'تعديل العمر' : 'Edit age') : (ar ? 'إضافة عمر' : 'Add age')}
              </h3>
              <button onClick={() => setEditingAge(null)} className="p-1 hover:bg-neutral-200 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-700 block mb-1">{ar ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                <input
                  className="input w-full"
                  value={editingAge.name_ar}
                  onChange={(e) => setEditingAge({ ...editingAge, name_ar: e.target.value })}
                  placeholder={ar ? 'مثال: 3-5 سنوات' : 'e.g. 3-5 years'}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-700 block mb-1">{ar ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                <input
                  className="input w-full"
                  value={editingAge.name_en}
                  onChange={(e) => setEditingAge({ ...editingAge, name_en: e.target.value })}
                  placeholder="e.g. 3-5 years"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-700 block mb-1">{ar ? 'العمر الأدنى' : 'Min age'}</label>
                  <input
                    type="number"
                    min={0}
                    className="input w-full"
                    value={editingAge.min_age}
                    onChange={(e) => setEditingAge({ ...editingAge, min_age: Number(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-700 block mb-1">{ar ? 'العمر الأعلى' : 'Max age'}</label>
                  <input
                    type="number"
                    min={0}
                    className="input w-full"
                    value={editingAge.max_age}
                    onChange={(e) => setEditingAge({ ...editingAge, max_age: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-700 block mb-1">{ar ? 'ترتيب العرض' : 'Sort order'}</label>
                <input
                  type="number"
                  className="input w-full"
                  value={editingAge.sort_order}
                  onChange={(e) => setEditingAge({ ...editingAge, sort_order: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setEditingAge(null)}
                className="flex-1 btn-secondary"
                disabled={saveAge.isPending}
              >
                {ar ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => saveAge.mutate(editingAge)}
                disabled={saveAge.isPending}
                className="flex-1 btn-primary inline-flex items-center justify-center gap-2"
              >
                {saveAge.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {ar ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
