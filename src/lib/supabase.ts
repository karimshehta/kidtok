import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ''

const envOk =
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseAnonKey !== 'your-anon-key-here'

if (!envOk) {
  console.error(
    '[KidTok] ⚠️  Missing Supabase env vars!\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel:\n' +
    '  Project → Settings → Environment Variables\n' +
    'Then re-deploy.'
  )
}

// Pass safe fallbacks so createClient never throws at module load.
// Queries will fail later (caught by React-Query), so the app still
// boots and the ErrorBoundary / login pages remain visible.
const SAFE_URL = supabaseUrl || 'https://placeholder.supabase.co'
const SAFE_KEY = supabaseAnonKey || 'placeholder_anon_key_for_boot_only'

// We get strong types from src/types/db.ts at the application layer;
// the client itself is permissively typed so insert/update don't resolve to never.
export const supabase: SupabaseClient = createClient(SAFE_URL, SAFE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
