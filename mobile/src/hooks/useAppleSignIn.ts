import { useState } from 'react'
import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import { supabase } from '@/lib/supabase'

/**
 * Apple Sign In flow for KidTok.
 *
 * The flow is dramatically simpler than the Google OAuth dance:
 *   1) Native sheet asks the user to confirm with Face ID / passcode.
 *   2) Apple returns an identity token (a signed JWT).
 *   3) Supabase verifies it against Apple's public keys.
 *   4) We get a Supabase session — same shape as Google / email login.
 *
 * Important Apple quirks this hook handles:
 *   • Name is returned on the FIRST login only. Apple's docs are very
 *     explicit about this — if the user uninstalls + reinstalls, name
 *     is gone. We persist it into profiles.name on first login so we
 *     never need to ask Apple for it again.
 *   • Email may be a private relay address (xxx@privaterelay.appleid.com).
 *     That's fine — Supabase still issues a session keyed by it, and
 *     Apple will forward email to the user's real address.
 *   • If the user revokes the app in Settings → Apple ID, the next
 *     sign-in starts fresh and Apple will return the name again.
 */
export function useAppleSignIn() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const isAvailable = Platform.OS === 'ios'

  const signIn = async (): Promise<'success' | 'cancelled' | 'error'> => {
    if (!isAvailable) {
      setError('Apple Sign In is iOS only')
      return 'error'
    }

    setLoading(true)
    setError(null)

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple')
      }

      // Exchange Apple's signed JWT for a Supabase session. The 'nonce'
      // param is optional here — Supabase doesn't enforce it for native
      // sign-in. Apple's token signature is what's verified.
      const { data, error: sessionErr } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      })
      if (sessionErr || !data?.user) {
        throw sessionErr ?? new Error('Supabase did not return a session')
      }

      // First-login enrichment: Apple returns the name in fullName only
      // on the very first authorisation. Subsequent sign-ins return null
      // for both givenName and familyName — even after a full reinstall
      // unless the user revokes the app in iOS Settings. So we save it
      // now, while we have it.
      const given = credential.fullName?.givenName?.trim()
      const family = credential.fullName?.familyName?.trim()
      const name = [given, family].filter(Boolean).join(' ')

      if (name) {
        // We only OVERWRITE an empty profile name — never trample over
        // something the user already set in the app. handle_new_user
        // creates the profile with name = '' so this is the normal path
        // for a brand-new Apple sign-up.
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', data.user.id)
          .maybeSingle()

        if (!existingProfile?.name) {
          await supabase
            .from('profiles')
            .update({ name })
            .eq('id', data.user.id)
        }
      }

      return 'success'
    } catch (err: any) {
      // expo-apple-authentication throws ERR_REQUEST_CANCELED when the
      // user closes the native sheet — treat that as a non-error.
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
        return 'cancelled'
      }
      const msg = (err as Error)?.message || 'Apple sign-in failed'
      setError(msg)
      return 'error'
    } finally {
      setLoading(false)
    }
  }

  return { signIn, loading, error, isAvailable }
}
