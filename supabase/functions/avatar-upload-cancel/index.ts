// Cancels an unfinished avatar upload and returns a one-use ad credit.
// Permanent coin purchases remain owned by the account.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let creatorVideoId = ''
  try {
    const body = await req.json()
    creatorVideoId = String(body?.creator_video_id || '')
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }
  if (!creatorVideoId) return errorResponse('creator_video_id is required', 400, 'MISSING_VIDEO_ID')

  const admin = getServiceClient()
  const { data: video } = await admin
    .from('creator_videos')
    .select('id, status, kid_avatar_id')
    .eq('id', creatorVideoId)
    .eq('creator_id', user.id)
    .not('kid_avatar_id', 'is', null)
    .maybeSingle()

  if (!video) return errorResponse('Video not found', 404, 'VIDEO_NOT_FOUND')
  if (!['uploading', 'processing', 'pending_review'].includes(video.status)) {
    return errorResponse('Published videos cannot be refunded', 409, 'VIDEO_ALREADY_PUBLISHED')
  }

  const { data: useEvent } = await admin
    .from('avatar_use_events')
    .select('id')
    .eq('creator_video_id', creatorVideoId)
    .maybeSingle()

  if (useEvent?.id) {
    const { error: refundError } = await admin.rpc('release_avatar_use', {
      p_user_id: user.id,
      p_event_id: useEvent.id,
    })
    if (refundError) {
      console.error('[avatar-upload-cancel] refund failed:', refundError)
      return errorResponse('Failed to refund avatar use', 500, 'REFUND_FAILED')
    }
  }

  const { error: quotaError } = await admin
    .from('creator_upload_quota_events')
    .delete()
    .eq('creator_video_id', creatorVideoId)
    .eq('user_id', user.id)

  if (quotaError) {
    console.error('[avatar-upload-cancel] quota release failed:', quotaError)
    return errorResponse('Failed to release upload quota', 500, 'QUOTA_RELEASE_FAILED')
  }

  // Remove the inactive mirror first. The current production FK uses SET NULL
  // and the videos source-consistency check does not allow an orphan mirror.
  const { error: mirrorError } = await admin
    .from('videos')
    .delete()
    .eq('creator_video_id', creatorVideoId)

  if (mirrorError) {
    console.error('[avatar-upload-cancel] mirror delete failed:', mirrorError)
    return errorResponse('Failed to cancel upload', 500, 'MIRROR_DELETE_FAILED')
  }

  const { error: deleteError } = await admin
    .from('creator_videos')
    .delete()
    .eq('id', creatorVideoId)

  if (deleteError) {
    console.error('[avatar-upload-cancel] creator video delete failed:', deleteError)
    return errorResponse('Failed to cancel upload', 500, 'DELETE_FAILED')
  }

  return jsonResponse({ cancelled: true, refunded: !!useEvent?.id })
})
