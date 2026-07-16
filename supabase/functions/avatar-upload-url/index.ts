// Avatar-aware direct upload URL. This is separate from creator-upload-url so
// the currently released app keeps using its unchanged production path.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { createDirectUpload, deleteVideo } from '../_shared/cloudflare.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

interface UploadRequest {
  avatar_id: string
  title: string
  description?: string | null
  age_id?: number | null
  interest_id?: number | null
  tags?: string[]
  max_duration_seconds?: number
  start_time_seconds?: number
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

  if (!body.avatar_id) {
    return errorResponse('avatar_id is required', 400, 'MISSING_AVATAR')
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

  const admin = getServiceClient()
  const { data: avatar } = await admin
    .from('kid_avatar_catalog')
    .select('id, sound_key, is_active')
    .eq('id', body.avatar_id)
    .eq('is_active', true)
    .maybeSingle()
  if (!avatar) return errorResponse('Avatar not found', 404, 'AVATAR_NOT_FOUND')

  const { data: quotaRows, error: quotaErr } = await admin.rpc('reserve_creator_upload_quota', {
    p_user_id: user.id,
  })
  const quota = (Array.isArray(quotaRows) ? quotaRows[0] : quotaRows) as QuotaReservation | undefined
  if (quotaErr || !quota?.event_id) {
    const message = quotaErr?.message || ''
    if (message.includes('PLAN_UPLOAD_LIMIT_REACHED')) {
      return errorResponse('Upload limit reached', 429, 'PLAN_UPLOAD_LIMIT_REACHED')
    }
    console.error('[avatar-upload-url] quota reservation failed:', quotaErr)
    return errorResponse('Failed to check upload quota', 500, 'UPLOAD_QUOTA_CHECK_FAILED')
  }

  const releaseQuota = async () => {
    const { error } = await admin
      .from('creator_upload_quota_events')
      .delete()
      .eq('id', quota.event_id)
      .eq('user_id', user.id)
    if (error) console.warn('[avatar-upload-url] quota release failed:', error)
  }

  const { data: avatarRows, error: avatarErr } = await admin.rpc('reserve_avatar_use', {
    p_user_id: user.id,
    p_avatar_id: body.avatar_id,
  })
  const avatarUse = (Array.isArray(avatarRows) ? avatarRows[0] : avatarRows) as AvatarReservation | undefined

  if (avatarErr || !avatarUse?.use_event_id) {
    await releaseQuota()
    const message = avatarErr?.message || ''
    if (message.includes('INSUFFICIENT_COINS')) {
      return errorResponse(message, 402, 'INSUFFICIENT_COINS')
    }
    if (message.includes('REWARDED_AD_REQUIRED')) {
      return errorResponse('Watch a rewarded ad to unlock one use', 403, 'REWARDED_AD_REQUIRED')
    }
    console.error('[avatar-upload-url] avatar reservation failed:', avatarErr)
    return errorResponse('Failed to reserve avatar', 500, 'AVATAR_RESERVATION_FAILED')
  }

  const releaseAvatar = async () => {
    await admin.rpc('release_avatar_use', {
      p_user_id: user.id,
      p_event_id: avatarUse.use_event_id,
    })
  }

  const maxDuration = Math.min(Math.max(Number(body.max_duration_seconds) || 30, 5), 30)
  const startTimeSeconds = Math.max(0, Number(body.start_time_seconds) || 0)

  let upload
  try {
    upload = await createDirectUpload({
      maxDurationSeconds: maxDuration,
      creator: user.id,
      meta: {
        title: body.title.trim(),
        kidtok_user_id: user.id,
        kidtok_avatar_id: body.avatar_id,
      },
    })
  } catch (error) {
    await Promise.allSettled([releaseQuota(), releaseAvatar()])
    console.error('[avatar-upload-url] Cloudflare failed:', error)
    return errorResponse('Cloudflare upload is unavailable', 502, 'CLOUDFLARE_ERROR')
  }

  const { data: row, error: insertErr } = await admin
    .from('creator_videos')
    .insert({
      creator_id: user.id,
      kid_avatar_id: body.avatar_id,
      kid_avatar_sound_key: avatar.sound_key,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      start_time_seconds: startTimeSeconds,
      clip_pending: startTimeSeconds > 0,
      age_id: body.age_id ?? null,
      interest_id: body.interest_id ?? null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      cloudflare_uid: upload.uid,
      status: 'uploading',
    })
    .select('id, cloudflare_uid')
    .single()

  if (insertErr || !row) {
    await Promise.allSettled([deleteVideo(upload.uid), releaseQuota(), releaseAvatar()])
    console.error('[avatar-upload-url] DB insert failed:', insertErr)
    return errorResponse('Failed to record avatar upload', 500, 'DB_INSERT_FAILED')
  }

  const [quotaLink, avatarLink] = await Promise.all([
    admin
      .from('creator_upload_quota_events')
      .update({ creator_video_id: row.id, cloudflare_uid: upload.uid })
      .eq('id', quota.event_id),
    admin
      .from('avatar_use_events')
      .update({
        creator_video_id: row.id,
        cloudflare_uid: upload.uid,
        status: 'consumed',
        consumed_at: new Date().toISOString(),
      })
      .eq('id', avatarUse.use_event_id),
  ])

  if (quotaLink.error || avatarLink.error) {
    // The sync trigger already created an inactive public mirror; remove it
    // before the creator row to respect the current production FK/check.
    await admin.from('videos').delete().eq('creator_video_id', row.id)
    await admin.from('creator_videos').delete().eq('id', row.id)
    await Promise.allSettled([deleteVideo(upload.uid), releaseQuota(), releaseAvatar()])
    console.error('[avatar-upload-url] reservation link failed:', {
      quota: quotaLink.error,
      avatar: avatarLink.error,
    })
    return errorResponse('Failed to finalize avatar upload', 500, 'RESERVATION_LINK_FAILED')
  }

  return jsonResponse({
    upload_url: upload.uploadURL,
    creator_video_id: row.id,
    cloudflare_uid: row.cloudflare_uid,
    avatar_use: {
      access_type: avatarUse.access_kind,
      coin_cost: avatarUse.cost,
      new_balance: avatarUse.new_balance,
    },
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
