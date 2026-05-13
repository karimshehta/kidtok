import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  ArrowRight,
  Clock,
  TrendingUp,
  Film,
  Loader2,
  Calendar,
  Trophy,
  BarChart3,
} from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import ChildAvatar from '@/components/ChildAvatar'
import { useChild } from '@/hooks/useChildren'
import { useChildStats, formatDuration } from '@/hooks/useStats'
import { useChildMode } from '@/hooks/useChildMode'
import { getYouTubeThumbnail } from '@/lib/youtube'
import { cn } from '@/lib/utils'

export default function Statistics() {
  const { childId } = useParams<{ childId: string }>()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'

  const { data: child, isLoading: childLoading } = useChild(childId)
  const { data: stats, isLoading: statsLoading } = useChildStats(childId)
  const { timeStatus } = useChildMode(childId!)

  const isLoading = childLoading || statsLoading

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </AppLayout>
    )
  }

  // Today's % of daily limit used
  const limitSec = timeStatus?.limitSeconds ?? 3600
  const todayPct = Math.min(100, Math.round(((stats?.totalSecondsToday || 0) / limitSec) * 100))

  const maxMinutes = Math.max(...(stats?.dailyStats.map((d) => d.minutes) || [1]), 1)

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Back */}
        <Link
          to={`/children/${childId}`}
          className="inline-flex items-center gap-1 text-primary text-sm mb-4 hover:underline"
        >
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          {t('common.back')}
        </Link>

        {/* Child header */}
        {child && (
          <div className="flex items-center gap-4 mb-6">
            <ChildAvatar name={child.name} imageUrl={child.image_url} gender={child.gender} size="lg" />
            <div>
              <h1 className="text-2xl font-bold">{child.name}</h1>
              <p className="text-neutral-700 text-sm flex items-center gap-1">
                <BarChart3 className="w-4 h-4" />
                {t('stats.title')}
              </p>
            </div>
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <StatCard
            icon={<Clock className="w-5 h-5 text-primary" />}
            label={t('stats.today')}
            value={formatDuration(stats?.totalSecondsToday || 0)}
            bg="bg-primary/10"
          />
          <StatCard
            icon={<Calendar className="w-5 h-5 text-secondary" />}
            label={t('stats.thisWeek')}
            value={formatDuration(stats?.totalSecondsThisWeek || 0)}
            bg="bg-secondary/10"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-green-600" />}
            label={t('stats.allTime')}
            value={formatDuration(stats?.totalSecondsAllTime || 0)}
            bg="bg-green-50"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* ── Today's limit progress ── */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">{t('stats.dailyLimit')}</span>
            <span className={cn('text-sm font-bold', todayPct >= 100 ? 'text-danger' : todayPct >= 75 ? 'text-amber-600' : 'text-primary')}>
              {formatDuration(stats?.totalSecondsToday || 0, true)} / {formatDuration(limitSec, true)}
            </span>
          </div>
          <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                todayPct >= 100 ? 'bg-danger' : todayPct >= 75 ? 'bg-amber-500' : 'bg-primary'
              )}
              style={{ width: `${todayPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-neutral-700">
            <span>{todayPct}% {t('stats.used')}</span>
            <span>{t('stats.remaining')}: {formatDuration(Math.max(0, limitSec - (stats?.totalSecondsToday || 0)), true)}</span>
          </div>
        </div>

        {/* ── Weekly chart ── */}
        <div className="card mb-6">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t('stats.weeklyChart')}
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats?.dailyStats || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}m`}
              />
              <Tooltip
                formatter={(val: unknown) => [`${Number(val)} min`, t('stats.watchTime')]}
                labelStyle={{ fontWeight: 600 }}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
              />
              <Bar dataKey="minutes" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {(stats?.dailyStats || []).map((entry, idx) => (
                  <Cell
                    key={entry.date}
                    fill={
                      entry.minutes === maxMinutes ? '#03BBE5' :
                      entry.minutes > maxMinutes * 0.6 ? '#7DD8F5' :
                      '#C8EEF9'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Extra stats ── */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="card text-center">
            <div className="text-3xl font-extrabold text-primary mb-1">
              {stats?.sessionCount || 0}
            </div>
            <div className="text-xs text-neutral-700">{t('stats.sessions')}</div>
          </div>
          <div className="card text-center">
            <div className="text-3xl font-extrabold text-secondary mb-1">
              {formatDuration(stats?.avgSessionSeconds || 0, true)}
            </div>
            <div className="text-xs text-neutral-700">{t('stats.avgSession')}</div>
          </div>
        </div>

        {/* ── Top videos ── */}
        {(stats?.topVideos || []).length > 0 && (
          <div className="card">
            <h2 className="font-bold mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              {t('stats.topVideos')}
            </h2>
            <div className="space-y-3">
              {stats!.topVideos.map((v, idx) => (
                <div key={v.video_id} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="w-14 aspect-video rounded-lg overflow-hidden bg-neutral-300 flex-shrink-0">
                    {(v.thumbnail_url || v.youtube_id) && (
                      <img
                        src={v.thumbnail_url || (v.youtube_id ? getYouTubeThumbnail(v.youtube_id, 'default') : '')}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{v.title || 'Video'}</p>
                    <p className="text-xs text-neutral-700">
                      {formatDuration(v.total_seconds, true)} · {v.watch_count}× {t('stats.watched')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!stats?.totalSecondsAllTime && (
          <div className="card text-center py-10">
            <Film className="w-12 h-12 mx-auto text-neutral-700 mb-3" />
            <p className="font-medium mb-1">{t('stats.noDataTitle')}</p>
            <p className="text-sm text-neutral-700">{t('stats.noDataBody')}</p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function StatCard({
  icon,
  label,
  value,
  bg,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: string
  bg: string
  className?: string
}) {
  return (
    <div className={cn('card', className)}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', bg)}>
        {icon}
      </div>
      <div className="text-xl font-extrabold">{value}</div>
      <div className="text-xs text-neutral-700 mt-0.5">{label}</div>
    </div>
  )
}
