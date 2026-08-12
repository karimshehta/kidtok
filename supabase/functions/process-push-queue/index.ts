/**
 * process-push-queue — Drain queued admin broadcast pushes in small batches.
 *
 * Called repeatedly by the admin notifications page. Each call processes a
 * small number of queued delivery rows so we avoid Edge Function worker
 * resource limits.
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

type QueueRow = {
  id: string
  history_id: string
  user_id: string | null
  expo_token: string
  language: string | null
}

type HistoryRow = {
  id: string
  title_ar: string
  body_ar: string
  title_en: string | null
  body_en: string | null
  image_url: string | null
  deep_link: string | null
  data: Record<string, unknown> | null
  sent_count: number
  failed_count: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  try {
    const auth = await requireAdmin(req, admin)
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({}))
    const historyId = typeof body?.history_id === 'string' ? body.history_id : null
    const limit = Math.max(50, Math.min(Number(body?.limit || 250), 500))

    await admin
      .from('notification_delivery_queue')
      .update({ status: 'queued', processed_at: null, error_code: null, error_detail: null })
      .eq('status', 'sending')
      .lt('processed_at', new Date(Date.now() - 10 * 60_000).toISOString())

    const activeHistoryId = historyId || await findNextHistoryId(admin)
    if (!activeHistoryId) {
      return json({ ok: true, processed: 0, sent: 0, failed: 0, remaining: 0 })
    }

    const queueQuery = admin
      .from('notification_delivery_queue')
      .select('id, history_id, user_id, expo_token, language')
      .eq('status', 'queued')
      .eq('history_id', activeHistoryId)
      .order('created_at', { ascending: true })
      .limit(limit)

    const { data: rows, error: rowsErr } = await queueQuery
    if (rowsErr) return json({ error: 'QUEUE_READ_FAILED', detail: rowsErr.message }, 500)
    if (!rows || rows.length === 0) {
      const remaining = await countRemaining(admin, activeHistoryId)
      if (remaining === 0) await finalizeHistoryIfDone(admin, activeHistoryId)
      return json({ ok: true, history_id: activeHistoryId, processed: 0, sent: 0, failed: 0, remaining })
    }

    const selected = rows as QueueRow[]
    const selectedIds = selected.map((r) => r.id)

    const { error: markErr } = await admin
      .from('notification_delivery_queue')
      .update({ status: 'sending', processed_at: new Date().toISOString() })
      .in('id', selectedIds)
    if (markErr) return json({ error: 'QUEUE_MARK_FAILED', detail: markErr.message }, 500)

    const { data: history, error: histErr } = await admin
      .from('notification_history')
      .select('id, title_ar, body_ar, title_en, body_en, image_url, deep_link, data, sent_count, failed_count')
      .eq('id', activeHistoryId)
      .single()
    if (histErr || !history) {
      return json({ error: 'HISTORY_NOT_FOUND', detail: histErr?.message }, 500)
    }

    await admin
      .from('notification_history')
      .update({ status: 'sending', last_error: null })
      .eq('id', activeHistoryId)

    const result = await sendExpoBatch(admin, selected, history as HistoryRow)

    const currentSent = Number((history as HistoryRow).sent_count || 0)
    const currentFailed = Number((history as HistoryRow).failed_count || 0)
    const nextSent = currentSent + result.sent
    const nextFailed = currentFailed + result.failed

    const remaining = await countRemaining(admin, activeHistoryId)
    const finalStatus = remaining > 0 ? 'sending' : nextSent > 0 ? 'sent' : 'failed'

    await admin
      .from('notification_history')
      .update({
        status: finalStatus,
        sent_count: nextSent,
        failed_count: nextFailed,
        last_error: result.lastError,
        sent_at: remaining > 0 ? null : new Date().toISOString(),
      })
      .eq('id', activeHistoryId)

    return json({
      ok: true,
      history_id: activeHistoryId,
      processed: selected.length,
      sent: result.sent,
      failed: result.failed,
      remaining,
    })
  } catch (err) {
    return json({ error: 'INTERNAL', detail: (err as Error).message }, 500)
  }
})

async function sendExpoBatch(
  admin: any,
  rows: QueueRow[],
  history: HistoryRow,
): Promise<{ sent: number; failed: number; lastError: string | null }> {
  let sent = 0
  let failed = 0
  let lastError: string | null = null
  const deadTokens: string[] = []

  for (let i = 0; i < rows.length; i += 100) {
    const chunkRows = rows.slice(i, i + 100)
    const messages = chunkRows.map((r) => {
      const useEn = r.language === 'en'
      return {
        to: r.expo_token,
        title: useEn ? (history.title_en || history.title_ar) : history.title_ar,
        body: useEn ? (history.body_en || history.body_ar) : history.body_ar,
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        data: {
          ...(history.data || {}),
          notification_id: history.id,
          deep_link: history.deep_link,
          type: 'broadcast',
        },
        ...(history.image_url ? { richContent: { image: history.image_url } } : {}),
      }
    })

    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      })

      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        const detail = payload?.errors?.[0]?.message || payload?.message || `Expo HTTP ${resp.status}`
        lastError = detail
        failed += chunkRows.length
        await markRows(admin, chunkRows.map((r) => r.id), 'failed', 'EXPO_HTTP', detail)
        continue
      }

      const tickets = Array.isArray(payload?.data) ? payload.data : []
      const sentIds: string[] = []
      const failedItems: { id: string; code: string; detail: string; token: string }[] = []

      for (let j = 0; j < chunkRows.length; j++) {
        const ticket = tickets[j]
        if (ticket?.status === 'ok') {
          sentIds.push(chunkRows[j].id)
          sent++
        } else {
          const code = ticket?.details?.error || 'EXPO_TICKET_FAILED'
          const detail = ticket?.message || code
          failedItems.push({ id: chunkRows[j].id, code, detail, token: chunkRows[j].expo_token })
          failed++
          lastError = detail
          if (DEAD_TOKEN_ERRORS.has(code)) deadTokens.push(chunkRows[j].expo_token)
        }
      }

      await markRows(admin, sentIds, 'sent')
      for (const item of failedItems) {
        await markRows(admin, [item.id], 'failed', item.code, item.detail)
      }
    } catch (err) {
      const detail = (err as Error).message
      lastError = detail
      failed += chunkRows.length
      await markRows(admin, chunkRows.map((r) => r.id), 'failed', 'EXPO_FETCH_FAILED', detail)
    }
  }

  if (deadTokens.length > 0) {
    for (let i = 0; i < deadTokens.length; i += 500) {
      await admin
        .from('push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('expo_token', deadTokens.slice(i, i + 500))
    }
  }

  return { sent, failed, lastError }
}

async function markRows(
  admin: any,
  ids: string[],
  status: 'sent' | 'failed',
  errorCode: string | null = null,
  errorDetail: string | null = null,
) {
  if (ids.length === 0) return
  await admin
    .from('notification_delivery_queue')
    .update({
      status,
      error_code: errorCode,
      error_detail: errorDetail,
      processed_at: new Date().toISOString(),
    })
    .in('id', ids)
}

async function countRemaining(admin: any, historyId: string): Promise<number> {
  const { count } = await admin
    .from('notification_delivery_queue')
    .select('id', { count: 'exact', head: true })
    .eq('history_id', historyId)
    .in('status', ['queued', 'sending'])
  return count || 0
}

async function finalizeHistoryIfDone(admin: any, historyId: string) {
  const { data } = await admin
    .from('notification_history')
    .select('sent_count, failed_count')
    .eq('id', historyId)
    .maybeSingle()

  if (!data) return
  const sent = Number(data.sent_count || 0)
  await admin
    .from('notification_history')
    .update({
      status: sent > 0 ? 'sent' : 'failed',
      sent_at: new Date().toISOString(),
    })
    .eq('id', historyId)
}

async function findNextHistoryId(admin: any): Promise<string | null> {
  const { data, error } = await admin
    .from('notification_delivery_queue')
    .select('history_id')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not find queued notification: ${error.message}`)
  return data?.history_id || null
}

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const DEAD_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MismatchSenderId',
])
