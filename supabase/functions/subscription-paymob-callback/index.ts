// /functions/v1/subscription-paymob-callback
//
// This is BOTH the server-to-server webhook AND the user redirect URL.
// Paymob delivers data either as JSON (POST webhook) or query params (GET redirect).
// Either way:
//   1. Extract the data (flatten 'obj' if nested)
//   2. Verify HMAC-SHA512
//   3. If success=true: mark the subscription 'active' and downgrade other actives
//   4. If failure: mark pending subscription 'cancelled'
//
// For GET (user redirect), we 302 redirect them to /subscription/success or
// /subscription/failed with a status message.
//
// No JWT required - HMAC is our auth.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import {
  getPaymobConfig,
  verifyPaymobHmac,
  flattenPaymobData,
} from '../_shared/paymob.ts'

function getAppUrl(): string {
  return Deno.env.get('APP_URL') || 'https://kidtok.vercel.app'
}

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${getAppUrl()}${path}` },
  })
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const url = new URL(req.url)
  let data: Record<string, any> = {}
  let receivedHmac: string | null = null
  const isGet = req.method === 'GET'

  // ===== Extract data depending on transport =====
  if (isGet) {
    // User redirect from Paymob: ?success=true&hmac=...&id=...&amount_cents=...
    url.searchParams.forEach((v, k) => (data[k] = v))
    receivedHmac = data.hmac as string
  } else if (req.method === 'POST') {
    // Server-to-server webhook
    try {
      const json = await req.json()
      data = flattenPaymobData(json)
      // The HMAC may arrive in the URL OR inside the body's `hmac` field
      receivedHmac = (url.searchParams.get('hmac') as string) || (data.hmac as string) || null
    } catch {
      return jsonResponse({ error: 'bad json' }, 400)
    }
  } else {
    return jsonResponse({ error: 'method not allowed' }, 405)
  }

  if (!receivedHmac) {
    console.warn('Paymob callback: no HMAC')
    return isGet ? redirectTo('/subscription/failed?reason=no_signature') : jsonResponse({ error: 'no signature' }, 401)
  }

  // ===== Verify HMAC =====
  let valid = false
  try {
    const cfg = getPaymobConfig()
    valid = await verifyPaymobHmac(cfg, data, receivedHmac)
  } catch (err) {
    console.error('verify error:', err)
  }
  if (!valid) {
    console.warn('Paymob callback: invalid HMAC')
    return isGet ? redirectTo('/subscription/failed?reason=invalid_signature') : jsonResponse({ error: 'invalid signature' }, 401)
  }

  // ===== Find the subscription =====
  // Paymob gives us merchant_order_id; we matched it to subscriptions.provider_subscription_id.
  // Their order_id is in `order` field. merchant_order_id is at `data.order.merchant_order_id`
  // when full transaction. In flat form it's directly at `data.merchant_order_id`.
  const merchantOrderId =
    data.merchant_order_id ||
    data?.order?.merchant_order_id ||
    null

  if (!merchantOrderId) {
    console.warn('No merchant_order_id in callback payload')
    return isGet ? redirectTo('/subscription/failed?reason=missing_order') : jsonResponse({ error: 'no merchant_order_id' }, 400)
  }

  const admin = getServiceClient()
  const { data: sub, error: findErr } = await admin
    .from('subscriptions')
    .select('id, user_id, plan_id, status, expires_at')
    .eq('provider_subscription_id', merchantOrderId)
    .maybeSingle()

  if (findErr || !sub) {
    console.warn('No subscription matches merchant_order_id', merchantOrderId)
    return isGet ? redirectTo('/subscription/failed?reason=order_not_found') : jsonResponse({ error: 'order not found' }, 404)
  }

  // ===== Decide success vs failure =====
  const success = String(data.success) === 'true' || data.success === true
  const pending = String(data.pending) === 'true' || data.pending === true
  const errorOccured = String(data.error_occured) === 'true' || data.error_occured === true

  // Build the patch
  const patch: Record<string, unknown> = {
    provider_data: {
      ...(data || {}),
      processed_at: new Date().toISOString(),
    },
  }

  if (success && !pending && !errorOccured) {
    patch.status = 'active'
    patch.started_at = new Date().toISOString()
    // expires_at was already set when creating the pending row, but recompute from now()
    // using the plan to be safe. We do this only if status was 'pending'.
    if (sub.status === 'pending') {
      const { data: plan } = await admin
        .from('subscription_plans')
        .select('duration_days')
        .eq('id', sub.plan_id)
        .single()
      if (plan?.duration_days) {
        patch.expires_at = new Date(Date.now() + plan.duration_days * 86400 * 1000).toISOString()
      }
    }
  } else if (pending) {
    patch.status = 'pending'
  } else {
    patch.status = 'cancelled'
  }

  // Apply patch
  const { error: updateErr } = await admin
    .from('subscriptions')
    .update(patch)
    .eq('id', sub.id)
  if (updateErr) {
    console.error('Failed to update subscription:', updateErr)
    return isGet ? redirectTo('/subscription/failed?reason=db_error') : jsonResponse({ error: 'db error' }, 500)
  }

  // If we just activated this subscription, expire/cancel the user's other actives
  if (patch.status === 'active') {
    await admin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', sub.user_id)
      .eq('status', 'active')
      .neq('id', sub.id)
  }

  // ===== Respond =====
  if (isGet) {
    return redirectTo(
      patch.status === 'active'
        ? `/subscription/success?id=${sub.id}`
        : `/subscription/failed?reason=${pending ? 'pending' : 'declined'}`
    )
  }
  return jsonResponse({ ok: true, subscription_id: sub.id, new_status: patch.status })
})
