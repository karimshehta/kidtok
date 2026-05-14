// POST /functions/v1/subscription-redeem-coins
//
// Auth: requires logged-in user.
// Body: { plan_id: number }
// Returns: { subscription_id, coins_spent, new_balance, expires_at }

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

interface RedeemRequest {
  plan_id: number
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let body: RedeemRequest
  try {
    body = (await req.json()) as RedeemRequest
  } catch {
    return errorResponse('Invalid JSON', 400, 'BAD_JSON')
  }

  if (!body.plan_id || typeof body.plan_id !== 'number') {
    return errorResponse('plan_id is required', 400, 'PLAN_ID_REQUIRED')
  }

  const admin = getServiceClient()
  const { data, error } = await admin.rpc('redeem_subscription_with_coins', {
    p_user_id: user.id,
    p_plan_id: body.plan_id,
  })

  if (error) {
    console.error('redeem_subscription_with_coins error:', error)
    const message = error.message || 'Failed to redeem coins'
    const code =
      message.includes('INSUFFICIENT_COINS') ? 'INSUFFICIENT_COINS' :
      message.includes('PARTIAL_COIN_DISCOUNT_UNSUPPORTED') ? 'PARTIAL_COIN_DISCOUNT_UNSUPPORTED' :
      message.includes('PLAN_NOT_FOUND') ? 'PLAN_NOT_FOUND' :
      message.includes('FREE_PLAN') ? 'FREE_PLAN' :
      'REDEEM_FAILED'
    const status = code === 'INSUFFICIENT_COINS' ? 400 : code === 'PLAN_NOT_FOUND' ? 404 : 400
    return errorResponse(message, status, code)
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return errorResponse('Failed to redeem coins', 500, 'REDEEM_FAILED')

  return jsonResponse({ ok: true, ...row })
})
