// Cloudflare Stream API client for Supabase Edge Functions
// https://developers.cloudflare.com/stream/

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

interface CloudflareEnv {
  accountId: string
  apiToken: string
  customerCode: string
  webhookSecret?: string
}

export function getCloudflareEnv(): CloudflareEnv {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const apiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN')
  const customerCode = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE')
  const webhookSecret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET')

  if (!accountId || !apiToken || !customerCode) {
    throw new Error(
      'Missing Cloudflare env vars. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN, CLOUDFLARE_STREAM_CUSTOMER_CODE in Supabase Edge Functions Secrets.'
    )
  }

  return { accountId, apiToken, customerCode, webhookSecret }
}

export interface DirectUploadResult {
  uploadURL: string
  uid: string
  scheduledDeletion?: string
}

/**
 * Request a Direct Creator Upload URL from Cloudflare Stream.
 * The client then POSTs the video file directly to this URL (server stays out of the way).
 * https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 */
export async function createDirectUpload(opts: {
  maxDurationSeconds?: number
  creator?: string // an opaque ID we can put our user id in
  meta?: Record<string, string>
  requireSignedURLs?: boolean
}): Promise<DirectUploadResult> {
  const env = getCloudflareEnv()
  const body = {
    maxDurationSeconds: opts.maxDurationSeconds ?? 600,
    creator: opts.creator,
    meta: opts.meta ?? {},
    requireSignedURLs: opts.requireSignedURLs ?? false,
    // 1 hour expiry on the upload URL itself
    expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }

  const res = await fetch(
    `${CF_API_BASE}/accounts/${env.accountId}/stream/direct_upload`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(
      `Cloudflare direct_upload failed (${res.status}): ${JSON.stringify(data.errors ?? data)}`
    )
  }
  return data.result as DirectUploadResult
}

/**
 * Verify a Cloudflare Stream webhook signature.
 * Header format: `time=<unix_seconds>,sig1=<hex_hmac_sha256>`
 * https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */
export async function verifyWebhookSignature(
  body: string,
  signatureHeader: string | null
): Promise<boolean> {
  const env = getCloudflareEnv()
  if (!env.webhookSecret) {
    console.warn('CLOUDFLARE_STREAM_WEBHOOK_SECRET not set; skipping verification')
    return true // Allow during initial setup before webhook is registered
  }
  if (!signatureHeader) return false

  // Parse "time=...,sig1=..."
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [k, ...rest] = p.split('=')
      return [k.trim(), rest.join('=').trim()]
    })
  )
  const timestamp = parts['time']
  const sig = parts['sig1']
  if (!timestamp || !sig) return false

  // Reject if older than 5 minutes (replay protection)
  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (ageSec > 300) {
    console.warn(`Webhook timestamp too old: ${ageSec}s`)
    return false
  }

  // HMAC-SHA256 over `${timestamp}.${body}` using the secret
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`))
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  if (expected.length !== sig.length) return false
  let result = 0
  for (let i = 0; i < expected.length; i++) result |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return result === 0
}

export interface CloudflareStreamVideo {
  uid: string
  creator?: string
  thumbnail?: string
  duration?: number
  readyToStream?: boolean
  status?: { state: string; pctComplete?: string; errorReasonCode?: string; errorReasonText?: string }
  playback?: { hls?: string; dash?: string }
  preview?: string
  meta?: Record<string, string>
  size?: number
  modified?: string
  uploaded?: string
}

/** Build an HLS URL even if the webhook payload doesn't include playback.hls. */
export function buildHlsUrl(uid: string): string {
  const env = getCloudflareEnv()
  return `https://${env.customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8`
}

export function buildThumbnailUrl(uid: string, time = '0s'): string {
  const env = getCloudflareEnv()
  return `https://${env.customerCode}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg?time=${time}`
}

export function buildPreviewUrl(uid: string): string {
  const env = getCloudflareEnv()
  return `https://${env.customerCode}.cloudflarestream.com/${uid}/manifest/video.mpd`
}


// ─── Clip API ─────────────────────────────────────────────────────────────────
// Create a new video that's a subsection of an existing one. The original keeps
// existing; we typically delete it after clip is ready.
export async function createClip(opts: {
  sourceUid: string
  startTimeSeconds: number
  endTimeSeconds: number
  creator?: string
  meta?: Record<string, string>
}): Promise<{ uid: string; readyToStream: boolean; status?: string }> {
  const env = getCloudflareEnv()
  const res = await fetch(
    `${CF_API_BASE}/accounts/${env.accountId}/stream/clip`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clippedFromVideoUID: opts.sourceUid,
        startTimeSeconds: opts.startTimeSeconds,
        endTimeSeconds: opts.endTimeSeconds,
        creator: opts.creator,
        meta: opts.meta ?? {},
      }),
    }
  )
  const data = await res.json()
  if (!res.ok || !data.success) {
    throw new Error(`Cloudflare clip failed: ${JSON.stringify(data.errors || data)}`)
  }
  const v = data.result
  return { uid: v.uid, readyToStream: !!v.readyToStream, status: v.status?.state }
}

// Delete a video from Cloudflare Stream
export async function deleteVideo(uid: string): Promise<void> {
  const env = getCloudflareEnv()
  const res = await fetch(
    `${CF_API_BASE}/accounts/${env.accountId}/stream/${uid}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.apiToken}` },
    }
  )
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Cloudflare delete failed: ${res.status} ${text}`)
  }
}

/**
 * Drains pending entries from the pending_cloudflare_deletions queue.
 * Successful entries are marked processed; failures get attempts++ and
 * last_error updated so they're retried on the next call.
 *
 * The queue is populated by a Postgres trigger on creator_videos BEFORE
 * DELETE, so it captures cascade deletes (admin delete user, self-delete,
 * even direct SQL).
 */
export type DrainResult = {
  scanned:   number
  deleted:   number
  not_found: number
  failed:    number
  failures:  { uid: string; status: number | null; message: string }[]
}

export async function drainCloudflareQueue(
  admin: any,
  limit = 50
): Promise<DrainResult> {
  const result: DrainResult = { scanned: 0, deleted: 0, not_found: 0, failed: 0, failures: [] }

  const { data: rows } = await admin
    .from('pending_cloudflare_deletions')
    .select('id, cloudflare_uid, attempts')
    .is('processed_at', null)
    .order('enqueued_at', { ascending: true })
    .limit(limit)

  if (!rows || rows.length === 0) return result
  result.scanned = rows.length

  for (const row of rows as any[]) {
    try {
      await deleteVideo(row.cloudflare_uid)
      // deleteVideo treats 404 as success too. Mark processed.
      await admin
        .from('pending_cloudflare_deletions')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', row.id)
      result.deleted++
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 400)
      const statusMatch = msg.match(/failed:\s*(\d+)/)
      const status = statusMatch ? Number(statusMatch[1]) : null
      await admin
        .from('pending_cloudflare_deletions')
        .update({
          attempts:   (row.attempts ?? 0) + 1,
          last_error: msg,
        })
        .eq('id', row.id)
      result.failed++
      result.failures.push({ uid: row.cloudflare_uid, status, message: msg })
    }
  }

  return result
}
