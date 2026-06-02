// /functions/v1/creator-delete-video
//
// Deletes a creator's video — both from Cloudflare Stream and from the DB.
// Only the owner may delete their video.
//
// Body: { video_id: uuid }
// Auth: user JWT (auth.uid() must equal creator_videos.creator_id)

import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

function cf() {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const apiToken  = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN')
  if (!accountId || !apiToken) return null
  return { accountId, apiToken }
}

async function deleteFromCloudflare(uid: string): Promise<{ ok: boolean; status?: number; body?: string }> {
  const c = cf()
  if (!c) return { ok: false, status: 0, body: 'CLOUDFLARE_NOT_CONFIGURED' }
  try {
    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${c.accountId}/stream/${uid}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${c.apiToken}` },
    })
    // 200 → deleted, 404 → already gone (treat as success)
    if (resp.ok || resp.status === 404) return { ok: true, status: resp.status }
    return { ok: false, status: resp.status, body: await resp.text().catch(() => '') }
  } catch (e) {
    return { ok: false, status: 0, body: String(e?.message || e) }
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  try {
    // Auth
    const user = await requireUser(req)
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401)

    // Body
    let body: { video_id?: string } = {}
    try { body = await req.json() } catch { /* keep empty */ }
    const videoId = body.video_id
    if (!videoId || typeof videoId !== 'string') {
      return jsonResponse({ error: 'video_id required' }, 400)
    }

    const admin = getServiceClient()

    // Fetch the row + ownership check
    const { data: vid, error: findErr } = await admin
      .from('creator_videos')
      .select('id, creator_id, cloudflare_uid, status')
      .eq('id', videoId)
      .maybeSingle()

    if (findErr) {
      console.error('lookup error:', findErr)
      return jsonResponse({ error: 'lookup failed', detail: findErr.message }, 500)
    }
    if (!vid) {
      return jsonResponse({ error: 'video not found' }, 404)
    }
    if (vid.creator_id !== user.id) {
      return jsonResponse({ error: 'forbidden' }, 403)
    }

    // ── Delete the mirror videos row FIRST.
    // The mirror references creator_videos with on-delete-set-null which is
    // fine. But the mirror itself has many cascading dependents (likes,
    // comments, history, playlist_videos) — all of those will cascade-clean
    // automatically when the videos row is deleted, so doing this first
    // avoids leaving orphan likes/comments that could trip up the next step.
    let mirrorDeleteErr: string | null = null
    if (vid.cloudflare_uid) {
      const { error } = await admin
        .from('videos')
        .delete()
        .eq('cloudflare_uid', vid.cloudflare_uid)
      if (error) {
        console.error('mirror videos delete error:', error)
        mirrorDeleteErr = error.message
      }
    }

    // ── Now delete the creator_videos row itself.
    const { error: delErr } = await admin
      .from('creator_videos')
      .delete()
      .eq('id', videoId)

    if (delErr) {
      console.error('creator_videos delete error:', delErr)
      return jsonResponse({
        error: 'db delete failed',
        detail: delErr.message,
        hint:   delErr.hint ?? null,
        code:   delErr.code ?? null,
        mirror_delete_err: mirrorDeleteErr,
      }, 500)
    }

    // ── Best-effort Cloudflare cleanup (after DB delete so UI is responsive).
    let cloudflareResult: { ok: boolean; status?: number; body?: string } = { ok: true }
    if (vid.cloudflare_uid) {
      cloudflareResult = await deleteFromCloudflare(vid.cloudflare_uid)
      if (!cloudflareResult.ok) {
        // Don't fail the request — orphan CF asset can be garbage-collected
        // later via a sweep. The user's DB is correct.
        console.warn('Cloudflare delete non-fatal:', cloudflareResult)
      }
    }

    return jsonResponse({
      ok:                   true,
      video_id:             videoId,
      cloudflare_uid:       vid.cloudflare_uid,
      cloudflare_deleted:   cloudflareResult.ok,
      cloudflare_status:    cloudflareResult.status,
    })
  } catch (err: any) {
    console.error('unhandled error:', err)
    return jsonResponse({
      error:  'internal error',
      detail: String(err?.message || err),
    }, 500)
  }
})
