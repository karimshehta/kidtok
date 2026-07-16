// POST /functions/v1/creator-upload-url
//
// Auth: requires a logged-in user whose profile.role IN ('creator','admin').
// Body: { title, description?, age_id?, interest_id?, tags?[], max_duration_seconds? }
// Returns: { upload_url, creator_video_id, cloudflare_uid, upload_quota }
//
// The client then uploads the video file directly to `upload_url` (multipart POST).
// Cloudflare will fire a webhook to /creator-cloudflare-webhook when transcoding finishes.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createDirectUpload } from '../_shared/cloudflare.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

interface UploadRequest {
  title?: string
  description?: string | null
  age_id?: number | null
  interest_id?: number | null
  tags?: string[]
  max_duration_seconds?: number
  start_time_seconds?: number
}

interface UploadQuotaReservation {
  event_id: string
  plan_code: string
  upload_limit: number
  used_uploads: number
  remaining_uploads: number
  cycle_start: string
  cycle_end: string
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  // 1. Authenticate the caller
  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  // 2. Get service client (all authenticated users can upload)
  const admin = getServiceClient()

  // 3. Validate input
  let body: UploadRequest
  try {
    body = (await req.json()) as UploadRequest
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }

  if (body.title != null && typeof body.title !== 'string') {
    return errorResponse('Title must be a string', 400, 'TITLE_INVALID')
  }
  const cleanTitle = (body.title || '').trim()
  if (cleanTitle.length > 200) {
    return errorResponse('Title too long (max 200 chars)', 400, 'TITLE_TOO_LONG')
  }
  if (body.description && body.description.length > 5000) {
    return errorResponse('Description too long (max 5000 chars)', 400, 'DESCRIPTION_TOO_LONG')
  }

  // Hard cap: 30 seconds per video (Stories/Reels-style content).
  // The default if the client doesn't send max_duration_seconds is also 30.
  const MAX_DURATION_SEC = 30
  const maxDuration = Math.min(
    Math.max(body.max_duration_seconds ?? MAX_DURATION_SEC, 5),
    MAX_DURATION_SEC
  )

  // Server-side trim — if user picked a start offset, we'll clip after upload
  const startTimeSeconds = Math.max(0, Number(body.start_time_seconds) || 0)

  // 4. Reserve this upload against the user's plan before Cloudflare is touched.
  // This protects Stream usage even if the user records/uploads repeatedly.
  const { data: quotaRows, error: quotaErr } = await admin.rpc('reserve_creator_upload_quota', {
    p_user_id: user.id,
  })
  const quota = (Array.isArray(quotaRows) ? quotaRows[0] : quotaRows) as UploadQuotaReservation | undefined

  if (quotaErr || !quota?.event_id) {
    const msg = quotaErr?.message || 'Failed to reserve upload quota'
    if (msg.includes('PLAN_UPLOAD_LIMIT_REACHED')) {
      return errorResponse(
        'You reached your plan upload limit for this 30-day period.',
        429,
        'PLAN_UPLOAD_LIMIT_REACHED'
      )
    }

    console.error('[creator-upload-url] quota reservation error:', quotaErr)
    return errorResponse('Failed to check upload quota', 500, 'UPLOAD_QUOTA_CHECK_FAILED')
  }
  const quotaEventId = quota.event_id

  const releaseQuotaReservation = async () => {
    try {
      await admin
        .from('creator_upload_quota_events')
        .delete()
        .eq('id', quotaEventId)
        .is('creator_video_id', null)
        .is('cloudflare_uid', null)
    } catch (err) {
      console.warn('[creator-upload-url] failed to release quota reservation:', err)
    }
  }

  // 5. Request a direct upload URL from Cloudflare
  let upload
  try {
    upload = await createDirectUpload({
      maxDurationSeconds: maxDuration,
      creator: user.id,
      meta: {
        title: cleanTitle,
        kidtok_user_id: user.id,
      },
    })
  } catch (err) {
    await releaseQuotaReservation()

    const errMsg = (err as Error).message || 'unknown error'
    console.error('[creator-upload-url] Cloudflare error:', errMsg)

    // Detect missing-secrets specifically
    if (errMsg.includes('Missing Cloudflare env vars')) {
      return errorResponse(
        'Cloudflare Stream is not configured. Add CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN, and CLOUDFLARE_STREAM_CUSTOMER_CODE to Supabase Edge Function Secrets.',
        502,
        'CLOUDFLARE_NOT_CONFIGURED'
      )
    }

    return errorResponse(
      `Cloudflare error: ${errMsg}`,
      502,
      'CLOUDFLARE_ERROR'
    )
  }

  await admin
    .from('creator_upload_quota_events')
    .update({ cloudflare_uid: upload.uid })
    .eq('id', quotaEventId)

  // 6. Persist the creator_videos row in 'uploading' state
  // We use service role to bypass the role-check policy (we already verified above).
  const { data: row, error: insertErr } = await admin
    .from('creator_videos')
    .insert({
      creator_id: user.id,
        title: cleanTitle,
      description: body.description?.trim() || null,
      start_time_seconds: startTimeSeconds,
      clip_pending: startTimeSeconds > 0,
      age_id: body.age_id ?? null,
      interest_id: body.interest_id ?? null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      cloudflare_uid: upload.uid,
      status: 'uploading',
    })
    .select('id, cloudflare_uid')
    .single()

  if (insertErr || !row) {
    console.error('DB insert error:', insertErr)
    return errorResponse('Failed to record upload', 500, 'DB_INSERT_FAILED')
  }

  await admin
    .from('creator_upload_quota_events')
    .update({ creator_video_id: row.id, cloudflare_uid: upload.uid })
    .eq('id', quotaEventId)

  return jsonResponse({
    upload_url: upload.uploadURL,
    creator_video_id: row.id,
    cloudflare_uid: row.cloudflare_uid,
    upload_quota: {
      plan_code: quota.plan_code,
      limit: quota.upload_limit,
      used: quota.used_uploads,
      remaining: quota.remaining_uploads,
      cycle_start: quota.cycle_start,
      cycle_end: quota.cycle_end,
    },
  })
})
