import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAges, useInterests } from '@/hooks/useReference'
import type { Child, Gender } from '@/types/db'
import { cn } from '@/lib/utils'

interface FormData {
  name: string
  gender: Gender | ''
  age_id: number | ''
}

interface Props {
  initial?: Child
  loading?: boolean
  onSubmit: (data: { name: string; gender: Gender | null; age_id: number | null; interest_ids: number[] }) => Promise<void>
  onCancel: () => void
}

export default function ChildForm({ initial, loading, onSubmit, onCancel }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const { data: ages = [] } = useAges()
  const { data: interests = [] } = useInterests()

  const [selectedInterests, setSelectedInterests] = useState<number[]>(
    initial?.interests?.map((i) => i.id) || []
  )

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: initial?.name || '',
      gender: initial?.gender || '',
      age_id: initial?.age_id ?? '',
    },
  })

  useEffect(() => {
    if (initial?.interests) {
      setSelectedInterests(initial.interests.map((i) => i.id))
    }
  }, [initial])

  const toggleInterest = (id: number) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const submit = handleSubmit(async (data) => {
    try {
      await onSubmit({
        name: data.name.trim(),
        gender: data.gender || null,
        age_id: data.age_id === '' ? null : Number(data.age_id),
        interest_ids: selectedInterests,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.errorGeneric'))
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">{t('children.fields.name')}</label>
        <input
          {...register('name', { required: t('common.required') })}
          className="input-field"
          placeholder={t('children.fields.namePlaceholder')}
        />
        {errors.name && <p className="text-danger text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t('children.fields.gender')}</label>
        <div className="grid grid-cols-2 gap-2">
          {(['male', 'female'] as const).map((g) => (
            <label key={g} className="cursor-pointer">
              <input
                type="radio"
                value={g}
                {...register('gender')}
                className="peer sr-only"
              />
              <div className="text-center px-3 py-2 rounded-xl bg-neutral-200 border-2 border-transparent peer-checked:bg-primary/10 peer-checked:border-primary transition-colors font-medium">
                {t(`children.fields.${g}`)}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t('children.fields.age')}</label>
        <select {...register('age_id')} className="input-field">
          <option value="">{t('children.fields.agePlaceholder')}</option>
          {ages.map((a) => (
            <option key={a.id} value={a.id}>
              {lang === 'ar' ? a.name_ar : a.name_en}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t('children.fields.interests')}</label>
        <p className="text-xs text-neutral-700 mb-2">{t('children.fields.interestsHint')}</p>
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => {
            const active = selectedInterests.includes(interest.id)
            return (
              <button
                type="button"
                key={interest.id}
                onClick={() => toggleInterest(interest.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300'
                )}
              >
                {lang === 'ar' ? interest.name_ar : interest.name_en}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-outline flex-1">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}
