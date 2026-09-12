import { createVideoThumbnail } from 'react-native-compressor'

import { supabase } from '@/lib/supabase'

export type CreatorUploadProvider = 'cloudflare' | 'r2'
export type CreatorUploadMethod = 'POST' | 'PUT'
export type CreatorUploadThumbnail = {
  base64: string
  mime: string
}

export interface CreatorUploadUrlData {
  upload_url: string
  upload_method?: CreatorUploadMethod
  storage_provider?: CreatorUploadProvider
  creator_video_id?: string
  [key: string]: any
}

const DEFAULT_PROVIDER: CreatorUploadProvider = 'cloudflare'

export async function getCreatorUploadFunctionName(isAvatarUpload: boolean): Promise<string> {
  const provider = await getCreatorUploadProvider()
  if (provider === 'r2') return 'creator-r2-upload-url'
  return isAvatarUpload ? 'avatar-upload-url' : 'creator-upload-url'
}

export async function completeCreatorR2Upload(
  uploadData: CreatorUploadUrlData,
  durationSeconds?: number,
  sizeBytes?: number,
  thumbnail?: CreatorUploadThumbnail | null
) {
  if (uploadData.storage_provider !== 'r2') return
  if (!uploadData.creator_video_id) throw new Error('Missing creator video id')

  const { error } = await withTimeout(
    supabase.functions.invoke('creator-r2-upload-complete', {
      body: {
        creator_video_id: uploadData.creator_video_id,
        duration_seconds: durationSeconds,
        size_bytes: sizeBytes,
        thumbnail_base64: thumbnail?.base64,
        thumbnail_mime: thumbnail?.mime,
      },
    }),
    45_000,
    'Timed out while publishing R2 upload'
  )
  if (error) throw error
}

export async function maybeCreateCreatorVideoThumbnail(uri: string): Promise<CreatorUploadThumbnail | null> {
  try {
    const thumbnail = await withTimeout(
      createVideoThumbnail(toNativeFileUri(uri), { quality: 0.75 }),
      20_000,
      'Timed out while creating video thumbnail'
    )
    if (!thumbnail?.path) return null

    const mime = normalizeImageMime(thumbnail.mime)
    const base64 = await fileUriToBase64(thumbnail.path)
    if (!base64) return null
    return { base64, mime }
  } catch (err) {
    console.warn('[creator-upload-storage] Thumbnail generation skipped:', err)
    return null
  }
}

export async function uploadVideoFileWithRetry({
  uri,
  url,
  method = 'POST',
  maxRetries = 3,
  onProgress,
  onXhr,
  rtl = false,
}: {
  uri: string
  url: string
  method?: CreatorUploadMethod
  maxRetries?: number
  onProgress?: (pct: number) => void
  onXhr?: (xhr: XMLHttpRequest) => void
  rtl?: boolean
}) {
  let lastErr: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const payload = method === 'PUT'
        ? await withTimeout(fileUriToBlob(uri), 60_000, 'Timed out while preparing upload file')
        : buildUploadForm(uri)

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        onXhr?.(xhr)
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100)
        })
        xhr.open(method, url)
        xhr.timeout = method === 'PUT' ? 180_000 : 300_000
        if (method === 'PUT') xhr.setRequestHeader('Content-Type', 'video/mp4')
        xhr.onload = () => (
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`HTTP ${xhr.status}`))
        )
        xhr.onerror = () => reject(new Error(rtl ? 'فشل الاتصال' : 'Connection failed'))
        xhr.onabort = () => reject(new Error(rtl ? 'تم الإلغاء' : 'Cancelled'))
        xhr.ontimeout = () => reject(new Error(rtl ? 'انتهت مهلة الرفع' : 'Upload timed out'))
        xhr.send(payload as any)
      })

      const sizeBytes = method === 'PUT' && payload instanceof Blob ? payload.size : undefined
      return { sizeBytes }
    } catch (err: any) {
      lastErr = err
      const msg = String(err?.message || '')
      if (/^HTTP 4/.test(msg) || msg.includes('تم الإلغاء') || msg.includes('Cancelled')) throw err
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw lastErr
}

async function getCreatorUploadProvider(): Promise<CreatorUploadProvider> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'creator_upload_storage_provider')
      .maybeSingle()

    if (error) throw error
    if (data?.value === 'r2') return 'r2'
    return DEFAULT_PROVIDER
  } catch (err) {
    console.warn('[creator-upload-storage] Falling back to Cloudflare:', err)
    return DEFAULT_PROVIDER
  }
}

async function fileUriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(toNativeFileUri(uri))
  if (!res.ok) throw new Error(`Failed to read upload file: HTTP ${res.status}`)
  return res.blob()
}

async function fileUriToBase64(uri: string): Promise<string> {
  const blob = await withTimeout(fileUriToBlob(uri), 20_000, 'Timed out while reading thumbnail')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read thumbnail'))
    reader.onloadend = () => {
      const value = String(reader.result || '')
      resolve(value.includes(',') ? value.split(',')[1] : value)
    }
    reader.readAsDataURL(blob)
  })
}

function buildUploadForm(uri: string): FormData {
  const form = new FormData()
  // @ts-ignore React Native FormData accepts { uri, name, type }.
  form.append('file', { uri: toNativeFileUri(uri), name: 'upload.mp4', type: 'video/mp4' })
  return form
}

function normalizeImageMime(mime?: string): string {
  const normalized = String(mime || '').toLowerCase()
  if (normalized === 'image/png') return 'image/png'
  if (normalized === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

function toNativeFileUri(uri: string): string {
  if (/^[A-Za-z]:\\/.test(uri)) {
    return `file:///${uri.replace(/\\/g, '/')}`
  }
  if (uri.startsWith('/')) {
    return `file://${uri}`
  }
  return uri
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}
