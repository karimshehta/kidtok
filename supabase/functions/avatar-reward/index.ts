// Grants one single-use avatar credit after the native AdMob callback reports
// EARNED_REWARD. Catalog availability/free status is controlled by admins.

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

  let avatarId = ''
  try {
    const body = await req.json()
    avatarId = String(body?.avatar_id || '')
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }

  if (!avatarId) {
    return errorResponse('avatar_id is required', 400, 'MISSING_AVATAR')
  }

  const admin = getServiceClient()
  const { data, error } = await admin.rpc('grant_avatar_reward', {
    p_user_id: user.id,
    p_avatar_id: avatarId,
  })

  if (error) {
    const message = error.message || 'Failed to grant avatar credit'
    if (message.includes('REWARD_ALREADY_GRANTED')) {
      return errorResponse('Reward already granted', 409, 'REWARD_ALREADY_GRANTED')
    }
    if (message.includes('AVATAR_ALREADY_OWNED')) {
      return errorResponse('Avatar is already owned', 409, 'AVATAR_ALREADY_OWNED')
    }
    if (message.includes('AVATAR_ALREADY_FREE')) {
      return errorResponse('Avatar is already free', 409, 'AVATAR_ALREADY_FREE')
    }
    if (message.includes('AVATAR_NOT_FOUND')) {
      return errorResponse('Avatar is unavailable', 404, 'AVATAR_NOT_FOUND')
    }
    console.error('[avatar-reward] grant failed:', error)
    return errorResponse('Failed to grant avatar credit', 500, 'REWARD_GRANT_FAILED')
  }

  return jsonResponse({ avatar_id: avatarId, remaining_uses: Number(data || 0) })
})
