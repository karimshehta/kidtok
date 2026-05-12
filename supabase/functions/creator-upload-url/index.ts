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

  // 2. Verify creator role via profiles table
  const admin = getServiceClient()
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) {
    return errorResponse('Profile not found', 404, 'PROFILE_NOT_FOUND')
  }
  if (!['creator', 'admin'].includes(profile.role)) {
    return errorResponse(
      'Only creator or admin accounts can upload videos',
      403,
      'NOT_A_CREATOR'
    )
  }

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

  // Cap at 30 minutes on the platform side; tune later based on subscription tier
  const maxDuration = Math.min(Math.max(body.max_duration_seconds ?? 600, 30), 1800)

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
    console.error('Cloudflare error:', err)
    return errorResponse(
      'Failed to prepare upload with Cloudflare. Try again in a moment.',
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
