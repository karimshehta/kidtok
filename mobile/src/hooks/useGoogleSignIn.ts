import { useState } from 'react'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import Constants from 'expo-constants'
import { supabase } from '@/lib/supabase'

WebBrowser.maybeCompleteAuthSession()

function makeRedirectUri(): string {
  // In Expo Go → exp://192.168.x.x:8081/auth/callback
  // In dev/production build → kidtok://auth/callback
  const isExpoGo = Constants.appOwnership === 'expo'
  if (isExpoGo) {
    return Linking.createURL('/auth/callback')
  }
  return 'kidtok://auth/callback'
}

export function useGoogleSignIn() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async (): Promise<'success' | 'cancelled' | 'error'> => {
    setLoading(true)
    setError(null)

    try {
      const redirectUri = makeRedirectUri()

      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      })

      if (oauthErr || !data?.url) {
        throw oauthErr ?? new Error('No OAuth URL returned')
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri)

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return 'cancelled'
      }
      if (result.type !== 'success' || !result.url) {
        throw new Error('OAuth was not successful')
      }

      const callbackUrl = result.url

      // Try fragment (#access_token=...&refresh_token=...)
      let accessToken: string | null = null
      let refreshToken: string | null = null
      let code: string | null = null

      const hashPart = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : ''
      if (hashPart) {
        const params = new URLSearchParams(hashPart)
        accessToken = params.get('access_token')
        refreshToken = params.get('refresh_token')
      }

      // Try query params (?code=... or ?access_token=...)
      if (!accessToken && !code) {
        const parsed = Linking.parse(callbackUrl)
        const qs = parsed.queryParams as Record<string, string> | undefined
        code = qs?.code ?? null
        accessToken = qs?.access_token ?? null
        refreshToken = qs?.refresh_token ?? null
      }

      if (code) {
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code)
        if (exchErr) throw exchErr
      } else if (accessToken) {
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        })
        if (sessErr) throw sessErr
      } else {
        throw new Error('No token or code in callback URL')
      }

      return 'success'
    } catch (err) {
      const msg = (err as Error).message || 'Google sign-in failed'
      setError(msg)
      return 'error'
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading, error }
}
