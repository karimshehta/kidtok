// /functions/v1/admin-delete-user
//
// Admin-only: permanently deletes a user and all of their data,
// including Cloudflare Stream assets. Replaces the dashboard's previous
// direct `supabase.from('profiles').delete().eq('id', user_id)` call
// which left:
//   • The auth.users row alive (user could still log in!)
//   • Cloudflare Stream videos orphaned (storage cost piling up)
//
// Body: { user_id: uuid }
// Auth: requester must have profiles.role = 'admin'
//
// Flow:
//   1. Verify caller is admin
//   2. Null out cross-references that don't cascade on auth.users
//   3. Delete profile row (cascades children/videos/etc; trigger queues
//      Cloudflare uids into pending_cloudflare_deletions)
//   4. Delete auth.users row
//   5. Drain the queue (inline cleanup of Cloudflare assets)
//   6. Return summary { cloudflare_deleted, cloudflare_failed, ... }

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'
import { drainCloudflareQueue } from '../_shared/cloudflare.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    const caller = await requireUser(req)
    if (!caller) return jsonResponse({ error: 'unauthorized' }, 401)

    const admin = getServiceClient()

    // ── 1) Verify caller is an admin
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()
    if (!callerProfile || (callerProfile as any).role !== 'admin') {
      return jsonResponse({ error: 'forbidden' }, 403)
    }

    // ── 2) Body
    let body: { user_id?: string } = {}
    try { body = await req.json() } catch { /* keep empty */ }
    const targetId = body.user_id
    if (!targetId || typeof targetId !== 'string') {
      return jsonResponse({ error: 'user_id required' }, 400)
    }
    if (targetId === caller.id) {
      return jsonResponse({ error: 'cannot delete yourself this way; use delete-account' }, 400)
    }

    // ── 3) Cancel any active subscription so we don't keep billing
    try {
      await admin
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', targetId)
        .eq('status', 'active')
    } catch (e) {
      console.warn('subscription cancel failed (non-fatal):', e)
    }

    // ── 4) NULL out cross-references that don't cascade on auth.users
    for (const [table, col] of [
      ['app_settings',      'updated_by'],
      ['notifications_log', 'created_by'],
    ] as const) {
      try { await admin.from(table).update({ [col]: null }).eq(col, targetId) }
      catch (e) { console.warn(`nulling ${table}.${col} failed (non-fatal):`, e) }
    }

    // ── 5) Delete the profile row.
    //      Postgres cascades: children → playlists → creator_videos → etc.
    //      The trigger on creator_videos BEFORE DELETE captures each
    //      cloudflare_uid into pending_cloudflare_deletions.
    const { error: profileErr } = await admin
      .from('profiles')
      .delete()
      .eq('id', targetId)
    if (profileErr) {
      console.error('profile delete failed:', profileErr)
      return jsonResponse({
        error:  'profile delete failed',
        detail: profileErr.message,
        code:   profileErr.code ?? null,
      }, 500)
    }

    // ── 6) Delete the auth user
    const { error: authErr } = await admin.auth.admin.deleteUser(targetId)
    if (authErr) {
      console.error('auth delete failed:', authErr)
      return jsonResponse({
        error:  'auth delete failed (DB profile was deleted)',
        detail: authErr.message,
      }, 500)
    }

    // ── 7) Drain the Cloudflare cleanup queue
    //      The queue may include entries from this delete *plus* any
    //      leftover unprocessed entries from earlier failures. Both get
    //      processed. We allow up to 500 in case a creator had many videos.
    let cloudflareResult: any = null
    try {
      cloudflareResult = await drainCloudflareQueue(admin, 500)
    } catch (e: any) {
      console.warn('cloudflare drain failed (will retry on next call):', e)
    }

    return jsonResponse({
      ok:                  true,
      user_id:             targetId,
      cloudflare_drain:    cloudflareResult,   // null if drain failed entirely
    })
  } catch (err: any) {
    console.error('admin-delete-user unhandled error:', err)
    return jsonResponse({
      error:  'internal error',
      detail: String(err?.message || err),
    }, 500)
  }
})
