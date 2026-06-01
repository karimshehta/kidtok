// Paymob (accept.paymob.com) API helpers for Edge Functions.
// Multi-step payment flow:
//   1. auth: get a temp token using API key
//   2. createOrder: create an order; returns paymob order id
//   3. getPaymentKey: get a payment_token bound to the order + an integration_id
//   4. processPayment: open iframe (card) / push to wallet / open Apple Pay
//   5. callback: Paymob calls us back with HMAC-signed data on success/failure

interface PaymobConfig {
  apiKey: string
  baseUrl: string
  hmacSecret: string
  iframeId: string
  integrationIds: {
    card?: string
    wallet?: string
    apple_pay?: string
  }
}

export function getPaymobConfig(): PaymobConfig {
  const apiKey = Deno.env.get('PAYMOB_API_KEY')
  const hmacSecret = Deno.env.get('PAYMOB_HMAC_SECRET')
  const iframeId = Deno.env.get('PAYMOB_IFRAME_ID')
  if (!apiKey || !hmacSecret || !iframeId) {
    throw new Error(
      'Missing Paymob env vars. Set PAYMOB_API_KEY, PAYMOB_HMAC_SECRET, PAYMOB_IFRAME_ID in Supabase Edge Functions Secrets.'
    )
  }
  return {
    apiKey,
    hmacSecret,
    iframeId,
    baseUrl: Deno.env.get('PAYMOB_BASE_URL') || 'https://accept.paymob.com/api',
    integrationIds: {
      card: Deno.env.get('PAYMOB_CARD_INTEGRATION_ID') || undefined,
      wallet: Deno.env.get('PAYMOB_WALLET_INTEGRATION_ID') || undefined,
      apple_pay: Deno.env.get('PAYMOB_APPLE_PAY_INTEGRATION_ID') || undefined,
    },
  }
}

// ============================================================
// Step 1: Authenticate with Paymob API
// ============================================================
export async function paymobAuthenticate(cfg: PaymobConfig): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/auth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: cfg.apiKey }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Paymob auth failed: ${res.status} ${body}`)
  }
  const json = await res.json()
  if (!json.token) throw new Error('Paymob auth: no token in response')
  return json.token as string
}

// ============================================================
// Step 2: Create order
// ============================================================
export async function paymobCreateOrder(
  cfg: PaymobConfig,
  authToken: string,
  amountCents: number,
  merchantOrderId: string,
  currency = 'EGP'
): Promise<{ id: number }> {
  const res = await fetch(`${cfg.baseUrl}/ecommerce/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency,
      items: [],
      merchant_order_id: merchantOrderId,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Paymob createOrder failed: ${res.status} ${body}`)
  }
  return (await res.json()) as { id: number }
}

// ============================================================
// Step 3: Get payment key
// ============================================================
export interface BillingData {
  first_name: string
  last_name: string
  email: string
  phone_number: string
  apartment?: string
  floor?: string
  street?: string
  building?: string
  shipping_method?: string
  postal_code?: string
  city?: string
  country?: string
  state?: string
}

const DEFAULT_BILLING_FALLBACKS: Partial<BillingData> = {
  apartment: 'NA',
  floor: 'NA',
  street: 'NA',
  building: 'NA',
  shipping_method: 'NA',
  postal_code: 'NA',
  city: 'NA',
  country: 'NA',
  state: 'NA',
}

export async function paymobGetPaymentKey(
  cfg: PaymobConfig,
  authToken: string,
  orderId: number,
  amountCents: number,
  billing: BillingData,
  integrationId: string,
  currency = 'EGP',
  expirationSec = 3600
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/acceptance/payment_keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: expirationSec,
      order_id: orderId,
      billing_data: { ...DEFAULT_BILLING_FALLBACKS, ...billing },
      currency,
      integration_id: integrationId,
      lock_order_when_paid: false,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Paymob paymentKey failed: ${res.status} ${body}`)
  }
  const json = await res.json()
  if (!json.token) throw new Error('Paymob paymentKey: no token in response')
  return json.token as string
}

// ============================================================
// Build URLs
// ============================================================
export function buildCardIframeUrl(cfg: PaymobConfig, paymentToken: string): string {
  return `${cfg.baseUrl}/acceptance/iframes/${cfg.iframeId}?payment_token=${paymentToken}`
}

export function buildApplePayUrl(cfg: PaymobConfig, paymentToken: string): string {
  return `${cfg.baseUrl}/acceptance/payments/applepay_pay?payment_token=${paymentToken}`
}

export async function paymobWalletPay(
  cfg: PaymobConfig,
  paymentToken: string,
  walletPhone: string
): Promise<any> {
  const res = await fetch(`${cfg.baseUrl}/acceptance/payments/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: { identifier: walletPhone, subtype: 'WALLET' },
      payment_token: paymentToken,
    }),
  })
  return await res.json()
}

// ============================================================
// HMAC verification (callback security)
// ============================================================
// The 20 fields Paymob signs, in this exact order. See:
// https://docs.paymob.com/docs/hmac-calculation
//
// Format note: Paymob uses dot-notation in their docs (`order.id`,
// `source_data.pan`, etc.). The POST webhook delivers nested objects so
// dot-notation works literally. The GET redirect URL delivers the same
// fields FLAT with underscores in the query string (e.g. `source_data_pan`).
// Our `getField` helper checks both forms.
const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
]

export function pickPaymobField(data: Record<string, any>, path: string): string {
  // 1) Try dot-notation traversal (POST webhook: nested objects).
  const parts = path.split('.')
  let val: any = data
  for (const p of parts) {
    if (val == null) { val = undefined; break }
    val = val[p]
  }
  // 2) Fallback: GET redirect uses flat underscore keys
  //    e.g. `order.id` -> `order`, `source_data.pan` -> `source_data_pan`.
  if (val == null && path.includes('.')) {
    // Try the simple top-level name first (order.id -> order)
    val = data[parts[0]]
    if (val == null || (typeof val === 'object')) {
      // Then try fully-underscored (source_data.pan -> source_data_pan)
      val = data[path.replace(/\./g, '_')]
    }
  }
  if (val == null) return ''
  return String(val)
}

function getField(data: Record<string, any>, path: string): string {
  return pickPaymobField(data, path)
}

/**
 * Verify Paymob HMAC-SHA512 signature.
 *
 * Paymob delivers callback data either:
 *  - in `obj.*` style (e.g. obj.success, obj.id) when sent via processed callback
 *  - flat (e.g. success, id) when sent as redirect query params
 *
 * The caller is responsible for normalising the data to a flat dict before
 * passing in here.
 */
export async function verifyPaymobHmac(
  cfg: PaymobConfig,
  data: Record<string, unknown>,
  receivedHmac: string
): Promise<boolean> {
  const concat = HMAC_FIELDS.map((f) => getField(data as Record<string, any>, f)).join('')

  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(cfg.hmacSecret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(concat))
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time compare
  if (expected.length !== receivedHmac.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ receivedHmac.charCodeAt(i)
  }
  return mismatch === 0
}

/**
 * Some Paymob callbacks deliver data nested under `obj`. Flatten if needed.
 */
export function flattenPaymobData(raw: Record<string, any>): Record<string, any> {
  if (raw && typeof raw.obj === 'object' && raw.obj !== null) {
    return raw.obj
  }
  return raw
}
