import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Zap,
  Users,
  Heart,
  Play,
  ToggleLeft,
  ToggleRight,
  Loader2,
  RefreshCw,
  Save,
  AlertTriangle,
  Rocket,
  Clock,
  Undo2,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ─── Types matching the automation_get_status RPC payload ────────────

interface AutomationSettings {
  follow_boost_enabled:         boolean
  follow_boost_per_cycle:       number
  follow_boost_cap:             number
  follow_boost_max_sources:     number
  engagement_boost_enabled:     boolean
  engagement_boost_view_min:    number
  engagement_boost_view_max:    number
  engagement_boost_like_pct:    number
  engagement_boost_view_cap:    number
  engagement_boost_like_cap:    number
  engagement_boost_max_age_days: number
}

interface AutomationStatus {
  settings: AutomationSettings
  follow_boost:     { last_run: string | null; total_added: number; users_at_cap: number }
  engagement_boost: { last_run: string | null; total_likes: number; total_views: number }
}

// ─── Data hooks ──────────────────────────────────────────────────────

function useAutomationStatus() {
  return useQuery<AutomationStatus>({
    queryKey: ['automation-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('automation_get_status')
      if (error) throw error
      return data as AutomationStatus
    },
    // Live-ish — status panel should feel current
    refetchInterval: 5000,
  })
}

function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<AutomationSettings>) => {
      const { data, error } = await supabase.rpc('automation_update_settings', { p_patch: patch })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-status'] }),
  })
}

function useTriggerRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (kind: 'follow' | 'engagement') => {
      const { data, error } = await supabase.rpc('automation_trigger_run', { p_kind: kind })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-status'] }),
  })
}

function useUndoBoost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (kind: 'follow' | 'engagement') => {
      const rpc = kind === 'follow'
        ? 'automation_undo_follow_boost'
        : 'automation_undo_engagement_boost'
      const { data, error } = await supabase.rpc(rpc, { p_since: null })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-status'] }),
  })
}

// ─── Page ────────────────────────────────────────────────────────────

export default function AdminAutomation() {
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { data: status, isLoading } = useAutomationStatus()
  const update = useUpdateSettings()
  const trigger = useTriggerRun()
  const undo = useUndoBoost()

  // Local form state so admin can tweak multiple values then hit Save
  const [form, setForm] = useState<Partial<AutomationSettings>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (status && !dirty) setForm(status.settings)
  }, [status, dirty])

  const set = (key: keyof AutomationSettings, value: number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const toggleFlag = async (key: 'follow_boost_enabled' | 'engagement_boost_enabled') => {
    const next = !form[key]
    try {
      await update.mutateAsync({ [key]: next })
      setForm((prev) => ({ ...prev, [key]: next }))
      toast.success(next
        ? (ar ? 'تم التشغيل ✓' : 'Started ✓')
        : (ar ? 'تم الإيقاف' : 'Stopped'))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const save = async () => {
    try {
      await update.mutateAsync(form)
      setDirty(false)
      toast.success(ar ? 'تم الحفظ' : 'Saved')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const runOnce = async (kind: 'follow' | 'engagement') => {
    try {
      const result = await trigger.mutateAsync(kind)
      const skipped = (result as any)?.skipped
      if (skipped) {
        toast.error(ar ? 'الخدمة موقوفة — شغلها الأول' : 'Disabled — enable it first')
      } else {
        toast.success(ar ? 'تم التشغيل مرة واحدة' : 'Ran once')
      }
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const undoAll = async (kind: 'follow' | 'engagement') => {
    const label = kind === 'follow'
      ? (ar ? 'كل المتابعات المضافة تلقائياً' : 'all boosted follows')
      : (ar ? 'كل اللايكات والمشاهدات المضافة تلقائياً' : 'all boosted likes and views')
    if (!confirm(ar
      ? `سيتم حذف ${label}. هل أنت متأكد؟ لا يمكن التراجع.`
      : `This will delete ${label}. Are you sure? Cannot be undone.`)) return
    try {
      const result = await undo.mutateAsync(kind)
      toast.success(ar ? 'تم التراجع' : 'Undone', {
        icon: '↩️',
      })
      console.log('[undo]', result)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (isLoading || !status) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6">
        <Header ar={ar} />
        <SafetyBanner ar={ar} />

        {/* ── Follow booster ────────────────────── */}
        <BoostCard
          ar={ar}
          icon={<Users className="w-6 h-6" />}
          title={ar ? 'الأتمتة: المتابعات' : 'Follow Automation'}
          subtitle={ar
            ? 'يضيف متابعين تلقائياً كل ساعة حتى يصل كل مستخدم للحد الأقصى'
            : 'Adds followers hourly until each user hits the cap'}
          enabled={!!form.follow_boost_enabled}
          onToggle={() => toggleFlag('follow_boost_enabled')}
          stats={[
            {
              label: ar ? 'إجمالي المضاف' : 'Total added',
              value: status.follow_boost.total_added.toLocaleString(),
              icon: <Users className="w-4 h-4" />,
            },
            {
              label: ar ? 'وصلوا للحد الأقصى' : 'At cap',
              value: status.follow_boost.users_at_cap.toLocaleString(),
              icon: <Rocket className="w-4 h-4" />,
            },
            {
              label: ar ? 'آخر تشغيل' : 'Last run',
              value: fmt(status.follow_boost.last_run, ar),
              icon: <Clock className="w-4 h-4" />,
            },
          ]}
          onRunOnce={() => runOnce('follow')}
          onUndo={() => undoAll('follow')}
          runLoading={trigger.isPending}
          undoLoading={undo.isPending}
        >
          <NumberField
            label={ar ? 'متابعات لكل ساعة/مستخدم' : 'Follows per hour / user'}
            value={form.follow_boost_per_cycle ?? 5}
            onChange={(v) => set('follow_boost_per_cycle', v)}
            min={1} max={50}
          />
          <NumberField
            label={ar ? 'الحد الأقصى للمتابعات لكل مستخدم' : 'Max followers per user (cap)'}
            value={form.follow_boost_cap ?? 200}
            onChange={(v) => set('follow_boost_cap', v)}
            min={10} max={5000}
          />
          <NumberField
            label={ar ? 'عدد المستخدمين لكل دورة' : 'Users processed per cycle'}
            value={form.follow_boost_max_sources ?? 500}
            onChange={(v) => set('follow_boost_max_sources', v)}
            min={50} max={5000}
            hint={ar
              ? 'الأكبر = أسرع لكن أثقل على الـ DB'
              : 'Higher = faster to cap but heavier on DB'}
          />
        </BoostCard>

        {/* ── Engagement booster ────────────────── */}
        <BoostCard
          ar={ar}
          icon={<Heart className="w-6 h-6" />}
          title={ar ? 'الأتمتة: المشاهدات واللايكات' : 'Engagement Automation'}
          subtitle={ar
            ? 'يضيف مشاهدات ولايكات على فيديوهات المُنشئين الجديدة كل 3 ساعات'
            : 'Adds views + likes to recent creator videos every 3 hours'}
          enabled={!!form.engagement_boost_enabled}
          onToggle={() => toggleFlag('engagement_boost_enabled')}
          stats={[
            {
              label: ar ? 'إجمالي المشاهدات المضافة' : 'Views added',
              value: status.engagement_boost.total_views.toLocaleString(),
              icon: <Play className="w-4 h-4" />,
            },
            {
              label: ar ? 'إجمالي اللايكات المضافة' : 'Likes added',
              value: status.engagement_boost.total_likes.toLocaleString(),
              icon: <Heart className="w-4 h-4" />,
            },
            {
              label: ar ? 'آخر تشغيل' : 'Last run',
              value: fmt(status.engagement_boost.last_run, ar),
              icon: <Clock className="w-4 h-4" />,
            },
          ]}
          onRunOnce={() => runOnce('engagement')}
          onUndo={() => undoAll('engagement')}
          runLoading={trigger.isPending}
          undoLoading={undo.isPending}
        >
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={ar ? 'أقل مشاهدات لكل دورة' : 'Views min'}
              value={form.engagement_boost_view_min ?? 3}
              onChange={(v) => set('engagement_boost_view_min', v)}
              min={0} max={100}
            />
            <NumberField
              label={ar ? 'أكثر مشاهدات لكل دورة' : 'Views max'}
              value={form.engagement_boost_view_max ?? 15}
              onChange={(v) => set('engagement_boost_view_max', v)}
              min={1} max={200}
            />
          </div>
          <NumberField
            label={ar ? 'نسبة اللايكات (٪ من المشاهدات)' : 'Likes as % of views'}
            value={form.engagement_boost_like_pct ?? 40}
            onChange={(v) => set('engagement_boost_like_pct', v)}
            min={0} max={100}
            hint={ar
              ? '50 يعني اللايكات = نص المشاهدات. النسبة الطبيعية 5-20٪'
              : '50 means likes = half of views. Realistic ratio is 5-20%'}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={ar ? 'حد المشاهدات لكل فيديو' : 'View cap / video'}
              value={form.engagement_boost_view_cap ?? 500}
              onChange={(v) => set('engagement_boost_view_cap', v)}
              min={10} max={10000}
            />
            <NumberField
              label={ar ? 'حد اللايكات لكل فيديو' : 'Like cap / video'}
              value={form.engagement_boost_like_cap ?? 200}
              onChange={(v) => set('engagement_boost_like_cap', v)}
              min={10} max={5000}
            />
          </div>
          <NumberField
            label={ar ? 'أقصى عمر للفيديو (أيام)' : 'Max video age (days)'}
            value={form.engagement_boost_max_age_days ?? 14}
            onChange={(v) => set('engagement_boost_max_age_days', v)}
            min={1} max={90}
            hint={ar
              ? 'الفيديوهات الأقدم من ده لا يتم تعزيزها'
              : 'Videos older than this are skipped'}
          />
        </BoostCard>

        {/* Save button — sticks to the bottom while dirty */}
        {dirty && (
          <div className="sticky bottom-0 bg-white border-t border-neutral-300 -mx-4 md:mx-0 md:rounded-xl p-3 shadow-lg flex items-center justify-between">
            <span className="text-sm text-neutral-700">
              {ar ? 'لديك تغييرات غير محفوظة' : 'You have unsaved changes'}
            </span>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 rounded-xl bg-neutral-200 text-neutral-900 text-sm hover:bg-neutral-300"
                onClick={() => { setForm(status.settings); setDirty(false) }}
              >
                {ar ? 'إلغاء' : 'Discard'}
              </button>
              <button
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
                onClick={save}
                disabled={update.isPending}
              >
                {update.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                {ar ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

// ─── UI Bits ─────────────────────────────────────────────────────────

function Header({ ar }: { ar: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center">
        <Zap className="w-6 h-6" />
      </div>
      <div>
        <h1 className="text-xl font-bold">{ar ? 'الأتمتة' : 'Engagement Automation'}</h1>
        <p className="text-sm text-neutral-700">
          {ar ? 'تحكم في تعزيز التفاعلات التلقائي' : 'Control automated engagement boosters'}
        </p>
      </div>
    </div>
  )
}

function SafetyBanner({ ar }: { ar: boolean }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-amber-900 space-y-1">
        <div className="font-medium">
          {ar ? 'استخدم بحذر' : 'Use carefully'}
        </div>
        <div>
          {ar
            ? 'الأرقام العالية تعطي انطباع مصطنع للأطفال ولمراجعي المتاجر. القيم الافتراضية آمنة. زيادتها ممكنة لكن راقب النتائج.'
            : 'High numbers make metrics look artificial to both kids and store reviewers. Defaults are safe. You can raise them but watch the outcomes.'}
        </div>
      </div>
    </div>
  )
}

function BoostCard({
  ar, icon, title, subtitle, enabled, onToggle, stats, children,
  onRunOnce, onUndo, runLoading, undoLoading,
}: {
  ar: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  enabled: boolean
  onToggle: () => void
  stats: { label: string; value: string; icon: React.ReactNode }[]
  children: React.ReactNode
  onRunOnce: () => void
  onUndo: () => void
  runLoading: boolean
  undoLoading: boolean
}) {
  return (
    <div className={cn(
      'rounded-2xl border p-5 space-y-4',
      enabled ? 'border-primary/30 bg-white' : 'border-neutral-300 bg-neutral-100/50',
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            enabled ? 'bg-primary text-white' : 'bg-neutral-300 text-neutral-700',
          )}>
            {icon}
          </div>
          <div>
            <h2 className="font-semibold text-lg">{title}</h2>
            <p className="text-sm text-neutral-700">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm transition',
            enabled ? 'bg-primary text-white' : 'bg-neutral-300 text-neutral-700',
          )}
        >
          {enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          {enabled ? (ar ? 'شغال' : 'On') : (ar ? 'موقوف' : 'Off')}
        </button>
      </div>

      {/* Live stats */}
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s, i) => (
          <div key={i} className="rounded-xl bg-neutral-100 border border-neutral-200 p-3">
            <div className="flex items-center gap-1.5 text-xs text-neutral-700 mb-1">
              {s.icon}
              <span>{s.label}</span>
            </div>
            <div className="font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Config inputs */}
      <div className="space-y-3">{children}</div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-200">
        <button
          onClick={onRunOnce}
          disabled={runLoading}
          className="px-3 py-2 rounded-xl bg-neutral-200 hover:bg-neutral-300 text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {runLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {ar ? 'شغّل مرة واحدة الآن' : 'Run once now'}
        </button>
        <button
          onClick={onUndo}
          disabled={undoLoading}
          className="px-3 py-2 rounded-xl bg-danger/10 text-danger hover:bg-danger/20 text-sm flex items-center gap-2 disabled:opacity-50 ml-auto"
        >
          {undoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
          {ar ? 'تراجع عن كل شيء' : 'Undo all'}
        </button>
      </div>
    </div>
  )
}

function NumberField({
  label, value, onChange, min, max, hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 focus:border-primary focus:ring-1 focus:ring-primary"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-700">{hint}</span>}
    </label>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function fmt(iso: string | null, ar: boolean): string {
  if (!iso) return ar ? 'لم يشغل بعد' : 'Never'
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.floor((now - d.getTime()) / 1000)
  if (diff < 60) return ar ? 'قبل ثوان' : 'seconds ago'
  if (diff < 3600) return ar ? `منذ ${Math.floor(diff / 60)} دقيقة` : `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return ar ? `منذ ${Math.floor(diff / 3600)} ساعة` : `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString(ar ? 'ar-EG' : 'en-US')
}
