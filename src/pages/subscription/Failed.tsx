import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { XCircle, RefreshCw, ArrowLeft } from 'lucide-react'

export default function SubscriptionFailed() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const reason = params.get('reason')

  return (
    <div className="min-h-[100dvh] bg-neutral-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle className="w-10 h-10 text-danger" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('subscription.failedTitle')}</h1>
        <p className="text-neutral-700 mb-1">{t('subscription.failedBody')}</p>
        {reason && (
          <p className="text-xs text-neutral-700 mb-6 font-mono opacity-60">code: {reason}</p>
        )}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <Link to="/feed" className="btn-outline inline-flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            {t('subscription.backToFeed')}
          </Link>
          <Link to="/subscription" className="btn-primary inline-flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {t('subscription.retry')}
          </Link>
        </div>
      </div>
    </div>
  )
}
