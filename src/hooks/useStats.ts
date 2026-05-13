import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subDays, format, startOfDay } from 'date-fns'

export interface DailyWatchStat {
  date: string          // 'YYYY-MM-DD'
  label: string         // 'Mon', 'الاثنين'
  minutes: number
  seconds: number
}

export interface VideoStat {
  video_id: string
  title: string | null
  thumbnail_url: string | null
  youtube_id: string | null
  watch_count: number
  total_seconds: number
}

export interface ChildStats {
  totalSecondsToday: number
  totalSecondsThisWeek: number
  totalSecondsAllTime: number
  dailyStats: DailyWatchStat[]      // last 7 days
  topVideos: VideoStat[]            // most watched videos
  sessionCount: number
  avgSessionSeconds: number
}

/** Full analytics for a child over the last 7 days. */
export function useChildStats(childId: string | undefined) {
  return useQuery({
    queryKey: ['child-stats', childId],
    enabled: !!childId,
    queryFn: async (): Promise<ChildStats> => {
      const today = new Date()
      const todayStr = format(today, 'yyyy-MM-dd')
      const sevenDaysAgo = format(subDays(today, 6), 'yyyy-MM-dd')
      const thisMonday = format(subDays(today, today.getDay() === 0 ? 6 : today.getDay() - 1), 'yyyy-MM-dd')

      // Run all queries in parallel
      const [
        { data: allSessions },
        { data: todaySessions },
        { data: weekSessions },
        { data: videoStats },
      ] = await Promise.all([
        // All time total
        supabase
          .from('watch_sessions')
          .select('watched_seconds, watch_date, started_at')
          .eq('child_id', childId!),

        // Today
        supabase
          .from('watch_sessions')
          .select('watched_seconds')
          .eq('child_id', childId!)
          .eq('watch_date', todayStr),

        // This week (last 7 days for chart)
        supabase
          .from('watch_sessions')
          .select('watched_seconds, watch_date')
          .eq('child_id', childId!)
          .gte('watch_date', sevenDaysAgo),

        // Top videos
        supabase
          .from('watch_sessions')
          .select('video_id, watched_seconds, video:videos(title, thumbnail_url, youtube_id)')
          .eq('child_id', childId!)
          .not('video_id', 'is', null),
      ])

      // ── Aggregate ──
      const totalSecondsToday = (todaySessions || []).reduce(
        (sum, s) => sum + (s.watched_seconds || 0), 0
      )

      const totalSecondsAllTime = (allSessions || []).reduce(
        (sum, s) => sum + (s.watched_seconds || 0), 0
      )

      const totalSecondsThisWeek = (weekSessions || []).reduce(
        (sum, s) => sum + (s.watched_seconds || 0), 0
      )

      // ── Daily stats (last 7 days) ──
      const dayMap: Record<string, number> = {}
      ;(weekSessions || []).forEach((s) => {
        const d = String(s.watch_date)
        dayMap[d] = (dayMap[d] || 0) + (s.watched_seconds || 0)
      })

      const dailyStats: DailyWatchStat[] = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(today, 6 - i)
        const dateStr = format(date, 'yyyy-MM-dd')
        const seconds = dayMap[dateStr] || 0
        return {
          date: dateStr,
          label: format(date, 'EEE'),
          minutes: Math.round(seconds / 60),
          seconds,
        }
      })

      // ── Top videos ──
      const videoMap: Record<string, VideoStat> = {}
      ;(videoStats || []).forEach((s: any) => {
        if (!s.video_id || !s.video) return
        if (!videoMap[s.video_id]) {
          videoMap[s.video_id] = {
            video_id: s.video_id,
            title: s.video.title,
            thumbnail_url: s.video.thumbnail_url,
            youtube_id: s.video.youtube_id,
            watch_count: 0,
            total_seconds: 0,
          }
        }
        videoMap[s.video_id].watch_count += 1
        videoMap[s.video_id].total_seconds += s.watched_seconds || 0
      })

      const topVideos = Object.values(videoMap)
        .sort((a, b) => b.total_seconds - a.total_seconds)
        .slice(0, 6)

      const sessionCount = (allSessions || []).length
      const avgSessionSeconds =
        sessionCount > 0 ? totalSecondsAllTime / sessionCount : 0

      return {
        totalSecondsToday,
        totalSecondsThisWeek,
        totalSecondsAllTime,
        dailyStats,
        topVideos,
        sessionCount,
        avgSessionSeconds,
      }
    },
  })
}

// Format seconds as "Xh Ym" or "Xm"
export function formatDuration(seconds: number, short = false): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return short ? `${h}h ${m}m` : `${h} hr ${m} min`
  if (m > 0) return short ? `${m}m` : `${m} min`
  return short ? `${s}s` : `${s} sec`
}
