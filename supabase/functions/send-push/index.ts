/**
 * send-push — Admin endpoint to queue a broadcast push.
 *
 * Heavy Expo sending is intentionally NOT done here. Large sends used to
 * hit Supabase Edge Function resource limits (HTTP 546). This function now:
 *   1. Verifies the caller is an admin.
 *   2. Inserts notification_history with status='queued'.
 *   3. Finds matching active push tokens.
 *   4. Inserts delivery rows into notification_delivery_queue.
 *   5. Fans out the in-app inbox rows once per user.
 *
 * The admin dashboard then calls process-push-queue repeatedly to drain
 * the queue in small safe batches.
 */

import { createClient } from 'jsr:@supabase/supabase-js@^2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type TokenRow = {
  expo_token: string
  language: string | null
  user_id: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let historyId: string | null = null
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  try {
    const auth = await requireAdmin(req, admin)
    if (auth.error) return auth.error

    const body = await req.json()
    const {
      title_ar,
      body_ar,
      title_en,
      body_en,
      image_url,
      deep_link,
      data,
      target_type = 'all',
      target_value,
    } = body || {}

    if (!title_ar || !body_ar) {
      return json({ error: 'MISSING_FIELDS', detail: 'title_ar and body_ar are required' }, 400)
    }

    const message = {
      title_ar,
      body_ar,
      title_en: title_en || title_ar,
      body_en: body_en || body_ar,
      image_url: image_url || null,
      deep_link: deep_link || null,
      data: data || {},
    }

    const { data: history, error: histErr } = await admin
      .from('notification_history')
      .insert({
        ...message,
        target_type,
        target_value,
        status: 'queued',
        sent_count: 0,
        failed_count: 0,
        queued_count: 0,
        last_error: null,
        created_by: auth.userId,
      })
      .select('id')
      .single()

    if (histErr || !history) {
      return json({ error: 'DB_INSERT_FAILED', detail: histErr?.message }, 500)
    }
    historyId = history.id

    const tokens = await fetchTargetTokens(admin, target_type, target_value)
    const validTokens = tokens.filter((t) => isExpoPushToken(t.expo_token))
    const uniqueValidTokens = dedupeTokenRows(validTokens)
    const invalidTokens = tokens
      .filter((t) => !isExpoPushToken(t.expo_token))
      .map((t) => t.expo_token)
      .filter(Boolean)

    if (invalidTokens.length > 0) {
      await deactivateTokens(admin, invalidTokens)
    }

    const queueRows = uniqueValidTokens.map((t) => ({
      history_id: history.id,
      user_id: t.user_id,
      expo_token: t.expo_token,
      language: t.language === 'en' ? 'en' : 'ar',
      status: 'queued',
    }))

    await insertInChunks(admin, 'notification_delivery_queue', queueRows)

    const inboxRows = [...new Set(uniqueValidTokens.map((t) => t.user_id).filter(Boolean))]
      .map((uid) => ({
        user_id: uid,
        type: 'broadcast',
        title_ar: message.title_ar,
        body_ar: message.body_ar,
        title_en: message.title_en || null,
        body_en: message.body_en || null,
        image_url: message.image_url,
        deep_link: message.deep_link,
        data: message.data,
        dispatch_push: false,
      }))

    await insertInChunks(admin, 'notifications', inboxRows)

    const terminalStatus = queueRows.length > 0
      ? 'queued'
      : invalidTokens.length > 0 ? 'failed' : 'sent'

    await admin
      .from('notification_history')
      .update({
        status: terminalStatus,
        queued_count: queueRows.length,
        failed_count: invalidTokens.length,
        sent_at: queueRows.length > 0 ? null : new Date().toISOString(),
      })
      .eq('id', history.id)

    return json({
      ok: true,
      queued: queueRows.length,
      failed: invalidTokens.length,
      total: tokens.length,
      duplicates: validTokens.length - uniqueValidTokens.length,
      history_id: history.id,
      message: queueRows.length > 0 ? 'Notification queued for delivery' : 'No active push tokens',
    })
  } catch (err) {
    if (historyId) {
      try {
        await admin.from('notification_history').update({
          status: 'failed',
          last_error: (err as Error).message,
          sent_at: new Date().toISOString(),
        }).eq('id', historyId)
      } catch {}
    }
    return json({ error: 'INTERNAL', detail: (err as Error).message }, 500)
  }
})

async function requireAdmin(req: Request, admin: any): Promise<{ userId: string; error?: Response }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { userId: '', error: json({ error: 'UNAUTHENTICATED' }, 401) }
  }

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userRes, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userRes.user) {
    return { userId: '', error: json({ error: 'UNAUTHENTICATED' }, 401) }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { userId: '', error: json({ error: 'FORBIDDEN' }, 403) }
  }

  return { userId: userRes.user.id }
}

async function fetchTargetTokens(
  admin: any,
  targetType: string,
  targetValue?: string,
): Promise<TokenRow[]> {
  const buildTokenQuery = () => admin
    .from('push_tokens')
    .select('expo_token, language, user_id')
    .eq('is_active', true)
    .order('id', { ascending: true })

  if (targetType === 'language' && targetValue) {
    const language = targetValue === 'en' ? 'en' : 'ar'
    return await fetchAll((from, to) => buildTokenQuery().eq('language', language).range(from, to))
  }

  if (targetType === 'user' && targetValue) {
    return await fetchAll((from, to) => buildTokenQuery().eq('user_id', targetValue).range(from, to))
  }

  if (targetType === 'role' && targetValue) {
    const users = await fetchAll<{ id: string }>((from, to) =>
      admin.from('profiles').select('id').eq('role', targetValue).order('id', { ascending: true }).range(from, to)
    )
    return await fetchTokensByUserIds(admin, users.map((u) => u.id))
  }

  if (targetType === 'subscribed') {
    const subs = await fetchAll<{ user_id: string }>((from, to) =>
      admin.from('subscriptions').select('user_id')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('user_id', { ascending: true })
        .range(from, to)
    )
    return await fetchTokensByUserIds(admin, [...new Set(subs.map((s) => s.user_id))])
  }

  if (targetType === 'free') {
    const subs = await fetchAll<{ user_id: string }>((from, to) =>
      admin.from('subscriptions').select('user_id')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('user_id', { ascending: true })
        .range(from, to)
    )
    const subIds = new Set(subs.map((s) => s.user_id))
    const tokens = await fetchAll<TokenRow>((from, to) => buildTokenQuery().range(from, to))
    return tokens.filter((t) => !subIds.has(String(t.user_id || '')))
  }

  return await fetchAll((from, to) => buildTokenQuery().range(from, to))
}

async function fetchTokensByUserIds(admin: any, userIds: string[]): Promise<TokenRow[]> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return []

  const out: TokenRow[] = []
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400)
    const tokens = await fetchAll<TokenRow>((from, to) =>
      admin
        .from('push_tokens')
        .select('expo_token, language, user_id')
        .eq('is_active', true)
        .in('user_id', chunk)
        .order('id', { ascending: true })
        .range(from, to)
    )
    out.push(...tokens)
  }
  return out
}

async function insertInChunks(admin: any, table: string, rows: any[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    if (chunk.length === 0) continue
    const { error } = await admin.from(table).insert(chunk)
    if (error) throw new Error(`${table} insert failed: ${error.message}`)
  }
}

async function deactivateTokens(admin: any, tokens: string[]) {
  const unique = [...new Set(tokens.filter(Boolean))]
  for (let i = 0; i < unique.length; i += 500) {
    await admin
      .from('push_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('expo_token', unique.slice(i, i + 500))
  }
}

async function fetchAll<T = any>(
  makeQuery: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  const maxPages = 200

  for (let page = 0; page < maxPages; page++) {
    const to = from + pageSize - 1
    const { data, error } = await makeQuery(from, to)
    if (error) {
      throw new Error(`fetchAll failed at page ${page}: ${error.message}`)
    }
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

function isExpoPushToken(token: unknown): token is string {
  return typeof token === 'string'
    && /^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/.test(token)
}

function dedupeTokenRows(tokens: TokenRow[]): TokenRow[] {
  const seen = new Set<string>()
  const out: TokenRow[] = []

  for (const token of tokens) {
    if (seen.has(token.expo_token)) continue
    seen.add(token.expo_token)
    out.push(token)
  }

  return out
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
