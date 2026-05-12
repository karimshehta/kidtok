import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight } from 'lucide-react'
import AppLayout from '@/components/AppLayout'

export default function Statistics() {
  const { childId } = useParams()
  const { t } = useTranslation()
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Link to={`/children/${childId}`} className="inline-flex items-center gap-1 text-primary text-sm mb-4 hover:underline">
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          {t('common.back')}
        </Link>
        <h1 className="text-2xl font-bold mb-4">{t('children.viewStats')}</h1>
        <div className="card text-center py-12">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-neutral-700">{t('common.loading')}</p>
        </div>
      </div>
    </AppLayout>
  )
}
