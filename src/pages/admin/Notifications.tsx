import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Bell,
  Send,
  Users,
  Languages,
  CreditCard,
  Gift,
  UserCheck,
  Loader2,
  Image as ImageIcon,
  Link2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { ar, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'

type TargetType = 'all' | 'language' | 'subscribed' | 'free' | 'user' | 'role'

interface NotificationHistory {
  id: string
  title_ar: string
  body_ar: string
  title_en: string | null
  body_en: string | null
  target_type: string
  target_value: string | null
  sent_count: number
  failed_count: number
  status: string
  created_at: string
}

export default function AdminNotifications() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const qc = useQueryClient()

  const [titleAr, setTitleAr] = useState('')
  const [bodyAr, setBodyAr] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [deepLink, setDeepLink] = useState('')
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [targetValue, setTargetValue] = useState<string>('')

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['push-stats'],
    queryFn: async () => {
      const { count: total } = await supabase
        .from('push_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
      const { count: arCount } = await supabase
        .from('push_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('language', 'ar')
      const { count: enCount } = await supabase
        .from('push_tokens')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('language', 'en')
      return { total: total || 0, arCount: arCount || 0, enCount: enCount || 0 }
    },
  })

  // History
  const { data: history = [] } = useQuery({
    queryKey: ['notification-history'],
    queryFn: async (): Promise<NotificationHistory[]> => {
      const { data } = await supabase
        .from('notification_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      return (data || []) as NotificationHistory[]
    },
  })

  // Send mutation
  const sendMut = useMutation({
    mutationFn: async () => {
      if (!titleAr.trim() || !bodyAr.trim()) {
        throw new Error(isAr ? 'العنوان والنص العربي مطلوبان' : 'Arabic title + body required')
      }
      const payload: any = {
        title_ar: titleAr.trim(),
        body_ar: bodyAr.trim(),
        title_en: titleEn.trim() || null,
        body_en: bodyEn.trim() || null,
        image_url: imageUrl.trim() || null,
        deep_link: deepLink.trim() || null,
        target_type: targetType,
      }
      if (targetType !== 'all' && targetType !== 'subscribed' && targetType !== 'free') {
        payload.target_value = targetValue.trim() || null
      }
      const { data, error } = await supabase.functions.invoke('send-push', { body: payload })
      if (error) throw error
      return data
    },
    onSuccess: (data: any) => {
      toast.success(
        isAr
          ? `تم الإرسال إلى ${data?.sent || 0} مستخدم`
          : `Sent to ${data?.sent || 0} users`
      )
      // Reset
      setTitleAr(''); setBodyAr(''); setTitleEn(''); setBodyEn('')
      setImageUrl(''); setDeepLink(''); setTargetValue('')
      qc.invalidateQueries({ queryKey: ['notification-history'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-neutral-900">
              {isAr ? 'الإشعارات' : 'Push Notifications'}
            </h1>
            <p className="text-sm text-neutral-600">
              {isAr ? 'أرسل إشعارات للمستخدمين بلغتهم المختارة' : 'Send notifications to users in their chosen language'}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard icon={<Users />} label={isAr ? 'إجمالي الأجهزة' : 'Total Devices'} value={stats?.total ?? 0} color="primary" />
          <StatCard icon={<Languages />} label={isAr ? 'عربي' : 'Arabic'} value={stats?.arCount ?? 0} color="secondary" />
          <StatCard icon={<Languages />} label={isAr ? 'إنجليزي' : 'English'} value={stats?.enCount ?? 0} color="amber" />
        </div>

        {/* Compose */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">{isAr ? 'إنشاء إشعار' : 'Compose'}</h2>

          {/* Arabic */}
          <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🇪🇬</span>
              <span className="font-bold text-blue-900">العربية</span>
              <span className="text-xs text-blue-600">(مطلوب)</span>
            </div>
            <input
              type="text"
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="العنوان"
              dir="rtl"
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 mb-2 focus:outline-none focus:ring-2 focus:ring-primary text-right"
              maxLength={100}
            />
            <textarea
              value={bodyAr}
              onChange={(e) => setBodyAr(e.target.value)}
              placeholder="نص الإشعار"
              dir="rtl"
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary text-right"
              maxLength={200}
            />
            <div className="text-xs text-right text-neutral-500 mt-1">{bodyAr.length}/200</div>
          </div>

          {/* English */}
          <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🇬🇧</span>
              <span className="font-bold text-green-900">English</span>
              <span className="text-xs text-green-600">(optional — falls back to Arabic)</span>
            </div>
            <input
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder="Title"
              dir="ltr"
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={100}
            />
            <textarea
              value={bodyEn}
              onChange={(e) => setBodyEn(e.target.value)}
              placeholder="Body"
              dir="ltr"
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={200}
            />
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-1">
                <ImageIcon className="w-4 h-4" />
                {isAr ? 'رابط صورة (اختياري)' : 'Image URL (optional)'}
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 mb-1">
                <Link2 className="w-4 h-4" />
                {isAr ? 'رابط داخلي (اختياري)' : 'Deep link (optional)'}
              </label>
              <input
                type="text"
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
                placeholder="/subscription"
                className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Target */}
          <div className="mb-4">
            <label className="text-sm font-medium text-neutral-700 mb-2 block">
              {isAr ? 'الجمهور' : 'Target audience'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <TargetBtn icon={<Users />} label={isAr ? 'الكل' : 'All'} active={targetType === 'all'} onClick={() => setTargetType('all')} />
              <TargetBtn icon={<Languages />} label={isAr ? 'عربي فقط' : 'Arabic only'} active={targetType === 'language' && targetValue === 'ar'} onClick={() => { setTargetType('language'); setTargetValue('ar') }} />
              <TargetBtn icon={<Languages />} label={isAr ? 'إنجليزي فقط' : 'English only'} active={targetType === 'language' && targetValue === 'en'} onClick={() => { setTargetType('language'); setTargetValue('en') }} />
              <TargetBtn icon={<CreditCard />} label={isAr ? 'مشتركين' : 'Subscribed'} active={targetType === 'subscribed'} onClick={() => setTargetType('subscribed')} />
              <TargetBtn icon={<Gift />} label={isAr ? 'مجاني' : 'Free users'} active={targetType === 'free'} onClick={() => setTargetType('free')} />
              <TargetBtn icon={<UserCheck />} label={isAr ? 'منشئين' : 'Creators'} active={targetType === 'role' && targetValue === 'creator'} onClick={() => { setTargetType('role'); setTargetValue('creator') }} />
            </div>
          </div>

          {/* Send button */}
          <button
            onClick={() => sendMut.mutate()}
            disabled={sendMut.isPending || !titleAr.trim() || !bodyAr.trim()}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 rounded-full font-black text-base transition-all',
              titleAr.trim() && bodyAr.trim() && !sendMut.isPending
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg hover:-translate-y-0.5'
                : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
            )}
          >
            {sendMut.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            {sendMut.isPending ? (isAr ? 'جارٍ الإرسال...' : 'Sending...') : (isAr ? 'إرسال الإشعار' : 'Send Notification')}
          </button>
        </div>

        {/* History */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-6">
          <h2 className="text-lg font-bold mb-4">{isAr ? 'سجل الإشعارات' : 'Recent Notifications'}</h2>
          {history.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              <Bell className="w-12 h-12 mx-auto mb-2 text-neutral-300" />
              <p>{isAr ? 'لا توجد إشعارات بعد' : 'No notifications yet'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((n) => (
                <HistoryRow key={n.id} n={n} isAr={isAr} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: 'primary' | 'secondary' | 'amber' }) {
  const colorMap = {
    primary: 'from-primary/10 to-primary/5 text-primary border-primary/20',
    secondary: 'from-secondary/10 to-secondary/5 text-secondary border-secondary/20',
    amber: 'from-amber-100 to-amber-50 text-amber-600 border-amber-200',
  }
  return (
    <div className={cn('p-4 rounded-2xl border bg-gradient-to-br', colorMap[color])}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5">{icon}</div>
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-black">{value.toLocaleString()}</div>
    </div>
  )
}

function TargetBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all border',
        active
          ? 'bg-primary text-white border-primary shadow-md'
          : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
      )}
    >
      <div className="w-4 h-4">{icon}</div>
      <span>{label}</span>
    </button>
  )
}

function HistoryRow({ n, isAr }: { n: NotificationHistory; isAr: boolean }) {
  const statusIcon =
    n.status === 'sent' ? <CheckCircle2 className="w-4 h-4 text-green-500" />
    : n.status === 'failed' ? <AlertCircle className="w-4 h-4 text-red-500" />
    : <Clock className="w-4 h-4 text-amber-500" />

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-neutral-100 hover:bg-neutral-50 transition-colors">
      <div className="mt-1">{statusIcon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <div className="font-bold text-neutral-900 truncate">{n.title_ar}</div>
          {n.title_en && <div className="text-xs text-neutral-500 truncate">{n.title_en}</div>}
        </div>
        <div className="text-sm text-neutral-700 truncate mt-0.5">{n.body_ar}</div>
        <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
          <span>📬 {n.sent_count} {isAr ? 'تم الإرسال' : 'sent'}</span>
          {n.failed_count > 0 && <span className="text-red-500">⚠ {n.failed_count}</span>}
          <span>•</span>
          <span>
            {formatDistanceToNow(new Date(n.created_at), {
              addSuffix: true,
              locale: isAr ? ar : enUS,
            })}
          </span>
        </div>
      </div>
    </div>
  )
}
