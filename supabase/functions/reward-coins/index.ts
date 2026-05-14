/**
 * POST /functions/v1/reward-coins
 *
 * Called after user watches a rewarded ad.
 * - Verifies cooldown (no spamming)
 * - Credits coins to user's balance
 * - Returns new balance
 *
 * JWT required.
 */
import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  const admin = getServiceClient()

  // ── 1. Read config ──
  const { data: settings } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', ['coins_per_ad', 'ad_reward_cooldown_min'])

  const cfg: Record<string, string> = {}
  for (const r of settings || []) cfg[r.key] = r.value ?? ''

  const coinsPerAd     = Math.max(1, parseInt(cfg['coins_per_ad'] || '5', 10))
  const cooldownMin    = Math.max(1, parseInt(cfg['ad_reward_cooldown_min'] || '30', 10))
  const cooldownMs     = cooldownMin * 60 * 1000

  // ── 2. Cooldown check ──
  const { data: lastTx } = await admin
    .from('coin_transactions')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('type', 'ad_reward')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastTx) {
    const elapsed = Date.now() - new Date(lastTx.created_at).getTime()
    if (elapsed < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - elapsed) / 1000)
      return errorResponse(
        `Cooldown active. Try again in ${Math.ceil(waitSec / 60)} minutes.`,
        429,
        'COOLDOWN_ACTIVE',
        { wait_seconds: waitSec }
      )
    }
  }

  // ── 3. Credit coins via RPC (atomic increment) ──
  const { data: newBalance, error: rpcErr } = await admin
    .rpc('increment_user_coins', { p_user_id: user.id, p_amount: coinsPerAd })

  if (rpcErr) {
    console.error('increment_user_coins error:', rpcErr)
    return errorResponse('Failed to credit coins', 500, 'DB_ERROR')
  }

  // ── 4. Record transaction ──
  await admin.from('coin_transactions').insert({
    user_id: user.id,
    amount:  coinsPerAd,
    type:    'ad_reward',
    notes:   `Rewarded ad — earned ${coinsPerAd} coins`,
  })

  return jsonResponse({
    ok: true,
    coins_earned: coinsPerAd,
    new_balance:  newBalance ?? coinsPerAd,
  })
})
