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
  platform?: string | null
  app_version?: string | null
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
    const limit = Math.max(25, Math.min(Number(body?.limit || 100), 100))

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

    const selected = await attachPushTokenMetadata(admin, rows as QueueRow[])
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
  const deadTokens = new Set<string>()

  for (const groupRows of groupRowsByProjectHint(rows)) {
    for (let i = 0; i < groupRows.length; i += 100) {
      const chunkRows = groupRows.slice(i, i + 100)
      const result = await sendExpoRows(admin, chunkRows, history, deadTokens)
      sent += result.sent
      failed += result.failed
      lastError = result.lastError || lastError
    }
  }

  if (deadTokens.size > 0) {
    const tokens = [...deadTokens]
    for (let i = 0; i < tokens.length; i += 500) {
      await admin
        .from('push_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('expo_token', tokens.slice(i, i + 500))
    }
  }

  return { sent, failed, lastError }
}

async function attachPushTokenMetadata(admin: any, rows: QueueRow[]): Promise<QueueRow[]> {
  const tokens = [...new Set(rows.map((row) => row.expo_token).filter(Boolean))]
  if (tokens.length === 0) return rows

  const metadata = new Map<string, { platform: string | null; app_version: string | null }>()
  for (let i = 0; i < tokens.length; i += 500) {
    const { data, error } = await admin
      .from('push_tokens')
      .select('expo_token, platform, app_version')
      .eq('is_active', true)
      .in('expo_token', tokens.slice(i, i + 500))

    if (error) continue
    for (const row of data || []) {
      if (typeof row?.expo_token !== 'string') continue
      metadata.set(row.expo_token, {
        platform: row.platform || null,
        app_version: row.app_version || null,
      })
    }
  }

  return rows.map((row) => ({
    ...row,
    platform: metadata.get(row.expo_token)?.platform || null,
    app_version: metadata.get(row.expo_token)?.app_version || null,
  }))
}

function groupRowsByProjectHint(rows: QueueRow[]): QueueRow[][] {
  const buckets = new Map<string, QueueRow[]>()

  for (const row of rows) {
    const key = `${row.platform || 'unknown'}:${row.app_version || 'unknown'}`
    const bucket = buckets.get(key) || []
    bucket.push(row)
    buckets.set(key, bucket)
  }

  return [...buckets.values()]
}

async function sendExpoRows(
  admin: any,
  rows: QueueRow[],
  history: HistoryRow,
  deadTokens: Set<string>,
): Promise<{ sent: number; failed: number; lastError: string | null }> {
  if (rows.length === 0) return { sent: 0, failed: 0, lastError: null }

  const messages = rows.map((r) => buildExpoMessage(r, history))

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
    const detail = getExpoErrorDetail(payload, resp.status)

    if (!resp.ok) {
      if (rows.length > 1 && isProjectMismatchError(payload, detail)) {
        const expoGroups = getProjectMismatchGroups(payload, rows)
        if (expoGroups.length > 1) {
          return await retryExpoGroups(admin, expoGroups, history, deadTokens)
        }
        return await splitAndRetryExpoRows(admin, rows, history, deadTokens)
      }

      await markRows(admin, rows.map((r) => r.id), 'failed', 'EXPO_HTTP', detail)
      return { sent: 0, failed: rows.length, lastError: detail }
    }

    const tickets = Array.isArray(payload?.data) ? payload.data : []
    const sentIds: string[] = []
    const failedItems: { id: string; code: string; detail: string; token: string }[] = []
    let sent = 0
    let failed = 0
    let lastError: string | null = null

    for (let j = 0; j < rows.length; j++) {
      const ticket = tickets[j]
      if (ticket?.status === 'ok') {
        sentIds.push(rows[j].id)
        sent++
      } else {
        const code = ticket?.details?.error || 'EXPO_TICKET_FAILED'
        const itemDetail = ticket?.message || code
        failedItems.push({ id: rows[j].id, code, detail: itemDetail, token: rows[j].expo_token })
        failed++
        lastError = itemDetail
        if (DEAD_TOKEN_ERRORS.has(code)) deadTokens.add(rows[j].expo_token)
      }
    }

    await markRows(admin, sentIds, 'sent')
    for (const item of failedItems) {
      await markRows(admin, [item.id], 'failed', item.code, item.detail)
    }

    return { sent, failed, lastError }
  } catch (err) {
    const detail = (err as Error).message
    await markRows(admin, rows.map((r) => r.id), 'failed', 'EXPO_FETCH_FAILED', detail)
    return { sent: 0, failed: rows.length, lastError: detail }
  }
}

async function splitAndRetryExpoRows(
  admin: any,
  rows: QueueRow[],
  history: HistoryRow,
  deadTokens: Set<string>,
): Promise<{ sent: number; failed: number; lastError: string | null }> {
  if (rows.length <= 1) {
    const detail = 'Expo rejected this token because it belongs to a different project/experience.'
    await markRows(admin, rows.map((r) => r.id), 'failed', 'PUSH_TOO_MANY_EXPERIENCE_IDS', detail)
    return { sent: 0, failed: rows.length, lastError: detail }
  }

  const mid = Math.ceil(rows.length / 2)
  const left = await sendExpoRows(admin, rows.slice(0, mid), history, deadTokens)
  const right = await sendExpoRows(admin, rows.slice(mid), history, deadTokens)
  return {
    sent: left.sent + right.sent,
    failed: left.failed + right.failed,
    lastError: right.lastError || left.lastError,
  }
}

async function retryExpoGroups(
  admin: any,
  groups: QueueRow[][],
  history: HistoryRow,
  deadTokens: Set<string>,
): Promise<{ sent: number; failed: number; lastError: string | null }> {
  let sent = 0
  let failed = 0
  let lastError: string | null = null

  for (const group of groups) {
    const result = await sendExpoRows(admin, group, history, deadTokens)
    sent += result.sent
    failed += result.failed
    lastError = result.lastError || lastError
  }

  return { sent, failed, lastError }
}

function buildExpoMessage(row: QueueRow, history: HistoryRow) {
  const useEn = row.language === 'en'
  return {
    to: row.expo_token,
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
}

function getExpoErrorDetail(payload: any, status: number): string {
  const errors = Array.isArray(payload?.errors) ? payload.errors : []
  const parts = errors.flatMap((e: any) => [
    e?.code,
    e?.details?.error,
    e?.message,
  ])
  if (payload?.message) parts.push(payload.message)
  return parts.filter(Boolean).join(' — ') || `Expo HTTP ${status}`
}

function isProjectMismatchError(payload: any, detail: string): boolean {
  const haystack = `${JSON.stringify(payload || {})} ${detail}`.toLowerCase()
  return haystack.includes('push_too_many_experience_ids')
    || haystack.includes('same project')
    || haystack.includes('conflicting tokens')
    || haystack.includes('different expo experiences')
}

function getProjectMismatchGroups(payload: any, rows: QueueRow[]): QueueRow[][] {
  const errors = Array.isArray(payload?.errors) ? payload.errors : []
  const details = errors.find((e: any) => e?.details && typeof e.details === 'object')?.details
  if (!details || Array.isArray(details)) return []

  const groups: QueueRow[][] = []
  const matched = new Set<string>()

  for (const tokens of Object.values(details)) {
    if (!Array.isArray(tokens)) continue
    const tokenSet = new Set(tokens.filter((token): token is string => typeof token === 'string'))
    const group = rows.filter((row) => tokenSet.has(row.expo_token))
    if (group.length === 0) continue
    groups.push(group)
    for (const row of group) matched.add(row.id)
  }

  const unmatched = rows.filter((row) => !matched.has(row.id))
  if (unmatched.length > 0) groups.push(unmatched)

  return groups
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
