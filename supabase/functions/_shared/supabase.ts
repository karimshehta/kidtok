// Supabase client helpers for Edge Functions
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * Service-role client. Bypasses RLS. Use ONLY in server-side Edge Functions,
 * never expose the key to the client.
 */
export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Authenticated user client. Uses the JWT from the caller's Authorization header
 * so RLS applies. Returns null if no valid JWT was provided.
 */
export function getUserClient(req: Request): SupabaseClient | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')

  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Resolve the caller's user id from the JWT, or null if anonymous. */
export async function requireUser(req: Request): Promise<{ id: string; role?: string } | null> {
  const client = getUserClient(req)
  if (!client) return null
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, role: (data.user.app_metadata as any)?.role }
}
