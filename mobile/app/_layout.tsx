import { useEffect, useState } from 'react'
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
import OnboardingModal from '@/components/OnboardingModal'
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck'
import { usePushNotifications } from '@/hooks/usePushNotifications'
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
function GlobalHeader({ isFeed, coinBalance }: { isFeed: boolean; coinBalance: number }) {
  const { i18n } = useTranslation()
  const isRTL = i18n.language === 'ar'

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
      {/* Inner row — always HEADER_BAR_HEIGHT tall, clipped when animating */}
      <View
        style={{
          height: HEADER_BAR_HEIGHT,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
        }}
      >
        {/* Language toggle */}
        <Pressable
          onPress={handleToggleLang}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: pressed ? colors.primarySemiDark : colors.primary,
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
          })}
        >
          <Text style={{ fontSize: 13 }}>🌐</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.white }}>
            {isRTL ? 'EN' : 'ع'}
          </Text>
        </Pressable>

        {/* ── Coin balance badge ── */}
        <View
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: '#FEF3C7',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: '#FCD34D',
          }}
        >
          <Text style={{ fontSize: 14 }}>🪙</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#78350F' }}>
            {coinBalance.toLocaleString()}
          </Text>
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

      {/* على غير الفيد: الهيدر في الـ flow العادي */}
      {!isFeed && (
        <>
          <View style={{ height: insets.top, backgroundColor: colors.white }} />
          <GlobalHeader isFeed={false} coinBalance={coinBalance} />
        </>
      )}

      {/* الـ Stack يأخد الـ flex:1 كامل — على الفيد مفيش حاجة فوقه تأثر على الحجم */}
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
          <GlobalHeader isFeed={false} coinBalance={coinBalance} />
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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
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