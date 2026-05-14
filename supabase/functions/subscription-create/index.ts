// POST /functions/v1/subscription-create
//
// Auth: requires logged-in user.
// Body: { plan_id: number, payment_method?: 'card'|'wallet'|'apple_pay', wallet_phone?: string }
// Returns: { subscription_id, payment_url? (card/apple), wallet_response? }
//
// What this does:
//   1. Loads the plan from DB (admin-managed price).
//   2. Creates a 'pending' subscription row.
//   3. Calls Paymob: auth → create order → get payment_key.
//   4. Returns the iframe URL (card) / Apple Pay URL / wallet response.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'
import {
  getPaymobConfig,
  paymobAuthenticate,
  paymobCreateOrder,
  paymobGetPaymentKey,
  buildCardIframeUrl,
  buildApplePayUrl,
  paymobWalletPay,
  type BillingData,
} from '../_shared/paymob.ts'

interface CreateRequest {
  plan_id: number
  payment_method?: 'card' | 'wallet' | 'apple_pay'
  wallet_phone?: string
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  // 1. Authenticate
  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  // 2. Validate body
  let body: CreateRequest
  try {
    body = (await req.json()) as CreateRequest
  } catch {
    return errorResponse('Invalid JSON', 400, 'BAD_JSON')
  }
  if (!body.plan_id || typeof body.plan_id !== 'number') {
    return errorResponse('plan_id is required', 400, 'PLAN_ID_REQUIRED')
  }
  const method = body.payment_method || 'card'
  if (method === 'wallet' && !body.wallet_phone) {
    return errorResponse('wallet_phone required for wallet payment', 400, 'WALLET_PHONE_REQUIRED')
  }

  const admin = getServiceClient()

  // 3. Load plan + profile
  const [{ data: plan, error: planErr }, { data: profile }] = await Promise.all([
    admin.from('subscription_plans').select('*').eq('id', body.plan_id).single(),
    admin.from('profiles').select('*').eq('id', user.id).single(),
  ])
  if (planErr || !plan) return errorResponse('Plan not found', 404, 'PLAN_NOT_FOUND')
  if (plan.plan_type === 'free') {
    return errorResponse('Free plan does not require payment', 400, 'FREE_PLAN')
  }
  if (!plan.is_active) {
    return errorResponse('Plan not available', 400, 'PLAN_INACTIVE')
  }
  if (Number(plan.price) <= 0) {
    return errorResponse('Plan has no price set', 400, 'PLAN_NO_PRICE')
  }

  // 4. Build billing data
  const userMetaName: string = profile?.name || 'KidTok'
  const [first, ...rest] = userMetaName.split(' ')
  const last = rest.join(' ') || first
  const billing: BillingData = {
    first_name: first || 'KidTok',
    last_name: last || 'User',
    email: (await admin.auth.admin.getUserById(user.id)).data.user?.email || 'noreply@kidtok.app',
    phone_number: body.wallet_phone || profile?.phone || '+201000000000',
  }

  // 5. Pick integration id for this method
  const cfg = getPaymobConfig()
  const integrationId = cfg.integrationIds[method]
  if (!integrationId) {
    return errorResponse(
      `Payment method '${method}' is not configured`,
      400,
      'METHOD_NOT_CONFIGURED'
    )
  }

  // 6. Create pending subscription row first so we have a UUID to use
  // as a Paymob merchant_order_id (must be unique per Paymob attempt).
  const amountCents = Math.round(Number(plan.price) * 100)
  const currency = plan.currency || 'EGP'
  const startedAt = new Date()
  const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000)

  const { data: sub, error: subErr } = await admin
    .from('subscriptions')
    .insert({
      user_id: user.id,
      plan_id: plan.id,
      status: 'pending',
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      payment_provider: 'paymob',
      paid_amount: plan.price,
      paid_currency: currency,
      provider_data: { method, attempted_at: new Date().toISOString() },
    })
    .select('id')
    .single()

  if (subErr || !sub) {
    console.error('subscription insert error', subErr)
    return errorResponse('Failed to record subscription', 500, 'DB_INSERT_FAILED')
  }

  // Paymob requires unique merchant_order_id per attempt. Append timestamp + rand.
  const merchantOrderId = `${plan.id}_${Date.now()}_${Math.floor(Math.random() * 9000) + 1000}_${sub.id.slice(0, 8)}`

  // 7. Call Paymob
  try {
    const authToken = await paymobAuthenticate(cfg)
    const order = await paymobCreateOrder(
      cfg,
      authToken,
      amountCents,
      merchantOrderId,
      currency
    )
    const paymentKey = await paymobGetPaymentKey(
      cfg,
      authToken,
      order.id,
      amountCents,
      billing,
      integrationId,
      currency
    )

    // Persist Paymob references on the subscription
    await admin
      .from('subscriptions')
      .update({
        provider_subscription_id: merchantOrderId,
        provider_data: {
          method,
          attempted_at: new Date().toISOString(),
          paymob_order_id: order.id,
          payment_key: paymentKey,
          merchant_order_id: merchantOrderId,
        },
      })
      .eq('id', sub.id)

    // Build the response based on method
    if (method === 'card') {
      return jsonResponse({
        subscription_id: sub.id,
        method: 'card',
        payment_url: buildCardIframeUrl(cfg, paymentKey),
      })
    }
    if (method === 'apple_pay') {
      return jsonResponse({
        subscription_id: sub.id,
        method: 'apple_pay',
        payment_url: buildApplePayUrl(cfg, paymentKey),
      })
    }
    // wallet
    const walletResponse = await paymobWalletPay(cfg, paymentKey, body.wallet_phone!)

    // Log the full wallet response for debugging
    console.log('[wallet-pay] raw Paymob response:', JSON.stringify(walletResponse))

    // Check for error from Paymob
    if (walletResponse?.detail) {
      throw new Error(`Paymob wallet error: ${walletResponse.detail}`)
    }
    if (walletResponse?.message === 'Receiver is not registered') {
      return errorResponse(
        'رقم المحفظة غير مسجل في خدمة الدفع. تأكد من صحة الرقم.',
        400, 'WALLET_NOT_REGISTERED'
      )
    }

    return jsonResponse({
      subscription_id: sub.id,
      method: 'wallet',
      redirect_url: walletResponse?.redirect_url || walletResponse?.redirection_url || null,
      wallet_response: walletResponse,
    })
  } catch (err) {
    console.error('Paymob error:', err)
    // Mark the pending subscription as cancelled so we don't leak rows
    await admin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('id', sub.id)
    return errorResponse(
      `Paymob error: ${(err as Error).message}`,
      502,
      'PAYMOB_ERROR'
    )
  }
})
