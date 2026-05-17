import { useState } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import * as Linking from 'expo-linking'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

// Required for iOS — makes the browser close properly after auth
WebBrowser.maybeCompleteAuthSession()

/**
 * Google Sign-In for mobile using Expo's browser-based OAuth.
 *
 * Flow:
 * 1. Ask Supabase for the Google OAuth URL (skipBrowserRedirect=true)
 * 2. Open it in the system browser via WebBrowser.openAuthSessionAsync
 * 3. Browser redirects back to our app scheme (kidtok://)
 * 4. Extract access_token + refresh_token (or code) from the URL
 * 5. Set the Supabase session — user is now logged in
 *
 * Works in Expo Go AND dev builds without any native module.
 */
export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async (): Promise<'success' | 'cancelled' | 'error'> => {
    setLoading(true)
    setError(null)

    try {
      // Build the redirect URI the app will receive after OAuth
      const redirectUri = makeRedirectUri({
        scheme: 'kidtok',
        path: 'auth/callback',
      })

      // Ask Supabase for the Google OAuth URL
      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,   // don't open browser yet
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (oauthErr || !data?.url) {
        throw oauthErr ?? new Error('No OAuth URL returned')
      }

      // Open the Google sign-in page in the system browser.
      // When done, the browser redirects back to redirectUri and this call resolves.
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri)

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return 'cancelled'
      }

      if (result.type !== 'success' || !result.url) {
        throw new Error('OAuth was not successful')
      }

      // ── Parse tokens from the callback URL ──────────────────────────
      // Supabase can return tokens in TWO ways depending on flow type:
      //   a) Fragment (#access_token=...&refresh_token=...) — implicit
      //   b) Query param (?code=...)                        — PKCE

      const callbackUrl = result.url
      let accessToken: string | null = null
      let refreshToken: string | null = null
      let code: string | null = null

      // Try fragment first
      const hashPart = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : ''
      if (hashPart) {
        const params = new URLSearchParams(hashPart)
        accessToken = params.get('access_token')
        refreshToken = params.get('refresh_token')
      }

      // Try query params (PKCE code)
      if (!accessToken) {
        const parsed = Linking.parse(callbackUrl)
        const qs = parsed.queryParams as Record<string, string> | undefined
        code = qs?.code ?? null
        accessToken = qs?.access_token ?? null
        refreshToken = qs?.refresh_token ?? null
      }

      if (code) {
        // PKCE: exchange code for session
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchErr) throw exchErr
      } else if (accessToken) {
        // Implicit: set session directly
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        })
        if (sessErr) throw sessErr
      } else {
        throw new Error('No token or code found in callback URL')
      }

      return 'success'
    } catch (err) {
      const msg = (err as Error).message || 'Google sign-in failed'
      setError(msg)
      console.error('[Google SignIn]', msg)
      return 'error'
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading, error }
}
