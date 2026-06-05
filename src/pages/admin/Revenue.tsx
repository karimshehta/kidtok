import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  Calendar,
  DollarSign,
  CreditCard,
  Users,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts'
import AdminLayout from '@/components/AdminLayout'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ── Date-window helpers ────────────────────────────────────────────────
function toIsoStartOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString()
}
function toIsoEndOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x.toISOString()
}
function toYmd(d: Date) {
  return d.toISOString().slice(0, 10)
}
function fromYmd(s: string) {
  // Treat as local midnight so the date picker is intuitive — typing
  // 2026-05-01 means "May 1st in your timezone", not 1am UTC.
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

type QuickRange = 'today' | '7d' | '30d' | '90d' | 'mtd' | 'last_month' | 'all'

function rangeFor(quick: QuickRange): { from: Date; to: Date } {
  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  switch (quick) {
    case 'today':      return { from: today, to: now }
    case '7d':         { const f = new Date(today); f.setDate(f.getDate() - 6);  return { from: f, to: now } }
    case '30d':        { const f = new Date(today); f.setDate(f.getDate() - 29); return { from: f, to: now } }
    case '90d':        { const f = new Date(today); f.setDate(f.getDate() - 89); return { from: f, to: now } }
    case 'mtd':        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    case 'last_month': {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const t = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      return { from: f, to: t }
    }
    case 'all':        return { from: new Date(2024, 0, 1), to: now }
  }
}

const PLAN_COLORS    = ['#03BBE5', '#F96286', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444']
const PROVIDER_COLOR: Record<string, string> = {
  paymob:  '#03BBE5',
  apple:   '#1F2937',
  google:  '#10B981',
  stripe:  '#8B5CF6',
  manual:  '#9CA3AF',
  unknown: '#D1D5DB',
}

// ── Page ───────────────────────────────────────────────────────────────
export default function AdminRevenue() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'

  const [quick, setQuick]   = useState<QuickRange>('30d')
  const [from, setFrom]     = useState<Date>(() => rangeFor('30d').from)
  const [to,   setTo]       = useState<Date>(() => rangeFor('30d').to)

  const applyQuick = (q: QuickRange) => {
    const r = rangeFor(q)
    setQuick(q)
    setFrom(r.from)
    setTo(r.to)
  }
  const applyCustom = (newFrom: Date, newTo: Date) => {
    setQuick('all')   // mark as custom — quick selector loses its highlight
    setFrom(newFrom)
    setTo(newTo)
  }

  const fromIso = toIsoStartOfDay(from)
  const toIso   = toIsoEndOfDay(to)

  // ── Analytics fetch ──────────────────────────────────────────────────
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-subscription-analytics', fromIso, toIso],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_subscription_analytics', {
        p_from: fromIso,
        p_to:   toIso,
      })
      if (error) throw error
      return data as any
    },
  })

  const summary    = data?.summary    || {}
  const byPlan     = (data?.by_plan     || []) as any[]
  const byProvider = (data?.by_provider || []) as any[]
  const byStatus   = (data?.by_status   || []) as any[]
  const timeseries = (data?.timeseries  || []) as any[]
  const activeNow  = data?.active_now  || {}
  const currency   = summary.currency || 'EGP'

  // Status totals — used by the breakdown widget. Pending is the
  // important one: those are abandoned checkouts (user tapped Subscribe
  // but never completed Paymob) and a high count means the payment
  // flow is leaking.
  const statusCount = (s: string) =>
    Number((byStatus.find((r: any) => r.status === s)?.count) || 0)
  const pendingCount   = statusCount('pending')
  const activeCount    = statusCount('active')
  const cancelledCount = statusCount('cancelled')
  const expiredCount   = statusCount('expired')

  // Format helpers
  const fmtMoney = (n: number) => `${currency} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const fmtInt   = (n: number) => Number(n || 0).toLocaleString()

  return (
    <AdminLayout>
      <div className="max-w-7xl">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-primary" />
            {ar ? 'الإيرادات والاشتراكات' : 'Revenue & Subscriptions'}
          </h1>
          <p className="text-neutral-700 mt-1">
            {ar
              ? 'تحليل مفصل للاشتراكات والإيرادات قابل للفلترة بالتاريخ'
              : 'Detailed subscriptions and revenue analytics with date filtering'}
          </p>
        </header>

        {/* ── Filter bar ───────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['today',      ar ? 'اليوم'         : 'Today'],
                ['7d',         ar ? '٧ أيام'         : '7 days'],
                ['30d',        ar ? '٣٠ يوم'         : '30 days'],
                ['90d',        ar ? '٩٠ يوم'         : '90 days'],
                ['mtd',        ar ? 'الشهر الحالي'  : 'Month to date'],
                ['last_month', ar ? 'الشهر الماضي'  : 'Last month'],
                ['all',        ar ? 'الكل'           : 'All time'],
              ] as Array<[QuickRange, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyQuick(key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  quick === key
                    ? 'bg-primary text-white'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
          <div className="flex items-center gap-2 ms-auto">
            <Calendar className="w-4 h-4 text-neutral-500" />
            <input
              type="date"
              value={toYmd(from)}
              onChange={(e) => applyCustom(fromYmd(e.target.value), to)}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-primary"
            />
            <span className="text-neutral-400">→</span>
            <input
              type="date"
              value={toYmd(to)}
              onChange={(e) => applyCustom(from, fromYmd(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* ── Error / loading ───────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-900">
                {ar ? 'تعذر تحميل البيانات' : 'Failed to load data'}
              </p>
              <p className="text-sm text-red-700 mt-1">{String((error as any)?.message || error)}</p>
            </div>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {/* ── KPI cards ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KpiCard
                label={ar ? 'إجمالي الإيرادات' : 'Total Revenue'}
                value={fmtMoney(summary.total_revenue)}
                icon={DollarSign}
                tint="bg-green-50 text-green-700"
              />
              <KpiCard
                label={ar ? 'إجمالي الاشتراكات' : 'Subscriptions'}
                value={fmtInt(summary.total_subscriptions)}
                icon={Users}
                tint="bg-blue-50 text-blue-700"
              />
              <KpiCard
                label={ar ? 'الباقة الشهرية' : 'Monthly Plan'}
                value={fmtInt(summary.monthly_count)}
                sub={fmtMoney(summary.monthly_revenue)}
                icon={CreditCard}
                tint="bg-cyan-50 text-cyan-700"
              />
              <KpiCard
                label={ar ? 'الباقة السنوية' : 'Yearly Plan'}
                value={fmtInt(summary.yearly_count)}
                sub={fmtMoney(summary.yearly_revenue)}
                icon={CreditCard}
                tint="bg-purple-50 text-purple-700"
              />
            </div>

            {/* ── Active-now bar (independent of date range) ──────── */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <span className="font-bold text-green-900">
                    {ar ? 'الاشتراكات النشطة الآن' : 'Active Subscriptions Now'}
                  </span>
                  <span className="text-xs text-green-700">
                    ({ar ? 'مستقل عن الفلتر' : 'independent of date filter'})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Inline label={ar ? 'إجمالي' : 'Total'} value={fmtInt(activeNow.total_active)} />
                  <Inline label={ar ? 'شهري' : 'Monthly'} value={fmtInt(activeNow.monthly_active)} />
                  <Inline label={ar ? 'سنوي' : 'Yearly'} value={fmtInt(activeNow.yearly_active)} />
                  <Inline
                    label={ar ? 'تنتهي خلال ٧ أيام' : 'Expiring in 7 days'}
                    value={fmtInt(activeNow.expiring_7d)}
                    tone={activeNow.expiring_7d > 0 ? 'warn' : undefined}
                  />
                </div>
              </div>
            </div>

            {/* ── Status breakdown ──────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-lg">
                  {ar ? 'تفصيل حالات الاشتراك' : 'Status Breakdown'}
                </h2>
                <span className="text-xs text-neutral-500">
                  {ar ? 'الإيرادات تشمل: ' : 'Revenue includes: '}
                  <span className="font-semibold">active + expired + cancelled</span>
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatusTile
                  label={ar ? 'نشط' : 'Active'}
                  value={activeCount}
                  tone="green"
                  hint={ar ? 'يدفع حالياً' : 'paying now'}
                />
                <StatusTile
                  label={ar ? 'منتهٍ' : 'Expired'}
                  value={expiredCount}
                  tone="neutral"
                  hint={ar ? 'دفع سابقاً' : 'past paying'}
                />
                <StatusTile
                  label={ar ? 'ملغي' : 'Cancelled'}
                  value={cancelledCount}
                  tone="blue"
                  hint={ar ? 'دفع ثم ألغى' : 'paid + cancelled'}
                />
                <StatusTile
                  label={ar ? 'معلق' : 'Pending'}
                  value={pendingCount}
                  tone={pendingCount > 0 ? 'amber' : 'neutral'}
                  hint={ar ? 'مهجور — لم يدفع' : 'abandoned, no payment'}
                  warn={pendingCount > 0}
                />
              </div>
              {pendingCount > 0 && (
                <p className="text-xs text-amber-700 mt-3 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {ar
                      ? `${pendingCount} اشتراك معلق — اليوزر داس "اشترك" لكن لم يكمل الدفع في Paymob. هذه الصفوف لا تحتسب في الإيرادات.`
                      : `${pendingCount} pending subscriptions — users tapped "Subscribe" but didn't complete Paymob payment. These are NOT counted in revenue.`}
                  </span>
                </p>
              )}
            </div>

            {/* ── Timeseries chart (full width) ───────────────────── */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg">
                  {ar ? 'الاشتراكات اليومية' : 'Daily Subscriptions'}
                </h2>
                <span className="text-sm text-neutral-500">
                  {ar ? `${timeseries.length} يوم` : `${timeseries.length} days`}
                </span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.slice(5)}  /* MM-DD */
                      stroke="#9ca3af"
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                    <Tooltip
                      formatter={(v: any, name: any) => {
                        const key = String(name ?? '')
                        if (key === 'revenue')       return [fmtMoney(v), ar ? 'الإيرادات' : 'Revenue']
                        if (key === 'monthly_count') return [v, ar ? 'شهري' : 'Monthly']
                        if (key === 'yearly_count')  return [v, ar ? 'سنوي' : 'Yearly']
                        return [v, key]
                      }}
                      labelFormatter={(v) => String(v)}
                    />
                    <Legend
                      formatter={(value: any) => {
                        const key = String(value ?? '')
                        if (key === 'monthly_count') return ar ? 'شهري' : 'Monthly'
                        if (key === 'yearly_count')  return ar ? 'سنوي' : 'Yearly'
                        if (key === 'revenue')       return ar ? 'الإيرادات' : 'Revenue'
                        return key
                      }}
                    />
                    <Line type="monotone" dataKey="monthly_count" stroke="#03BBE5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="yearly_count"  stroke="#F96286" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Two-column charts ───────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Plan distribution */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                <h2 className="font-bold text-lg mb-4">
                  {ar ? 'توزيع الاشتراكات حسب الباقة' : 'Subscriptions by Plan'}
                </h2>
                {byPlan.every((p: any) => !p.count) ? (
                  <EmptyState label={ar ? 'لا اشتراكات في الفترة المحددة' : 'No subscriptions in range'} />
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={byPlan.filter((p: any) => p.count > 0)}
                            dataKey="count"
                            nameKey={ar ? 'name_ar' : 'name_en'}
                            cx="50%" cy="50%"
                            outerRadius={80}
                            innerRadius={50}
                            paddingAngle={2}
                          >
                            {byPlan.filter((p: any) => p.count > 0).map((_: any, i: number) => (
                              <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmtInt(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5 mt-3">
                      {byPlan.filter((p: any) => p.count > 0).map((p: any, i: number) => (
                        <div key={p.plan_id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                            <span className="font-medium truncate">{ar ? p.name_ar : p.name_en}</span>
                            <span className="text-xs text-neutral-500 shrink-0">
                              ({p.is_yearly ? (ar ? 'سنوي' : 'yearly') : (ar ? 'شهري' : 'monthly')})
                            </span>
                          </div>
                          <span className="font-semibold tabular-nums shrink-0 ms-2">{fmtInt(p.count)}</span>
                          <span className="text-neutral-500 tabular-nums shrink-0 ms-3">{fmtMoney(p.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Payment provider */}
              <div className="bg-white rounded-2xl border border-neutral-200 p-5">
                <h2 className="font-bold text-lg mb-4">
                  {ar ? 'طرق الدفع' : 'Payment Methods'}
                </h2>
                {byProvider.length === 0 ? (
                  <EmptyState label={ar ? 'لا توجد بيانات' : 'No data'} />
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byProvider} layout="vertical" margin={{ top: 5, right: 16, left: 16, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} />
                          <YAxis type="category" dataKey="provider" tick={{ fontSize: 12 }} stroke="#9ca3af" width={80} />
                          <Tooltip formatter={(v: any) => fmtInt(v)} />
                          <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                            {byProvider.map((row: any, i: number) => (
                              <Cell key={i} fill={PROVIDER_COLOR[row.provider] || '#9CA3AF'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5 mt-3">
                      {byProvider.map((row: any) => (
                        <div key={row.provider} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ background: PROVIDER_COLOR[row.provider] || '#9CA3AF' }} />
                            <span className="font-medium capitalize">{row.provider}</span>
                          </div>
                          <span className="font-semibold tabular-nums">{fmtInt(row.count)}</span>
                          <span className="text-neutral-500 tabular-nums">{fmtMoney(row.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Recent subscriptions table ──────────────────────── */}
            <RecentSubscriptions fromIso={fromIso} toIso={toIso} />
          </>
        )}
      </div>
    </AdminLayout>
  )
}

// ── KPI card ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, tint }: {
  label: string; value: string; sub?: string; icon: any; tint: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-neutral-600 font-medium">{label}</span>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', tint)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1 tabular-nums">{sub}</div>}
    </div>
  )
}

function Inline({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-green-800">{label}:</span>
      <span className={cn('font-bold tabular-nums', tone === 'warn' ? 'text-amber-700' : 'text-green-900')}>
        {value}
      </span>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-10 text-neutral-400 text-sm">{label}</div>
  )
}

function StatusTile({ label, value, tone, hint, warn }: {
  label: string
  value: number
  tone: 'green' | 'blue' | 'amber' | 'neutral'
  hint?: string
  warn?: boolean
}) {
  const toneClasses: Record<typeof tone, string> = {
    green:   'bg-green-50 border-green-200 text-green-900',
    blue:    'bg-blue-50 border-blue-200 text-blue-900',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
    neutral: 'bg-neutral-50 border-neutral-200 text-neutral-900',
  }
  return (
    <div className={cn(
      'rounded-xl border p-3',
      toneClasses[tone],
      warn && 'ring-2 ring-amber-300',
    )}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="text-[10px] opacity-70 mt-0.5">{hint}</div>
      )}
    </div>
  )
}

// ── Recent subscriptions table (paginated) ─────────────────────────────
function RecentSubscriptions({ fromIso, toIso }: { fromIso: string; toIso: string }) {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const [page, setPage] = useState(0)
  const pageSize = 25

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-recent-subscriptions', fromIso, toIso, page],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_recent_subscriptions', {
        p_from:   fromIso,
        p_to:     toIso,
        p_limit:  pageSize,
        p_offset: page * pageSize,
      })
      if (error) throw error
      return (data || []) as any[]
    },
  })

  const statusColor = (s: string) => {
    switch (s) {
      case 'active':    return 'bg-green-100 text-green-700'
      case 'expired':   return 'bg-neutral-100 text-neutral-700'
      case 'cancelled': return 'bg-amber-100 text-amber-700'
      case 'pending':   return 'bg-blue-100 text-blue-700'
      default:          return 'bg-neutral-100 text-neutral-700'
    }
  }
  const fmtMoney = (n: number, c: string) =>
    `${c} ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const fmtDate = (s: string) => new Date(s).toLocaleDateString()

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-8">
      <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
        <h2 className="font-bold text-lg">
          {ar ? 'آخر الاشتراكات' : 'Recent Subscriptions'}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-neutral-600 tabular-nums">
            {ar ? `صفحة ${page + 1}` : `Page ${page + 1}`}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={rows.length < pageSize}
            className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <EmptyState label={ar ? 'لا اشتراكات في الفترة المحددة' : 'No subscriptions in range'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr className="text-left text-xs uppercase tracking-wider text-neutral-600">
                <th className="px-5 py-3">{ar ? 'المستخدم' : 'User'}</th>
                <th className="px-5 py-3">{ar ? 'الباقة' : 'Plan'}</th>
                <th className="px-5 py-3">{ar ? 'السعر' : 'Price'}</th>
                <th className="px-5 py-3">{ar ? 'الطريقة' : 'Method'}</th>
                <th className="px-5 py-3">{ar ? 'الحالة' : 'Status'}</th>
                <th className="px-5 py-3">{ar ? 'تاريخ البداية' : 'Started'}</th>
                <th className="px-5 py-3">{ar ? 'تاريخ الانتهاء' : 'Expires'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-neutral-100 text-sm hover:bg-neutral-50/50">
                  <td className="px-5 py-3">
                    <div className="font-medium truncate max-w-[180px]">{r.user_name || '—'}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[180px]">{r.user_email || ''}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-medium">{ar ? r.plan_name_ar : r.plan_name_en}</div>
                    <div className="text-xs text-neutral-500">
                      {r.duration_days > 31 ? (ar ? 'سنوي' : 'Yearly') : (ar ? 'شهري' : 'Monthly')}
                    </div>
                  </td>
                  <td className="px-5 py-3 tabular-nums font-medium">{fmtMoney(r.price, r.currency)}</td>
                  <td className="px-5 py-3 capitalize text-neutral-700">{r.payment_provider || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusColor(r.status))}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{fmtDate(r.started_at)}</td>
                  <td className="px-5 py-3 text-neutral-700">{fmtDate(r.expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
