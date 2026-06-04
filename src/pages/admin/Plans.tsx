import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  CreditCard,
  Edit2,
  Save,
  X,
  Loader2,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAdminPlans, useUpdatePlan, type SubscriptionPlan } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'

export default function AdminPlans() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const { data: plans = [], isLoading } = useAdminPlans()
  const updateMut = useUpdatePlan()
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null)

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-primary" />
            {t('admin.nav.plans')}
          </h1>
          <p className="text-neutral-700 text-sm mt-1">
            Edit prices and limits — plan limits apply immediately in the app.
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                isEditing={editing?.id === plan.id}
                onEdit={() => setEditing(plan)}
                onCancel={() => setEditing(null)}
                onSave={async (patch) => {
                  try {
                    await updateMut.mutateAsync({ id: plan.id, patch })
                    toast.success('Plan saved')
                    setEditing(null)
                  } catch (err) {
                    toast.error((err as Error).message)
                  }
                }}
                saving={updateMut.isPending}
                lang={lang}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

// ============================================================
// Plan row — read & edit
// ============================================================
function PlanRow({
  plan,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  saving,
  lang,
}: {
  plan: SubscriptionPlan
  isEditing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (patch: Partial<SubscriptionPlan>) => Promise<void>
  saving: boolean
  lang: 'ar' | 'en'
}) {
  const [form, setForm] = useState({
    price: plan.price,
    old_price: plan.old_price ?? 0,
    duration_days: plan.duration_days,
    max_children: plan.max_children ?? 1,
    max_playlists: plan.max_playlists ?? 1,
    max_videos_per_playlist: plan.max_videos_per_playlist ?? 20,
    max_creator_uploads_per_30_days: plan.max_creator_uploads_per_30_days ?? 30,
    daily_time_minutes: plan.daily_time_minutes ?? 60,
    has_insights: plan.has_insights,
    has_ads: plan.has_ads,
    has_games: plan.has_games,
    has_free_courses: plan.has_free_courses,
    is_active: plan.is_active,
  })

  // Reset form when starting to edit
  useEffect(() => {
    if (isEditing) {
      setForm({
        price: plan.price,
        old_price: plan.old_price ?? 0,
        duration_days: plan.duration_days,
        max_children: plan.max_children ?? 1,
        max_playlists: plan.max_playlists ?? 1,
        max_videos_per_playlist: plan.max_videos_per_playlist ?? 20,
        max_creator_uploads_per_30_days: plan.max_creator_uploads_per_30_days ?? 30,
        daily_time_minutes: plan.daily_time_minutes ?? 60,
        has_insights: plan.has_insights,
        has_ads: plan.has_ads,
        has_games: plan.has_games,
        has_free_courses: plan.has_free_courses,
        is_active: plan.is_active,
      })
    }
  }, [isEditing, plan])

  const handleSave = () => {
    const patch: Partial<SubscriptionPlan> = {
      ...form,
      old_price: form.old_price > 0 ? form.old_price : null,
    }
    onSave(patch)
  }

  const name = lang === 'ar' ? plan.name_ar : plan.name_en

  return (
    <div className={cn('card', !plan.is_active && 'opacity-60')}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-lg">{name}</h3>
            <span className="text-xs bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded-full font-mono">
              {plan.code}
            </span>
            {!plan.is_active && (
              <span className="text-xs bg-neutral-300 text-neutral-700 px-2 py-0.5 rounded-full">
                inactive
              </span>
            )}
          </div>
          {!isEditing && (
            <div className="text-2xl font-extrabold text-primary">
              {Number(plan.price).toFixed(2)} {plan.currency}{' '}
              <span className="text-sm font-medium text-neutral-700">
                / {plan.duration_days}d
              </span>
            </div>
          )}
        </div>
        {!isEditing && (
          <button
            onClick={onEdit}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4 mt-3 pt-3 border-t border-neutral-300">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Price (${plan.currency})`}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                className="input-field"
              />
            </Field>
            <Field label="Old price (strike-through)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.old_price}
                onChange={(e) => setForm((f) => ({ ...f, old_price: parseFloat(e.target.value) || 0 }))}
                className="input-field"
              />
            </Field>
            <Field label="Duration (days)">
              <input
                type="number"
                min="1"
                value={form.duration_days}
                onChange={(e) => setForm((f) => ({ ...f, duration_days: parseInt(e.target.value) || 30 }))}
                className="input-field"
              />
            </Field>
            <Field label="Daily time (minutes)">
              <input
                type="number"
                min="0"
                value={form.daily_time_minutes}
                onChange={(e) => setForm((f) => ({ ...f, daily_time_minutes: parseInt(e.target.value) || 0 }))}
                className="input-field"
              />
            </Field>
            <Field label="Max children">
              <input
                type="number"
                min="1"
                value={form.max_children}
                onChange={(e) => setForm((f) => ({ ...f, max_children: parseInt(e.target.value) || 1 }))}
                className="input-field"
              />
            </Field>
            <Field label="Max playlists">
              <input
                type="number"
                min="1"
                value={form.max_playlists}
                onChange={(e) => setForm((f) => ({ ...f, max_playlists: parseInt(e.target.value) || 1 }))}
                className="input-field"
              />
            </Field>
            <Field label="Max videos / playlist">
              <input
                type="number"
                min="1"
                value={form.max_videos_per_playlist}
                onChange={(e) => setForm((f) => ({ ...f, max_videos_per_playlist: parseInt(e.target.value) || 20 }))}
                className="input-field"
              />
            </Field>
            <Field label="Creator uploads / 30 days">
              <input
                type="number"
                min="0"
                value={form.max_creator_uploads_per_30_days}
                onChange={(e) => setForm((f) => ({ ...f, max_creator_uploads_per_30_days: parseInt(e.target.value) || 0 }))}
                className="input-field"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Toggle
              label="Show ads"
              value={form.has_ads}
              onChange={(v) => setForm((f) => ({ ...f, has_ads: v }))}
            />
            <Toggle
              label="Insights"
              value={form.has_insights}
              onChange={(v) => setForm((f) => ({ ...f, has_insights: v }))}
            />
            <Toggle
              label="Games"
              value={form.has_games}
              onChange={(v) => setForm((f) => ({ ...f, has_games: v }))}
            />
            <Toggle
              label="Free courses"
              value={form.has_free_courses}
              onChange={(v) => setForm((f) => ({ ...f, has_free_courses: v }))}
            />
            <Toggle
              label="Plan is active"
              value={form.is_active}
              onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              activeIcon={Eye}
              inactiveIcon={EyeOff}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onCancel} className="btn-outline flex-1 inline-flex items-center justify-center gap-2">
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-xs">
          <Stat label="Children" value={plan.max_children ?? '∞'} />
          <Stat label="Playlists" value={plan.max_playlists ?? '∞'} />
          <Stat label="Videos/list" value={plan.max_videos_per_playlist ?? '∞'} />
          <Stat label="Uploads/30d" value={plan.max_creator_uploads_per_30_days ?? 30} />
          <Stat label="Daily min" value={plan.daily_time_minutes ?? '∞'} />
          <Feature on={!plan.has_ads} label="No ads" />
          <Feature on={plan.has_insights} label="Insights" />
          <Feature on={plan.has_games} label="Games" />
          <Feature on={plan.has_free_courses} label="Courses" />
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-700 block mb-1">{label}</span>
      {children}
    </label>
  )
}

function Toggle({
  label,
  value,
  onChange,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  activeIcon?: any
  inactiveIcon?: any
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors',
        value
          ? 'bg-primary text-white border-primary'
          : 'bg-neutral-200 text-neutral-900 border-neutral-300'
      )}
    >
      {value
        ? ActiveIcon ? <ActiveIcon className="w-4 h-4" /> : <Check className="w-4 h-4" />
        : InactiveIcon ? <InactiveIcon className="w-4 h-4" /> : <X className="w-4 h-4" />}
      <span>{label}</span>
    </button>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-neutral-200/50 rounded-lg px-2 py-1.5">
      <div className="text-[10px] text-neutral-700">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  )
}

function Feature({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={cn('px-2 py-1.5 rounded-lg flex items-center gap-1', on ? 'bg-green-50 text-green-700' : 'bg-neutral-200/50 text-neutral-700')}>
      {on ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      <span>{label}</span>
    </div>
  )
}
