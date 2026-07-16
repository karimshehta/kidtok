// Cloudflare R2 helper for Supabase Edge Functions.
// R2 uses the S3-compatible API. We generate short-lived presigned URLs so the
// mobile app can upload directly without exposing any R2 secret.

const REGION = 'auto'
const SERVICE = 's3'

export interface R2Env {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string
}

export function getR2Env(): R2Env {
  const accountId = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  const bucket = Deno.env.get('R2_BUCKET') || 'kidtok-videos'
  const publicBaseUrl = Deno.env.get('R2_PUBLIC_BASE_URL')

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error(
      'Missing R2 env vars. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL.'
    )
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
  }
}

export function publicUrlForKey(key: string, env = getR2Env()): string {
  return `${env.publicBaseUrl}/${key.split('/').map(encodeRfc3986).join('/')}`
}

export async function createR2PresignedUpload(opts: {
  key: string
  expiresSeconds?: number
}): Promise<{ uploadUrl: string; publicUrl: string; bucket: string; key: string }> {
  const env = getR2Env()
  const uploadUrl = await presignR2Url({
    method: 'PUT',
    key: opts.key,
    expiresSeconds: opts.expiresSeconds ?? 3600,
    env,
  })

  return {
    uploadUrl,
    publicUrl: publicUrlForKey(opts.key, env),
    bucket: env.bucket,
    key: opts.key,
  }
}

export async function deleteR2Object(key: string, bucket?: string): Promise<void> {
  const env = getR2Env()
  const uploadEnv = bucket ? { ...env, bucket } : env
  const url = await presignR2Url({
    method: 'DELETE',
    key,
    expiresSeconds: 60,
    env: uploadEnv,
  })
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`R2 delete failed: ${res.status} ${text}`)
  }
}

export async function headR2Object(key: string, bucket?: string): Promise<{ exists: boolean; sizeBytes?: number }> {
  const env = getR2Env()
  const uploadEnv = bucket ? { ...env, bucket } : env
  const url = await presignR2Url({
    method: 'HEAD',
    key,
    expiresSeconds: 60,
    env: uploadEnv,
  })
  const res = await fetch(url, { method: 'HEAD' })
  if (res.status === 404) return { exists: false }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`R2 head failed: ${res.status} ${text}`)
  }
  const size = Number(res.headers.get('content-length') || '')
  return { exists: true, sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined }
}

export type R2DrainResult = {
  scanned: number
  deleted: number
  not_found: number
  failed: number
  failures: { key: string; status: number | null; message: string }[]
}

export async function drainR2Queue(admin: any, limit = 50): Promise<R2DrainResult> {
  const result: R2DrainResult = { scanned: 0, deleted: 0, not_found: 0, failed: 0, failures: [] }
  const { data: rows } = await admin
    .from('pending_r2_deletions')
    .select('id, r2_bucket, r2_key, attempts')
    .is('processed_at', null)
    .order('enqueued_at', { ascending: true })
    .limit(limit)

  if (!rows || rows.length === 0) return result
  result.scanned = rows.length

  for (const row of rows as any[]) {
    try {
      await deleteR2Object(row.r2_key, row.r2_bucket)
      await admin
        .from('pending_r2_deletions')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', row.id)
      result.deleted++
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 400)
      const statusMatch = msg.match(/failed:\s*(\d+)/)
      const status = statusMatch ? Number(statusMatch[1]) : null
      await admin
        .from('pending_r2_deletions')
        .update({
          attempts: (row.attempts ?? 0) + 1,
          last_error: msg,
        })
        .eq('id', row.id)
      result.failed++
      result.failures.push({ key: row.r2_key, status, message: msg })
    }
  }

  return result
}

async function presignR2Url(opts: {
  method: 'PUT' | 'DELETE' | 'HEAD'
  key: string
  expiresSeconds: number
  env: R2Env
}): Promise<string> {
  const now = new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const host = `${opts.env.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodeRfc3986(opts.env.bucket)}/${opts.key.split('/').map(encodeRfc3986).join('/')}`

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'X-Amz-Credential': `${opts.env.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(opts.expiresSeconds, 604800))),
    'X-Amz-SignedHeaders': 'host',
  }

  const canonicalQuery = canonicalQueryString(query)
  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')
  const signingKey = await getSigningKey(opts.env.secretAccessKey, dateStamp)
  const signature = await hmacHex(signingKey, stringToSign)

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key])}`)
    .join('&')
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(hash))
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value))
  return new Uint8Array(sig)
}

async function hmacHex(key: Uint8Array, value: string): Promise<string> {
  return toHex(await hmac(key, value))
}

async function getSigningKey(secret: string, dateStamp: string): Promise<Uint8Array> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp)
  const kRegion = await hmac(kDate, REGION)
  const kService = await hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}
