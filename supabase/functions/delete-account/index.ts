// /functions/v1/delete-account
//
// Permanently deletes the calling user's account and all of their data.
// Required by Apple App Store §5.1.1(v) and Google Play account-deletion
// policies — apps that let users sign up must let them delete the account
// from within the app.
//
// Flow:
//   1. Verify the request is from the user themselves (JWT → auth.uid()).
//   2. Best-effort cancel any active subscription so we don't keep billing.
//   3. Delete from public.profiles. Cascades clean up videos, children,
//      playlists, comments, likes, follows, notifications, push_tokens,
//      subscriptions etc. via on-delete-cascade FKs.
//   4. Delete the auth.users row via the admin API. This is irreversible.
//   5. Return success — caller signs out locally.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'
import { drainCloudflareQueue } from '../_shared/cloudflare.ts'
import { drainR2Queue } from '../_shared/r2.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    const user = await requireUser(req)
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401)

    const admin = getServiceClient()

    // 1) Cancel any active subscription so we don't keep billing
    try {
      await admin
        .from('subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'active')
    } catch (e) {
      console.warn('subscription cancel failed (non-fatal):', e)
    }

    // 2) NULL out cross-references that don't have ON DELETE CASCADE on
    //    auth.users. These tables exist for admin/audit purposes and don't
    //    cascade — leaving them with the user's id would block the auth
    //    delete in step 4. Best-effort: ignore failures since most regular
    //    users have no rows here anyway.
    for (const table of [
      'app_settings',        // updated_by
      'notifications_log',   // created_by
    ] as const) {
      try {
        const col = table === 'app_settings' ? 'updated_by' : 'created_by'
        await admin.from(table).update({ [col]: null }).eq(col, user.id)
      } catch (e) {
        console.warn(`nulling ${table} failed (non-fatal):`, e)
      }
    }

    // 2) Delete the profile row. The schema's on-delete-cascade FKs handle
    //    everything that hangs off it (children, videos, playlists, comments,
    //    likes, follows, notifications, push tokens, subscriptions, etc.).
    const { error: profileErr } = await admin
      .from('profiles')
      .delete()
      .eq('id', user.id)
    if (profileErr) {
      console.error('profile delete failed:', profileErr)
      return jsonResponse({
        error:  'profile delete failed',
        detail: profileErr.message,
        code:   profileErr.code ?? null,
      }, 500)
    }

    // 3) Delete the auth user. Irreversible.
    const { error: authErr } = await admin.auth.admin.deleteUser(user.id)
    if (authErr) {
      console.error('auth delete failed:', authErr)
      return jsonResponse({
        error:  'auth delete failed',
        detail: authErr.message,
      }, 500)
    }

    // 4) Drain the Cloudflare cleanup queue. The BEFORE-DELETE trigger on
    //    creator_videos queued each cloudflare_uid as the profile cascade
    //    ran; we drain now so the user's videos disappear from Cloudflare
    //    Stream immediately rather than waiting for a cron sweep.
    let cloudflareResult: any = null
    try {
      cloudflareResult = await drainCloudflareQueue(admin, 500)
    } catch (e: any) {
      console.warn('cloudflare drain failed (will retry on next call):', e)
    }

    let r2Result: any = null
    try {
      r2Result = await drainR2Queue(admin, 500)
    } catch (e: any) {
      console.warn('r2 drain failed (will retry on next call):', e)
    }

    return jsonResponse({
      ok:               true,
      user_id:          user.id,
      cloudflare_drain: cloudflareResult,
      r2_drain:         r2Result,
    })
  } catch (err: any) {
    console.error('unhandled error:', err)
    return jsonResponse({
      error:  'internal error',
      detail: String(err?.message || err),
    }, 500)
  }
})
