// POST /functions/v1/creator-r2-upload-url
//
// Creates a creator_videos row and returns a short-lived R2 presigned PUT URL.
// The mobile app uploads its already-trimmed/compressed MP4 to that URL, then
// calls creator-r2-upload-complete to publish the row.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'
import { createR2PresignedUpload } from '../_shared/r2.ts'

interface UploadRequest {
  title: string
  description?: string | null
  age_id?: number | null
  interest_id?: number | null
  tags?: string[]
  max_duration_seconds?: number
  start_time_seconds?: number
  avatar_id?: string
  access_method?: 'free' | 'reward' | 'coins'
}

interface QuotaReservation {
  event_id: string
  plan_code: string
  upload_limit: number
  used_uploads: number
  remaining_uploads: number
  cycle_start: string
  cycle_end: string
}

interface AvatarReservation {
  use_event_id: string
  access_kind: 'free' | 'reward' | 'coins'
  cost: number
  new_balance: number
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, 'METHOD_NOT_ALLOWED')
  }

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let body: UploadRequest
  try {
    body = (await req.json()) as UploadRequest
  } catch {
    return errorResponse('Invalid JSON body', 400, 'BAD_JSON')
  }

  if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
    return errorResponse('Title is required', 400, 'TITLE_REQUIRED')
  }
  if (body.title.length > 200) {
    return errorResponse('Title too long', 400, 'TITLE_TOO_LONG')
  }
  if (body.description && body.description.length > 5000) {
    return errorResponse('Description too long', 400, 'DESCRIPTION_TOO_LONG')
  }
  if (body.access_method && !['free', 'reward', 'coins'].includes(body.access_method)) {
    return errorResponse('Invalid avatar access method', 400, 'INVALID_ACCESS_METHOD')
  }

  const admin = getServiceClient()
  const isAvatarUpload = !!body.avatar_id
  let avatar: { id: string; sound_key: string | null } | null = null

  if (isAvatarUpload) {
    const { data } = await admin
      .from('kid_avatar_catalog')
      .select('id, sound_key')
      .eq('id', body.avatar_id!)
      .eq('is_active', true)
      .maybeSingle()
    if (!data) return errorResponse('Avatar not found', 404, 'AVATAR_NOT_FOUND')
    avatar = data as any
  }

  const { data: quotaRows, error: quotaErr } = await admin.rpc('reserve_creator_upload_quota', {
    p_user_id: user.id,
  })
  const quota = (Array.isArray(quotaRows) ? quotaRows[0] : quotaRows) as QuotaReservation | undefined

  if (quotaErr || !quota?.event_id) {
    const message = quotaErr?.message || ''
    if (message.includes('PLAN_UPLOAD_LIMIT_REACHED')) {
      return errorResponse('Upload limit reached', 429, 'PLAN_UPLOAD_LIMIT_REACHED')
    }
    console.error('[creator-r2-upload-url] quota reservation failed:', quotaErr)
    return errorResponse('Failed to check upload quota', 500, 'UPLOAD_QUOTA_CHECK_FAILED')
  }

  const releaseQuota = async () => {
    const { error } = await admin
      .from('creator_upload_quota_events')
      .delete()
      .eq('id', quota.event_id)
      .eq('user_id', user.id)
    if (error) console.warn('[creator-r2-upload-url] quota release failed:', error)
  }

  let avatarUse: AvatarReservation | undefined
  if (isAvatarUpload) {
    const { data: avatarRows, error: avatarErr } = await admin.rpc('reserve_avatar_use', {
      p_user_id: user.id,
      p_avatar_id: body.avatar_id,
      p_access_method: body.access_method || null,
    })
    avatarUse = (Array.isArray(avatarRows) ? avatarRows[0] : avatarRows) as AvatarReservation | undefined

    if (avatarErr || !avatarUse?.use_event_id) {
      await releaseQuota()
      const message = avatarErr?.message || ''
      if (message.includes('INSUFFICIENT_COINS')) {
        return errorResponse(message, 402, 'INSUFFICIENT_COINS')
      }
      if (message.includes('REWARDED_AD_REQUIRED')) {
        return errorResponse('Watch a rewarded ad to unlock one use', 403, 'REWARDED_AD_REQUIRED')
      }
      if (message.includes('AVATAR_PRICE_NOT_CONFIGURED')) {
        return errorResponse('Avatar price is not configured', 409, 'AVATAR_PRICE_NOT_CONFIGURED')
      }
      console.error('[creator-r2-upload-url] avatar reservation failed:', avatarErr)
      return errorResponse('Failed to reserve avatar', 500, 'AVATAR_RESERVATION_FAILED')
    }
  }

  const releaseAvatar = async () => {
    if (!avatarUse?.use_event_id) return
    await admin.rpc('release_avatar_use', {
      p_user_id: user.id,
      p_event_id: avatarUse.use_event_id,
    })
  }

  const maxDuration = Math.min(Math.max(Number(body.max_duration_seconds) || 30, 1), 30)
  const startTimeSeconds = Math.max(0, Number(body.start_time_seconds) || 0)
  const videoId = crypto.randomUUID()
  const key = `creator-videos/${user.id}/${videoId}.mp4`

  let upload
  try {
    upload = await createR2PresignedUpload({ key, expiresSeconds: 3600 })
  } catch (error) {
    await Promise.allSettled([releaseQuota(), releaseAvatar()])
    console.error('[creator-r2-upload-url] R2 presign failed:', error)
    return errorResponse('R2 upload is unavailable', 502, 'R2_ERROR')
  }

  const { data: row, error: insertErr } = await admin
    .from('creator_videos')
    .insert({
      id: videoId,
      creator_id: user.id,
      kid_avatar_id: avatar?.id ?? null,
      kid_avatar_sound_key: avatar?.sound_key ?? null,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      start_time_seconds: startTimeSeconds,
      clip_pending: false,
      age_id: body.age_id ?? null,
      interest_id: body.interest_id ?? null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      storage_provider: 'r2',
      r2_bucket: upload.bucket,
      r2_key: upload.key,
      r2_public_url: upload.publicUrl,
      hls_url: upload.publicUrl,
      duration_seconds: Math.round(maxDuration),
      status: 'uploading',
    })
    .select('id, r2_key, r2_public_url')
    .single()

  if (insertErr || !row) {
    await Promise.allSettled([releaseQuota(), releaseAvatar()])
    console.error('[creator-r2-upload-url] DB insert failed:', insertErr)
    return errorResponse('Failed to record R2 upload', 500, 'DB_INSERT_FAILED')
  }

  const updates: Promise<any>[] = [
    admin
      .from('creator_upload_quota_events')
      .update({ creator_video_id: row.id })
      .eq('id', quota.event_id),
  ]

  if (avatarUse?.use_event_id) {
    updates.push(
      admin
        .from('avatar_use_events')
        .update({
          creator_video_id: row.id,
          status: 'consumed',
          consumed_at: new Date().toISOString(),
        })
        .eq('id', avatarUse.use_event_id)
    )
  }

  const results = await Promise.all(updates)
  const firstError = results.find((result: any) => result?.error)?.error
  if (firstError) {
    await admin.from('videos').delete().eq('creator_video_id', row.id)
    await admin.from('creator_videos').delete().eq('id', row.id)
    await Promise.allSettled([releaseQuota(), releaseAvatar()])
    console.error('[creator-r2-upload-url] reservation link failed:', firstError)
    return errorResponse('Failed to finalize R2 reservation', 500, 'RESERVATION_LINK_FAILED')
  }

  return jsonResponse({
    upload_url: upload.uploadUrl,
    upload_method: 'PUT',
    storage_provider: 'r2',
    creator_video_id: row.id,
    r2_key: row.r2_key,
    public_url: row.r2_public_url,
    avatar_use: avatarUse ? {
      access_type: avatarUse.access_kind,
      coin_cost: avatarUse.cost,
      new_balance: avatarUse.new_balance,
    } : null,
    upload_quota: {
      plan_code: quota.plan_code,
      limit: quota.upload_limit,
      used: quota.used_uploads,
      remaining: quota.remaining_uploads,
      cycle_start: quota.cycle_start,
      cycle_end: quota.cycle_end,
    },
  })
})
