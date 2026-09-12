import { useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Stack, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import {
  View,
  Animated,
  ActivityIndicator,
  I18nManager,
  Text,
  TextInput,
  Pressable,
} from 'react-native'
import Toast from 'react-native-toast-message'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFonts } from 'expo-font'
import { useTranslation } from 'react-i18next'
import { useVideoPlayer } from 'expo-video'

import { initI18n, setLanguage } from '@/lib/i18n'
import { headerAnimHeight, HEADER_BAR_HEIGHT, showHeader } from '@/lib/headerScroll'
import { useAuth } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { colors, fontSize } from '@/lib/theme'
import { router } from 'expo-router'
import OnboardingModal from '@/components/OnboardingModal'
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useActivityHeartbeat } from '@/hooks/useActivityHeartbeat'
import NotificationsPanel from '@/components/NotificationsPanel'
import { ForceUpdateScreen, MaintenanceScreen } from '@/components/SystemScreens'
import BannerAd from '@/components/BannerAd'
import DailyCheckInModal from '@/components/DailyCheckInModal'
import KidCoinIcon from '@/components/KidCoinIcon'
import KidTokCollectionModal from '@/components/KidTokCollectionModal'
import RewardedAdPrompt from '@/components/RewardedAdPrompt'
import { claimKidTokMission, getMyKidTokCollection } from '@/lib/kidtokCollection'

// ─── Global Cairo font ────────────────────────────────────────────────────────
function setGlobalFont() {
  if (!(Text as any).__cairoApplied) {
    ;(Text as any).defaultProps = (Text as any).defaultProps || {}
    ;(Text as any).defaultProps.style = [{ fontFamily: 'Cairo' }, (Text as any).defaultProps.style]
    ;(Text as any).__cairoApplied = true
  }
  if (!(TextInput as any).__cairoApplied) {
    ;(TextInput as any).defaultProps = (TextInput as any).defaultProps || {}
    ;(TextInput as any).defaultProps.style = [{ fontFamily: 'Cairo' }, (TextInput as any).defaultProps.style]
    ;(TextInput as any).__cairoApplied = true
  }
}

function RewardToast({
  text1,
  text2,
  props,
  variant = 'coins',
}: any) {
  const isCoins = variant === 'coins' || props?.accent === 'gold'
  const icon = props?.icon || (isCoins ? '🪙' : '🎁')
  const coins = Number(props?.coins ?? props?.amount ?? 0)
  const actionLabel = props?.actionLabel
  const onAction = typeof props?.onAction === 'function' ? props.onAction : null
  const title = isCoins && coins > 0 && !/\d/.test(String(text1 || ''))
    ? (I18nManager.isRTL ? `كسبت +${coins} كوين` : `You won +${coins} coins`)
    : text1
  const cardGradient = isCoins
    ? ['#FFFFFF', '#FFF7D6', '#FFE9F1']
    : ['#FFFFFF', '#E0F7FF', '#FFE9F1']
  const iconGradient = isCoins
    ? ['#FFD54F', '#F59E0B']
    : ['#03BBE5', '#F96286']

  return (
    <View
      style={{
        alignSelf: 'center',
        width: '76%',
        maxWidth: 320,
        borderRadius: 20,
        shadowColor: isCoins ? '#F59E0B' : '#03BBE5',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 8,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={cardGradient as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 9,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: isCoins ? '#FCD34D' : '#BAE6FD',
          flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 9,
        }}
      >
        <LinearGradient
          colors={iconGradient as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: '#FFFFFF',
          }}
        >
          <Text style={{ fontSize: 20 }}>{icon}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#07375B', fontWeight: '900', fontSize: 13, textAlign: I18nManager.isRTL ? 'right' : 'left' }} numberOfLines={1}>{title}</Text>
          {!!text2 && <Text style={{ color: '#667085', fontWeight: '800', fontSize: 10, marginTop: 1, textAlign: I18nManager.isRTL ? 'right' : 'left' }} numberOfLines={1}>{text2}</Text>}
        </View>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            style={({ pressed }) => ({
              minHeight: 28,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: pressed ? '#F59E0B' : '#F96286',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }} numberOfLines={1}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={13} color={isCoins ? '#F59E0B' : '#F96286'} />
          </View>
        )}
      </LinearGradient>
    </View>
  )
}

const toastConfig = {
  coinReward: (toastProps: any) => <RewardToast {...toastProps} variant="coins" />,
  kidReward: (toastProps: any) => <RewardToast {...toastProps} variant="kid" />,
}

// ─── Global header bar ────────────────────────────────────────────────────────
/**
 * على صفحة الفيد: يتحرك مع السكرول (يظهر ويختفي).
 * على باقي الصفحات: ثابت دايماً.
 * يعرض زر اللغة + رصيد العملات.
 */
function GlobalHeader({
  isFeed,
  coinBalance,
  unreadCount,
  onOpenDailyCheckIn,
  onOpenMissions,
  onOpenShop,
  onOpenCoinReward,
}: {
  isFeed: boolean
  coinBalance: number
  unreadCount: number
  onOpenDailyCheckIn: () => void
  onOpenMissions: () => void
  onOpenShop: () => void
  onOpenCoinReward: () => void
}) {
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'
  const [showPanel, setShowPanel] = useState(false)

  const handleToggleLang = async () => {
    await setLanguage(isRTL ? 'en' : 'ar')
  }

  return (
    <Animated.View
      style={{
        // على الفيد: الارتفاع متحرك (0 ↔ HEADER_BAR_HEIGHT)
        // على باقي الصفحات: ثابت دايماً
        height: isFeed ? headerAnimHeight : HEADER_BAR_HEIGHT,
        overflow: 'hidden',
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.grey100,
      }}
    >
      {/* Inner row */}
      <View style={{ height: HEADER_BAR_HEIGHT, flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 }}>

        {/* LEFT: Language toggle */}
        <Pressable
          onPress={handleToggleLang}
          accessibilityRole="button"
          accessibilityLabel={isRTL ? 'Switch language to English' : 'تغيير اللغة للعربية'}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: pressed ? '#BAE6FD' : '#E0F2FE',
            borderWidth: 1.5,
            borderColor: pressed ? '#38BDF8' : '#7DD3FC',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0EA5E9',
            shadowOpacity: 0.16,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          })}
        >
          <Ionicons name="globe-outline" size={21} color="#0284C7" />
        </Pressable>

        {/* RIGHT: Bell → Upload → Coins → Daily reward */}
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>

          {/* Coin balance */}
          <Pressable
            onPress={onOpenCoinReward}
            accessibilityRole="button"
            accessibilityLabel={isRTL ? 'شاهد إعلان واكسب 5 كوين' : 'Watch an ad and earn 5 coins'}
            style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#FCD34D' }}
          >
            <KidCoinIcon size={18} />
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#78350F' }}>{coinBalance.toLocaleString()}</Text>
          </Pressable>

          {/* Daily check-in calendar */}
          <Pressable
            onPress={onOpenDailyCheckIn}
            style={({ pressed }) => ({
              position: 'relative',
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: pressed ? '#EDE9FE' : '#F3F4F6',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="calendar-outline" size={19} color="#7C3AED" />
            <View style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} />
          </Pressable>

          {/* Missions */}
          <Pressable
            onPress={onOpenMissions}
            style={({ pressed }) => ({
              position: 'relative',
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: pressed ? '#FFE4F0' : '#F3F4F6',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="trophy-outline" size={19} color="#F96286" />
          </Pressable>

          {/* Shop */}
          <Pressable
            onPress={onOpenShop}
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: pressed ? '#FEF3C7' : '#F3F4F6',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="cart-outline" size={19} color="#D97706" />
          </Pressable>

          {/* Bell */}
          <Pressable
            onPress={() => setShowPanel(p => !p)}
            style={{ position: 'relative', width: 34, height: 34, borderRadius: 17, backgroundColor: showPanel ? colors.primary : '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={showPanel ? 'notifications' : 'notifications-outline'} size={19} color={showPanel ? '#fff' : '#374151'} />
            {unreadCount > 0 && !showPanel && (
              <View style={{ position: 'absolute', top: -1, right: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' }}>
                <Text style={{ fontSize: 8, fontWeight: '900', color: '#fff' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <NotificationsPanel visible={showPanel} onClose={() => setShowPanel(false)} />

          {/* Settings gear — أقصى اليمين (LTR) أو أقصى اليسار (RTL) */}
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => ({
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: pressed ? colors.grey200 : '#F3F4F6',
              alignItems: 'center', justifyContent: 'center',
            })}
          >
            <Ionicons name="settings-outline" size={19} color="#374151" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  )
}

// ─── Query client ─────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
})

// ─── App shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const { i18n } = useTranslation()
  const versionCheck = useAppVersionCheck()
  usePushNotifications()
  useActivityHeartbeat()

  const pathname = usePathname()
  const user = useAuth((s) => s.user)
  const [dailyCheckInOpenSignal, setDailyCheckInOpenSignal] = useState(0)
  const [collectionVisible, setCollectionVisible] = useState(false)
  const [collectionInitialTab, setCollectionInitialTab] = useState<'missions' | 'themes' | 'frames' | 'badges' | 'lenses'>('missions')
  const [collectionShowMissions, setCollectionShowMissions] = useState(true)
  const [coinRewardPromptVisible, setCoinRewardPromptVisible] = useState(false)

  const openCollection = (tab: 'missions' | 'themes' | 'frames' | 'badges' | 'lenses', showMissions = true) => {
    setCollectionInitialTab(tab)
    setCollectionShowMissions(showMissions)
    setCollectionVisible(true)
  }

  // الفيد هو الصفحة الرئيسية للفيديو — فيها الهيدر يتحرك مع السكرول
  const isFeed = pathname === '/' || pathname === '/(tabs)/feed' || pathname === '/feed'
  const isCreatorRoute = pathname.startsWith('/creator')
  // No banner inside kid mode (children must never see ads in our app),
  // on the playlist video player (banner overlaps controls + breaks the
  // immersive viewing experience), or on the suggested-feed reel screen
  // (same problem — it's a full-screen YouTube reel viewer reached from
  // the Search tab).
  const isKidMode      = /\/kid-mode\b/.test(pathname)
  const isVideoPlayer  = /\/playlist\/[^/]+\/play/.test(pathname)
  const isSuggestedReel = pathname.startsWith('/suggested-feed')
  // The five tab routes — sticky banner must sit *above* the bottom tab bar
  // on these screens, otherwise it covers Children / Profile.
  const isTabRoute =
    isFeed ||
    pathname === '/search'   || pathname === '/(tabs)/search'   ||
    pathname === '/children' || pathname === '/(tabs)/children' ||
    pathname === '/profile'  || pathname === '/(tabs)/profile'

  // لما تروح لصفحة غير الفيد، اجبر الهيدر يظهر
  useEffect(() => {
    if (!isFeed) {
      showHeader()
    }
  }, [isFeed])

  // Unread notifications count for this user (from the inbox).
  // Polls every 10s and refetches on focus so new comments show on the bell.
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['unread-count', user?.id],
    enabled: !!user?.id,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await supabase.rpc('unread_notification_count')
      return (data as number) || 0
    },
  })

  const { data: coinBalance = 0 } = useQuery({
    queryKey: ['coins', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<number> => {
      const { data } = await supabase.rpc('my_coin_balance')
      return (data as number) ?? 0
    },
  })

  const { data: readyMissions = [] } = useQuery({
    queryKey: ['kidtok-ready-missions-toast', user?.id],
    enabled: !!user?.id && !isKidMode,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const collection = await getMyKidTokCollection()
      return (collection.missions || []).filter((mission) => mission.completed && !mission.claimed)
    },
  })

  useEffect(() => {
    if (!user?.id || readyMissions.length === 0) return
    const mission = readyMissions[0]
    const key = `kidtok:mission-ready-toast:${user.id}:${mission.period_key}:${mission.id}`
    let cancelled = false

    AsyncStorage.getItem(key)
      .then((seen) => {
        if (cancelled || seen === '1') return
        return AsyncStorage.setItem(key, '1').then(() => {
          Toast.show({
            type: 'kidReward',
            text1: i18n.language === 'ar' ? 'مهمة اكتملت! 🎯' : 'Mission complete! 🎯',
            text2: i18n.language === 'ar'
              ? `استلم +${mission.reward_coins} كوين دلوقتي`
              : `Collect +${mission.reward_coins} coins now`,
            visibilityTime: 8000,
            props: {
              icon: '🎁',
              accent: 'gold',
              actionLabel: i18n.language === 'ar' ? 'استلم' : 'Collect',
              onAction: async () => {
                Toast.hide()
                try {
                  const result = await claimKidTokMission(mission.id)
                  const earned = Number(result?.reward_coins || mission.reward_coins || 0)
                  await Promise.all([
                    qc.invalidateQueries({ queryKey: ['kidtok-ready-missions-toast', user.id] }),
                    qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'coins' }),
                    qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'kidtok-collection' }),
                  ])
                  Toast.show({
                    type: 'coinReward',
                    text1: i18n.language === 'ar' ? `كسبت +${earned} كوين!` : `You won +${earned} coins!`,
                    text2: i18n.language === 'ar' ? 'مكافأة المهمة دخلت حصالتك' : 'Mission reward added to your bank',
                    props: { icon: '🪙', accent: 'gold', coins: earned },
                  })
                } catch (error: any) {
                  Toast.show({
                    type: 'kidReward',
                    text1: i18n.language === 'ar' ? 'المكافأة مش جاهزة' : 'Reward is not ready',
                    text2: String(error?.message || error || '').slice(0, 100),
                    props: { icon: '✨', accent: 'purple' },
                  })
                }
              },
            },
          })
        })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [i18n.language, qc, readyMissions, user?.id])

  if (!versionCheck.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }
  if (versionCheck.maintenance) {
    return <MaintenanceScreen messageAr={versionCheck.messageAr} messageEn={versionCheck.messageEn} />
  }
  if (versionCheck.forceUpdate) {
    return (
      <ForceUpdateScreen
        messageAr={versionCheck.messageAr}
        messageEn={versionCheck.messageEn}
        storeUrl={versionCheck.storeUrl}
      />
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <StatusBar style={isFeed ? 'light' : 'dark'} />

      {/* على غير الفيد: safe area فقط بدون هيدر */}
      {!isFeed && (
        <View style={{ height: insets.top, backgroundColor: colors.white }} />
      )}

      {/* الـ Stack يأخد الـ flex:1 كامل */}
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {/* Kid mode home — once entered, the only way out is the PIN/
              biometric exit modal. Block the iOS edge-swipe gesture
              (no equivalent on Android, where we already intercept the
              hardware back button). */}
          <Stack.Screen
            name="children/[id]/kid-mode"
            options={{ gestureEnabled: false, animation: 'fade' }}
          />
          {/* Playlist player inside kid mode — same reasoning. We don't
              want a half-second swipe to drop the child back to the
              kid-mode list with a gesture they could easily repeat. */}
          <Stack.Screen
            name="playlist/[id]/play"
            options={{ gestureEnabled: false }}
          />
        </Stack>
        {/* OnboardingModal removed — login page is the gate */}
      </View>

      {/* على الفيد: الهيدر position:absolute فوق كل حاجة — مايأثرش على حجم الـ container */}
      {isFeed && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            height: insets.top + HEADER_BAR_HEIGHT,
            overflow: 'hidden',
            transform: [{
              translateY: headerAnimHeight.interpolate({
                inputRange: [0, HEADER_BAR_HEIGHT],
                outputRange: [-(insets.top + HEADER_BAR_HEIGHT), 0],
              }),
            }],
          }}
        >
          <View style={{ height: insets.top, backgroundColor: colors.white }} />
          <GlobalHeader
            isFeed={false}
            coinBalance={coinBalance}
            unreadCount={unreadCount}
            onOpenDailyCheckIn={() => setDailyCheckInOpenSignal((n) => n + 1)}
            onOpenMissions={() => openCollection('missions', true)}
            onOpenShop={() => openCollection('frames', false)}
            onOpenCoinReward={() => setCoinRewardPromptVisible(true)}
          />
        </Animated.View>
      )}
      {(() => {
        const shouldRender = !!user && !isFeed && !isCreatorRoute && !isKidMode && !isVideoPlayer && !isSuggestedReel
        if (__DEV__) {
          console.log('[banner-gate]', {
            pathname,
            user:             !!user,
            isFeed,
            isCreatorRoute,
            isKidMode,
            isVideoPlayer,
            isSuggestedReel,
            isTabRoute,
            willRender:       shouldRender,
          })
        }
        if (!shouldRender) return null
        return <BannerAd variant="sticky" bottomOffset={isTabRoute ? 60 + insets.bottom : 0} />
      })()}
      {!!user && <DailyCheckInModal disabled={isKidMode} openSignal={dailyCheckInOpenSignal} />}
      {!!user && (
        <KidTokCollectionModal
          visible={collectionVisible}
          ar={i18n.language === 'ar'}
          userId={user.id}
          coinBalance={Number(coinBalance || 0)}
          initialTab={collectionInitialTab}
          showMissions={collectionShowMissions}
          onClose={() => setCollectionVisible(false)}
          onChanged={() => {
            qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'coins' })
            qc.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'kidtok-collection' })
            qc.invalidateQueries({ queryKey: ['kidtok-ready-missions-toast', user.id] })
          }}
        />
      )}
      {!!user && (
        <RewardedAdPrompt
          visible={coinRewardPromptVisible}
          mode="gate"
          onDismiss={() => setCoinRewardPromptVisible(false)}
        />
      )}
      <Toast config={toastConfig} topOffset={insets.top + HEADER_BAR_HEIGHT + 8} />
    </View>
  )
}

// ─── Root layout ──────────────────────────────────────────────────────────────
export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const initAuth = useAuth((s) => s.init)

  const [fontsLoaded] = useFonts({
    Cairo: require('../assets/fonts/Cairo.ttf'),
  })

  // ── iOS audio session warm-up ────────────────────────────────────────
  // YouTube videos run inside react-native-webview's WKWebView, which
  // inherits whatever AVAudioSession the host app has set. The iOS
  // default is SoloAmbient → silenced by the ringer switch + blocks
  // audio autoplay in WKWebView entirely. expo-video promotes the
  // session to Playback the moment a VideoPlayer is instantiated with
  // audioMixingMode='doNotMix', and the category persists app-wide
  // (only one AVAudioSession per app). We cannot use expo-audio's
  // setAudioModeAsync here because expo-audio is not compatible with
  // SDK 55; this hidden warm-up player is the workaround.
  //
  // No source = nothing actually plays, muted = defensive belt-and-
  // braces. One idle AVPlayer instance for the lifetime of the app.
  const warmupPlayer = useVideoPlayer(null as any, (p: any) => {
    try {
      p.audioMixingMode = 'doNotMix'
      p.muted = true
    } catch { /* native side may reject before native module mounts; harmless */ }
  })
  // Reference the player so React doesn't tree-shake it away.
  void warmupPlayer

  // ── AdMob SDK Init ─────────────────────────────────────────────────
  // KidTok serves children, so we intentionally:
  //   • request NON-personalized ads (no IDFA / no tracking)
  //   • tag every request as child-directed (TFCD)
  //   • cap content rating at G (general audiences only)
  //
  // This matches Apple's Kids/Family review guidelines AND lets us drop
  // NSUserTrackingUsageDescription from Info.plist (no ATT prompt
  // needed, no App Privacy "tracking" declaration to fight in review).
  useEffect(() => {
    try {
      const ads = require('react-native-google-mobile-ads').default()
      ads.setRequestConfiguration({
        testDeviceIdentifiers: ['EMULATOR'],
        // 'G' = general audiences — Google won't serve anything harsher
        maxAdContentRating: 'G',
        // Tag-for-child-directed-treatment — server-side enforces COPPA
        // rules on the AdMob side (no personalised ads, no remarketing)
        tagForChildDirectedTreatment: true,
        // Belt-and-braces: under-age-of-consent in GDPR sense
        tagForUnderAgeOfConsent: true,
      })
      ads.initialize()
    } catch {
      // Native module not available — ads silently disabled
    }
  }, [])

  useEffect(() => {
    if (!fontsLoaded) return
    setGlobalFont()
    ;(async () => {
      const lang = await initI18n()
      const shouldBeRTL = lang === 'ar'
      if (I18nManager.isRTL !== shouldBeRTL) {
        I18nManager.allowRTL(shouldBeRTL)
        I18nManager.forceRTL(shouldBeRTL)
      }

      await initAuth()
      setReady(true)
    })()
  }, [fontsLoaded, initAuth])

  if (!ready || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppShell />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
