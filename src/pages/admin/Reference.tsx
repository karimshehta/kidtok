import { useTranslation } from 'react-i18next'
import { Tags, Baby, Sparkles, Loader2 } from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAges, useInterests } from '@/hooks/useReference'

export default function AdminReference() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const { data: ages = [], isLoading: agesLoading } = useAges()
  const { data: interests = [], isLoading: interestsLoading } = useInterests()

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
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Baby className="w-5 h-5 text-primary" />
              {t('children.fields.age')}
            </h2>
            {agesLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-neutral-700" />
            ) : (
              <ul className="space-y-1 text-sm">
                {ages.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-1 border-b border-neutral-300 last:border-0">
                    <span>{lang === 'ar' ? a.name_ar : a.name_en}</span>
                    <span className="text-xs text-neutral-700">{a.min_age}-{a.max_age}</span>
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
          </div>
        </div>

        <p className="text-xs text-neutral-700 text-center mt-6">
          Editing reference data via UI coming soon — for now, edit via Supabase SQL editor.
        </p>
      </div>
    </AdminLayout>
  )
}
