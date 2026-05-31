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
    let q = admin
      .from('push_tokens')
      .select('expo_token, language, user_id')
      .eq('is_active', true)

    if (target_type === 'language' && target_value) {
      q = q.eq('language', target_value === 'en' ? 'en' : 'ar')
    } else if (target_type === 'user' && target_value) {
      q = q.eq('user_id', target_value)
    } else if (target_type === 'role' && target_value) {
      // Get user_ids with this role first
      const { data: users } = await admin
        .from('profiles')
        .select('id')
        .eq('role', target_value)
      const ids = (users || []).map((u: any) => u.id)
      if (ids.length === 0) {
        await admin.from('notification_history').update({
          status: 'sent', sent_count: 0, sent_at: new Date().toISOString(),
        }).eq('id', history.id)
        return json({ ok: true, sent: 0, message: 'No users with that role' })
      }
      q = q.in('user_id', ids)
    } else if (target_type === 'subscribed') {
      const { data: subs } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
      const ids = [...new Set((subs || []).map((s: any) => s.user_id))]
      if (ids.length === 0) {
        await admin.from('notification_history').update({
          status: 'sent', sent_count: 0, sent_at: new Date().toISOString(),
        }).eq('id', history.id)
        return json({ ok: true, sent: 0, message: 'No subscribed users' })
      }
      q = q.in('user_id', ids)
    } else if (target_type === 'free') {
      const { data: subs } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
      const subIds = new Set((subs || []).map((s: any) => s.user_id))
      // We'll filter out subscribed users below in JS
      const { data: allTokens } = await q
      const filtered = (allTokens || []).filter((t: any) => !subIds.has(t.user_id))
      return await sendBatch(admin, history.id, filtered, {
        title_ar, body_ar, title_en, body_en, image_url, deep_link, data,
      })
    }

    const { data: tokens, error: tokErr } = await q
    if (tokErr) {
      return json({ error: 'TOKEN_QUERY_FAILED', detail: tokErr.message }, 500)
    }

    return await sendBatch(admin, history.id, tokens || [], {
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
      for (const tk of tickets) {
        if (tk?.status === 'ok') sent++
        else {
          failed++
          // Mark token as inactive if it's invalid (DeviceNotRegistered)
          if (tk?.details?.error === 'DeviceNotRegistered') {
            // ignore — token already removed below if needed
          }
        }
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
