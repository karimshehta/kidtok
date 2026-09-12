import { useCallback, useMemo, useRef } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import KidCoinIcon from '@/components/KidCoinIcon'
import { supabase } from '@/lib/supabase'
import { colors, fontSize, radius, spacing } from '@/lib/theme'

type CoinTier = 'crown' | 'diamond' | 'gold' | 'silver' | 'bronze'

interface RichestEntry {
  rank_position: number
  user_id: string | null
  display_name: string
  username: string | null
  avatar_url: string | null
  coin_balance: number | null
  coin_tier: CoinTier
}

interface KidTokRichestLeaderboardProps {
  topInset: number
  ar: boolean
}

const TIER_META: Record<CoinTier, {
  icon: keyof typeof Ionicons.glyphMap
  color: string
  soft: string
  ar: string
  en: string
}> = {
  crown: {
    icon: 'trophy',
    color: '#F59E0B',
    soft: '#FEF3C7',
    ar: 'تاج الأغنى',
    en: 'Crown',
  },
  diamond: {
    icon: 'diamond',
    color: '#22D3EE',
    soft: '#CFFAFE',
    ar: 'ماسي',
    en: 'Diamond',
  },
  gold: {
    icon: 'medal',
    color: '#D97706',
    soft: '#FEF3C7',
    ar: 'ذهبي',
    en: 'Gold',
  },
  silver: {
    icon: 'medal-outline',
    color: '#64748B',
    soft: '#E2E8F0',
    ar: 'فضي',
    en: 'Silver',
  },
  bronze: {
    icon: 'ribbon-outline',
    color: '#B45309',
    soft: '#FFEDD5',
    ar: 'برونزي',
    en: 'Bronze',
  },
}

function normalizeEntry(row: any): RichestEntry {
  const tier = String(row?.coin_tier || 'bronze') as CoinTier
  const rank = Number(row?.rank_position)
  const rawBalance = row?.coin_balance
  const balance = rawBalance == null ? null : Number(rawBalance)
  return {
    rank_position: Number.isFinite(rank) ? Math.max(1, rank) : 1,
    user_id: typeof row?.user_id === 'string' && row.user_id.trim() ? row.user_id.trim() : null,
    display_name: String(row?.display_name || 'KidTok Star'),
    username: row?.username ? String(row.username) : null,
    avatar_url: row?.avatar_url ? String(row.avatar_url) : null,
    coin_balance: balance != null && Number.isFinite(balance) ? Math.max(0, balance) : null,
    coin_tier: TIER_META[tier] ? tier : 'bronze',
  }
}

function formatCoins(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

export default function KidTokRichestLeaderboard({ topInset, ar }: KidTokRichestLeaderboardProps) {
  const locale = ar ? 'ar-EG' : 'en-US'
  const router = useRouter()
  const openingProfilesRef = useRef(new Set<string>())
  const query = useQuery<RichestEntry[]>({
    queryKey: ['kidtok-richest', 50],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_kidtok_richest', { p_limit: 50 })
      if (error) throw error
      return ((data || []) as any[]).map(normalizeEntry)
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  })

  const leaders = query.data || []
  const podium = useMemo(() => {
    const first = leaders[0]
    const second = leaders[1]
    const third = leaders[2]
    return [third, first, second].filter(Boolean) as RichestEntry[]
  }, [leaders])

  const openProfile = useCallback(async (entry: RichestEntry) => {
    const userId = entry.user_id?.trim()
    const username = entry.username?.trim()
    const openKey = userId || username
    if (!openKey || openingProfilesRef.current.has(openKey)) return

    openingProfilesRef.current.add(openKey)
    try {
      if (userId) {
        router.push(`/creator/${userId}` as any)
        return
      }

      if (!username) return
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle()
      if (error) throw error

      if (!data?.id) {
        Toast.show({
          type: 'info',
          text1: ar ? 'البروفايل مش متاح دلوقتي' : 'Profile is not available right now',
          text2: ar ? 'حدّث الترتيب وجرّب تاني.' : 'Refresh the ranking and try again.',
        })
        return
      }

      router.push(`/creator/${data.id}` as any)
    } catch {
      Toast.show({
        type: 'error',
        text1: ar ? 'معرفناش نفتح البروفايل' : 'Could not open the profile',
        text2: ar ? 'جرّب تاني بعد لحظة.' : 'Please try again in a moment.',
      })
    } finally {
      openingProfilesRef.current.delete(openKey)
    }
  }, [ar, router])

  return (
    <LinearGradient
      colors={['#071527', '#0B2440', '#111827']}
      style={{ flex: 1 }}
    >
      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: topInset }}>
          <ActivityIndicator size="large" color="#FBBF24" />
          <Text style={{ color: 'rgba(255,255,255,0.72)', marginTop: spacing.md, fontWeight: '700' }}>
            {ar ? 'بنرتب أغنياء كيدتوك…' : 'Ranking KidTok’s richest…'}
          </Text>
        </View>
      ) : query.isError ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, paddingTop: topInset }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(248,113,113,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="cloud-offline-outline" size={34} color="#FCA5A5" />
          </View>
          <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '900', marginTop: spacing.md, textAlign: 'center' }}>
            {ar ? 'مش قادرين نعرض الترتيب دلوقتي' : 'The ranking is unavailable right now'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center' }}>
            {ar ? 'جرّب تاني بعد لحظة.' : 'Please try again in a moment.'}
          </Text>
          <Pressable
            onPress={() => { void query.refetch() }}
            style={({ pressed }) => ({
              marginTop: spacing.lg,
              opacity: pressed ? 0.8 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              paddingHorizontal: spacing.lg,
              paddingVertical: 11,
              borderRadius: radius.pill,
              backgroundColor: colors.primary,
            })}
          >
            <Ionicons name="refresh" size={18} color={colors.white} />
            <Text style={{ color: colors.white, fontWeight: '900' }}>{ar ? 'إعادة المحاولة' : 'Try again'}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: topInset,
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.xxl + 76,
          }}
          refreshControl={(
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => { void query.refetch() }}
              tintColor="#FBBF24"
              colors={['#FBBF24']}
              progressBackgroundColor="#0F2946"
            />
          )}
        >
          <View style={{ alignItems: 'center', paddingHorizontal: spacing.md }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(251,191,36,0.14)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="trophy" size={29} color="#FBBF24" />
            </View>
            <Text style={{ color: colors.white, fontSize: fontSize['2xl'], fontWeight: '900', marginTop: spacing.sm, textAlign: 'center' }}>
              {ar ? 'أغنياء كيدتوك' : 'KidTok Richest'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: fontSize.sm, marginTop: 5, textAlign: 'center' }}>
              {ar ? 'نجوم جمعوا أكبر رصيد كوينز' : 'Stars with the biggest coin balances'}
            </Text>
          </View>

          {leaders.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: spacing.xxl, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}>
              <KidCoinIcon size={52} />
              <Text style={{ color: colors.white, fontSize: fontSize.lg, fontWeight: '900', marginTop: spacing.md, textAlign: 'center' }}>
                {ar ? 'لسه السباق بيبدأ!' : 'The race is just starting!'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center', lineHeight: 21 }}>
                {ar ? 'أول ما نجوم كيدتوك يجمعوا كوينز، ترتيبهم هيظهر هنا.' : 'As KidTok stars collect coins, their ranking will appear here.'}
              </Text>
            </View>
          ) : (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: spacing.xl,
                  paddingHorizontal: 2,
                  minHeight: 205,
                }}
              >
                {podium.map((entry, index) => (
                  <PodiumCard
                    key={`${entry.rank_position}-${entry.user_id || entry.username || entry.display_name}-${index}`}
                    entry={entry}
                    ar={ar}
                    locale={locale}
                    onOpenProfile={openProfile}
                  />
                ))}
              </View>

              {leaders.length > 3 && (
                <View style={{ marginTop: spacing.xl }}>
                  <Text style={{ color: colors.white, fontSize: fontSize.base, fontWeight: '900', marginBottom: spacing.sm }}>
                    {ar ? 'باقي الترتيب' : 'Leaderboard'}
                  </Text>
                  <View style={{ gap: spacing.sm }}>
                    {leaders.slice(3).map((entry, index) => (
                      <LeaderboardRow
                        key={`${entry.rank_position}-${entry.user_id || entry.username || entry.display_name}-${index}`}
                        entry={entry}
                        ar={ar}
                        locale={locale}
                        onOpenProfile={openProfile}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.lg }}>
            <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.45)" />
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center' }}>
              {ar ? 'الترتيب ورصيد الكوينز ظاهرين للتشجيع والتحدي' : 'Ranks and coin balances are public for the KidTok challenge'}
            </Text>
          </View>
        </ScrollView>
      )}
    </LinearGradient>
  )
}

function PodiumCard({
  entry,
  ar,
  locale,
  onOpenProfile,
}: {
  entry: RichestEntry
  ar: boolean
  locale: string
  onOpenProfile: (entry: RichestEntry) => void
}) {
  const first = entry.rank_position === 1
  const meta = TIER_META[entry.coin_tier]
  const avatarSize = first ? 74 : 58
  const balance = Number(entry.coin_balance ?? 0)

  return (
    <Pressable
      accessibilityRole={(entry.user_id || entry.username) ? 'button' : undefined}
      accessibilityLabel={(entry.user_id || entry.username) ? (ar ? `فتح بروفايل ${entry.display_name}` : `Open ${entry.display_name}'s profile`) : undefined}
      disabled={!entry.user_id && !entry.username}
      onPress={() => onOpenProfile(entry)}
      style={{
        width: '31%',
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingTop: first ? 0 : 28,
        transform: [{ translateY: first ? -10 : 0 }],
        zIndex: first ? 3 : 1,
      }}
    >
      {first && (
        <Ionicons name="trophy" size={27} color="#FBBF24" style={{ marginBottom: -1 }} />
      )}
      <View style={{ position: 'relative' }}>
        <LinearGradient
          colors={first ? ['#FDE68A', '#F59E0B', '#B45309'] : [meta.soft, meta.color]}
          style={{ width: avatarSize + 8, height: avatarSize + 8, borderRadius: (avatarSize + 8) / 2, padding: 4 }}
        >
          <Avatar entry={entry} size={avatarSize} />
        </LinearGradient>
        <View style={{ position: 'absolute', bottom: -5, alignSelf: 'center', minWidth: 30, height: 25, borderRadius: 13, paddingHorizontal: 7, backgroundColor: first ? '#F59E0B' : meta.color, borderWidth: 2, borderColor: '#10233A', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.white, fontSize: 12, fontWeight: '900' }}>#{entry.rank_position}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={{ width: '100%', color: colors.white, fontWeight: '900', fontSize: first ? fontSize.base : fontSize.sm, textAlign: 'center', marginTop: 12 }}>
        {entry.display_name}
      </Text>
      {entry.username ? (
        <Text numberOfLines={1} style={{ width: '100%', color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
          @{entry.username.replace(/^@/, '')}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: ar ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 4,
          marginTop: 7,
          backgroundColor: 'rgba(251,191,36,0.16)',
          paddingHorizontal: 9,
          paddingVertical: 5,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: 'rgba(251,191,36,0.28)',
        }}
      >
        <KidCoinIcon size={16} />
        <Text style={{ color: '#FDE68A', fontSize: 12, fontWeight: '900' }}>{formatCoins(balance, locale)}</Text>
      </View>
      <View
        style={{
          width: first ? 64 : 52,
          height: first ? 72 : 54,
          marginTop: 8,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
          backgroundColor: first ? 'rgba(245,158,11,0.24)' : 'rgba(14,165,233,0.16)',
          borderWidth: 1,
          borderColor: first ? 'rgba(251,191,36,0.4)' : 'rgba(125,211,252,0.22)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={meta.icon} size={first ? 21 : 17} color={first ? '#FBBF24' : meta.color} />
      </View>
    </Pressable>
  )
}

function LeaderboardRow({
  entry,
  ar,
  locale,
  onOpenProfile,
}: {
  entry: RichestEntry
  ar: boolean
  locale: string
  onOpenProfile: (entry: RichestEntry) => void
}) {
  const meta = TIER_META[entry.coin_tier]
  const balance = Number(entry.coin_balance ?? 0)
  return (
    <Pressable
      accessibilityRole={(entry.user_id || entry.username) ? 'button' : undefined}
      accessibilityLabel={(entry.user_id || entry.username) ? (ar ? `فتح بروفايل ${entry.display_name}` : `Open ${entry.display_name}'s profile`) : undefined}
      disabled={!entry.user_id && !entry.username}
      onPress={() => onOpenProfile(entry)}
      style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: spacing.sm + 2, padding: spacing.sm + 2, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}
    >
      <Text style={{ width: 34, color: 'rgba(255,255,255,0.72)', fontSize: fontSize.sm, fontWeight: '900', textAlign: 'center' }}>
        #{entry.rank_position}
      </Text>
      <Avatar entry={entry} size={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '900', textAlign: ar ? 'right' : 'left' }}>
          {entry.display_name}
        </Text>
        <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
          <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: meta.soft }}>
            <Ionicons name={meta.icon} size={10} color={meta.color} />
            <Text style={{ color: meta.color, fontSize: 9, fontWeight: '900' }}>{ar ? meta.ar : meta.en}</Text>
          </View>
          {entry.username ? (
            <Text numberOfLines={1} style={{ flex: 1, color: 'rgba(255,255,255,0.45)', fontSize: 10, textAlign: ar ? 'right' : 'left' }}>
              @{entry.username.replace(/^@/, '')}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(251,191,36,0.13)' }}>
        <KidCoinIcon size={17} />
        <Text style={{ color: '#FDE68A', fontSize: 12, fontWeight: '900' }}>{formatCoins(balance, locale)}</Text>
      </View>
    </Pressable>
  )
}

function Avatar({ entry, size }: { entry: RichestEntry; size: number }) {
  if (entry.avatar_url) {
    return (
      <Image
        source={{ uri: entry.avatar_url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1E3A5F' }}
      />
    )
  }

  const initial = entry.display_name.trim().charAt(0).toUpperCase() || 'K'
  return (
    <LinearGradient
      colors={[colors.primary, colors.secondary]}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: colors.white, fontSize: size * 0.38, fontWeight: '900' }}>{initial}</Text>
    </LinearGradient>
  )
}
