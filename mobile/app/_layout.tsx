import { useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Stack, usePathname } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
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
import { useFonts } from 'expo-font'
import { useTranslation } from 'react-i18next'

import { initI18n, setLanguage } from '@/lib/i18n'
import { headerAnimHeight, HEADER_BAR_HEIGHT, showHeader } from '@/lib/headerScroll'
import { useAuth } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { colors, fontSize } from '@/lib/theme'
import { router } from 'expo-router'
import OnboardingModal from '@/components/OnboardingModal'
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import NotificationsPanel from '@/components/NotificationsPanel'
import { ForceUpdateScreen, MaintenanceScreen } from '@/components/SystemScreens'

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

// ─── Global header bar ────────────────────────────────────────────────────────
/**
 * على صفحة الفيد: يتحرك مع السكرول (يظهر ويختفي).
 * على باقي الصفحات: ثابت دايماً.
 * يعرض زر اللغة + رصيد العملات.
 */
function GlobalHeader({ isFeed, coinBalance, unreadCount }: { isFeed: boolean; coinBalance: number; unreadCount: number }) {
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

        {/* LEFT: Language toggle — pink pill */}
        <Pressable
          onPress={handleToggleLang}
          style={({ pressed }) => ({
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
            backgroundColor: pressed ? '#d4547a' : colors.secondary,
            flexDirection: 'row', alignItems: 'center', gap: 4,
          })}
        >
          <Ionicons name="language-outline" size={14} color="#fff" />
          <Text style={{ fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.5 }}>
            {isRTL ? 'EN' : 'ع'}
          </Text>
        </Pressable>

        {/* RIGHT: Bell → Upload → Coins → Daily reward */}
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>

          {/* Upload — pink pill */}
          <Pressable
            onPress={() => router.push('/creator/upload')}
            style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: pressed ? '#d4547a' : colors.secondary, flexDirection: 'row', alignItems: 'center', gap: 4 })}
          >
            <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>{isRTL ? 'رفع' : 'Upload'}</Text>
          </Pressable>

          {/* Coin balance */}
          <Pressable
            onPress={() => router.push('/subscription')}
            style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#FCD34D' }}
          >
            <Text style={{ fontSize: 13 }}>🪙</Text>
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#78350F' }}>{coinBalance.toLocaleString()}</Text>
          </Pressable>

          {/* Bell — far right */}
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
  const versionCheck = useAppVersionCheck()
  usePushNotifications()

  const pathname = usePathname()
  const user = useAuth((s) => s.user)

  // الفيد هو الصفحة الرئيسية للفيديو — فيها الهيدر يتحرك مع السكرول
  const isFeed = pathname === '/' || pathname === '/(tabs)/feed' || pathname === '/feed'

  // لما تروح لصفحة غير الفيد، اجبر الهيدر يظهر
  useEffect(() => {
    if (!isFeed) {
      showHeader()
    }
  }, [isFeed])

  // رصيد العملات — يتحدث تلقائياً
  // Unread notifications count (last 24h)
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['unread-notifs'],
    staleTime: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('notification_history')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', since)
      return count || 0
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
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        <OnboardingModal />
        <Toast />
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
          <GlobalHeader isFeed={false} coinBalance={coinBalance} unreadCount={unreadCount} />
        </Animated.View>
      )}
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

  // ── Configure audio session for media playback ──
  // Required so video audio plays through media speaker (not earpiece)
  // and bypasses iOS silent mode for short-form video content
  useEffect(() => {
    try {
      // expo-video / expo-av audio mode
      const { setAudioModeAsync } = require('expo-audio')
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix',
        interruptionModeAndroid: 'doNotMix',
      }).catch(() => {})
    } catch {
      // Fallback for builds without expo-audio
      try {
        const { Audio } = require('expo-av')
        Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        }).catch(() => {})
      } catch {}
    }
  }, [])

  // ── AdMob SDK Init (same as MobileAds.instance.initialize() in Flutter) ──
  useEffect(() => {
    try {
      const mobileAds = require('react-native-google-mobile-ads').default
      // Configure test device IDs to get test ads during development
      mobileAds().setRequestConfiguration({
        testDeviceIdentifiers: ['EMULATOR', 'SIMULATOR'],
      })
      mobileAds().initialize().then(() => {
      })
    } catch (e) {
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