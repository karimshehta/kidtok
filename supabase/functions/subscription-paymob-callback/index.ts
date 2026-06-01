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

// Returns a self-contained HTML page the WebView can display directly,
// instead of redirecting to /subscription/success on Vercel (which doesn't
// exist and produces a "Not Found" page in the mobile WebView).
//
// The page contains `?kidtok_done=1` in the query (set by the caller) which
// the mobile WebView matches and uses to auto-close. It also calls
// window.ReactNativeWebView.postMessage as a backup channel.
function htmlPage(success: boolean): Response {
  const title  = success ? 'تم الدفع بنجاح'  : 'لم يكتمل الدفع'
  const titleEn = success ? 'Payment successful' : 'Payment failed'
  const icon   = success ? '✅' : '❌'
  const color  = success ? '#16A34A' : '#DC2626'
  const bg     = success ? '#F0FDF4' : '#FEF2F2'
  const subAr  = success ? 'العودة للتطبيق...' : 'يرجى المحاولة مجدداً'
  const subEn  = success ? 'Returning to the app…' : 'Please try again'
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>${title}</title>
<style>
  html, body { margin:0; padding:0; height:100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background:${bg}; display:flex; align-items:center; justify-content:center; }
  .card { text-align:center; padding:32px; }
  .icon { font-size:80px; line-height:1; margin-bottom:20px; }
  h1    { color:${color}; font-size:24px; margin:0 0 8px; font-weight:800; }
  p     { color:#6B7280; font-size:14px; margin:6px 0 0; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${titleEn}</p>
    <p>${subAr}</p>
    <p>${subEn}</p>
  </div>
  <script>
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ kidtok_payment: '${success ? 'success' : 'failed'}' })
      );
    } catch (e) {}
  </script>
</body>
</html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
    return isGet ? htmlPage(false) : jsonResponse({ error: 'no signature' }, 401)
  }

  // ===== Verify HMAC =====
  let valid = false
  try {
    const cfg = getPaymobConfig()
    valid = await verifyPaymobHmac(cfg, data, receivedHmac)
    if (!valid) {
      // Diagnostic: log the fields we used and the HMACs we expected vs got.
      // (The secret itself is never logged.) Helps debug HMAC-source mismatch
      // between Paymob's old/new dashboards.
      const debugFields = {
        amount_cents:           data.amount_cents,
        created_at:             data.created_at,
        currency:               data.currency,
        error_occured:          data.error_occured,
        has_parent_transaction: data.has_parent_transaction,
        id:                     data.id,
        integration_id:         data.integration_id,
        is_3d_secure:           data.is_3d_secure,
        is_auth:                data.is_auth,
        is_capture:             data.is_capture,
        is_refunded:            data.is_refunded,
        is_standalone_payment:  data.is_standalone_payment,
        is_voided:              data.is_voided,
        order:                  data.order,
        owner:                  data.owner,
        pending:                data.pending,
        source_data_pan:        data.source_data_pan,
        source_data_sub_type:   data.source_data_sub_type,
        source_data_type:       data.source_data_type,
        success:                data.success,
      }
      console.warn('HMAC mismatch debug:', JSON.stringify({
        received_hmac_prefix: String(receivedHmac).slice(0, 12) + '…',
        received_hmac_length: String(receivedHmac).length,
        transport:            isGet ? 'GET (redirect)' : 'POST (webhook)',
        fields:               debugFields,
      }))
    }
  } catch (err) {
    console.error('verify error:', err)
  }
  if (!valid) {
    console.warn('Paymob callback: invalid HMAC')
    return isGet ? htmlPage(false) : jsonResponse({ error: 'invalid signature' }, 401)
  }

  // ===== Find the subscription =====
  // Paymob gives us merchant_order_id; we matched it to subscriptions.provider_subscription_id.
  // Their order_id is in `order` field. merchant_order_id is at `data.order.merchant_order_id`
  // when full transaction. In flat form it's directly at `data.merchant_order_id`.
  const merchantOrderId =
    data.merchant_order_id ||
    data?.order?.merchant_order_id ||
    null

  // Paymob's own internal order id — falls back lookup target when their
  // redirect URL doesn't include our merchant_order_id (it sometimes only has
  // `order=<paymob_order_id>` in the query params).
  const paymobOrderId =
    (typeof data.order === 'number' || typeof data.order === 'string') ? String(data.order) :
    data?.order?.id ? String(data.order.id) :
    data.order_id ? String(data.order_id) :
    null

  if (!merchantOrderId && !paymobOrderId) {
    console.warn('No order identifier in callback payload')
    return isGet ? htmlPage(false) : jsonResponse({ error: 'no order id' }, 400)
  }

  const admin = getServiceClient()
  let sub: { id: string; user_id: string; plan_id: number; status: string; expires_at: string } | null = null
  let findErr: any = null

  // Primary lookup by our merchant_order_id (stored as provider_subscription_id).
  if (merchantOrderId) {
    const r = await admin
      .from('subscriptions')
      .select('id, user_id, plan_id, status, expires_at')
      .eq('provider_subscription_id', merchantOrderId)
      .maybeSingle()
    sub = r.data as any
    findErr = r.error
  }
  // Fallback: look up by Paymob's order_id which we stored in provider_data.
  if (!sub && paymobOrderId) {
    const r = await admin
      .from('subscriptions')
      .select('id, user_id, plan_id, status, expires_at')
      .eq('provider_data->>paymob_order_id', paymobOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    sub = r.data as any
    findErr = r.error
  }

  if (findErr || !sub) {
    console.warn('No subscription matches', { merchantOrderId, paymobOrderId })
    return isGet ? htmlPage(false) : jsonResponse({ error: 'order not found' }, 404)
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
    return isGet ? htmlPage(false) : jsonResponse({ error: 'db error' }, 500)
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
    return htmlPage(patch.status === 'active')
  }
  return jsonResponse({ ok: true, subscription_id: sub.id, new_status: patch.status })
})
