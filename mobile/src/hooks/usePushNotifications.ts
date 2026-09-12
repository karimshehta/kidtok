import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { getNotificationTargetPath } from '@/lib/notificationNavigation'

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

const APP_VERSION = (Constants.expoConfig?.version || '1.0.0')
const TOKEN_STORAGE_KEY  = 'kidtok_push_token_v1'
// Stable per-install device identifier. Generated once on first run and
// kept across app launches. Wiped on uninstall, so reinstalls produce a
// new device_id — that's intentional, the orphan token from the previous
// install will be cleaned up by the next push attempt via the send-push
// edge function or by the cleanup_stale_push_tokens RPC.
const DEVICE_ID_KEY      = 'kidtok_device_id_v1'

async function getOrCreateDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY)
  if (id) return id
  // Lightweight UUID without pulling in a new dep
  id = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36) +
            Math.random().toString(36).slice(2)
  await AsyncStorage.setItem(DEVICE_ID_KEY, id)
  return id
}

/**
 * Registers the device for push notifications and syncs the Expo token
 * (plus the user's chosen language) to Supabase via the
 * `upsert_push_token` RPC.
 *
 * Also handles tap-to-open: if the notification has a `deep_link` payload,
 * we navigate there when the user taps it.
 */
export function usePushNotifications() {
  const userId = useAuth((s) => s.user?.id)
  const { i18n } = useTranslation()
  const router = useRouter()
  const responseListener = useRef<Notifications.Subscription | null>(null)

  // 1) Register for push notifications and sync token to Supabase
  useEffect(() => {
    if (!userId) return
    ;(async () => {
      try {
        const token = await registerForPushNotificationsAsync()
        if (!token) return

        // Avoid spamming the API: only sync if token or language changed
        const last = await AsyncStorage.getItem(TOKEN_STORAGE_KEY)
        const current = `${token}|${i18n.language}|${userId}`
        if (last === current) return

        const platform = Platform.OS === 'ios' ? 'ios' : 'android'
        const deviceId = await getOrCreateDeviceId()
        const { error } = await supabase.rpc('upsert_push_token', {
          p_expo_token:  token,
          p_platform:    platform,
          p_language:    i18n.language === 'en' ? 'en' : 'ar',
          p_device_name: Device.modelName || null,
          p_app_version: APP_VERSION,
          p_device_id:   deviceId,
        })

        if (!error) {
          await AsyncStorage.setItem(TOKEN_STORAGE_KEY, current)
        }
      } catch (err) {
        console.warn('[push] registration failed:', err)
      }
    })()
  }, [userId, i18n.language])

  // 2) Handle notification tap → deep link
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data: any = response.notification.request.content.data || {}
        const target = getNotificationTargetPath({
          type: data?.type,
          deep_link: typeof data?.deep_link === 'string' ? data.deep_link : null,
          data,
        })
        try { router.push(target as any) } catch {}
      }
    )
    return () => {
      if (responseListener.current) responseListener.current.remove()
    }
  }, [router])
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null  // Push doesn't work on simulators

  // Android: ensure default channel exists
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'الإشعارات الافتراضية',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#03BBE5',
    })
  }

  // Permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  // Get the Expo push token
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants as any).easConfig?.projectId

  // Silent fail if FCM not configured (needs google-services.json for Android)
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )
    return tokenData.data
  } catch {
    // FCM/Firebase not set up — push disabled until google-services.json is added
    return null
  }
}
