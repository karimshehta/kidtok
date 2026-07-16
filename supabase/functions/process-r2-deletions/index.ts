// /functions/v1/process-r2-deletions
//
// Drains pending R2 object deletions. Useful for cron/manual cleanup if an
// inline delete could not reach R2 at the time.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/supabase.ts'
import { drainR2Queue } from '../_shared/r2.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

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
    const result = await drainR2Queue(admin, limit)

    return jsonResponse({
      ok: true,
      processed: result.deleted + result.not_found,
      ...result,
    })
  } catch (err: any) {
    console.error('process-r2-deletions unhandled error:', err)
    return jsonResponse({
      error: 'internal error',
      detail: String(err?.message || err),
    }, 500)
  }
})
