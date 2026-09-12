import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { getAvailablePurchases as fetchAvailablePurchases, useIAP, type Purchase } from 'expo-iap'
import { supabase } from '@/lib/supabase'

/**
 * Apple In-App Purchases hook (iOS only) — built on expo-iap.
 *
 * Why expo-iap (not react-native-iap)?
 *   react-native-iap v14+ depends on NitroModules, which Expo SDK 55
 *   does NOT ship with. The library's own author recommends expo-iap
 *   for Expo projects. expo-iap is an Expo Module (no Nitro needed),
 *   conforms to the same OpenIAP spec, and works with Hermes + new
 *   architecture out of the box.
 *
 * Flow:
 *   1) useIAP() registers StoreKit listeners and exposes connection
 *      + reactive products/subscriptions state.
 *   2) On connect we fetch subscriptions + consumables in parallel.
 *   3) Also on connect we process any "available" (pending, non-finished)
 *      purchases — this catches the user-killed-mid-purchase case where
 *      StoreKit re-delivers the receipt on next app open.
 *   4) purchase() returns a Promise — under the hood we store a
 *      resolver ref that the onPurchaseSuccess listener invokes.
 *   5) Receipt is sent to apple-iap-verify edge fn BEFORE
 *      finishTransaction. Verifying after finishing means a tampered
 *      receipt could grant entitlement; the order matters.
 */

export interface IapProduct {
  productId:      string
  type:           'subs' | 'inapp'
  /** Localized price string from StoreKit, e.g. "$4.99" / "EGP 245.00" */
  localizedPrice?: string
  title?:         string
  description?:   string
}

export interface PurchaseResult {
  ok:              boolean
  status?:         string
  transaction_id?: string
  error?:          string
}

// Helpers to read fields safely across OpenIAP shape variations
function getReceipt(pur: any): string | null {
  return pur?.transactionReceipt ?? pur?.purchaseToken ?? null
}
function getProductId(pur: any): string | null {
  return pur?.productId ?? pur?.id ?? null
}
function getTransactionId(pur: any): string | null {
  return pur?.id ?? pur?.transactionId ?? null
}
function getPrice(p: any): string | undefined {
  return p?.displayPrice ?? p?.localizedPrice ?? p?.price
}

export function useAppleIap({ subscriptions, consumables }: {
  subscriptions: string[]
  consumables:   string[]
}) {
  const isAvailable = Platform.OS === 'ios'

  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Pending-purchase resolver bridge ────────────────────────────────
  // Promise-based purchase() → event-driven listener. When the user
  // taps Subscribe we create a Promise + store its resolver here. The
  // onPurchaseSuccess listener (registered via useIAP) finds the
  // resolver by productId and resolves it.
  const pendingResolveRef = useRef<((r: PurchaseResult) => void) | null>(null)
  const pendingProductRef = useRef<string | null>(null)

  // Memoise the SKU arrays so useIAP deps don't re-fire every render
  const subscriptionSkus = useMemo(() => subscriptions.slice().sort(), [subscriptions.join(',')])
  const consumableSkus   = useMemo(() => consumables.slice().sort(),   [consumables.join(',')])

  // ── Server-side verification + finish ─────────────────────────────
  const verifyAndFinish = useCallback(async (pur: any, isConsumable: boolean) => {
    const receipt = getReceipt(pur)
    const productId = getProductId(pur)
    if (!receipt) throw new Error('NO_RECEIPT')

    // ⚠️ ORDER MATTERS: verify FIRST, then finishTransaction. If we
    // finish before verifying, a tampered receipt could grant
    // entitlement because StoreKit stops re-delivering it.
    const { data, error: verifyErr } = await supabase.functions.invoke('apple-iap-verify', {
      body: { receipt, expected_product_id: productId },
    })
    if (verifyErr) throw verifyErr
    if (!data?.ok)  throw new Error(data?.error ?? 'VERIFY_FAILED')

    try {
      await finishTransaction({ purchase: pur, isConsumable })
    } catch (e) {
      // Non-fatal: idempotent grant_apple_* RPCs mean a re-delivery
      // on next launch would be safe even if finishTransaction failed.
      console.warn('[useAppleIap] finishTransaction failed:', e)
    }

    return {
      ok:              true,
      status:          data.status,
      transaction_id:  getTransactionId(pur) || undefined,
    } as PurchaseResult
  }, [])

  // ── useIAP — the OpenIAP hook that does the heavy lifting ────────
  const {
    connected,
    products,
    subscriptions: subsState,
    fetchProducts,
    requestPurchase,
    finishTransaction,
  } = useIAP({
    // Called when StoreKit delivers a successful purchase (including
    // re-deliveries of unfinished ones on app launch).
    onPurchaseSuccess: async (purchase: Purchase) => {
      const productId = getProductId(purchase)
      // Was the consumable bucket the source? (subs purchase otherwise)
      const isConsumable = consumableSkus.includes(productId ?? '')
      try {
        const result = await verifyAndFinish(purchase, isConsumable)
        const resolver = pendingResolveRef.current
        pendingResolveRef.current = null
        pendingProductRef.current = null
        setBusy(false)
        resolver?.(result)
      } catch (err: any) {
        const result: PurchaseResult = { ok: false, error: err?.message ?? 'PURCHASE_FAILED' }
        const resolver = pendingResolveRef.current
        pendingResolveRef.current = null
        pendingProductRef.current = null
        setBusy(false)
        setError(result.error ?? null)
        resolver?.(result)
      }
    },
    onPurchaseError: (err) => {
      const code = (err as any)?.code ?? ''
      const isCancel = typeof code === 'string' && code.toLowerCase().includes('cancel')
      const result: PurchaseResult = isCancel
        ? { ok: false, error: 'CANCELLED' }
        : { ok: false, error: (err as any)?.message ?? 'PURCHASE_FAILED' }
      const resolver = pendingResolveRef.current
      pendingResolveRef.current = null
      pendingProductRef.current = null
      setBusy(false)
      if (!isCancel) setError(result.error ?? null)
      resolver?.(result)
    },
  })

  // ── Fetch product metadata once connected ───────────────────────
  useEffect(() => {
    if (!isAvailable || !connected) return
    let cancelled = false
    ;(async () => {
      try {
        if (subscriptionSkus.length > 0) {
          await fetchProducts({ skus: subscriptionSkus, type: 'subs' })
        }
        if (consumableSkus.length > 0) {
          await fetchProducts({ skus: consumableSkus, type: 'in-app' })
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'FETCH_PRODUCTS_FAILED')
      }
    })()
    return () => { cancelled = true }
  }, [isAvailable, connected, subscriptionSkus, consumableSkus, fetchProducts])

  // ── Process unfinished purchases on connect ─────────────────────
  // CRITICAL for production: if the user killed the app mid-purchase,
  // or finishTransaction failed last time, StoreKit will have those
  // purchases queued. We need to drain them so the user gets their
  // entitlement without having to tap Restore manually.
  useEffect(() => {
    if (!isAvailable || !connected) return
    let cancelled = false
    ;(async () => {
      try {
        const pending = await fetchAvailablePurchases({ onlyIncludeActiveItemsIOS: true })
        if (cancelled || !pending) return
        for (const pur of pending) {
          const productId = getProductId(pur)
          if (!productId) continue
          // Skip ones we already have a pendingResolveRef for
          if (pendingProductRef.current && pendingProductRef.current === productId) continue
          const isConsumable = consumableSkus.includes(productId)
          try {
            await verifyAndFinish(pur, isConsumable)
          } catch (e) {
            console.warn('[useAppleIap] pending purchase verify failed:', e)
            // Leave it; StoreKit will redeliver next launch
          }
        }
      } catch (e) {
        // getAvailablePurchases can throw on iOS Sim; that's fine
        console.warn('[useAppleIap] getAvailablePurchases failed:', e)
      }
    })()
    return () => { cancelled = true }
  }, [isAvailable, connected, consumableSkus, verifyAndFinish])

  // ── Public: purchase ────────────────────────────────────────────
  const purchase = useCallback((productId: string, type: 'subs' | 'inapp'): Promise<PurchaseResult> => {
    if (!isAvailable)  return Promise.resolve({ ok: false, error: 'IOS_ONLY' })
    if (!connected)    return Promise.resolve({ ok: false, error: 'NOT_CONNECTED' })
    if (pendingResolveRef.current) {
      return Promise.resolve({ ok: false, error: 'PURCHASE_IN_PROGRESS' })
    }

    setBusy(true)
    setError(null)

    return new Promise<PurchaseResult>((resolve) => {
      pendingResolveRef.current = resolve
      pendingProductRef.current = productId

      // OpenIAP request shape: per-platform keys + a 'type' enum.
      // For iOS we only need the `apple` block; android keys are ignored.
      requestPurchase({
        request: {
          apple:  { sku: productId },
          google: { skus: [productId] },
        },
        type: type === 'subs' ? 'subs' : 'in-app',
      }).catch((e: any) => {
        // Sync throws (e.g. invalid SKU) — listener won't fire, resolve here.
        const result: PurchaseResult = { ok: false, error: e?.message ?? 'PURCHASE_FAILED' }
        const r = pendingResolveRef.current
        pendingResolveRef.current = null
        pendingProductRef.current = null
        setBusy(false)
        setError(result.error ?? null)
        r?.(result)
      })
    })
  }, [isAvailable, connected, requestPurchase])

  // ── Public: restore ─────────────────────────────────────────────
  // Apple's review guidelines require this affordance for any app
  // that sells auto-renewable subscriptions. The subscription page
  // has a "Restore Purchases" button that calls this.
  const restore = useCallback(async (): Promise<{ restored: number; errors: number }> => {
    if (!isAvailable || !connected) return { restored: 0, errors: 0 }
    setBusy(true)
    setError(null)
    let restored = 0
    let errors   = 0
    try {
      const purchases = await fetchAvailablePurchases({ onlyIncludeActiveItemsIOS: true }).catch(() => null)
      if (!purchases || purchases.length === 0) return { restored: 0, errors: 0 }
      for (const pur of purchases) {
        const productId = getProductId(pur)
        if (!productId) { errors++; continue }
        const isConsumable = consumableSkus.includes(productId)
        try {
          await verifyAndFinish(pur, isConsumable)
          restored++
        } catch (e) {
          errors++
          console.warn('[useAppleIap] restore — verify failed:', e)
        }
      }
      return { restored, errors }
    } finally {
      setBusy(false)
    }
  }, [isAvailable, connected, consumableSkus, verifyAndFinish])

  // ── Public: products (flat, normalised list) ───────────────────
  const allProducts: IapProduct[] = useMemo(() => {
    const subs = (subsState || []).map((p: any) => ({
      productId:      getProductId(p) ?? '',
      type:           'subs' as const,
      localizedPrice: getPrice(p),
      title:          p?.title,
      description:    p?.description,
    })).filter((p) => p.productId)
    const cons = (products || []).map((p: any) => ({
      productId:      getProductId(p) ?? '',
      type:           'inapp' as const,
      localizedPrice: getPrice(p),
      title:          p?.title,
      description:    p?.description,
    })).filter((p) => p.productId)
    return [...subs, ...cons]
  }, [subsState, products])

  return {
    /** iOS + native module mounted */
    isAvailable,
    /** StoreKit connection ready (products may still be loading) */
    ready:      connected,
    /** StoreKit products + subscriptions, normalised */
    products:   allProducts,
    /** Active purchase or restore */
    busy,
    /** Last non-cancel error */
    error,
    /** Initiate a StoreKit purchase. Returns a Promise that resolves
     *  with { ok, status, transaction_id } or { ok: false, error }. */
    purchase,
    /** Restore previous purchases (required by App Review). */
    restore,
  }
}
