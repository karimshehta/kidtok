import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users as UsersIcon,
  Video,
  Baby,
  ListMusic,
  Clock,
  CheckCircle2,
  Sparkles,
  Flag,
  Plus,
  ArrowRight,
  ShieldCheck,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAdminStats } from '@/hooks/useFeed'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ── Active-users counter ────────────────────────────────────────────────
// Reads count_active_users() (5-minute window). Refetches every 30s so the
// number stays meaningful without hammering the DB. Errors silently fall
// back to 0 so the dashboard never shows a broken state to admins.
function useActiveUsers() {
  return useQuery({
    queryKey: ['admin-active-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('count_active_users', { p_window_minutes: 5 })
      if (error) return 0
      return Number(data) || 0
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })
}

export default function AdminDashboard() {
  const { t } = useTranslation()
  const { data: stats, isLoading } = useAdminStats()
  const { data: activeUsers = 0 } = useActiveUsers()

  const cards: Array<{
    key: 'users' | 'children' | 'playlists' | 'pendingReview' | 'approvedCreator' | 'suggested' | 'reports'
    value: number | undefined
    icon: typeof UsersIcon
    color: string
    href?: string
  }> = [
    { key: 'users', value: stats?.totalUsers, icon: UsersIcon, color: 'text-blue-600 bg-blue-50' },
    { key: 'children', value: stats?.totalChildren, icon: Baby, color: 'text-pink-600 bg-pink-50' },
    { key: 'playlists', value: stats?.totalPlaylists, icon: ListMusic, color: 'text-cyan-600 bg-cyan-50' },
    { key: 'pendingReview', value: stats?.pendingReview, icon: Clock, color: 'text-amber-600 bg-amber-50', href: '/admin/moderation' },
    { key: 'approvedCreator', value: stats?.approvedCreatorVideos, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
    { key: 'suggested', value: stats?.suggestedYTVideos, icon: Video, color: 'text-primary bg-primary/10', href: '/admin/content' },
    { key: 'reports', value: stats?.pendingReports, icon: Flag, color: 'text-red-600 bg-red-50', href: '/admin/reports' },
  ]

  return (
    <AdminLayout>
      <div className="max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-primary" />
              {t('admin.dashboard.title')}
            </h1>
            <p className="text-neutral-700 mt-1">{t('admin.dashboard.welcome')}</p>
          </div>

          {/* Active-now badge: green pulsing dot + live user count.
              Re-renders every 30s from useActiveUsers. */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-green-50 border border-green-200 shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-sm font-semibold text-green-800 tabular-nums">
              {activeUsers.toLocaleString()}
            </span>
            <span className="text-xs text-green-700">{t('admin.dashboard.activeNow', 'Active now')}</span>
          </div>
        </header>

        {/* Stats grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {cards.map((card) => {
            const Content = (
              <div className="card hover:shadow-md transition-shadow h-full">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', card.color)}>
                  <card.icon className="w-5 h-5" />
                </div>
                <div className="text-2xl font-bold mb-1">
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-neutral-700" /> : (card.value ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-neutral-700">
                  {t(`admin.dashboard.stats.${card.key}`)}
                </div>
              </div>
            )
            return card.href ? (
              <Link to={card.href} key={card.key} className="block">
                {Content}
              </Link>
            ) : (
              <div key={card.key}>{Content}</div>
            )
          })}
        </section>

        {/* Flagged videos alert */}
        <FlaggedVideosSection />

        {/* Quick actions */}
        <section>
          <h2 className="text-lg font-bold mb-3">{t('admin.dashboard.quickActions')}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link
              to="/admin/content"
              className="card hover:shadow-md transition-shadow flex items-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Plus className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t('admin.dashboard.addSuggested')}</div>
                <div className="text-xs text-neutral-700">{t('admin.content.subtitle')}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-neutral-700 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/admin/moderation"
              className="card hover:shadow-md transition-shadow flex items-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                <Clock className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t('admin.dashboard.reviewPending')}</div>
                <div className="text-xs text-neutral-700">
                  {stats?.pendingReview ?? 0} {t('admin.dashboard.stats.pendingReview')}
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-neutral-700 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1 transition-transform" />
            </Link>
          </div>
        </section>
      </div>
    </AdminLayout>
  )
}

// ── Flagged videos (high dislike ratio or reports) ──
function FlaggedVideosSection() {
  const { t } = useTranslation()
  const [videos, setVideos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.from('videos')
      .select('id, title, thumbnail_url, like_count, dislike_count, view_count, creator_id')
      .eq('source', 'creator')
      .or('dislike_count.gte.5,report_count.gte.3')
      .order('dislike_count', { ascending: false })
      .limit(5)
      .then(({ data }) => { setVideos(data || []); setLoading(false) })
  }, [])

  if (loading || videos.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <h2 className="text-base font-bold text-red-600">فيديوهات مُبلَّغ عنها</h2>
        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{videos.length} تحتاج مراجعة</span>
      </div>
      <div className="space-y-2">
        {videos.map((v: any) => (
          <div key={v.id} className="card flex items-center gap-3 p-3 border-s-4 border-red-400">
            {v.thumbnail_url && (
              <img src={v.thumbnail_url} alt="" className="w-14 aspect-video rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{v.title}</div>
              <div className="text-xs text-neutral-700">
                👎 {v.dislike_count} · 👍 {v.like_count} · 👁 {v.view_count}
              </div>
            </div>
            <DeleteVideoButton videoId={v.id} onDeleted={() => setVideos((prev: any[]) => prev.filter((x: any) => x.id !== v.id))} />
          </div>
        ))}
      </div>
    </section>
  )
}

function DeleteVideoButton({ videoId, onDeleted }: { videoId: string; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  return (
    <button
      onClick={async () => {
        if (!confirm('حذف هذا الفيديو نهائياً؟')) return
        setDeleting(true)
        await supabase.from('videos').delete().eq('id', videoId)
        onDeleted()
        setDeleting(false)
      }}
      disabled={deleting}
      className="text-xs text-danger hover:underline flex-shrink-0"
    >
      {deleting ? '...' : 'حذف'}
    </button>
  )
}
