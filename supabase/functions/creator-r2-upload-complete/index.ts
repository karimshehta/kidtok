// POST /functions/v1/creator-r2-upload-complete
//
// Marks a direct-to-R2 creator upload as published after the mobile app
// successfully PUTs the prepared MP4 to the presigned URL.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'
import { headR2Object } from '../_shared/r2.ts'

interface CompleteRequest {
  creator_video_id?: string
  duration_seconds?: number
  size_bytes?: number
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let body: CompleteRequest
  try {
    body = (await req.json()) as CompleteRequest
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }

  const creatorVideoId = String(body.creator_video_id || '')
  if (!creatorVideoId) {
    return errorResponse('creator_video_id is required', 400, 'MISSING_VIDEO_ID')
  }

  const admin = getServiceClient()
  const { data: video, error: findErr } = await admin
    .from('creator_videos')
    .select('id, creator_id, status, storage_provider, r2_bucket, r2_key, r2_public_url, hls_url')
    .eq('id', creatorVideoId)
    .maybeSingle()

  if (findErr) {
    console.error('[creator-r2-upload-complete] lookup failed:', findErr)
    return errorResponse('Failed to find upload', 500, 'LOOKUP_FAILED')
  }
  if (!video) return errorResponse('Video not found', 404, 'VIDEO_NOT_FOUND')
  if (video.creator_id !== user.id) return errorResponse('Forbidden', 403, 'FORBIDDEN')
  if (video.storage_provider !== 'r2') {
    return errorResponse('Upload is not an R2 upload', 409, 'NOT_R2_UPLOAD')
  }
  if (!video.r2_public_url) {
    return errorResponse('R2 public URL missing', 409, 'R2_PUBLIC_URL_MISSING')
  }
  if (!video.r2_key) {
    return errorResponse('R2 key missing', 409, 'R2_KEY_MISSING')
  }

  if (video.status === 'approved') {
    return jsonResponse({
      ok: true,
      creator_video_id: video.id,
      public_url: video.r2_public_url,
      already_completed: true,
    })
  }

  let objectHead: { exists: boolean; sizeBytes?: number }
  try {
    objectHead = await headR2Object(video.r2_key, video.r2_bucket || undefined)
  } catch (err) {
    console.error('[creator-r2-upload-complete] R2 head failed:', err)
    return errorResponse('Failed to verify R2 upload', 502, 'R2_VERIFY_FAILED')
  }
  if (!objectHead.exists) {
    return errorResponse('R2 object was not uploaded yet', 409, 'R2_OBJECT_NOT_FOUND')
  }

  const patch: Record<string, unknown> = {
    status: 'approved',
    is_active: true,
    ready_to_stream: true,
    hls_url: video.hls_url || video.r2_public_url,
    updated_at: new Date().toISOString(),
  }

  if (typeof body.duration_seconds === 'number' && isFinite(body.duration_seconds)) {
    patch.duration_seconds = Math.max(1, Math.min(30, Math.round(body.duration_seconds)))
  }
  const verifiedSize = objectHead.sizeBytes || body.size_bytes
  if (typeof verifiedSize === 'number' && isFinite(verifiedSize) && verifiedSize > 0) {
    patch.size_bytes = Math.round(verifiedSize)
  }

  const { error: updateErr } = await admin
    .from('creator_videos')
    .update(patch)
    .eq('id', video.id)
    .eq('creator_id', user.id)
    .eq('storage_provider', 'r2')

  if (updateErr) {
    console.error('[creator-r2-upload-complete] update failed:', updateErr)
    return errorResponse('Failed to publish upload', 500, 'UPDATE_FAILED')
  }

  return jsonResponse({
    ok: true,
    creator_video_id: video.id,
    public_url: video.r2_public_url,
  })
})
