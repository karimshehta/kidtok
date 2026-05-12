import { useTranslation } from 'react-i18next'
import AppLayout from '@/components/AppLayout'

export default function Subscription() {
  const { t } = useTranslation()
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-4">{t('common.loading')}</h1>
        <div className="card text-center py-12">
          <div className="text-5xl mb-3">💳</div>
          <p className="text-neutral-700">{t('common.loading')}</p>
        </div>
      </div>
    </AppLayout>
  )
}
