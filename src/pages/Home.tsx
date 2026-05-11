import { useTranslation } from 'react-i18next'
import AppLayout from '@/components/AppLayout'

export default function Home() {
  const { t } = useTranslation()
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">{t('content')}</h1>
        <div className="card">
          <p className="text-neutral-700">القائمة الرئيسية - سيتم بناؤها قريبًا</p>
        </div>
      </div>
    </AppLayout>
  )
}
