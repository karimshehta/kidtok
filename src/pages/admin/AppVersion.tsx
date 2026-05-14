import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Smartphone,
  Save,
  Loader2,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Info,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAdminSettings, useUpdateSettings } from '@/hooks/useAds'
import { cn } from '@/lib/utils'

// All version-control keys we manage on this page
const VERSION_KEYS = [
  'app_min_android_version',
  'app_current_android_version',
  'app_android_store_url',
  'app_min_ios_version',
  'app_current_ios_version',
  'app_ios_store_url',
  'app_force_update_message_ar',
  'app_force_update_message_en',
  'app_maintenance_mode',
  'app_maintenance_message_ar',
  'app_maintenance_message_en',
]

function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export default function AdminAppVersion() {
  const { t } = useTranslation()
  const { data: allSettings = [], isLoading } = useAdminSettings()
  const updateMut = useUpdateSettings()

  const [form, setForm] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (allSettings.length > 0 && Object.keys(form).length === 0) {
      const init: Record<string, string> = {}
      allSettings.forEach((s: any) => {
        if (VERSION_KEYS.includes(s.key)) init[s.key] = s.value ?? ''
      })
      setForm(init)
    }
  }, [allSettings, form])

  const set = (key: string, value: string) => {
    setForm((p) => ({ ...p, [key]: value }))
    setIsDirty(true)
  }

  const toggle = (key: string) => set(key, form[key] === 'true' ? 'false' : 'true')

  const handleSave = async () => {
    // Validate: min must be ≤ current
    if (form['app_min_android_version'] && form['app_current_android_version']) {
      if (semverCompare(form['app_min_android_version'], form['app_current_android_version']) > 0) {
        toast.error('Minimum Android version cannot be higher than current version')
        return
      }
    }
    if (form['app_min_ios_version'] && form['app_current_ios_version']) {
      if (semverCompare(form['app_min_ios_version'], form['app_current_ios_version']) > 0) {
        toast.error('Minimum iOS version cannot be higher than current version')
        return
      }
    }
    try {
      await updateMut.mutateAsync(form)
      toast.success('App version settings saved')
      setIsDirty(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const apiUrl = `https://${import.meta.env.VITE_SUPABASE_URL?.replace('https://', '')?.split('.')[0]}.supabase.co/functions/v1/app-config`

  const maintenanceOn = form['app_maintenance_mode'] === 'true'

  return (
    <AdminLayout>
      <div className="max-w-3xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Smartphone className="w-7 h-7 text-primary" />
              تحكم في إصدار التطبيق
            </h1>
            <p className="text-neutral-700 text-sm mt-1">
              حدّد أقل إصدار مسموح به — التطبيق القديم هيظهرله شاشة إجبارية للتحديث
            </p>
          </div>
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="btn-primary inline-flex items-center gap-2"
            >
              {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الإعدادات
            </button>
          )}
        </header>

        {/* ── Maintenance Mode ── */}
        <div className={cn(
          'card mb-4 border-2',
          maintenanceOn ? 'border-red-400 bg-red-50' : 'border-neutral-300'
        )}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-bold flex items-center gap-2">
                <AlertTriangle className={cn('w-5 h-5', maintenanceOn ? 'text-red-500' : 'text-neutral-700')} />
                وضع الصيانة
              </h2>
              <p className="text-sm text-neutral-700 mt-0.5">
                لو فعّلته، كل المستخدمين هيشوفوا شاشة صيانة بغض النظر عن الإصدار
              </p>
            </div>
            <button type="button" onClick={() => toggle('app_maintenance_mode')}>
              {maintenanceOn
                ? <ToggleRight className="w-10 h-10 text-red-500" />
                : <ToggleLeft className="w-10 h-10 text-neutral-700" />}
            </button>
          </div>
          {maintenanceOn && (
            <div className="bg-red-100 border border-red-300 rounded-xl p-3 text-sm text-red-700 mb-3">
              ⚠️ التطبيق محجوب دلوقتي لكل المستخدمين!
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="رسالة الصيانة (عربي)" value={form['app_maintenance_message_ar'] || ''} onChange={(v) => set('app_maintenance_message_ar', v)} />
            <Field label="رسالة الصيانة (English)" value={form['app_maintenance_message_en'] || ''} onChange={(v) => set('app_maintenance_message_en', v)} />
          </div>
        </div>

        {/* ── Android ── */}
        <PlatformCard
          platform="android"
          emoji="🤖"
          label="Android — Google Play"
          currentVersion={form['app_current_android_version'] || '1.0.0'}
          minVersion={form['app_min_android_version'] || '1.0.0'}
          storeUrl={form['app_android_store_url'] || ''}
          onCurrentChange={(v) => set('app_current_android_version', v)}
          onMinChange={(v) => set('app_min_android_version', v)}
          onStoreChange={(v) => set('app_android_store_url', v)}
        />

        {/* ── iOS ── */}
        <PlatformCard
          platform="ios"
          emoji="🍎"
          label="iOS — Apple App Store"
          currentVersion={form['app_current_ios_version'] || '1.0.0'}
          minVersion={form['app_min_ios_version'] || '1.0.0'}
          storeUrl={form['app_ios_store_url'] || ''}
          onCurrentChange={(v) => set('app_current_ios_version', v)}
          onMinChange={(v) => set('app_min_ios_version', v)}
          onStoreChange={(v) => set('app_ios_store_url', v)}
        />

        {/* ── Force update message ── */}
        <div className="card mb-4">
          <h2 className="font-bold mb-3">رسالة التحديث الإجباري</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              label="النص بالعربي"
              value={form['app_force_update_message_ar'] || ''}
              onChange={(v) => set('app_force_update_message_ar', v)}
            />
            <Field
              label="النص بالإنجليزي"
              value={form['app_force_update_message_en'] || ''}
              onChange={(v) => set('app_force_update_message_en', v)}
            />
          </div>
        </div>

        {/* ── API endpoint ── */}
        <div className="card bg-neutral-50 border border-neutral-300">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            API Endpoint (للـ Mobile App)
          </h2>
          <p className="text-sm text-neutral-700 mb-2">
            التطبيق يكلّم هذا الـ endpoint عند كل فتح. لو الإصدار أقل من الحد الأدنى → تظهر شاشة التحديث.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-neutral-200 rounded-lg px-3 py-2 font-mono truncate" dir="ltr">
              GET {apiUrl}
            </code>
            <a
              href={apiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline !py-1.5 !px-3 text-xs inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Test
            </a>
          </div>
          <div className="mt-3 text-xs text-neutral-700 space-y-1">
            <div>✅ لا يحتاج JWT (مفتوح للعموم)</div>
            <div>✅ يرجع: maintenance mode + min versions + store URLs + messages</div>
          </div>
        </div>

        {/* How it works */}
        <div className="card mt-4">
          <h2 className="font-bold mb-3">🔄 كيف يشتغل؟</h2>
          <div className="space-y-3 text-sm">
            <Step n={1} text="المستخدم يفتح التطبيق" />
            <Step n={2} text="التطبيق يكلّم الـ API endpoint فوراً" />
            <Step n={3} text="لو maintenance_mode = true → شاشة صيانة للكل" />
            <Step n={4} text="لو إصدار المستخدم < min_version → شاشة تحديث إجباري" />
            <Step n={5} text="المستخدم يضغط 'تحديث الآن' → يفتح Play Store أو App Store" />
            <Step n={6} text="لا يقدر يغلق الشاشة أو يتجاوزها 🔒" />
          </div>
        </div>

        {isDirty && (
          <div className="flex justify-end mt-6">
            <button
              onClick={handleSave}
              disabled={updateMut.isPending}
              className="btn-primary inline-flex items-center gap-2"
            >
              {updateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الإعدادات
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

// ── Platform card ──
function PlatformCard({
  platform, emoji, label,
  currentVersion, minVersion, storeUrl,
  onCurrentChange, onMinChange, onStoreChange,
}: {
  platform: string; emoji: string; label: string
  currentVersion: string; minVersion: string; storeUrl: string
  onCurrentChange: (v: string) => void
  onMinChange: (v: string) => void
  onStoreChange: (v: string) => void
}) {
  const forceUpdate = semverCompare(minVersion, currentVersion) === 0
  const allGood = semverCompare(minVersion, currentVersion) < 0

  return (
    <div className="card mb-4">
      <h2 className="font-bold mb-4 text-lg flex items-center gap-2">
        <span>{emoji}</span>
        {label}
        {forceUpdate && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ms-auto">
            كل المستخدمين مضطرين يحدّثوا
          </span>
        )}
        {allGood && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full ms-auto flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            مرن
          </span>
        )}
      </h2>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        {/* Current version */}
        <div>
          <label className="block text-sm font-medium mb-1">
            📦 الإصدار الحالي على المتجر
            <span className="text-xs text-neutral-700 font-normal ms-1">(current)</span>
          </label>
          <input
            type="text"
            value={currentVersion}
            onChange={(e) => onCurrentChange(e.target.value)}
            placeholder="1.0.0"
            className="input-field font-mono"
            dir="ltr"
          />
          <p className="text-xs text-neutral-700 mt-1">الإصدار الجديد اللي رفعته على المتجر</p>
        </div>

        {/* Minimum version */}
        <div>
          <label className="block text-sm font-medium mb-1">
            🚫 أقل إصدار مسموح
            <span className="text-xs text-neutral-700 font-normal ms-1">(min)</span>
          </label>
          <input
            type="text"
            value={minVersion}
            onChange={(e) => onMinChange(e.target.value)}
            placeholder="1.0.0"
            className={cn('input-field font-mono', semverCompare(minVersion, currentVersion) > 0 ? 'border-red-400' : '')}
            dir="ltr"
          />
          <p className="text-xs text-neutral-700 mt-1">الإصدارات الأقل منه → شاشة تحديث إجباري</p>
        </div>
      </div>

      {/* Visual version comparison */}
      <div className="bg-neutral-100 rounded-xl p-3 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono font-bold">{minVersion || '1.0.0'}</span>
          <span className="text-neutral-700">← أقل مسموح</span>
          <div className="flex-1 h-2 bg-gradient-to-r from-red-400 via-amber-400 to-green-400 rounded-full mx-2" />
          <span className="text-neutral-700">الحالي →</span>
          <span className="font-mono font-bold">{currentVersion || '1.0.0'}</span>
        </div>
        <p className="text-xs text-neutral-700 mt-2">
          {minVersion === currentVersion
            ? '⚠️ كل الإصدارات القديمة ستُجبر على التحديث'
            : semverCompare(minVersion, currentVersion) < 0
              ? `✅ المستخدمون على ${minVersion}+ يقدروا يشغّلوا التطبيق`
              : '❌ الحد الأدنى أعلى من الإصدار الحالي — خطأ!'}
        </p>
      </div>

      <Field
        label={`🔗 رابط المتجر (${platform === 'android' ? 'Play Store' : 'App Store'})`}
        value={storeUrl}
        onChange={onStoreChange}
        placeholder={platform === 'android' ? 'https://play.google.com/store/apps/details?id=...' : 'https://apps.apple.com/app/...'}
        mono
      />
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, mono,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; mono?: boolean
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium block mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={mono ? 'ltr' : undefined}
        className={cn('input-field', mono && 'font-mono text-sm')}
      />
    </label>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <span className="text-sm">{text}</span>
    </div>
  )
}
