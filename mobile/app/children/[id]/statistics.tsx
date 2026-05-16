import { View, Text, ScrollView, Pressable, ActivityIndicator, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { colors, spacing, fontSize, radius } from '@/lib/theme'

interface Session {
  id: string
  started_at: string
  watched_seconds: number
  video_id: string | null
  videos: { id: string; title: string | null; thumbnail_url: string | null } | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export default function StatisticsScreen() {
  const router = useRouter()
  const { id: childId } = useLocalSearchParams<{ id: string }>()

  const { data: child } = useQuery({
    queryKey: ['child', childId],
    queryFn: async () => {
      const { data } = await supabase.from('children').select('name').eq('id', childId).single()
      return data
    },
  })

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['child-sessions', childId],
    queryFn: async (): Promise<Session[]> => {
      const since = new Date(Date.now() - 7 * DAY_MS).toISOString()
      const { data, error } = await supabase
        .from('watch_sessions')
        .select('id, started_at, watched_seconds, video_id, videos(id, title, thumbnail_url)')
        .eq('child_id', childId)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
      if (error) throw error
      return (data || []) as any
    },
  })

  // ── Compute daily totals for last 7 days
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days: { date: Date; seconds: number; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS)
    days.push({
      date: d,
      seconds: 0,
      label: ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'][d.getDay()],
    })
  }
  for (const s of sessions) {
    const sDate = new Date(s.started_at)
    sDate.setHours(0, 0, 0, 0)
    const dayIdx = days.findIndex((d) => d.date.getTime() === sDate.getTime())
    if (dayIdx >= 0) days[dayIdx].seconds += s.watched_seconds || 0
  }

  const todaySeconds = days[days.length - 1].seconds
  const weekSeconds = days.reduce((a, d) => a + d.seconds, 0)
  const totalSessions = sessions.length
  const avgSession = totalSessions ? Math.round(weekSeconds / totalSessions / 60) : 0

  // ── Top 5 videos by total watch time
  const videoMap = new Map<string, { id: string; title: string; thumbnail: string; seconds: number }>()
  for (const s of sessions) {
    if (!s.videos) continue
    const k = s.videos.id
    const cur = videoMap.get(k)
    if (cur) cur.seconds += s.watched_seconds || 0
    else videoMap.set(k, {
      id: s.videos.id,
      title: s.videos.title || 'فيديو',
      thumbnail: s.videos.thumbnail_url || '',
      seconds: s.watched_seconds || 0,
    })
  }
  const topVideos = Array.from(videoMap.values()).sort((a, b) => b.seconds - a.seconds).slice(0, 5)

  const maxSeconds = Math.max(1, ...days.map((d) => d.seconds))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={28} color={colors.grey900} />
        </Pressable>
        <View>
          <Text style={{ fontSize: fontSize.xl, fontWeight: '900', color: colors.grey900 }}>
            إحصائيات
          </Text>
          {child?.name && (
            <Text style={{ fontSize: fontSize.sm, color: colors.grey600 }}>{child.name}</Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
          {/* Summary cards */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            <StatCard
              label="اليوم"
              value={formatTime(todaySeconds)}
              icon="time"
              color={colors.primary}
            />
            <StatCard
              label="الأسبوع"
              value={formatTime(weekSeconds)}
              icon="calendar"
              color={colors.secondary}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
            <StatCard
              label="جلسات"
              value={String(totalSessions)}
              icon="play-circle"
              color="#8B5CF6"
            />
            <StatCard
              label="متوسط الجلسة"
              value={`${avgSession} د`}
              icon="stopwatch"
              color="#F59E0B"
            />
          </View>

          {/* 7-day chart */}
          <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.grey900, marginBottom: spacing.md }}>
            آخر 7 أيام
          </Text>
          <View
            style={{
              backgroundColor: colors.grey50,
              borderRadius: radius.lg,
              padding: spacing.md,
              marginBottom: spacing.xl,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 }}>
              {days.map((d, i) => {
                const pct = (d.seconds / maxSeconds) * 100
                const isToday = i === days.length - 1
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: colors.grey600, marginBottom: 4 }}>
                      {d.seconds > 0 ? formatShort(d.seconds) : ''}
                    </Text>
                    <View
                      style={{
                        height: `${Math.max(2, pct)}%`,
                        width: '70%',
                        backgroundColor: isToday ? colors.primary : `${colors.primary}80`,
                        borderRadius: 8,
                        minHeight: 4,
                      }}
                    />
                  </View>
                )
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs }}>
              {days.map((d, i) => (
                <Text
                  key={i}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: 11,
                    color: i === days.length - 1 ? colors.primary : colors.grey600,
                    fontWeight: i === days.length - 1 ? '800' : '500',
                  }}
                >
                  {d.label}
                </Text>
              ))}
            </View>
          </View>

          {/* Top videos */}
          {topVideos.length > 0 && (
            <>
              <Text style={{ fontSize: fontSize.lg, fontWeight: '800', color: colors.grey900, marginBottom: spacing.sm }}>
                الفيديوهات الأكثر مشاهدة
              </Text>
              <View style={{ gap: spacing.xs }}>
                {topVideos.map((v, i) => (
                  <View
                    key={v.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.grey50,
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      gap: spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: i === 0 ? '#FBBF24' : colors.grey200,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontWeight: '900', color: i === 0 ? colors.white : colors.grey700 }}>
                        {i + 1}
                      </Text>
                    </View>
                    {v.thumbnail ? (
                      <Image source={{ uri: v.thumbnail }} style={{ width: 60, height: 40, borderRadius: 6 }} />
                    ) : (
                      <View style={{ width: 60, height: 40, borderRadius: 6, backgroundColor: colors.grey200 }} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: '700' }} numberOfLines={2}>
                        {v.title}
                      </Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }}>
                        {formatTime(v.seconds)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {sessions.length === 0 && (
            <View style={{ alignItems: 'center', padding: spacing.xl, marginTop: spacing.xl }}>
              <Ionicons name="stats-chart-outline" size={64} color={colors.grey200} />
              <Text style={{ color: colors.grey700, marginTop: spacing.sm, fontWeight: '700' }}>
                لا توجد بيانات بعد
              </Text>
              <Text style={{ color: colors.grey600, fontSize: fontSize.sm, marginTop: 4, textAlign: 'center' }}>
                ستظهر الإحصائيات بعد أن يبدأ الطفل بالمشاهدة
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: `${color}10`,
        borderRadius: radius.lg,
        padding: spacing.md,
        borderWidth: 1, borderColor: `${color}25`,
      }}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={{ fontSize: fontSize['2xl'], fontWeight: '900', color: colors.grey900, marginTop: spacing.xs }}>
        {value}
      </Text>
      <Text style={{ fontSize: fontSize.xs, color: colors.grey600 }}>{label}</Text>
    </View>
  )
}

function formatTime(seconds: number): string {
  if (seconds === 0) return '0 د'
  if (seconds < 60) return `${seconds} ث`
  if (seconds < 3600) return `${Math.round(seconds / 60)} د`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m === 0 ? `${h} س` : `${h} س ${m} د`
}

function formatShort(seconds: number): string {
  if (seconds < 60) return `${seconds}ث`
  return `${Math.round(seconds / 60)}د`
}
