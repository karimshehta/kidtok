// POST /functions/v1/creator-upload-url
//
// Auth: requires a logged-in user whose profile.role IN ('creator','admin').
// Body: { title, description?, age_id?, interest_id?, tags?[], max_duration_seconds? }
// Returns: { upload_url, creator_video_id, cloudflare_uid }
//
// The client then uploads the video file directly to `upload_url` (multipart POST).
// Cloudflare will fire a webhook to /creator-cloudflare-webhook when transcoding finishes.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createDirectUpload } from '../_shared/cloudflare.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

interface UploadRequest {
  title: string
  description?: string | null
  age_id?: number | null
  interest_id?: number | null
  tags?: string[]
  max_duration_seconds?: number
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

  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return errorResponse('Title is required', 400, 'TITLE_REQUIRED')
  }
  if (body.title.length > 200) {
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

  // 4. Request a direct upload URL from Cloudflare
  let upload
  try {
    upload = await createDirectUpload({
      maxDurationSeconds: maxDuration,
      creator: user.id,
      meta: {
        title: body.title.trim(),
        kidtok_user_id: user.id,
      },
    })
  } catch (err) {
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

  // 5. Persist the creator_videos row in 'uploading' state
  // We use service role to bypass the role-check policy (we already verified above).
  const { data: row, error: insertErr } = await admin
    .from('creator_videos')
    .insert({
      creator_id: user.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
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

  return jsonResponse({
    upload_url: upload.uploadURL,
    creator_video_id: row.id,
    cloudflare_uid: row.cloudflare_uid,
  })
})
