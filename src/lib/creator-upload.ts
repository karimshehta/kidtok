import { supabase } from '@/lib/supabase'

export const MAX_VIDEO_DURATION_SEC = 30
export const MAX_VIDEO_SIZE_MB = 200
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']

export interface UploadMetadata {
  title: string
  description?: string | null
  age_id?: number | null
  interest_id?: number | null
  tags?: string[]
}

interface UploadResult {
  creator_video_id: string
  cloudflare_uid: string
}

/** Read a video file's duration in the browser before uploading. */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      const duration = video.duration
      URL.revokeObjectURL(url)
      if (!isFinite(duration) || duration <= 0) {
        reject(new Error('INVALID_DURATION'))
      } else {
        resolve(duration)
      }
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('METADATA_READ_FAILED'))
    }
    video.src = url
  })
}

/** Validate the file before kicking off an upload. Throws with a stable code on failure. */
export async function validateVideoFile(file: File): Promise<{ duration: number }> {
  if (!ACCEPTED_VIDEO_TYPES.includes(file.type) && !file.name.match(/\.(mp4|mov|webm|mkv)$/i)) {
    throw new Error('INVALID_TYPE')
  }
  if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE')
  }
  const duration = await getVideoDuration(file)
  if (duration > MAX_VIDEO_DURATION_SEC + 0.5) {
    throw new Error('TOO_LONG')
  }
  return { duration }
}

/**
 * Full upload flow:
 *   1. Validate locally
 *   2. POST metadata to our Edge Function → get a direct Cloudflare upload URL
 *   3. POST the file straight to Cloudflare (with progress)
 */
export async function uploadCreatorVideo(
  file: File,
  metadata: UploadMetadata,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  // 1. Client-side validation
  await validateVideoFile(file)

  // 2. Request the upload URL from our Edge Function
  const { data, error } = await supabase.functions.invoke('creator-upload-url', {
    body: {
      ...metadata,
      max_duration_seconds: MAX_VIDEO_DURATION_SEC,
    },
  })

  if (error) {
    // Supabase wraps edge function errors in FunctionsHttpError.
    // The actual message is in the response body — we need to parse it async.
    let msg = (error as Error).message || 'EDGE_FUNCTION_FAILED'

    const ctx = (error as any)?.context
    if (ctx) {
      try {
        // FunctionsHttpError.context is a Response object
        const body = typeof ctx.json === 'function' ? await ctx.json() : ctx
        if (body?.error?.message) msg = body.error.message
        else if (body?.error?.code) msg = body.error.code
        else if (body?.message) msg = body.message
        else if (typeof body === 'string') msg = body
      } catch {
        // fallback to generic message from error object
      }
    }

    console.error('[creator-upload] Edge function error:', { raw: error, msg })
    throw new Error(msg)
  }

  if (!data?.upload_url || !data?.creator_video_id) {
    throw new Error('BAD_EDGE_RESPONSE')
  }

  // 3. Upload directly to Cloudflare with progress tracking
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`CLOUDFLARE_UPLOAD_FAILED:${xhr.status}`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('CLOUDFLARE_NETWORK_ERROR')))
    xhr.addEventListener('abort', () => reject(new Error('CLOUDFLARE_UPLOAD_ABORTED')))

    const formData = new FormData()
    formData.append('file', file)

    xhr.open('POST', data.upload_url)
    xhr.send(formData)
  })

  return { creator_video_id: data.creator_video_id, cloudflare_uid: data.cloudflare_uid }
}

/** Human-readable error message for an upload error. Returns the raw message for unmapped codes. */
export function uploadErrorMessage(err: unknown, t: (key: string) => string): string {
  const msg = err instanceof Error ? err.message : String(err)
  const code = msg.split(':')[0].trim()

  const keyMap: Record<string, string> = {
    INVALID_TYPE:           'creator.upload.errors.invalidType',
    FILE_TOO_LARGE:         'creator.upload.errors.fileTooLarge',
    TOO_LONG:               'creator.upload.errors.tooLong',
    INVALID_DURATION:       'creator.upload.errors.unreadable',
    METADATA_READ_FAILED:   'creator.upload.errors.unreadable',
    CLOUDFLARE_UPLOAD_FAILED: 'creator.upload.errors.networkFailed',
    CLOUDFLARE_NETWORK_ERROR: 'creator.upload.errors.networkFailed',
    CLOUDFLARE_UPLOAD_ABORTED: 'creator.upload.errors.aborted',
    NOT_A_CREATOR:          'creator.upload.errors.notACreator',
    PLAN_UPLOAD_LIMIT_REACHED: 'creator.upload.errors.uploadLimitReached',
  }

  // If there's a known translation key, use it
  if (keyMap[code]) return t(keyMap[code])

  // Otherwise surface the raw server message directly — much more useful for debugging
  return msg || t('common.errorGeneric')
}

/** @deprecated use uploadErrorMessage */
export function uploadErrorKey(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const code = msg.split(':')[0].trim()
  switch (code) {
    case 'INVALID_TYPE':   return 'creator.upload.errors.invalidType'
    case 'FILE_TOO_LARGE': return 'creator.upload.errors.fileTooLarge'
    case 'TOO_LONG':       return 'creator.upload.errors.tooLong'
    case 'NOT_A_CREATOR':  return 'creator.upload.errors.notACreator'
    default:               return 'common.errorGeneric'
  }
}
