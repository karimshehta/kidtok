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
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAdminStats } from '@/hooks/useFeed'
import { cn } from '@/lib/utils'

export default function AdminDashboard() {
  const { t } = useTranslation()
  const { data: stats, isLoading } = useAdminStats()

  const cards: Array<{
    key: 'users' | 'creators' | 'children' | 'playlists' | 'pendingReview' | 'approvedCreator' | 'suggested' | 'reports'
    value: number | undefined
    icon: typeof UsersIcon
    color: string
    href?: string
  }> = [
    { key: 'users', value: stats?.totalUsers, icon: UsersIcon, color: 'text-blue-600 bg-blue-50' },
    { key: 'creators', value: stats?.totalCreators, icon: Sparkles, color: 'text-purple-600 bg-purple-50' },
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
        <header className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-primary" />
            {t('admin.dashboard.title')}
          </h1>
          <p className="text-neutral-700 mt-1">{t('admin.dashboard.welcome')}</p>
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
