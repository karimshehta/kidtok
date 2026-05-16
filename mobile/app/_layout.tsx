import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { View, ActivityIndicator, I18nManager, Text, TextInput } from 'react-native'
import Toast from 'react-native-toast-message'
import * as Font from 'expo-font'

import { initI18n } from '@/lib/i18n'
import { useAuth } from '@/stores/auth'
import { colors } from '@/lib/theme'
import OnboardingModal from '@/components/OnboardingModal'
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck'
import { ForceUpdateScreen, MaintenanceScreen } from '@/components/SystemScreens'

// Set Cairo as default font for ALL Text + TextInput components
function setGlobalFont() {
  const oldTextRender = (Text as any).render
  const oldInputRender = (TextInput as any).render
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

function AppShell() {
  const versionCheck = useAppVersionCheck()

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
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
      <OnboardingModal />
      <Toast />
    </>
  )
}

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const initAuth = useAuth((s) => s.init)

  useEffect(() => {
    ;(async () => {
      // Load Cairo font
      try {
        await Font.loadAsync({
          'Cairo': require('../assets/fonts/Cairo.ttf'),
        })
        setGlobalFont()
      } catch (e) {
        console.warn('[font] Cairo failed to load', e)
      }

      const lang = await initI18n()
      if (lang === 'ar' && !I18nManager.isRTL) {
        try { I18nManager.allowRTL(true); I18nManager.forceRTL(true) } catch {}
      }
      await initAuth()
      setReady(true)
    })()
  }, [initAuth])

  if (!ready) {
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
