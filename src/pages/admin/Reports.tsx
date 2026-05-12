import { useTranslation } from 'react-i18next'
import { Flag } from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'

export default function AdminReports() {
  const { t } = useTranslation()
  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag className="w-7 h-7 text-primary" />
            {t('admin.nav.reports')}
          </h1>
        </header>
        <div className="card text-center py-12">
          <div className="text-5xl mb-3">🚧</div>
          <p className="text-neutral-700">User reports management — coming soon.</p>
        </div>
      </div>
    </AdminLayout>
  )
}
