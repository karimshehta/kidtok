// Reserve a voice right before upload.  The later finalize endpoint attaches
// the server-validated voice id to the successful creator video.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

type AccessMethod = 'free' | 'reward' | 'coins'

interface Reservation {
  use_event_id: string
  access_kind: AccessMethod
  cost: number
  new_balance: number
  purchased: boolean
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let body: { voice_id?: string; access_method?: AccessMethod }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }

  const voiceId = String(body.voice_id || '')
  if (!voiceId) return errorResponse('voice_id is required', 400, 'MISSING_VOICE')
  if (body.access_method && !['free', 'reward', 'coins'].includes(body.access_method)) {
    return errorResponse('Invalid voice access method', 400, 'INVALID_VOICE_ACCESS_METHOD')
  }

  const admin = getServiceClient()
  const { data: rows, error } = await admin.rpc('reserve_voice_use', {
    p_user_id: user.id,
    p_voice_id: voiceId,
    p_access_method: body.access_method || null,
  })
  const reservation = (Array.isArray(rows) ? rows[0] : rows) as Reservation | undefined

  if (error || !reservation?.use_event_id) {
    const message = error?.message || ''
    if (message.includes('INSUFFICIENT_COINS')) return errorResponse(message, 402, 'INSUFFICIENT_COINS')
    if (message.includes('REWARDED_AD_REQUIRED')) return errorResponse('Watch a rewarded ad to unlock one use', 403, 'REWARDED_AD_REQUIRED')
    if (message.includes('VOICE_REWARD_ONLY')) return errorResponse('This voice is available through a rewarded ad only', 403, 'VOICE_REWARD_ONLY')
    if (message.includes('VOICE_PRICE_NOT_CONFIGURED')) return errorResponse('Voice price is not configured', 409, 'VOICE_PRICE_NOT_CONFIGURED')
    if (message.includes('VOICE_NOT_FOUND')) return errorResponse('Voice is unavailable', 404, 'VOICE_NOT_FOUND')
    if (message.includes('INVALID_VOICE_ACCESS_METHOD')) return errorResponse('Invalid voice access method', 400, 'INVALID_VOICE_ACCESS_METHOD')
    console.error('[voice-use-reserve] reservation failed:', error)
    return errorResponse('Failed to reserve voice', 500, 'VOICE_RESERVATION_FAILED')
  }

  return jsonResponse({
    use_event_id: reservation.use_event_id,
    access_type: reservation.access_kind,
    coin_cost: reservation.cost,
    new_balance: reservation.new_balance,
    purchased: reservation.purchased,
  })
})
