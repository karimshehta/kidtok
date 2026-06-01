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
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${c.accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${c.apiToken}` },
  })
  // Cloudflare returns 200 for a successful delete. 404 means the video is
  // already gone on Cloudflare's side, which we treat as success.
  if (resp.ok || resp.status === 404) return { ok: true, status: resp.status }
  return { ok: false, status: resp.status, body: await resp.text().catch(() => '') }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

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

  if (findErr || !vid) {
    return jsonResponse({ error: 'video not found' }, 404)
  }
  if (vid.creator_id !== user.id) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  // Best-effort Cloudflare cleanup. If it fails we still proceed with the DB
  // delete — leaving a row pointing at a possibly-existing CF asset would be
  // worse than orphaning an asset that can be GC'd later.
  let cloudflareResult: any = { skipped: true }
  if (vid.cloudflare_uid) {
    cloudflareResult = await deleteFromCloudflare(vid.cloudflare_uid)
  }

  // DB delete. FKs cascade into:
  //   - public.videos (mirror row, via creator_video_id reference)
  //   - public.video_likes / video_comments (via video_id on the mirror)
  //   - public.playlist_videos (via video_id)
  const { error: delErr } = await admin
    .from('creator_videos')
    .delete()
    .eq('id', videoId)

  if (delErr) {
    return jsonResponse({ error: 'db delete failed', detail: delErr.message }, 500)
  }

  // Also delete any mirror row in public.videos that wasn't covered by cascade
  // (the mirror is by cloudflare_uid in some installs).
  if (vid.cloudflare_uid) {
    await admin.from('videos').delete().eq('cloudflare_uid', vid.cloudflare_uid)
  }

  return jsonResponse({
    ok:                   true,
    video_id:             videoId,
    cloudflare_uid:       vid.cloudflare_uid,
    cloudflare_deleted:   cloudflareResult.ok === true,
    cloudflare_status:    cloudflareResult.status,
  })
})
