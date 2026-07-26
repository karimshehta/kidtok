// Commits a previously reserved voice only after the corresponding upload has
// succeeded.  event_id is optional to securely clear the default avatar voice
// when the child deliberately chose "No voice".

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let body: { creator_video_id?: string; event_id?: string | null }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }

  const creatorVideoId = String(body.creator_video_id || '')
  if (!creatorVideoId) return errorResponse('creator_video_id is required', 400, 'MISSING_CREATOR_VIDEO')
  const eventId = body.event_id ? String(body.event_id) : null

  const admin = getServiceClient()
  const { data, error } = await admin.rpc('finalize_voice_use', {
    p_user_id: user.id,
    p_creator_video_id: creatorVideoId,
    p_event_id: eventId,
  })

  if (error) {
    const message = error.message || 'Failed to finalize voice'
    if (message.includes('CREATOR_VIDEO_NOT_FOUND')) return errorResponse('Video is unavailable', 404, 'CREATOR_VIDEO_NOT_FOUND')
    if (message.includes('VOICE_USE_NOT_FOUND')) return errorResponse('Voice reservation was not found', 404, 'VOICE_USE_NOT_FOUND')
    if (message.includes('VOICE_USE_REFUNDED')) return errorResponse('Voice reservation was released', 409, 'VOICE_USE_REFUNDED')
    if (message.includes('VOICE_USE_ALREADY_CONSUMED')) return errorResponse('Voice reservation is already used', 409, 'VOICE_USE_ALREADY_CONSUMED')
    console.error('[voice-use-finalize] finalization failed:', error)
    return errorResponse('Failed to finalize voice', 500, 'VOICE_FINALIZE_FAILED')
  }

  return jsonResponse({ voice_id: data || null })
})
