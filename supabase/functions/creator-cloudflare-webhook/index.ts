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

  // Review system removed — all ready videos are approved immediately.
  // Creators see their content the moment Cloudflare finishes processing.
  let nextStatus: string
  let rejection_reason: string | null = null

  if (state === 'ready' || video.readyToStream === true) {
    nextStatus = 'approved'
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

  // ── SERVER-SIDE CLIP ──────────────────────────────────────────────────────
  // If the user picked a start time in the trimmer, create a clipped version
  // that starts from start_time_seconds. We only do this once the original is ready.
  if (state === 'ready' || video.readyToStream === true) {
    const { data: cvRow } = await admin
      .from('creator_videos')
      .select('id, clip_pending, start_time_seconds, duration_seconds, title, creator_id, original_cloudflare_uid')
      .eq('cloudflare_uid', video.uid)
      .maybeSingle()

    if (cvRow?.clip_pending && cvRow.start_time_seconds > 0 && !cvRow.original_cloudflare_uid) {
      try {
        const start = Number(cvRow.start_time_seconds)
        const dur   = Number(cvRow.duration_seconds || 30)
        const end   = start + Math.min(dur, 30)
        console.log(`Clipping uid=${video.uid} ${start}s..${end}s`)

        const clip = await createClip({
          sourceUid: video.uid,
          startTimeSeconds: start,
          endTimeSeconds: end,
          meta: { title: cvRow.title, kidtok_user_id: cvRow.creator_id },
        })

        // Point the row at the new clipped video. Webhook will fire again
        // for the clip's UID and update playback URLs.
        await admin
          .from('creator_videos')
          .update({
            original_cloudflare_uid: video.uid,   // keep reference to original
            cloudflare_uid: clip.uid,             // switch playback to clip
            clip_pending: false,
            ready_to_stream: clip.readyToStream,
            hls_url: buildHlsUrl(clip.uid),
            thumbnail_url: buildThumbnailUrl(clip.uid),
            status: 'processing',                  // wait for clip's webhook
          })
          .eq('id', cvRow.id)

        // Delete original to save storage costs
        try { await deleteVideo(video.uid) } catch (e) { console.warn('Delete original failed:', e) }
        console.log(`Clip created: ${clip.uid}, original deleted`)
      } catch (err) {
        console.error('Clip API error:', err)
        // Don't fail the webhook — original video is still playable
        await admin.from('creator_videos').update({ clip_pending: false }).eq('id', cvRow.id)
      }
    }
  }

  // Hive moderation hook — if HIVE_API_KEY is set we'd kick off a moderation
  // job here. Skipped for now to keep the function simple; will live in a
  // separate 'creator-hive-moderate' Edge Function we'll add later.

  return jsonResponse({
    ok: true,
    creator_video_id: existing.id,
    new_status: nextStatus,
  })
})
