import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Megaphone,
  Globe,
  Smartphone,
  Save,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Info,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAdminSettings, useUpdateSettings } from '@/hooks/useAds'
import { cn } from '@/lib/utils'

export default function AdminAds() {
  const { t } = useTranslation()
  const { data: settings = [], isLoading } = useAdminSettings()
  const updateMut = useUpdateSettings()

  // Local form state as a key→value map
  const [form, setForm] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)

  // Initialise form when settings load
  useEffect(() => {
    if (settings.length > 0 && Object.keys(form).length === 0) {
      const init: Record<string, string> = {}
      settings.forEach((s: any) => {
        init[s.key] = s.value ?? ''
      })
      setForm(init)
    }
  }, [settings, form])

  const set = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  const toggle = (key: string) => {
    set(key, form[key] === 'true' ? 'false' : 'true')
  }

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync(form)
      toast.success(t('ads.saveSuccess'))
      setIsDirty(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (isLoading) {
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
      <div className="max-w-3xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="w-7 h-7 text-primary" />
              {t('ads.adminTitle')}
            </h1>
            <p className="text-neutral-700 text-sm mt-1">{t('ads.adminSubtitle')}</p>
          </div>
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="btn-primary inline-flex items-center gap-2"
            >
              {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('common.save')}
            </button>
          )}
        </header>

        {/* ======================================================
            Web: Google AdSense
        ====================================================== */}
        <section className="card mb-4">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-primary" />
            {t('ads.webSection')}
          </h2>

          {/* Master toggle */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-neutral-300">
            <div>
              <div className="font-medium">{t('ads.enabledLabel')}</div>
              <div className="text-xs text-neutral-700">{t('ads.enabledHint')}</div>
            </div>
            <button type="button" onClick={() => toggle('adsense_enabled')}>
              {form['adsense_enabled'] === 'true' ? (
                <ToggleRight className="w-9 h-9 text-primary" />
              ) : (
                <ToggleLeft className="w-9 h-9 text-neutral-700" />
              )}
            </button>
          </div>

          <div
            className={cn(
              'space-y-3 transition-opacity',
              form['adsense_enabled'] !== 'true' && 'opacity-40 pointer-events-none'
            )}
          >
            <Field
              label={t('ads.publisherIdLabel')}
              hint="ca-pub-XXXXXXXXXXXXXXXX"
              value={form['adsense_publisher_id'] || ''}
              onChange={(v) => set('adsense_publisher_id', v)}
              placeholder="ca-pub-9534911590158193"
              mono
            />
            <Field
              label={t('ads.feedUnitLabel')}
              hint={t('ads.feedUnitHint', { n: form['ads_frequency'] || '5' })}
              value={form['adsense_feed_unit_id'] || ''}
              onChange={(v) => set('adsense_feed_unit_id', v)}
              placeholder="XXXXXXXXXX/XXXXXXXXXX"
              mono
            />
            <Field
              label={t('ads.bannerUnitLabel')}
              hint={t('ads.bannerUnitHint')}
              value={form['adsense_banner_unit_id'] || ''}
              onChange={(v) => set('adsense_banner_unit_id', v)}
              placeholder="XXXXXXXXXX/XXXXXXXXXX"
              mono
            />
            <Field
              label={t('ads.frequencyLabel')}
              hint={t('ads.frequencyHint')}
              value={form['ads_frequency'] || '5'}
              onChange={(v) => set('ads_frequency', v)}
              type="number"
              min={0}
              max={20}
            />
          </div>

          {/* Dev mode notice */}
          <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{t('ads.testMode')}: </span>
              {t('ads.testModeHint')}
            </div>
          </div>
        </section>

        {/* ======================================================
            Mobile: Google AdMob
        ====================================================== */}
        <section className="card mb-4">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <Smartphone className="w-5 h-5 text-secondary" />
            {t('ads.mobileSection')}
          </h2>

          <p className="text-sm text-neutral-700 mb-4 bg-neutral-200/50 rounded-xl p-3">
            These IDs are used by the <strong>Expo mobile app</strong> (Phase 1B). The values from the legacy Flutter project have been pre-filled. Update if you create new AdMob ad units.
          </p>

          <div className="space-y-3">
            <PlatformFields
              label="App IDs"
              androidKey="admob_android_app_id"
              iosKey="admob_ios_app_id"
              form={form}
              set={set}
            />
            <PlatformFields
              label="Interstitial Unit IDs"
              androidKey="admob_android_interstitial"
              iosKey="admob_ios_interstitial"
              form={form}
              set={set}
            />
            <PlatformFields
              label="Rewarded Unit IDs"
              androidKey="admob_android_rewarded"
              iosKey="admob_ios_rewarded"
              form={form}
              set={set}
            />
            <Field
              label="Rewarded ad skip (minutes)"
              hint="Minutes of ad-free time after user watches a rewarded ad (mobile only)"
              value={form['rewarded_skip_minutes'] || '30'}
              onChange={(v) => set('rewarded_skip_minutes', v)}
              type="number"
              min={5}
              max={1440}
            />
          </div>
        </section>

        {/* Save button at bottom */}
        {isDirty && (
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="btn-primary inline-flex items-center gap-2"
            >
              {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('common.save')}
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

// ============================================================
// Sub-components
// ============================================================
interface FieldProps {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  min?: number
  max?: number
  mono?: boolean
}

function Field({ label, hint, value, onChange, placeholder, type = 'text', min, max, mono }: FieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-0.5">{label}</span>
      {hint && <span className="text-xs text-neutral-700 block mb-1">{hint}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className={cn('input-field', mono && 'font-mono text-sm')}
        dir="ltr"
      />
    </label>
  )
}

function PlatformFields({
  label,
  androidKey,
  iosKey,
  form,
  set,
}: {
  label: string
  androidKey: string
  iosKey: string
  form: Record<string, string>
  set: (k: string, v: string) => void
}) {
  return (
    <div className="border border-neutral-300 rounded-xl p-3">
      <div className="text-sm font-semibold mb-2">{label}</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-neutral-700 block mb-1">🤖 Android</span>
          <input
            type="text"
            value={form[androidKey] || ''}
            onChange={(e) => set(androidKey, e.target.value)}
            className="input-field font-mono text-xs"
            dir="ltr"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-700 block mb-1">🍎 iOS</span>
          <input
            type="text"
            value={form[iosKey] || ''}
            onChange={(e) => set(iosKey, e.target.value)}
            className="input-field font-mono text-xs"
            dir="ltr"
          />
        </label>
      </div>
    </div>
  )
}
