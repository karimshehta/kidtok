// /functions/v1/admin-delete-video
//
// Hard-delete any creator_videos row as an admin. Removes the mirror videos
// row (cascade from FK we set in migration 000011) and enqueues the
// cloudflare_uid for deletion (trigger from migration 000009). We then drain
// the queue immediately so the asset is wiped from Cloudflare in the same
// request the admin made — no background lag.
//
// Body: { video_id: uuid }
// Auth: caller's JWT must belong to a profile with role='admin'.

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser }  from '../_shared/supabase.ts'
import { drainCloudflareQueue }           from '../_shared/cloudflare.ts'

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    const user = await requireUser(req)
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401)

    let body: { video_id?: string } = {}
    try { body = await req.json() } catch { /* keep empty */ }
    const videoId = body.video_id
    if (!videoId || typeof videoId !== 'string') {
      return jsonResponse({ error: 'video_id required' }, 400)
    }

    const admin = getServiceClient()

    // Admin role check — service role bypasses RLS so we MUST do this
    // explicitly here. (We use the caller's id, not whatever the body says.)
    const { data: caller, error: callerErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (callerErr) {
      console.error('caller lookup error:', callerErr)
      return jsonResponse({ error: 'lookup failed', detail: callerErr.message }, 500)
    }
    if (caller?.role !== 'admin') {
      return jsonResponse({ error: 'forbidden — admin only' }, 403)
    }

    // Find the row we're about to delete (so we can log/return useful info)
    const { data: vid, error: findErr } = await admin
      .from('creator_videos')
      .select('id, creator_id, cloudflare_uid, title, status')
      .eq('id', videoId)
      .maybeSingle()
    if (findErr) {
      console.error('video lookup error:', findErr)
      return jsonResponse({ error: 'lookup failed', detail: findErr.message }, 500)
    }
    if (!vid) {
      return jsonResponse({ error: 'video not found' }, 404)
    }

    // Delete — the trigger queue_cloudflare_deletion fires here and writes
    // the cloudflare_uid into pending_cloudflare_deletions BEFORE the row
    // disappears, so we don't need to capture the uid manually.
    const { error: delErr } = await admin
      .from('creator_videos')
      .delete()
      .eq('id', videoId)
    if (delErr) {
      console.error('delete error:', delErr)
      return jsonResponse({ error: 'delete failed', detail: delErr.message }, 500)
    }

    // Drain the queue immediately. Limit 50 = plenty for a single delete,
    // and we won't block the admin's request waiting for a huge backlog.
    let drain: any = null
    try { drain = await drainCloudflareQueue(admin, 50) }
    catch (e) { console.error('drain failed:', e); /* non-fatal */ }

    return jsonResponse({
      ok: true,
      video_id: videoId,
      title:    vid.title,
      creator_id: vid.creator_id,
      cloudflare_drain: drain,
    })
  } catch (e: any) {
    console.error('admin-delete-video error:', e)
    return jsonResponse({ error: 'internal', detail: String(e?.message || e) }, 500)
  }
})
