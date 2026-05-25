import { useState } from 'react'
import toast from 'react-hot-toast'
import { Save, Facebook, Instagram, Mail, ExternalLink } from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const SOCIAL_KEYS = ['social_facebook', 'social_instagram', 'social_email'] as const
type SocialKey = typeof SOCIAL_KEYS[number]

const SOCIAL_META: Record<SocialKey, { label: string; icon: any; placeholder: string; color: string; bg: string }> = {
  social_facebook: {
    label: 'Facebook',
    icon: Facebook,
    placeholder: 'https://facebook.com/your-page',
    color: '#1877F2',
    bg: '#EBF5FF',
  },
  social_instagram: {
    label: 'Instagram',
    icon: Instagram,
    placeholder: 'https://instagram.com/your-account',
    color: '#E1306C',
    bg: '#FFF0F5',
  },
  social_email: {
    label: 'Email',
    icon: Mail,
    placeholder: 'support@kidtok.app',
    color: '#0EA5E9',
    bg: '#F0F9FF',
  },
}

export default function SocialPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<Record<SocialKey, string>>({
    social_facebook: '',
    social_instagram: '',
    social_email: '',
  })

  const { isLoading } = useQuery({
    queryKey: ['admin-social'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', SOCIAL_KEYS)
      const map: Partial<Record<SocialKey, string>> = {}
      for (const row of data || []) {
        if (SOCIAL_KEYS.includes(row.key as SocialKey)) {
          map[row.key as SocialKey] = row.value || ''
        }
      }
      setForm((prev) => ({ ...prev, ...map }))
      return map
    },
  })

  const saveMut = useMutation({
    mutationFn: async () => {
      const upserts = SOCIAL_KEYS.map((key) => ({
        key,
        value: form[key] || '',
        description: `Social media link for ${key.replace('social_', '')}`,
        is_public: true,
      }))
      const { error } = await supabase.from('app_settings').upsert(upserts, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Social links saved ✓')
      qc.invalidateQueries({ queryKey: ['admin-social'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">Social Media Links</h1>
          <p className="text-sm text-gray-500 mt-1">
            Links shown to users in the app's "Contact Us" section (Settings → Contact Us).
          </p>
        </div>

        {/* Cards */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <div className="space-y-4">
            {SOCIAL_KEYS.map((key) => {
              const meta = SOCIAL_META[key]
              const Icon = meta.icon
              const val = form[key]
              return (
                <div key={key} className="bg-white rounded-xl border border-gray-200 p-5 flex gap-4">
                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: meta.bg }}
                  >
                    <Icon size={22} style={{ color: meta.color }} />
                  </div>

                  {/* Field */}
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-bold text-gray-800">{meta.label}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder={meta.placeholder}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                        style={{ direction: 'ltr' }}
                      />
                      {val && (
                        <a
                          href={key === 'social_email' ? `mailto:${val}` : val}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 hover:text-gray-600"
                          title="Preview link"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {key === 'social_email'
                        ? 'Enter email address only (without mailto:)'
                        : 'Enter the full URL including https://'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Preview */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">
            Preview in app (Contact Us)
          </p>
          <div className="flex gap-6 justify-center">
            {SOCIAL_KEYS.map((key) => {
              const meta = SOCIAL_META[key]
              const Icon = meta.icon
              return (
                <div key={key} className="flex flex-col items-center gap-2">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: meta.bg, border: `2px solid ${meta.color}20` }}
                  >
                    <Icon size={24} style={{ color: meta.color }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-600">{meta.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save size={18} />
          {saveMut.isPending ? 'Saving…' : 'Save Social Links'}
        </button>
      </div>
    </AdminLayout>
  )
}
