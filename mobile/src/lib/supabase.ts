import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra || {}

// Preview builds can point at a Supabase Branch through EXPO_PUBLIC_* vars.
// Store/release builds keep using the existing app.json values unchanged.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || (extra.SUPABASE_URL as string) || ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || (extra.SUPABASE_ANON_KEY as string) || ''

export { SUPABASE_URL, SUPABASE_ANON_KEY }

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[KidTok] Missing Supabase config in app.json → extra')
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder_key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
