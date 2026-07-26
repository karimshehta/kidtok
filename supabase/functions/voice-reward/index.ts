// Grants one single-use voice credit after AdMob reports EARNED_REWARD.
// Voice availability and price are controlled by kid_voice_catalog.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let voiceId = ''
  try {
    const body = await req.json()
    voiceId = String(body?.voice_id || '')
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }
  if (!voiceId) return errorResponse('voice_id is required', 400, 'MISSING_VOICE')

  const admin = getServiceClient()
  const { data, error } = await admin.rpc('grant_voice_reward', {
    p_user_id: user.id,
    p_voice_id: voiceId,
  })

  if (error) {
    const message = error.message || 'Failed to grant voice credit'
    if (message.includes('REWARD_ALREADY_GRANTED')) return errorResponse('Reward already granted', 409, 'REWARD_ALREADY_GRANTED')
    if (message.includes('VOICE_ALREADY_OWNED')) return errorResponse('Voice is already owned', 409, 'VOICE_ALREADY_OWNED')
    if (message.includes('VOICE_ALREADY_FREE')) return errorResponse('Voice is already free', 409, 'VOICE_ALREADY_FREE')
    if (message.includes('VOICE_NOT_FOUND')) return errorResponse('Voice is unavailable', 404, 'VOICE_NOT_FOUND')
    console.error('[voice-reward] grant failed:', error)
    return errorResponse('Failed to grant voice credit', 500, 'VOICE_REWARD_GRANT_FAILED')
  }

  return jsonResponse({ voice_id: voiceId, remaining_uses: Number(data || 0) })
})
