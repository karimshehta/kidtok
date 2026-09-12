import { useState, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { G, Rect, Text as SvgText, Line } from 'react-native-svg'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

// ───── Helpers ─────────────────────────────────────────────────────────────
const ymd = (d: Date) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
const daysAgo = (n: number) => { const d = today(); d.setDate(d.getDate() - n); return d }
const usedTimesFromSeconds = (totalSeconds: number): UsedTimes => ({
  hours: Math.floor(totalSeconds / 3600),
  minutes: Math.floor((totalSeconds % 3600) / 60),
  seconds: Math.floor(totalSeconds % 60),
})

function listDateKeys(from: string, to: string) {
  const keys: string[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  while (cursor <= end) {
    keys.push(ymd(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

type UsedTimes = { hours: number; minutes: number; seconds?: number }
type VideoItem = {
  id: string
  title: string | null
  name?: string | null
  thumbnail: string | null
  youtube_id: string | null
  channel_name: string | null
  category: string | null
  date: string
  watched_count: number
  watched_time: UsedTimes
}
type ScreenTimeData = {
  used_times: UsedTimes
  days: string[]
  videos_count: number
  videos_hours: { day: string; hours: number }[]
}
type ActivityData = {
  most_watched_video: (Omit<VideoItem, 'date' | 'category' | 'name'> & { channel_name: string | null }) | null
  most_watched_category: { name: string; watched_count: number; watched_time: UsedTimes } | null
  videos: VideoItem[]
}

type RangeKey = '7d' | '30d' | '90d'
type ChartPoint = {
  key: string
  label: string
  hours: number
  isCurrent: boolean
}

const RANGES: { key: RangeKey; days: number; labelAr: string; labelEn: string }[] = [
  { key: '7d',  days: 7,  labelAr: '٧ أيام',  labelEn: '7 days'  },
  { key: '30d', days: 30, labelAr: '٣٠ يوم',  labelEn: '30 days' },
  { key: '90d', days: 90, labelAr: '٩٠ يوم',  labelEn: '90 days' },
]

const DAY_LABELS_AR = ['أحد','إثن','ثلا','أرب','خمي','جمع','سبت']
const DAY_LABELS_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function formatTime(ut: UsedTimes | null | undefined, ar: boolean): string {
  if (!ut) return ar ? '٠ دقيقة' : '0 min'
  const h = Number(ut.hours || 0)
  const m = Number(ut.minutes || 0)
  const s = Number(ut.seconds || 0)
  if (h > 0 && m > 0) return ar ? `${h} س ${m} د` : `${h}h ${m}m`
  if (h > 0)         return ar ? `${h} ساعة`      : `${h}h`
  if (m === 0 && s > 0) return ar ? `${s} ث` : `${s}s`
  return ar ? `${m} دقيقة` : `${m}m`
}

function fmtShort(ut: UsedTimes | null | undefined): string {
  if (!ut) return '0m'
  const h = Number(ut.hours || 0)
  const m = Number(ut.minutes || 0)
  const s = Number(ut.seconds || 0)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

const MONTH_LABELS_AR = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس']
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getChartTitle(range: RangeKey, ar: boolean) {
  if (range === '7d') return ar ? 'الساعات اليومية' : 'Daily hours'
  if (range === '30d') return ar ? 'الساعات الأسبوعية' : 'Weekly hours'
  return ar ? 'الساعات الشهرية' : 'Monthly hours'
}

function buildChartPoints(data: { day: string; hours: number }[], range: RangeKey, ar: boolean): ChartPoint[] {
  const normalized = data.map((item) => ({
    day: item.day,
    hours: Number(item.hours || 0),
    date: new Date(`${item.day}T00:00:00`),
  }))
  const todayKey = ymd(today())

  if (range === '7d') {
    return normalized.map((item) => ({
      key: item.day,
      label: (ar ? DAY_LABELS_AR : DAY_LABELS_EN)[item.date.getDay()],
      hours: item.hours,
      isCurrent: item.day === todayKey,
    }))
  }

  if (range === '30d') {
    const points: ChartPoint[] = []
    for (let start = 0; start < normalized.length; start += 7) {
      const items = normalized.slice(start, start + 7)
      const weekNumber = points.length + 1
      points.push({
        key: `week-${weekNumber}`,
        label: ar ? `أسبوع ${weekNumber}` : `W${weekNumber}`,
        hours: Number(items.reduce((sum, item) => sum + item.hours, 0).toFixed(2)),
        isCurrent: items.some((item) => item.day === todayKey),
      })
    }
    return points
  }

  const monthMap = new Map<string, ChartPoint>()
  for (const item of normalized) {
    const key = `${item.date.getFullYear()}-${item.date.getMonth()}`
    const existing = monthMap.get(key)
    if (existing) {
      existing.hours = Number((existing.hours + item.hours).toFixed(2))
      existing.isCurrent = existing.isCurrent || item.day === todayKey
    } else {
      monthMap.set(key, {
        key,
        label: (ar ? MONTH_LABELS_AR : MONTH_LABELS_EN)[item.date.getMonth()],
        hours: item.hours,
        isCurrent: item.day === todayKey,
      })
    }
  }
  return Array.from(monthMap.values())
}

// ───── Bar chart (pure react-native-svg, no external deps) ─────────────────
function BarChart({
  data, height = 180, ar,
}: { data: ChartPoint[]; height?: number; ar: boolean }) {
  const padTop = 30, padBottom = 32, padLeft = 36, padRight = 12
  const chartHeight = height - padTop - padBottom
  const max = Math.max(0.1, ...data.map(d => d.hours))
  const ticks = [0, max / 3, (max / 3) * 2, max].map(v => Number(v.toFixed(1)))

  const viewWidth = 320
  const barArea = viewWidth - padLeft - padRight
  const slot    = barArea / Math.max(1, data.length)
  const barW    = Math.min(42, Math.max(12, slot * 0.48))

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${viewWidth} ${height}`}>
      {ticks.map((t, i) => {
        const y = padTop + chartHeight - (t / max) * chartHeight
        return (
          <G key={`tick-${i}`}>
            <Line x1={padLeft} y1={y} x2={viewWidth - padRight} y2={y}
                  stroke="#E5E7EB" strokeDasharray="3,3" strokeWidth={0.5} />
            <SvgText x={padLeft - 4} y={y + 3} fontSize="9"
                     fill={colors.grey500} textAnchor="end">
              {t}
            </SvgText>
          </G>
        )
      })}

      {data.map((d, i) => {
        const h     = (d.hours / max) * chartHeight
        const x     = padLeft + slot * i + (slot - barW) / 2
        const y     = padTop + chartHeight - h
        return (
          <G key={d.key}>
            <Rect
              x={x} y={y} width={barW} height={Math.max(0, h)}
              rx={4} ry={4}
              fill={d.isCurrent ? colors.secondary : colors.primary}
              opacity={d.hours > 0 ? 1 : 0.25}
            />
            {d.hours > 0 && (
              <SvgText
                x={x + barW / 2}
                y={Math.max(10, y - 6)}
                fontSize="8"
                fill={colors.grey600}
                fontWeight="bold"
                textAnchor="middle"
              >
                {d.hours}
              </SvgText>
            )}
            <SvgText
              x={x + barW / 2}
              y={padTop + chartHeight + 14}
              fontSize="9"
              fill={d.isCurrent ? colors.secondary : colors.grey500}
              fontWeight={d.isCurrent ? 'bold' : 'normal'}
              textAnchor="middle"
            >
              {d.label}
            </SvgText>
          </G>
        )
      })}
      <SvgText x={8} y={12} fontSize="8" fill={colors.grey400}>
        {ar ? 'ساعة' : 'hours'}
      </SvgText>
    </Svg>
  )
}

// ───── Screen ──────────────────────────────────────────────────────────────
export default function StatisticsScreen() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { id: childId } = useLocalSearchParams<{ id: string }>()

  const [tab, setTab] = useState<'time' | 'activity'>('time')
  const [range, setRange] = useState<RangeKey>('7d')

  const dateRange = useMemo(() => {
    const r = RANGES.find(x => x.key === range)!
    return { from: ymd(daysAgo(r.days - 1)), to: ymd(today()) }
  }, [range])

  const { data: child } = useQuery({
    queryKey: ['child-stats', childId],
    queryFn: async () => {
      const { data } = await supabase.from('children').select('id, name, gender, image_url').eq('id', childId).single()
      return data
    },
  })

  // Screen-time source of truth: watch_sessions.
  const { data: screenTime, isLoading: stLoading } = useQuery<ScreenTimeData | null>({
    queryKey: ['screen-time', childId, dateRange.from, dateRange.to],
    enabled: !!childId,
    queryFn: async () => {
      const { data: rows, error: rowsError } = await supabase
        .from('watch_sessions')
        .select('watch_date, watched_seconds')
        .eq('child_id', childId)
        .gte('watch_date', dateRange.from)
        .lte('watch_date', dateRange.to)

      if (rowsError) throw rowsError

      const totals = new Map<string, number>()
      for (const row of rows || []) {
        const day = String((row as any).watch_date)
        totals.set(day, (totals.get(day) || 0) + Number((row as any).watched_seconds || 0))
      }

      const videos_hours = listDateKeys(dateRange.from, dateRange.to).map((day) => ({
        day,
        hours: Number(((totals.get(day) || 0) / 3600).toFixed(2)),
      }))
      const totalSeconds = Array.from(totals.values()).reduce((sum, seconds) => sum + seconds, 0)
      const activeDays = Array.from(totals.entries())
        .filter(([, seconds]) => seconds > 0)
        .map(([day]) => day)

      return {
        used_times: usedTimesFromSeconds(totalSeconds),
        days: activeDays,
        videos_count: (rows || []).filter((row: any) => Number(row.watched_seconds || 0) > 0).length,
        videos_hours,
      }
    },
  })

  const { data: sessionCount } = useQuery<number>({
    queryKey: ['child-watch-session-count', childId, dateRange.from, dateRange.to],
    enabled: !!childId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('watch_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('child_id', childId)
        .gte('watch_date', dateRange.from)
        .lte('watch_date', dateRange.to)
        .gt('watched_seconds', 0)

      if (error) throw error
      return count || 0
    },
  })

  // Activity RPC: most-watched video + category + chronological list
  const { data: activity, isLoading: actLoading } = useQuery<ActivityData | null>({
    queryKey: ['activity', childId, dateRange.from, dateRange.to],
    enabled: !!childId && tab === 'activity',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_child_activity', {
        p_child_id:  childId,
        p_date_from: dateRange.from,
        p_date_to:   dateRange.to,
      })
      if (error) throw error
      return data as ActivityData
    },
  })

  const chartData = useMemo(
    () => buildChartPoints(screenTime?.videos_hours || [], range, ar),
    [screenTime?.videos_hours, range, ar]
  )
  const displayedSessionCount = sessionCount ?? screenTime?.videos_count ?? 0

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.grey50 }}>
      {/* Header */}
      <LinearGradient colors={[colors.primary, '#0A8FB8']} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, paddingBottom: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={ar ? 'chevron-forward' : 'chevron-back'} size={22} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '800' }}>
              {ar ? 'الإحصائيات' : 'Statistics'}
            </Text>
            {child?.name ? (
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, marginTop: 2 }}>{child.name}</Text>
            ) : null}
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Range chips */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg, gap: 8 }}>
          {RANGES.map(r => {
            const active = r.key === range
            return (
              <Pressable
                key={r.key}
                onPress={() => setRange(r.key)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: active ? colors.white : 'rgba(255,255,255,0.18)',
                }}
              >
                <Text style={{
                  color: active ? colors.primary : colors.white,
                  fontWeight: '700', fontSize: fontSize.sm,
                }}>
                  {ar ? r.labelAr : r.labelEn}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.grey100 }}>
        {(['time', 'activity'] as const).map(t => {
          const active = t === tab
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1, paddingVertical: 14, alignItems: 'center',
                borderBottomWidth: 3,
                borderBottomColor: active ? colors.primary : 'transparent',
              }}
            >
              <Text style={{
                color: active ? colors.primary : colors.grey500,
                fontWeight: active ? '800' : '600',
                fontSize: fontSize.sm,
              }}>
                {t === 'time' ? (ar ? 'وقت الشاشة' : 'Screen Time') : (ar ? 'سجل النشاط' : 'Activity Records')}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* Body */}
      {tab === 'time' ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
          {stLoading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : !screenTime ? (
            <NoData ar={ar} />
          ) : (
            <>
              {/* Total time card */}
              <LinearGradient
                colors={[colors.primary, '#0A8FB8']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.lg }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.sm, fontWeight: '600' }}>
                  {ar ? 'إجمالي وقت الاستخدام' : 'Total screen time'}
                </Text>
                <Text style={{ color: colors.white, fontSize: 40, fontWeight: '900', marginTop: 6 }}>
                  {formatTime(screenTime.used_times, ar)}
                </Text>
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: spacing.md }} />
                <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <StatPill icon="play-circle"   label={ar ? 'جلسة'  : 'Sessions'} value={String(displayedSessionCount)} />
                  <StatPill icon="calendar"      label={ar ? 'أيام'   : 'Days'}   value={String(screenTime.days?.length || 0)} />
                </View>
              </LinearGradient>

              {/* Chart card */}
              <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6 }}>
                <Text style={{ fontSize: fontSize.base, fontWeight: '800', color: colors.grey900, marginBottom: spacing.md }}>
                  {getChartTitle(range, ar)}
                </Text>
                <BarChart data={chartData} ar={ar} />
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        // ── Activity tab ─────────────────────────────────────────────
        actLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !activity || (!activity.most_watched_video && (!activity.videos || activity.videos.length === 0)) ? (
          <NoData ar={ar} />
        ) : (
          <FlatList
            data={activity.videos || []}
            keyExtractor={(v) => v.id}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
            ListHeaderComponent={
              <View style={{ marginBottom: spacing.lg }}>
                {/* Most-watched video card */}
                {activity.most_watched_video && (
                  <View style={{
                    backgroundColor: colors.white, borderRadius: radius.lg,
                    padding: spacing.md, marginBottom: spacing.md, flexDirection: 'row', gap: spacing.md,
                    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 2 }, shadowRadius: 6,
                  }}>
                    {activity.most_watched_video.thumbnail ? (
                      <Image source={{ uri: activity.most_watched_video.thumbnail }} style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.grey100 }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.grey100, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="play" size={36} color={colors.grey500} />
                      </View>
                    )}
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="trophy" size={14} color={colors.secondary} />
                        <Text style={{ fontSize: fontSize.xs, fontWeight: '700', color: colors.secondary }}>
                          {ar ? 'الأكثر مشاهدة' : 'Most watched'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: '800', color: colors.grey900, marginTop: 4 }} numberOfLines={2}>
                        {activity.most_watched_video.title || 'Untitled'}
                      </Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey500, marginTop: 4 }}>
                        {fmtShort(activity.most_watched_video.watched_time)} • {activity.most_watched_video.watched_count}× {ar ? 'مشاهدة' : 'plays'}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Most-watched category card */}
                {activity.most_watched_category && (
                  <LinearGradient
                    colors={[colors.secondary, '#F0405F']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={{ borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="layers" size={26} color={colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                        {ar ? 'الفئة المفضلة' : 'Favorite category'}
                      </Text>
                      <Text style={{ fontSize: fontSize.base, color: colors.white, fontWeight: '900', marginTop: 2 }}>
                        {activity.most_watched_category.name}
                      </Text>
                      <Text style={{ fontSize: fontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                        {fmtShort(activity.most_watched_category.watched_time)} • {activity.most_watched_category.watched_count}× {ar ? 'مشاهدة' : 'plays'}
                      </Text>
                    </View>
                  </LinearGradient>
                )}

                <Text style={{ fontSize: fontSize.base, fontWeight: '800', color: colors.grey900, marginTop: spacing.md }}>
                  {ar ? 'كل المشاهدات' : 'All views'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={{
                flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.md,
                padding: spacing.sm, marginBottom: spacing.sm, gap: spacing.md, alignItems: 'center',
              }}>
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={{ width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.grey100 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.grey100, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="play" size={28} color={colors.grey500} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: '700', color: colors.grey900 }} numberOfLines={2}>
                    {item.title || 'Untitled'}
                  </Text>
                  {item.channel_name ? (
                    <Text style={{ fontSize: fontSize.xs, color: colors.grey500, marginTop: 2 }} numberOfLines={1}>
                      {item.channel_name}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="time-outline" size={12} color={colors.primary} />
                      <Text style={{ fontSize: fontSize.xs, color: colors.primary, fontWeight: '600' }}>{fmtShort(item.watched_time)}</Text>
                    </View>
                    <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>•</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.grey500 }}>{item.watched_count}× {ar ? 'م' : 'plays'}</Text>
                  </View>
                </View>
              </View>
            )}
          />
        )
      )}
    </SafeAreaView>
  )
}

function StatPill({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={colors.white} />
      </View>
      <View>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: fontSize.xs }}>{label}</Text>
        <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '800' }}>{value}</Text>
      </View>
    </View>
  )
}

function NoData({ ar }: { ar: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
      <Ionicons name="bar-chart-outline" size={64} color={colors.grey300} />
      <Text style={{ fontSize: fontSize.base, color: colors.grey500, fontWeight: '700', marginTop: spacing.md }}>
        {ar ? 'لا توجد بيانات بعد' : 'No data yet'}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.grey400, marginTop: 6, textAlign: 'center', paddingHorizontal: spacing.xl }}>
        {ar ? 'البيانات ستظهر هنا بعد أن يشاهد الطفل بعض الفيديوهات' : 'Data will appear here after the child watches some videos'}
      </Text>
    </View>
  )
}
