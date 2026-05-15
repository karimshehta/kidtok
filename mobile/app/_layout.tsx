import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { View, ActivityIndicator, I18nManager } from 'react-native'
import Toast from 'react-native-toast-message'

import { initI18n } from '@/lib/i18n'
import { useAuth } from '@/stores/auth'
import { colors } from '@/lib/theme'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

export default function RootLayout() {
  const [ready, setReady] = useState(false)
  const initAuth = useAuth((s) => s.init)

  useEffect(() => {
    ;(async () => {
      const lang = await initI18n()
      // Set RTL for Arabic — handled at layout level, no restart needed at first launch
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
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/signup" />
            <Stack.Screen name="(tabs)" />
          </Stack>
          <Toast />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
