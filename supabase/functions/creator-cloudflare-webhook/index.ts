// POST /functions/v1/creator-cloudflare-webhook
//
// Receives notifications from Cloudflare Stream when a video finishes processing
// (or fails). No JWT verification — we use HMAC signature instead.
//
// Cloudflare sends the full video object as JSON, with header:
//   Webhook-Signature: time=<unix>,sig1=<hex hmac-sha256>
//
// We update the matching creator_videos row with playback URLs, thumbnail,
// duration, and status. By default the video lands in 'pending_review' so an
// admin (or Hive moderation in a follow-up) can approve it. Set the env var
// CREATOR_AUTO_APPROVE=true to auto-approve (testing only, no moderation!).

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import {
  verifyWebhookSignature,
  buildHlsUrl,
  buildThumbnailUrl,
  type CloudflareStreamVideo,
} from '../_shared/cloudflare.ts'
import { getServiceClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  // Read the raw body for signature verification
  const rawBody = await req.text()
  const signature = req.headers.get('Webhook-Signature')

  const validSig = await verifyWebhookSignature(rawBody, signature)
  if (!validSig) {
    console.warn('Invalid webhook signature; ignoring')
    return errorResponse('Invalid signature', 401, 'INVALID_SIGNATURE')
  }

  // Parse the payload
  let video: CloudflareStreamVideo
  try {
    video = JSON.parse(rawBody) as CloudflareStreamVideo
  } catch {
    return errorResponse('Invalid JSON', 400, 'BAD_JSON')
  }

  if (!video.uid) {
    return errorResponse('Missing video uid', 400, 'MISSING_UID')
  }

  const admin = getServiceClient()

  // Find the matching creator_videos row
  const { data: existing, error: findErr } = await admin
    .from('creator_videos')
    .select('id, status, creator_id')
    .eq('cloudflare_uid', video.uid)
    .maybeSingle()

  if (findErr) {
    console.error('DB lookup error:', findErr)
    return errorResponse('Database error', 500, 'DB_LOOKUP_FAILED')
  }
  if (!existing) {
    // Could be a video uploaded outside our app, or our row was deleted.
    console.warn(`No creator_videos row for cloudflare_uid=${video.uid}; ignoring`)
    return jsonResponse({ ignored: true }, 200)
  }

  const state = video.status?.state
  const autoApprove = (Deno.env.get('CREATOR_AUTO_APPROVE') || '').toLowerCase() === 'true'

  // Decide the new status based on Cloudflare's reported state
  let nextStatus: string
  let rejection_reason: string | null = null

  if (state === 'ready' || video.readyToStream === true) {
    nextStatus = autoApprove ? 'approved' : 'pending_review'
  } else if (state === 'error') {
    nextStatus = 'rejected'
    rejection_reason =
      video.status?.errorReasonText ||
      video.status?.errorReasonCode ||
      'Cloudflare reported a processing error'
  } else if (state === 'inprogress' || state === 'queued' || state === 'pendingupload') {
    nextStatus = 'processing'
  } else {
    // Unknown state — log and don't change status
    console.warn(`Unknown Cloudflare state="${state}" for uid=${video.uid}`)
    return jsonResponse({ ignored: true, state }, 200)
  }

  // Build playback URLs even when Cloudflare doesn't include them yet
  const hls_url = video.playback?.hls || buildHlsUrl(video.uid)
  const thumbnail_url = video.thumbnail || buildThumbnailUrl(video.uid)

  const update: Record<string, unknown> = {
    status: nextStatus,
    ready_to_stream: video.readyToStream === true,
    hls_url,
    dash_url: video.playback?.dash ?? null,
    thumbnail_url,
    preview_url: video.preview ?? null,
    duration_seconds: video.duration ? Math.round(video.duration) : null,
    size_bytes: video.size ?? null,
  }
  if (rejection_reason) update.rejection_reason = rejection_reason

  const { error: updateErr } = await admin
    .from('creator_videos')
    .update(update)
    .eq('cloudflare_uid', video.uid)

  if (updateErr) {
    console.error('DB update error:', updateErr)
    return errorResponse('Failed to update creator_videos', 500, 'DB_UPDATE_FAILED')
  }

  console.log(
    `Updated creator_video (uid=${video.uid}) state=${state} -> status=${nextStatus}`
  )

  // Hive moderation hook — if HIVE_API_KEY is set we'd kick off a moderation
  // job here. Skipped for now to keep the function simple; will live in a
  // separate 'creator-hive-moderate' Edge Function we'll add later.

  return jsonResponse({
    ok: true,
    creator_video_id: existing.id,
    new_status: nextStatus,
  })
})
