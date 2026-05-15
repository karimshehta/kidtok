import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra || {}

const SUPABASE_URL = (extra.SUPABASE_URL as string) || ''
const SUPABASE_ANON_KEY = (extra.SUPABASE_ANON_KEY as string) || ''

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
