// Releases an unconsumed reservation.  Rewarded-ad credits are returned once;
// permanent coin purchases remain owned exactly like purchased avatars.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let eventId = ''
  try {
    const body = await req.json()
    eventId = String(body?.event_id || '')
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }
  if (!eventId) return errorResponse('event_id is required', 400, 'MISSING_VOICE_EVENT')

  const admin = getServiceClient()
  const { error } = await admin.rpc('release_voice_use', {
    p_user_id: user.id,
    p_event_id: eventId,
  })
  if (error) {
    console.error('[voice-use-release] release failed:', error)
    return errorResponse('Failed to release voice reservation', 500, 'VOICE_RELEASE_FAILED')
  }

  return jsonResponse({ released: true })
})
