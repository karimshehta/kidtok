import { useTranslation } from 'react-i18next'
import { CreditCard } from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'

export default function AdminPlans() {
  const { t } = useTranslation()
  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-primary" />
            {t('admin.nav.plans')}
          </h1>
        </header>
        <div className="card text-center py-12">
          <div className="text-5xl mb-3">🚧</div>
          <p className="text-neutral-700">Coming soon — once the Paymob integration ships, plan editing will live here.</p>
        </div>
      </div>
    </AdminLayout>
  )
}
