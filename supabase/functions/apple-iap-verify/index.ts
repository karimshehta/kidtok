// ════════════════════════════════════════════════════════════════════════
// apple-iap-verify — validates an Apple in-app-purchase receipt and
// grants the corresponding entitlement (subscription or coins).
// ════════════════════════════════════════════════════════════════════════
// Why server-side validation?
//   - The mobile client can never be trusted to say "user paid"
//   - Apple's verifyReceipt endpoint is the source of truth
//   - Receipts are signed by Apple, so verifying them proves payment
//
// Why this lives in an edge function rather than the mobile app?
//   - Needs the App Store shared secret (autorenewables) — secret value
//   - Needs to write to public.subscriptions / public.user_coins via
//     SECURITY DEFINER RPCs that only service_role can call
//
// Apple's documented retry pattern:
//   1. POST to production (https://buy.itunes.apple.com/verifyReceipt)
//   2. If response.status === 21007 → it's a sandbox receipt, retry
//      against sandbox endpoint
//   3. Read latest_receipt_info for the freshest transaction state
// ════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const PROD_VERIFY    = 'https://buy.itunes.apple.com/verifyReceipt'
const SANDBOX_VERIFY = 'https://sandbox.itunes.apple.com/verifyReceipt'
const SANDBOX_STATUS = 21007  // "this receipt is from the test environment"
const PROD_RECEIPT_STATUS_OK = 0

interface VerifyRequest {
  // base64-encoded receipt from StoreKit (transactionReceipt)
  receipt: string
  // The Apple product_id the client THINKS this is for — used as a
  // sanity check against what Apple returns
  expected_product_id?: string
}

interface AppleInApp {
  product_id:                string
  transaction_id:            string
  original_transaction_id?:  string
  purchase_date_ms?:         string
  expires_date_ms?:          string
}

interface AppleVerifyResponse {
  status: number
  environment?: 'Sandbox' | 'Production'
  receipt?: { in_app?: AppleInApp[] }
  latest_receipt_info?: AppleInApp[]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })

async function verifyReceipt(receipt: string, sharedSecret: string, sandbox = false): Promise<AppleVerifyResponse> {
  const endpoint = sandbox ? SANDBOX_VERIFY : PROD_VERIFY
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      'receipt-data':              receipt,
      'password':                  sharedSecret,
      'exclude-old-transactions':  true,
    }),
  })
  if (!res.ok) throw new Error(`Apple verifyReceipt HTTP ${res.status}`)
  return await res.json() as AppleVerifyResponse
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (req.method !== 'POST')    return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  // ── Auth: who is making this request? ────────────────────────────────
  // The Authorization header carries the user's JWT. We do a userinfo
  // lookup with the *anon* key + the user's JWT to get their ID without
  // trusting the JWT contents (Supabase verifies the signature).
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'UNAUTHENTICATED' }, 401)

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SHARED_SECRET     = Deno.env.get('APPLE_IAP_SHARED_SECRET')

  if (!SHARED_SECRET) {
    console.error('[apple-iap-verify] APPLE_IAP_SHARED_SECRET is not configured')
    return json({ error: 'SERVER_MISCONFIGURED' }, 500)
  }

  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userResp, error: userErr } = await authedClient.auth.getUser()
  if (userErr || !userResp.user) return json({ error: 'UNAUTHENTICATED' }, 401)
  const userId = userResp.user.id

  // ── Parse + verify the receipt with Apple ────────────────────────────
  let body: VerifyRequest
  try { body = await req.json() } catch { return json({ error: 'BAD_JSON' }, 400) }
  if (!body.receipt || typeof body.receipt !== 'string') {
    return json({ error: 'MISSING_RECEIPT' }, 400)
  }

  let apple: AppleVerifyResponse
  try {
    apple = await verifyReceipt(body.receipt, SHARED_SECRET, false)
    // Apple returns 21007 when production gets a sandbox receipt — retry
    if (apple.status === SANDBOX_STATUS) {
      apple = await verifyReceipt(body.receipt, SHARED_SECRET, true)
    }
  } catch (err) {
    console.error('[apple-iap-verify] Apple call failed:', err)
    return json({ error: 'APPLE_VERIFY_FAILED', detail: String(err) }, 502)
  }

  if (apple.status !== PROD_RECEIPT_STATUS_OK) {
    return json({ error: 'INVALID_RECEIPT', apple_status: apple.status }, 400)
  }

  // ── Pick the latest transaction ──────────────────────────────────────
  // latest_receipt_info is what's current; receipt.in_app is the
  // original purchase list. For autorenewables, latest_receipt_info has
  // the up-to-date expires date.
  const txList = (apple.latest_receipt_info && apple.latest_receipt_info.length > 0)
    ? apple.latest_receipt_info
    : (apple.receipt?.in_app || [])

  if (txList.length === 0) {
    return json({ error: 'NO_TRANSACTIONS' }, 400)
  }

  // Newest first (highest purchase_date_ms)
  const latest = [...txList].sort((a, b) =>
    Number(b.purchase_date_ms ?? 0) - Number(a.purchase_date_ms ?? 0)
  )[0]

  if (body.expected_product_id && latest.product_id !== body.expected_product_id) {
    return json({
      error:          'PRODUCT_MISMATCH',
      expected:       body.expected_product_id,
      from_receipt:   latest.product_id,
    }, 400)
  }

  // ── Resolve product → kind (subscription / consumable) ──────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: product, error: prodErr } = await admin
    .from('apple_iap_products')
    .select('kind')
    .eq('product_id', latest.product_id)
    .eq('is_active', true)
    .maybeSingle()

  if (prodErr || !product) {
    return json({ error: 'UNKNOWN_PRODUCT', product_id: latest.product_id }, 400)
  }

  const purchasedAt = latest.purchase_date_ms
    ? new Date(Number(latest.purchase_date_ms)).toISOString()
    : new Date().toISOString()
  const expiresAt = latest.expires_date_ms
    ? new Date(Number(latest.expires_date_ms)).toISOString()
    : null

  // ── Grant via the appropriate RPC ───────────────────────────────────
  if (product.kind === 'subscription') {
    if (!expiresAt) {
      return json({ error: 'SUBSCRIPTION_MISSING_EXPIRES' }, 400)
    }
    const { data: grantData, error: grantErr } = await admin.rpc('grant_apple_subscription', {
      p_user_id:                 userId,
      p_transaction_id:          latest.transaction_id,
      p_original_transaction_id: latest.original_transaction_id ?? latest.transaction_id,
      p_product_id:              latest.product_id,
      p_expires_at:              expiresAt,
      p_purchased_at:            purchasedAt,
      p_environment:             apple.environment ?? 'Production',
      p_receipt:                 body.receipt,
    })
    if (grantErr) {
      console.error('[apple-iap-verify] grant_apple_subscription failed:', grantErr)
      return json({ error: 'GRANT_FAILED', detail: grantErr.message }, 500)
    }
    return json({ ok: true, ...grantData })
  }

  // Consumable (coins)
  const { data: grantData, error: grantErr } = await admin.rpc('grant_apple_coins', {
    p_user_id:        userId,
    p_transaction_id: latest.transaction_id,
    p_product_id:     latest.product_id,
    p_purchased_at:   purchasedAt,
    p_environment:    apple.environment ?? 'Production',
    p_receipt:        body.receipt,
  })
  if (grantErr) {
    console.error('[apple-iap-verify] grant_apple_coins failed:', grantErr)
    return json({ error: 'GRANT_FAILED', detail: grantErr.message }, 500)
  }
  return json({ ok: true, ...grantData })
})
