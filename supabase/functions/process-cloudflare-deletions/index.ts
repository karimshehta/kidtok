// /functions/v1/process-cloudflare-deletions
//
// Drains the pending_cloudflare_deletions queue: pulls up to `limit`
// pending entries, calls Cloudflare Stream DELETE for each, marks
// successful ones processed and bumps the attempts counter on failures.
//
// Callable by:
//   • Admin dashboard (manual "Clean up Cloudflare orphans" button)
//   • Other edge functions immediately after a delete cascade
//     (admin-delete-user, delete-account) — so cleanup is automatic
//   • A pg_cron schedule if you want background sweeps for stragglers
//
// Idempotent: calling it twice is harmless — already-processed rows are
// skipped. Failures stay queued for the next call to retry.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { drainCloudflareQueue } from '../_shared/cloudflare.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  // Allow both GET and POST so it can be hit by cron jobs / browsers
  // for manual triggering, plus from other edge functions internally.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405)
  }

  try {
    let limit = 50
    try {
      if (req.method === 'POST') {
        const body = await req.json().catch(() => ({})) as { limit?: number }
        if (typeof body.limit === 'number' && body.limit > 0 && body.limit <= 500) {
          limit = body.limit
        }
      } else {
        const u = new URL(req.url)
        const ql = Number(u.searchParams.get('limit'))
        if (!isNaN(ql) && ql > 0 && ql <= 500) limit = ql
      }
    } catch { /* keep default */ }

    const admin = getServiceClient()
    const result = await drainCloudflareQueue(admin, limit)

    return jsonResponse({
      ok:        true,
      processed: result.deleted + result.not_found,
      ...result,
    })
  } catch (err: any) {
    console.error('process-cloudflare-deletions unhandled error:', err)
    return jsonResponse({
      error:  'internal error',
      detail: String(err?.message || err),
    }, 500)
  }
})
