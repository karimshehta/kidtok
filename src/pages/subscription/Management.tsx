import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Crown,
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowUpCircle,
  Clock,
  Sparkles,
  ChevronRight,
  Receipt,
  Loader2,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import AppLayout from '@/components/AppLayout'
import { type ActiveSubscription, usePublicPlans } from '@/hooks/useSubscription'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface Props { sub: ActiveSubscription }

export default function SubscriptionManagement({ sub }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: plans = [] } = usePublicPlans()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const expiresAt = new Date(sub.expires_at)
  const isExpired = expiresAt < new Date()

  const planName = lang === 'ar' ? sub.plan_name_ar : sub.plan_name_en
  const currentPlan = plans.find((p) => p.id === sub.plan_id)

  const features: { key: string; on: boolean }[] = currentPlan
    ? [
        { key: 'noAds', on: !currentPlan.has_ads },
        { key: 'insights', on: currentPlan.has_insights },
        { key: 'games', on: currentPlan.has_games },
        { key: 'freeCourses', on: currentPlan.has_free_courses },
      ]
    : []

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', sub.id)
      if (error) throw error
      toast.success(t('subManage.cancelSuccess'))
      await qc.invalidateQueries({ queryKey: ['my-subscription'] })
      setCancelOpen(false)
      navigate('/subscription')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-lg">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Crown className="w-7 h-7 text-primary" />
          {t('subManage.title')}
        </h1>

        {/* ── Plan card ── */}
        <div className="rounded-3xl overflow-hidden mb-4 bg-gradient-to-br from-primary to-secondary text-white shadow-lg">
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-sm opacity-80 mb-1">{t('subManage.currentPlan')}</div>
                <div className="text-3xl font-extrabold">{planName}</div>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Crown className="w-7 h-7 text-amber-200" />
              </div>
            </div>

            {/* Expiry */}
            <div className={cn(
              'flex items-center gap-2 rounded-2xl px-4 py-2 text-sm',
              isExpired ? 'bg-red-500/30' : sub.days_remaining <= 7 ? 'bg-amber-500/30' : 'bg-white/15 backdrop-blur'
            )}>
              <Calendar className="w-4 h-4 flex-shrink-0" />
              {isExpired ? (
                <span className="font-semibold">{t('subManage.expired')}</span>
              ) : (
                <>
                  <span>{t('subManage.expiresOn')}: {format(expiresAt, 'dd MMM yyyy')}</span>
                  <span className="ms-auto font-bold">
                    {t('subManage.daysLeft', { days: sub.days_remaining })}
                  </span>
                </>
              )}
            </div>

            {/* Amount paid */}
            {sub.paid_amount && (
              <div className="mt-3 text-sm opacity-80">
                {sub.paid_amount} {sub.paid_currency || 'EGP'} / {t('subscription.perMonth')}
              </div>
            )}
          </div>

          {/* Progress bar of days remaining */}
          {!isExpired && currentPlan && (
            <div className="px-6 pb-4">
              <div className="w-full h-1.5 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full"
                  style={{
                    width: `${Math.max(5, Math.min(100, (sub.days_remaining / (currentPlan.duration_days || 30)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Features ── */}
        {features.length > 0 && (
          <div className="card mb-4">
            <h2 className="font-semibold mb-3">{t('subManage.features')}</h2>
            <div className="space-y-2">
              {features.map((f) => (
                <div key={f.key} className="flex items-center gap-3 text-sm">
                  {f.on
                    ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    : <XCircle className="w-5 h-5 text-neutral-300 flex-shrink-0" />}
                  <span className={f.on ? 'text-neutral-900' : 'text-neutral-700 line-through'}>
                    {t(`subscription.features.${f.key}`)}
                  </span>
                </div>
              ))}
              {currentPlan?.max_children && (
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span>{t('subscription.features.multiChildren', { count: currentPlan.max_children })}</span>
                </div>
              )}
              {currentPlan?.daily_time_minutes && (
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                  <span>{t('subscription.features.anytime', { minutes: currentPlan.daily_time_minutes })}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="space-y-3 mb-4">
          {isExpired ? (
            <button
              onClick={() => navigate('/subscription')}
              className="btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              {t('subManage.renewNow')}
            </button>
          ) : (
            <button
              onClick={() => navigate('/subscription')}
              className="card w-full flex items-center gap-3 hover:shadow-md transition-shadow text-start"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                <ArrowUpCircle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{t('subManage.changePlan')}</div>
                <div className="text-xs text-neutral-700">{t('subscription.upgradeSubtitle')}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-neutral-700 rtl:rotate-180" />
            </button>
          )}

          {!isExpired && (
            <button
              onClick={() => setCancelOpen(true)}
              className="w-full text-center text-sm text-danger hover:underline py-2"
            >
              {t('subManage.cancelTitle')}
            </button>
          )}
        </div>

        {/* ── Payment history placeholder ── */}
        <div className="card">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-neutral-700" />
            {t('subManage.history')}
          </h2>
          <PaymentHistory subId={sub.id} />
        </div>
      </div>

      {/* Cancel confirm modal */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <button
              onClick={() => setCancelOpen(false)}
              className="absolute top-4 end-4 p-1 hover:bg-neutral-200 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-danger/10 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-danger" />
              </div>
              <h2 className="text-xl font-bold mb-2">{t('subManage.cancelTitle')}</h2>
              <p className="text-sm text-neutral-700">{t('subManage.cancelBody')}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCancelOpen(false)} className="btn-outline flex-1">
                {t('common.back')}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 py-2.5 px-4 rounded-xl bg-danger text-white font-semibold inline-flex items-center justify-center gap-2"
              >
                {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : t('subManage.cancelConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

// ── Payment history from subscriptions table ──
function PaymentHistory({ subId }: { subId: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const [rows, setRows] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  // Load history on first render
  useState(() => {
    supabase
      .from('subscriptions')
      .select('id, started_at, paid_amount, paid_currency, status, plan:subscription_plans(name_ar, name_en)')
      .order('started_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setRows(data || []); setLoaded(true) })
  })

  if (!loaded) {
    return <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></div>
  }

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-700 text-center py-2">{t('subManage.noHistory')}</p>
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const planName = lang === 'ar' ? r.plan?.name_ar : r.plan?.name_en
        return (
          <div key={r.id} className="flex items-center justify-between text-sm py-2 border-b border-neutral-200 last:border-0">
            <div>
              <div className="font-medium">{planName}</div>
              <div className="text-xs text-neutral-700">{format(new Date(r.started_at), 'dd MMM yyyy')}</div>
            </div>
            <div className="text-end">
              <div className="font-bold">{r.paid_amount} {r.paid_currency || 'EGP'}</div>
              <div className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                r.status === 'active' ? 'bg-green-100 text-green-700' :
                r.status === 'expired' ? 'bg-neutral-200 text-neutral-700' :
                'bg-red-100 text-red-700'
              )}>
                {r.status}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
