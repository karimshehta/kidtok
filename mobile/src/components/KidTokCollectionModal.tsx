import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Toast from 'react-native-toast-message'

import KidCoinIcon from '@/components/KidCoinIcon'
import { ProfileThemeDecor } from '@/components/ProfileThemeDecor'
import RewardedAdPrompt from '@/components/RewardedAdPrompt'
import {
  claimKidTokMission,
  getMyKidTokCollection,
  KidTokMission,
  KidTokTheme,
  purchaseAndEquipProfileFrame,
  purchaseAndEquipProfileTheme,
  unequipMyProfileFrame,
} from '@/lib/kidtokCollection'
import {
  getSnapLensUseCost,
  loadSnapLensCatalog,
  snapLensPriceLabel,
  type SnapLensCatalogItem,
} from '@/lib/snapLensCatalog'
import { colors, fontSize, radius, spacing } from '@/lib/theme'

type CollectionTab = 'missions' | 'themes' | 'frames' | 'badges' | 'lenses'

export const kidtokCollectionQueryKey = (userId?: string | null) =>
  ['kidtok-collection', userId || null] as const

export default function KidTokCollectionModal({
  visible,
  ar,
  userId,
  coinBalance,
  initialTab = 'missions',
  showMissions = true,
  onClose,
  onChanged,
}: {
  visible: boolean
  ar: boolean
  userId?: string | null
  coinBalance: number
  initialTab?: CollectionTab
  showMissions?: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<CollectionTab>(showMissions ? initialTab : (initialTab === 'missions' ? 'frames' : initialTab))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [themeCandidate, setThemeCandidate] = useState<KidTokTheme | null>(null)
  const [rewardPromptVisible, setRewardPromptVisible] = useState(false)
  const [rewardReturnTab, setRewardReturnTab] = useState<CollectionTab>('frames')

  const { data, isLoading, refetch } = useQuery({
    queryKey: kidtokCollectionQueryKey(userId),
    enabled: visible && !!userId,
    staleTime: 20_000,
    queryFn: getMyKidTokCollection,
  })

  const snapLensShopQuery = useQuery({
    queryKey: ['snap-lens-shop', userId],
    enabled: visible && !!userId,
    staleTime: 20_000,
    queryFn: async (): Promise<{ lenses: SnapLensCatalogItem[] }> => {
      const lenses = await loadSnapLensCatalog()
      return {
        lenses: lenses
          .filter((lens) => lens.is_active !== false && lens.is_blocked !== true)
          .sort((left, right) => {
            if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order
            return String(left.name_en || left.name_ar || left.id).localeCompare(String(right.name_en || right.name_ar || right.id))
          }),
      }
    },
  })

  const themes = data?.themes || []
  const missions = data?.missions || []
  const frames = data?.frames || []
  const badges = data?.badges || []
  const snapLenses = snapLensShopQuery.data?.lenses || []
  const balance = data?.coin_balance ?? coinBalance

  useEffect(() => {
    if (!visible) return
    setTab(showMissions ? initialTab : (initialTab === 'missions' ? 'frames' : initialTab))
  }, [initialTab, showMissions, visible])

  const offerRewardedCoins = (returnTab: CollectionTab) => {
    setRewardReturnTab(returnTab)
    Toast.hide()
    setRewardPromptVisible(true)
  }

  const dailyMissions = useMemo(
    () => missions.filter((mission) => mission.scope === 'daily'),
    [missions]
  )
  const weeklyMissions = useMemo(
    () => missions.filter((mission) => mission.scope === 'weekly'),
    [missions]
  )

  const invalidateCollection = async () => {
    await Promise.all([
      refetch(),
      qc.invalidateQueries({ queryKey: kidtokCollectionQueryKey(userId) }),
      qc.invalidateQueries({ queryKey: ['snap-lens-shop', userId] }),
      qc.invalidateQueries({ queryKey: ['creator-progress', userId] }),
      qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'coins' }),
    ])
    onChanged?.()
  }

  const claimMission = async (mission: KidTokMission) => {
    if (busyId) return
    setBusyId(mission.id)
    try {
      const result = await claimKidTokMission(mission.id)
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'استلمت مكافأة المهمة!' : 'Mission reward claimed!',
        text2: ar
          ? `+${Number(result?.reward_coins || mission.reward_coins)} كوين`
          : `+${Number(result?.reward_coins || mission.reward_coins)} coins`,
        props: { icon: '🎯', accent: 'gold' },
      })
      await invalidateCollection()
    } catch (error: any) {
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'المهمة لسه مش جاهزة' : 'Mission is not ready yet',
        text2: String(error?.message || error || '').slice(0, 110),
        props: { icon: '✨', accent: 'purple' },
      })
    } finally {
      setBusyId(null)
    }
  }

  const equipTheme = async (theme: KidTokTheme) => {
    if (busyId) return
    setBusyId(theme.id)
    try {
      const result = await purchaseAndEquipProfileTheme(theme.id)
      const spent = Number(result?.coins_spent || 0)
      Toast.show({
        type: 'kidReward',
        text1: ar ? 'الثيم اشتغل على بروفايلك!' : 'Theme equipped!',
        text2: spent > 0
          ? (ar ? `تم استخدام ${spent} كوين` : `${spent} coins used`)
          : (ar ? 'اختيار جميل يا بطل' : 'Nice choice, hero!'),
        props: { icon: theme.emoji || '🎨', accent: spent > 0 ? 'gold' : 'blue' },
      })
      await invalidateCollection()
    } catch (error: any) {
      const raw = String(error?.message || error || '')
      const insufficient = raw.includes('INSUFFICIENT_COINS')
      if (insufficient) {
        offerRewardedCoins('themes')
        return
      }
      Toast.show({
        type: 'kidReward',
        text1: insufficient
          ? (ar ? 'محتاج كوينز أكتر' : 'You need more coins')
          : (ar ? 'الثيم متغيرش' : 'Theme was not changed'),
        text2: insufficient
          ? (ar ? 'شاهد إعلان مكافأة واجمع كوينز ثم جرب تاني.' : 'Watch rewarded ads, collect coins, and try again.')
          : raw.slice(0, 110),
        props: { icon: insufficient ? '🪙' : '🎨', accent: insufficient ? 'gold' : 'purple' },
      })
    } finally {
      setBusyId(null)
    }
  }

  const requestTheme = (theme: KidTokTheme) => {
    if (theme.equipped || busyId) return
    if (!theme.owned && !theme.is_free) {
      if (balance < theme.coin_cost) {
        offerRewardedCoins('themes')
        return
      }
      setThemeCandidate(theme)
      return
    }
    void equipTheme(theme)
  }

  const applyFrame = async (frame: any) => {
    if (busyId || !frame?.id) return
    const current = frame.id === data?.current_frame_id
    const owned = frame.owned === true || frame.is_free === true
    const cost = Number(frame.coin_cost || 0)
    if (!current && !owned && cost > balance) {
      offerRewardedCoins('frames')
      return
    }
    setBusyId(frame.id)
    try {
      const result = current
        ? await unequipMyProfileFrame()
        : await purchaseAndEquipProfileFrame(frame.id)
      const spent = Number(result?.coins_spent || 0)
      Toast.show({
        type: 'kidReward',
        text1: current
          ? (ar ? 'تم إخفاء الإطار' : 'Frame removed')
          : (ar ? 'الإطار بقى على صورتك!' : 'Frame equipped!'),
        text2: spent > 0
          ? (ar ? `تم استخدام ${spent} كوين` : `${spent} coins used`)
          : (ar ? 'اختيار رائع يا بطل' : 'Nice choice, hero!'),
        props: { icon: current ? '🖼️' : (frame.icon || '🛒'), accent: spent > 0 ? 'gold' : 'blue' },
      })
      await invalidateCollection()
    } catch (error: any) {
      const raw = String(error?.message || error || '')
      const insufficient = raw.includes('INSUFFICIENT_COINS')
      if (insufficient) {
        offerRewardedCoins('frames')
        return
      }
      Toast.show({
        type: 'kidReward',
        text1: insufficient
          ? (ar ? 'محتاج كوينز أكثر' : 'You need more coins')
          : (ar ? 'الإطار متغيرش' : 'Frame was not changed'),
        text2: insufficient
          ? (ar ? 'افتح السلة بعد ما تكسب كوينز من إعلان Reward.' : 'Earn coins from a rewarded ad, then try the frame again.')
          : raw.slice(0, 110),
        props: { icon: insufficient ? '🪙' : '✨', accent: insufficient ? 'gold' : 'purple' },
      })
    } finally {
      setBusyId(null)
    }
  }

  const unlockSnapLens = (lens: SnapLensCatalogItem) => {
    if (busyId || !lens?.id) return
    const cost = getSnapLensUseCost(lens)
    const title = ar ? (lens.name_ar || lens.name_en || lens.name_match) : (lens.name_en || lens.name_ar || lens.name_match)

    if (cost > 0 && cost > balance) {
      offerRewardedCoins('lenses')
      return
    }

    Toast.show({
      type: 'kidReward',
      text1: ar ? 'اختار الوش من الكاميرا' : 'Pick this face in the camera',
      text2: cost > 0
        ? (ar ? `${title} هيتخصم ${cost} كوين لما تدوس Record، للفيديو ده فقط.` : `${title} costs ${cost} coins only when you press Record, for one video.`)
        : (ar ? `${title} مجاني وجاهز للتصوير.` : `${title} is free and ready to record.`),
      props: { icon: cost > 0 ? '🪙' : '✨', accent: cost > 0 ? 'gold' : 'blue' },
    })
  }

  const modalTitle = showMissions
    ? (ar ? 'مهمات وجوائز KidTok' : 'KidTok Missions & rewards')
    : (ar ? 'شنطة KidTok' : 'KidTok Bag')
  const modalSubtitle = showMissions
    ? (ar ? 'الكاليندر، المهمات، والمتجر في مكان واحد' : 'Calendar, missions, and shop in one place')
    : (ar ? 'ثيمات، إطارات، وبادجاتك في مكان واحد' : 'Themes, frames, and badges in one place')

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.64)', justifyContent: 'flex-end' }}>
        <LinearGradient
          colors={['#FFFFFF', '#F0FDFF', '#FFF1F8']}
          style={{
            maxHeight: '92%',
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
            paddingTop: spacing.md,
            paddingHorizontal: spacing.md,
            paddingBottom: spacing.lg,
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 46, height: 5, borderRadius: 999, backgroundColor: '#CBD5E1' }} />
          </View>

          <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
            <LinearGradient
              colors={['#F96286', '#A855F7', '#22D3EE']}
              style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 29 }}>🎒</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.grey900, fontSize: fontSize.xl, fontWeight: '900', textAlign: ar ? 'right' : 'left' }}>
                {modalTitle}
              </Text>
              <Text style={{ color: colors.grey500, fontSize: fontSize.xs, fontWeight: '700', textAlign: ar ? 'right' : 'left' }}>
                {modalSubtitle}
              </Text>
            </View>
            <View style={{ alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }}>
              <KidCoinIcon size={22} />
              <Text style={{ marginTop: 2, color: '#92400E', fontSize: 12, fontWeight: '900' }}>
                {Number(balance || 0).toLocaleString()}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color={colors.grey700} />
            </Pressable>
          </View>

          <View style={{ flexDirection: ar ? 'row-reverse' : 'row', gap: 7, marginTop: spacing.md }}>
            <TabPill active={tab === 'lenses'} label={ar ? 'عدسات' : 'Faces'} icon="sparkles" onPress={() => setTab('lenses')} />
            {showMissions && <TabPill active={tab === 'missions'} label={ar ? 'مهمات' : 'Missions'} icon="flag" onPress={() => setTab('missions')} />}
            <TabPill active={tab === 'themes'} label={ar ? 'ثيمات' : 'Themes'} icon="color-palette" onPress={() => setTab('themes')} />
            <TabPill active={tab === 'frames'} label={ar ? 'إطارات' : 'Frames'} icon="image" onPress={() => setTab('frames')} />
            <TabPill active={tab === 'badges'} label={ar ? 'بادجات' : 'Badges'} icon="ribbon" onPress={() => setTab('badges')} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}>
            {isLoading ? (
              <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ color: colors.grey500, fontWeight: '800' }}>
                  {ar ? 'بنجهز المجموعة...' : 'Loading collection...'}
                </Text>
              </View>
            ) : tab === 'missions' ? (
              <>
                <MissionSection title={ar ? 'مهمات اليوم' : 'Today missions'} missions={dailyMissions} ar={ar} busyId={busyId} onClaim={claimMission} />
                <MissionSection title={ar ? 'مهمات الأسبوع' : 'Weekly missions'} missions={weeklyMissions} ar={ar} busyId={busyId} onClaim={claimMission} />
              </>
            ) : tab === 'themes' ? (
              <View style={{ gap: 12 }}>
                {themes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    ar={ar}
                    busy={busyId === theme.id}
                    balance={balance}
                    onPress={() => requestTheme(theme)}
                  />
                ))}
                {!themes.length && <EmptyState ar={ar} icon="🎨" textEn="Themes will appear after the database update." textAr="الثيمات هتظهر بعد تحديث قاعدة البيانات." />}
              </View>
            ) : tab === 'frames' ? (
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }}>
                {frames.map((frame: any) => {
                  const current = frame.id === data?.current_frame_id
                  const owned = frame.owned || frame.is_free
                  return (
                  <Pressable
                    key={frame.id}
                    onPress={() => applyFrame(frame)}
                    disabled={busyId === frame.id}
                    style={({ pressed }) => ({
                      width: '30.8%',
                      minHeight: 108,
                      borderRadius: 20,
                      padding: 9,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: current ? '#FFF7D6' : '#FFFFFF',
                      borderWidth: current ? 2 : 1,
                      borderColor: current ? '#F59E0B' : '#E0F2FE',
                      opacity: pressed || busyId === frame.id ? 0.72 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 28 }}>{frame.icon || '🖼️'}</Text>
                    <Text numberOfLines={2} style={{ marginTop: 5, color: colors.grey900, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>
                      {ar ? frame.name_ar : frame.name_en}
                    </Text>
                    <View style={{ marginTop: 5, minHeight: 22, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: current ? '#FEF3C7' : owned ? '#ECFEFF' : '#FFF7D6', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      {busyId === frame.id ? (
                        <ActivityIndicator size="small" color="#0EA5E9" />
                      ) : !owned ? (
                        <KidCoinIcon size={13} />
                      ) : (
                        <Ionicons name={current ? 'checkmark-circle' : 'shirt-outline'} size={12} color={current ? '#B45309' : '#0369A1'} />
                      )}
                      <Text style={{ color: current ? '#92400E' : owned ? '#0369A1' : '#92400E', fontSize: 8, fontWeight: '900' }}>
                        {current
                        ? (ar ? 'مستخدم' : 'Equipped')
                        : owned
                          ? (ar ? 'استخدم' : 'Equip')
                          : `${Number(frame.coin_cost || 0).toLocaleString()}`}
                      </Text>
                    </View>
                  </Pressable>
                  )
                })}
                {!frames.length && <EmptyState ar={ar} icon="🖼️" textEn="Frames will appear after the database update." textAr="الإطارات هتظهر بعد تحديث قاعدة البيانات." />}
              </View>
            ) : tab === 'lenses' ? (
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }}>
                {snapLensShopQuery.isLoading ? (
                  <View style={{ width: '100%', minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={{ color: colors.grey500, fontWeight: '800' }}>
                      {ar ? 'بنجهز العدسات...' : 'Loading lenses...'}
                    </Text>
                  </View>
                ) : (
                  snapLenses.map((lens) => (
                    <SnapLensShopCard
                      key={lens.id}
                      lens={lens}
                      ar={ar}
                      busy={busyId === lens.id}
                      balance={balance}
                      onPress={() => unlockSnapLens(lens)}
                    />
                  ))
                )}
                {!snapLensShopQuery.isLoading && !snapLenses.length && (
                  <EmptyState ar={ar} icon="✨" textEn="Snap faces will appear after admin enables them." textAr="عدسات سناب هتظهر بعد ما الأدمن يفعلها." />
                )}
              </View>
            ) : (
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 10 }}>
                {badges.map((badge: any) => (
                  <View key={badge.id} style={{ width: '47%', minHeight: 116, borderRadius: 22, padding: spacing.sm, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 31 }}>{badge.id?.includes('like') ? '💖' : badge.id?.includes('follow') ? '👥' : badge.id?.includes('view') ? '👀' : '🏅'}</Text>
                    <Text numberOfLines={2} style={{ marginTop: 6, color: colors.grey900, fontSize: fontSize.xs, fontWeight: '900', textAlign: 'center' }}>
                      {ar ? badge.name_ar : badge.name_en}
                    </Text>
                    <Text style={{ marginTop: 3, color: colors.grey500, fontSize: 10, fontWeight: '800', textAlign: 'center' }}>
                      {Number(badge.current_value || 0).toLocaleString()} / {Number(badge.threshold || 0).toLocaleString()}
                    </Text>
                  </View>
                ))}
                {!badges.length && <EmptyState ar={ar} icon="🏅" textEn="Earn likes, views, and followers to unlock medals." textAr="اجمع لايكات ومشاهدات ومتابعين عشان تفتح البادجات." />}
              </View>
            )}
          </ScrollView>

          {!!themeCandidate && (
            <View style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(2,6,23,0.58)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.lg,
            }}>
              <View style={{ width: '100%', maxWidth: 360, borderRadius: 28, padding: spacing.lg, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FDE68A' }}>
                <View style={{ alignItems: 'center' }}>
                  <LinearGradient colors={themeCandidate.gradient as any} style={{ width: 74, height: 74, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 38 }}>{themeCandidate.emoji}</Text>
                  </LinearGradient>
                  <Text style={{ marginTop: spacing.sm, color: colors.grey900, fontSize: fontSize.lg, fontWeight: '900', textAlign: 'center' }}>
                    {ar ? themeCandidate.name_ar : themeCandidate.name_en}
                  </Text>
                  <View style={{ marginTop: 8, flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={{ color: '#92400E', fontSize: fontSize.sm, fontWeight: '900' }}>
                      {ar ? 'السعر' : 'Price'}
                    </Text>
                    <KidCoinIcon size={22} />
                    <Text style={{ color: '#92400E', fontSize: fontSize.base, fontWeight: '900' }}>
                      {themeCandidate.coin_cost.toLocaleString()}
                    </Text>
                  </View>
                  <Text style={{ marginTop: 8, color: colors.grey500, fontSize: fontSize.xs, fontWeight: '700', textAlign: 'center', lineHeight: 18 }}>
                    {ar ? 'بعد الشراء هيبقى الثيم ملكك للأبد.' : 'After purchase, this theme stays yours forever.'}
                  </Text>
                </View>

                <View style={{ flexDirection: ar ? 'row-reverse' : 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                  <Pressable
                    onPress={() => setThemeCandidate(null)}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 46,
                      borderRadius: radius.pill,
                      backgroundColor: pressed ? '#E0F2FE' : '#F1F5F9',
                      alignItems: 'center',
                      justifyContent: 'center',
                    })}
                  >
                    <Text style={{ color: colors.grey700, fontSize: fontSize.sm, fontWeight: '900' }}>
                      {ar ? 'إلغاء' : 'Cancel'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const theme = themeCandidate
                      setThemeCandidate(null)
                      if (theme) void equipTheme(theme)
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: 46,
                      borderRadius: radius.pill,
                      backgroundColor: pressed ? '#C026D3' : '#F96286',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: ar ? 'row-reverse' : 'row',
                      gap: 6,
                    })}
                  >
                    <Ionicons name="sparkles" size={17} color="#fff" />
                    <Text style={{ color: colors.white, fontSize: fontSize.sm, fontWeight: '900' }}>
                      {ar ? 'اشتري' : 'Buy'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          <RewardedAdPrompt
            visible={rewardPromptVisible}
            mode="gate"
            onDismiss={async () => {
              setRewardPromptVisible(false)
              setTab(rewardReturnTab)
              await invalidateCollection()
            }}
          />
        </LinearGradient>
      </View>
    </Modal>
  )
}

function TabPill({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean
  label: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 42,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? '#0EA5E9' : '#FFFFFF',
        borderWidth: 1,
        borderColor: active ? '#0EA5E9' : '#E0F2FE',
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Ionicons name={icon} size={15} color={active ? '#FFFFFF' : colors.primary} />
      <Text numberOfLines={1} style={{ marginTop: 2, color: active ? '#FFFFFF' : colors.grey700, fontSize: 9, fontWeight: '900' }}>
        {label}
      </Text>
    </Pressable>
  )
}

function MissionSection({
  title,
  missions,
  ar,
  busyId,
  onClaim,
}: {
  title: string
  missions: KidTokMission[]
  ar: boolean
  busyId: string | null
  onClaim: (mission: KidTokMission) => void
}) {
  if (!missions.length) {
    return <EmptyState ar={ar} icon="🎯" textEn="Missions will appear after the database update." textAr="المهمات هتظهر بعد تحديث قاعدة البيانات." />
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ color: colors.grey900, fontSize: fontSize.base, fontWeight: '900', textAlign: ar ? 'right' : 'left', marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ gap: 9 }}>
        {missions.map((mission) => {
          const pct = Math.max(0, Math.min(100, (mission.progress / Math.max(1, mission.target)) * 100))
          const ready = mission.completed && !mission.claimed
          return (
            <View key={mission.id} style={{ borderRadius: 20, padding: spacing.sm, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: ready ? '#FDE68A' : '#E0F2FE' }}>
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: ready ? '#FFFBEB' : '#ECFEFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 23 }}>{mission.claimed ? '✅' : ready ? '🎁' : '🎯'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.grey900, fontSize: fontSize.sm, fontWeight: '900', textAlign: ar ? 'right' : 'left' }}>
                    {ar ? mission.title_ar : mission.title_en}
                  </Text>
                  <Text numberOfLines={2} style={{ marginTop: 2, color: colors.grey500, fontSize: 10, fontWeight: '700', textAlign: ar ? 'right' : 'left' }}>
                    {ar ? mission.description_ar : mission.description_en}
                  </Text>
                </View>
                <View style={{ alignItems: 'center', minWidth: 48 }}>
                  <KidCoinIcon size={20} />
                  <Text style={{ color: '#92400E', fontSize: 11, fontWeight: '900' }}>+{mission.reward_coins}</Text>
                </View>
              </View>
              <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, marginTop: 9 }}>
                <View style={{ flex: 1, height: 9, borderRadius: 999, overflow: 'hidden', backgroundColor: '#E2E8F0' }}>
                  <LinearGradient colors={['#22D3EE', '#F96286']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${pct}%`, height: '100%' }} />
                </View>
                <Text style={{ color: colors.grey600, fontSize: 10, fontWeight: '900' }}>
                  {mission.progress}/{mission.target}
                </Text>
                <Pressable
                  disabled={!ready || !!busyId}
                  onPress={() => onClaim(mission)}
                  style={({ pressed }) => ({
                    minWidth: 76,
                    height: 32,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: mission.claimed ? '#DCFCE7' : ready ? '#F96286' : '#F1F5F9',
                    opacity: pressed ? 0.75 : (!ready && !mission.claimed ? 0.72 : 1),
                  })}
                >
                  {busyId === mission.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: mission.claimed ? '#166534' : ready ? '#fff' : colors.grey500, fontSize: 10, fontWeight: '900' }}>
                      {mission.claimed ? (ar ? 'استلمت' : 'Claimed') : ready ? (ar ? 'استلم' : 'Claim') : (ar ? 'كملها' : 'Go')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ThemeCard({
  theme,
  ar,
  busy,
  balance,
  onPress,
}: {
  theme: KidTokTheme
  ar: boolean
  busy: boolean
  balance: number
  onPress: () => void
}) {
  const canBuy = theme.owned || theme.is_free || balance >= theme.coin_cost
  const action = theme.equipped
    ? (ar ? 'مستخدم الآن' : 'Equipped')
    : theme.owned || theme.is_free
      ? (ar ? 'استخدم' : 'Equip')
      : canBuy
        ? (ar ? 'اشتري' : 'Buy')
        : (ar ? 'كوينز أكثر' : 'Need coins')

  return (
    <Pressable disabled={busy || theme.equipped} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}>
      <LinearGradient colors={theme.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 2 }}>
        <View style={{ minHeight: 112, borderRadius: 22, padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.92)', overflow: 'hidden' }}>
          <ProfileThemeDecor theme={theme} variant="card" />
          <View style={{ flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 12 }}>
            <LinearGradient colors={theme.gradient as any} style={{ width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 31 }}>{theme.emoji}</Text>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.grey900, fontSize: fontSize.base, fontWeight: '900', textAlign: ar ? 'right' : 'left' }}>
                {ar ? theme.name_ar : theme.name_en}
              </Text>
              <Text numberOfLines={2} style={{ marginTop: 3, color: colors.grey500, fontSize: 11, fontWeight: '700', textAlign: ar ? 'right' : 'left' }}>
                {ar ? theme.description_ar : theme.description_en}
              </Text>
              <View style={{ marginTop: 7, flexDirection: ar ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: theme.accent_color, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>
                  {theme.rarity}
                </Text>
                {!theme.owned && !theme.is_free && (
                  <>
                    <KidCoinIcon size={16} />
                    <Text style={{ color: '#92400E', fontSize: 11, fontWeight: '900' }}>{theme.coin_cost.toLocaleString()}</Text>
                  </>
                )}
              </View>
            </View>
            <View style={{ minWidth: 82, height: 38, borderRadius: radius.pill, backgroundColor: theme.equipped ? '#DCFCE7' : theme.owned || theme.is_free || canBuy ? theme.accent_color : '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
              {busy ? (
                <ActivityIndicator size="small" color={theme.equipped ? '#166534' : '#fff'} />
              ) : (
                <Text style={{ color: theme.equipped ? '#166534' : theme.owned || theme.is_free || canBuy ? '#fff' : colors.grey500, fontSize: 11, fontWeight: '900' }}>
                  {action}
                </Text>
              )}
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  )
}

function SnapLensShopCard({
  lens,
  ar,
  busy,
  balance,
  onPress,
}: {
  lens: SnapLensCatalogItem
  ar: boolean
  busy: boolean
  balance: number
  onPress: () => void
}) {
  const cost = getSnapLensUseCost(lens)
  const isPaid = cost > 0
  const canUse = !isPaid || balance >= cost
  const title = ar ? (lens.name_ar || lens.name_en || lens.name_match) : (lens.name_en || lens.name_ar || lens.name_match)
  const action = !isPaid
    ? snapLensPriceLabel(lens, ar)
    : canUse
      ? (ar ? 'مرة واحدة' : 'One use')
      : (ar ? 'كوينز أكثر' : 'Need coins')

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        width: '30.8%',
        minHeight: 122,
        borderRadius: 22,
        padding: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: isPaid ? 2 : 1,
        borderColor: isPaid ? '#FDE68A' : '#E0F2FE',
        opacity: pressed || busy ? 0.72 : 1,
      })}
    >
      <LinearGradient
        colors={isPaid ? ['#F59E0B', '#F43F5E'] : ['#F96286', '#22D3EE']}
        style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      >
        {lens.icon_url ? (
          <Image source={{ uri: lens.icon_url }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff' }} />
        ) : (
          <Ionicons name="sparkles" size={26} color="#fff" />
        )}
      </LinearGradient>
      <Text numberOfLines={2} style={{ marginTop: 8, color: colors.grey900, fontSize: 10, fontWeight: '900', textAlign: 'center' }}>
        {title || lens.id}
      </Text>
      <View style={{ marginTop: 6, minHeight: 23, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: isPaid ? '#FFF7D6' : '#ECFEFF', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {busy ? (
          <ActivityIndicator size="small" color="#0EA5E9" />
        ) : isPaid ? (
          <KidCoinIcon size={13} />
        ) : (
          <Ionicons name="sparkles" size={13} color="#0369A1" />
        )}
        <Text style={{ color: !isPaid ? '#0369A1' : '#92400E', fontSize: 8, fontWeight: '900' }}>
          {isPaid ? `${cost.toLocaleString()} / video` : action}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ marginTop: 4, color: canUse ? colors.grey500 : '#F43F5E', fontSize: 8, fontWeight: '900', textAlign: 'center' }}>
        {action}
      </Text>
    </Pressable>
  )
}

function EmptyState({
  ar,
  icon,
  textEn,
  textAr,
}: {
  ar: boolean
  icon: string
  textEn: string
  textAr: string
}) {
  return (
    <View style={{ width: '100%', minHeight: 150, borderRadius: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
      <Text style={{ fontSize: 38 }}>{icon}</Text>
      <Text style={{ marginTop: 8, color: colors.grey500, fontSize: fontSize.sm, fontWeight: '800', textAlign: 'center' }}>
        {ar ? textAr : textEn}
      </Text>
    </View>
  )
}
