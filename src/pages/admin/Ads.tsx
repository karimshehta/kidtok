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
  Coins,
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
            ⚠️ <strong>App IDs</strong> are baked into the native build at compile time — changing them requires a new release. <strong>Unit IDs and toggles</strong> are read live from this dashboard and update over-the-air without a rebuild.
          </p>

          <div className="space-y-3">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <label className="block">
                <span className="text-sm font-semibold block mb-0.5">Creator upload storage</span>
                <span className="text-xs text-neutral-700 block mb-2">
                  New mobile builds only. Keep Cloudflare until R2 secrets and public bucket URL are configured.
                </span>
                <select
                  value={form['creator_upload_storage_provider'] || 'cloudflare'}
                  onChange={(e) => set('creator_upload_storage_provider', e.target.value)}
                  className="input-field"
                  dir="ltr"
                >
                  <option value="cloudflare">cloudflare</option>
                  <option value="r2">r2</option>
                </select>
              </label>
            </div>
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
            <PlatformFields
              label="Banner Unit IDs"
              androidKey="admob_android_banner"
              iosKey="admob_ios_banner"
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
            <Field
              label="Auto-show rewarded ad after (minutes)"
              hint="Show rewarded ad prompt in feed + child mode after X minutes of use. Free users only. Set to 0 to disable."
              value={form['rewarded_ad_after_minutes'] || '3'}
              onChange={(v) => set('rewarded_ad_after_minutes', v)}
              type="number"
              min={0}
              max={60}
            />
            <Field
              label="Rewarded prompt after feed swipes"
              hint="Mobile feed only: show a rewarded-ad gate after N swipes in KidTok Hero, Suggested, or Following. 0 = disabled."
              value={form['rewarded_ad_after_swipes'] || '0'}
              onChange={(v) => set('rewarded_ad_after_swipes', v)}
              type="number"
              min={0}
              max={100}
            />
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Rewarded ads must remain opt-in under AdMob policy. For a truly forced ad break, use the interstitial frequency below instead.
            </div>

            {/* ─── Interstitial Frequency ─── */}
            <div className="pt-2 border-t border-neutral-200">
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-2">Feed Interstitial Frequency</p>
              <Field
                label="Show interstitial after every N videos"
                hint="How many videos a free user watches before seeing an interstitial ad (0 = disabled)"
                value={form['ads_interstitial_after_videos'] || '5'}
                onChange={(v) => set('ads_interstitial_after_videos', v)}
                type="number"
                min={0}
                max={50}
              />
            </div>

            {/* ─── Banner Ads ─── */}
            <div className="pt-2 border-t border-neutral-200">
              <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-2">Banner Ads (Feed — Parent Mode Only)</p>
              <PlatformFields
                label="Banner Unit IDs"
                androidKey="admob_android_banner"
                iosKey="admob_ios_banner"
                form={form}
                set={set}
              />
              {/* ─── Master toggles per ad type (OTA) ─── */}
              <div className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 border border-neutral-200">
                <div>
                  <p className="text-sm font-medium">Enable interstitial ads</p>
                  <p className="text-xs text-neutral-500">Full-screen ads between feed videos (free users)</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('admob_interstitial_enabled', form['admob_interstitial_enabled'] === 'false' ? 'true' : 'false')}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    form['admob_interstitial_enabled'] !== 'false' ? 'bg-primary' : 'bg-neutral-300'
                  )}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    form['admob_interstitial_enabled'] !== 'false' ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 border border-neutral-200">
                <div>
                  <p className="text-sm font-medium">Enable rewarded ads</p>
                  <p className="text-xs text-neutral-500">Optional ads users watch to earn coins or ad-free time</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('admob_rewarded_enabled', form['admob_rewarded_enabled'] === 'false' ? 'true' : 'false')}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    form['admob_rewarded_enabled'] !== 'false' ? 'bg-primary' : 'bg-neutral-300'
                  )}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    form['admob_rewarded_enabled'] !== 'false' ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-neutral-50 rounded-xl px-4 py-3 border border-neutral-200">
                <div>
                  <p className="text-sm font-medium">Enable banner in feed</p>
                  <p className="text-xs text-neutral-500">Show banner at bottom of feed for free users (parent mode only)</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('admob_banner_enabled', form['admob_banner_enabled'] === 'true' ? 'false' : 'true')}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    form['admob_banner_enabled'] === 'true' ? 'bg-primary' : 'bg-neutral-300'
                  )}
                >
                  <span className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    form['admob_banner_enabled'] === 'true' ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>
            </div>
          </div>
        </section>


        {/* ======================================================
            Coin / Rewards System
        ====================================================== */}
        <section className="card mb-4">
          <h2 className="font-bold flex items-center gap-2 mb-4">
            <span className="text-xl">🪙</span>
            {t('coins.adminTitle')}
          </h2>
          <p className="text-sm text-neutral-700 mb-4">{t('coins.adminSubtitle')}</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <Field label={t('coins.perAd')} hint="Default: 5"
              value={form['coins_per_ad'] || '5'} onChange={(v) => set('coins_per_ad', v)} type="number" min={1} max={100} />
            <Field label={t('coins.cooldown')} hint="Default: 30"
              value={form['ad_reward_cooldown_min'] || '30'} onChange={(v) => set('ad_reward_cooldown_min', v)} type="number" min={1} max={1440} />
            <Field label="Coins per daily register" hint="Default: 5"
              value={form['coins_per_daily_register'] || '5'} onChange={(v) => set('coins_per_daily_register', v)} type="number" min={0} max={1000} />
            <Field label={t('coins.monthlyRequired')} hint="Default: 100"
              value={form['coins_for_monthly'] || '100'} onChange={(v) => set('coins_for_monthly', v)} type="number" min={1} />
            <Field label={t('coins.yearlyRequired')} hint="Default: 200"
              value={form['coins_for_yearly'] || '200'} onChange={(v) => set('coins_for_yearly', v)} type="number" min={1} />
            <Field label={t('coins.monthlyDiscount')} hint="100 = free"
              value={form['monthly_discount_pct'] || '100'} onChange={(v) => set('monthly_discount_pct', v)} type="number" min={1} max={100} />
            <Field label={t('coins.yearlyDiscount')} hint="50 = half price"
              value={form['yearly_discount_pct'] || '50'} onChange={(v) => set('yearly_discount_pct', v)} type="number" min={1} max={100} />
          </div>

          <div className="flex items-center justify-between py-3 border-t border-neutral-300">
            <div>
              <div className="font-medium">{t('coins.onboardingEnabled')}</div>
              <div className="text-xs text-neutral-700">Show Watch/Login/Skip popup on first visit</div>
            </div>
            <button type="button" onClick={() => {
              const cur = form['coins_onboarding_enabled']
              set('coins_onboarding_enabled', cur === 'false' ? 'true' : 'false')
            }}>
              {form['coins_onboarding_enabled'] !== 'false'
                ? <ToggleRight className="w-9 h-9 text-primary" />
                : <ToggleLeft className="w-9 h-9 text-neutral-700" />}
            </button>
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
