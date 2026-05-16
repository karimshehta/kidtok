import * as Linking from 'expo-linking'
import Constants from 'expo-constants'

/**
 * The base URL Supabase should redirect to in emails.
 *
 * - In Expo Go (development): use the Expo Go URI scheme so the email link
 *   re-opens Expo Go on the device.
 * - In a standalone build (production): use the universal-link domain
 *   (kidtok.vercel.app) which Android + iOS will automatically catch and
 *   open in the native app via App Links / Universal Links.
 *
 * Both URLs are configured as "Redirect URLs" in Supabase Auth settings
 * so Supabase will sign them.
 */
const PROD_WEB = 'https://kidtok.vercel.app'

export function getAuthRedirectUrl(path: 'callback' | 'reset-password'): string {
  // In Expo Go, return the dev URL — automatically becomes exp://… on device
  if (Constants.appOwnership === 'expo' || __DEV__) {
    // expo-linking generates the correct dev URL (exp://<lan-ip>:8081/auth/<path>)
    return Linking.createURL(`/auth/${path}`)
  }

  // Production: prefer universal link (Android App Links + iOS Universal Links)
  // → If app installed → opens app directly
  // → If not installed → goes to web fallback (which can show "Install app" CTA)
  return `${PROD_WEB}/auth/${path}`
}

/** For places that just need the app's own scheme (kidtok://...) */
export function getNativeDeepLink(path: string): string {
  return Linking.createURL(path)
}
