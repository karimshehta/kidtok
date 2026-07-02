/**
 * send-push — Admin endpoint to send push notifications to KidTok users.
 *
 * Body (JSON):
 * {
 *   "title_ar": "...",
 *   "body_ar": "...",
 *   "title_en"?: "...",
 *   "body_en"?: "...",
 *   "image_url"?: "...",
 *   "deep_link"?: "/playlist/abc/play",
 *   "data"?: { ... },
 *   "target_type": "all" | "language" | "subscribed" | "free" | "user" | "role",
 *   "target_value"?: "ar" | "en" | "<user_id>" | "creator" | "admin"
 * }
 *
 * Strategy:
 *   1. Verify the caller is an admin (RLS via service_role + role check).
 *   2. Insert a row in notification_history (status='sending').
 *   3. Fetch matching push_tokens.
 *   4. Group tokens by language so we can send the right localized text.
 *   5. POST to https://exp.host/--/api/v2/push/send in batches of 100.
 *   6. Update notification_history with sent_count + status='sent'.
 */

import { createClient } from 'jsr:@supabase/supabase-js@^2.45.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth: verify the caller is an authenticated admin ─────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'UNAUTHENTICATED' }, 401)
    }

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userRes, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userRes.user) {
      return json({ error: 'UNAUTHENTICATED' }, 401)
    }

    // Verify admin role
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userRes.user.id)
      .single()

    if (profile?.role !== 'admin') {
      return json({ error: 'FORBIDDEN' }, 403)
    }

    // ── Parse body ────────────────────────────────────────────────────
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

    // ── Record in history (status='sending') ──────────────────────────
    const { data: history, error: histErr } = await admin
      .from('notification_history')
      .insert({
        title_ar, body_ar,
        title_en: title_en || title_ar,
        body_en: body_en || body_ar,
        image_url, deep_link,
        data: data || {},
        target_type, target_value,
        status: 'sending',
        created_by: userRes.user.id,
      })
      .select('id')
      .single()

    if (histErr || !history) {
      return json({ error: 'DB_INSERT_FAILED', detail: histErr?.message }, 500)
    }

    // ── Fetch matching push tokens ────────────────────────────────────
    // NOTE: PostgREST caps un-paginated SELECT at ~1000 rows. Without
    // explicit pagination, this used to return only the first 1000
    // tokens even when 5,000+ existed — which is why past sends
    // reported ~900 delivered on a base of 5,641 devices. We now
    // paginate through every matching row.
    const buildTokenQuery = () => admin
      .from('push_tokens')
      .select('expo_token, language, user_id')
      .eq('is_active', true)

    let tokenFilter: 'none' | 'language' | 'user' | 'in' | 'free' = 'none'
    let tokenFilterValue: any = null

    if (target_type === 'language' && target_value) {
      tokenFilter = 'language'
      tokenFilterValue = target_value === 'en' ? 'en' : 'ar'
    } else if (target_type === 'user' && target_value) {
      tokenFilter = 'user'
      tokenFilterValue = target_value
    } else if (target_type === 'role' && target_value) {
      // Get user_ids with this role first (also paginated — role tables
      // can be small but we paginate for safety)
      const users = await fetchAll((from, to) =>
        admin.from('profiles').select('id').eq('role', target_value).range(from, to)
      )
      const ids = users.map((u: any) => u.id)
      if (ids.length === 0) {
        await admin.from('notification_history').update({
          status: 'sent', sent_count: 0, sent_at: new Date().toISOString(),
        }).eq('id', history.id)
        return json({ ok: true, sent: 0, message: 'No users with that role' })
      }
      tokenFilter = 'in'
      tokenFilterValue = ids
    } else if (target_type === 'subscribed') {
      const subs = await fetchAll((from, to) =>
        admin.from('subscriptions').select('user_id')
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .range(from, to)
      )
      const ids = [...new Set(subs.map((s: any) => s.user_id))]
      if (ids.length === 0) {
        await admin.from('notification_history').update({
          status: 'sent', sent_count: 0, sent_at: new Date().toISOString(),
        }).eq('id', history.id)
        return json({ ok: true, sent: 0, message: 'No subscribed users' })
      }
      tokenFilter = 'in'
      tokenFilterValue = ids
    } else if (target_type === 'free') {
      const subs = await fetchAll((from, to) =>
        admin.from('subscriptions').select('user_id')
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .range(from, to)
      )
      const subIds = new Set(subs.map((s: any) => s.user_id))
      const allTokens = await fetchAll((from, to) => buildTokenQuery().range(from, to))
      const filtered = allTokens.filter((t: any) => !subIds.has(t.user_id))
      return await sendBatch(admin, history.id, filtered, {
        title_ar, body_ar, title_en, body_en, image_url, deep_link, data,
      })
    }

    // Fetch tokens (fully paginated — no more silent 1000-row cap)
    const tokens = await fetchAll((from, to) => {
      let q = buildTokenQuery().range(from, to)
      if (tokenFilter === 'language') q = q.eq('language', tokenFilterValue)
      else if (tokenFilter === 'user') q = q.eq('user_id', tokenFilterValue)
      else if (tokenFilter === 'in') q = q.in('user_id', tokenFilterValue)
      return q
    })

    return await sendBatch(admin, history.id, tokens, {
      title_ar, body_ar, title_en, body_en, image_url, deep_link, data,
    })
  } catch (err) {
    return json({ error: 'INTERNAL', detail: (err as Error).message }, 500)
  }
})

async function sendBatch(
  admin: any,
  historyId: string,
  tokens: { expo_token: string; language: string; user_id?: string }[],
  msg: {
    title_ar: string
    body_ar: string
    title_en?: string
    body_en?: string
    image_url?: string
    deep_link?: string
    data?: any
  }
): Promise<Response> {
  if (tokens.length === 0) {
    await admin.from('notification_history').update({
      status: 'sent',
      sent_count: 0,
      sent_at: new Date().toISOString(),
    }).eq('id', historyId)
    return json({ ok: true, sent: 0 })
  }

  // Build Expo push messages — pick AR or EN per recipient
  const messages = tokens.map((t) => {
    const useEn = t.language === 'en'
    const title = useEn ? (msg.title_en || msg.title_ar) : msg.title_ar
    const body = useEn ? (msg.body_en || msg.body_ar) : msg.body_ar
    return {
      to: t.expo_token,
      title,
      body,
      sound: 'default',
      priority: 'high',
      data: {
        ...(msg.data || {}),
        deep_link: msg.deep_link,
      },
      ...(msg.image_url ? { richContent: { image: msg.image_url } } : {}),
      channelId: 'default',
    }
  })

  let sent = 0
  let failed = 0
  const batchSize = 100

  for (let i = 0; i < messages.length; i += batchSize) {
    const chunk = messages.slice(i, i + batchSize)
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      const result = await resp.json()
      const tickets = result?.data || []
      // tickets[i] aligns with chunk[i] — same order. Track which tokens are
      // dead so we can deactivate them in one batched query at the end.
      const deadTokens: string[] = []
      for (let j = 0; j < tickets.length; j++) {
        const tk = tickets[j]
        if (tk?.status === 'ok') sent++
        else {
          failed++
          // Any of the dead-token error codes → deactivate so we
          // never waste another push on this token.
          const errCode = tk?.details?.error
          if (errCode && DEAD_TOKEN_ERRORS.has(errCode)) {
            const deadTo = chunk[j]?.to
            if (typeof deadTo === 'string' && deadTo) deadTokens.push(deadTo)
          }
        }
      }
      // Batch-deactivate dead tokens
      if (deadTokens.length > 0) {
        try {
          await admin
            .from('push_tokens')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .in('expo_token', deadTokens)
        } catch { /* best-effort cleanup; don't fail the send */ }
      }
    } catch {
      failed += chunk.length
    }
  }

  // ── Fanout to per-user inbox so the in-app notifications tab shows it.
  // dispatch_push=false because we already sent the Expo push above —
  // otherwise the notifications trigger would re-send it (duplicate push).
  try {
    const uniqueUserIds = [...new Set(tokens.map((t) => t.user_id).filter(Boolean))]
    if (uniqueUserIds.length > 0) {
      const rows = uniqueUserIds.map((uid) => ({
        user_id:       uid,
        type:          'broadcast',
        title_ar:      msg.title_ar,
        body_ar:       msg.body_ar,
        title_en:      msg.title_en || null,
        body_en:       msg.body_en  || null,
        image_url:     msg.image_url || null,
        deep_link:     msg.deep_link || null,
        data:          msg.data || {},
        dispatch_push: false,        // ← already sent above
      }))
      await admin.from('notifications').insert(rows)
    }
  } catch { /* inbox fanout is best-effort; don't fail the send */ }

  await admin.from('notification_history').update({
    status: failed === messages.length ? 'failed' : 'sent',
    sent_count: sent,
    failed_count: failed,
    sent_at: new Date().toISOString(),
  }).eq('id', historyId)

  return json({ ok: true, sent, failed, total: messages.length })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Paginate through a Supabase query, gathering every row.
 *
 * PostgREST caps un-paginated selects at ~1000 rows. Any table that
 * grows past that ceiling (push_tokens, notification_history, etc.)
 * silently truncates results without pagination. This helper walks
 * page-by-page in 1000-row windows until it sees a short page or an
 * error, then returns the full set.
 */
async function fetchAll<T = any>(
  makeQuery: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  // Hard ceiling — refuses to try more than 200k rows to avoid runaway
  // loops. Push_tokens rarely goes past 100k for KidTok's scale; if we
  // ever cross this we'll notice from the log and paginate on read.
  const maxPages = 200
  for (let page = 0; page < maxPages; page++) {
    const to = from + pageSize - 1
    const { data, error } = await makeQuery(from, to)
    if (error) {
      console.error('[fetchAll] error at page', page, error)
      break
    }
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

/**
 * Expo returns a handful of ticket-level error codes that all mean the
 * token is dead and should never be pushed again. Kept as a single set
 * so we deactivate on any of them, not just the two most common.
 */
const DEAD_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MismatchSenderId',
  'MessageTooBig',
])
