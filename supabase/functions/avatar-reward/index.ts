// Grants one single-use avatar credit after the native AdMob callback reports
// EARNED_REWARD. Existing coin/ad flows are not changed.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

const REWARD_AVATARS = new Set(['cartoon-boy', 'cartoon-girl', 'lion'])

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

  if (!REWARD_AVATARS.has(avatarId)) {
    return errorResponse('Invalid rewarded avatar', 400, 'INVALID_REWARD_AVATAR')
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
    console.error('[avatar-reward] grant failed:', error)
    return errorResponse('Failed to grant avatar credit', 500, 'REWARD_GRANT_FAILED')
  }

  return jsonResponse({ avatar_id: avatarId, remaining_uses: Number(data || 0) })
})
