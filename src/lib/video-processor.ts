/**
 * Browser-side video processing using FFmpeg.wasm.
 *
 * Loads the WASM core lazily from /public/ffmpeg/ on first use.
 * Operations: trim (start → start+30s) + compress to 720p/480p.
 *
 * Note: @ffmpeg/core-st (single-threaded) is used so NO
 * Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers
 * are needed on the host.
 */

import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

export type ProgressCallback = (pct: number, stage: 'loading' | 'trimming' | 'compressing') => void

export interface ProcessResult {
  file: File
  durationSec: number
  originalSizeMB: number
  outputSizeMB: number
  compressionRatio: number
}

let ffmpegInstance: ReturnType<typeof createFFmpeg> | null = null
let loading = false
let loadedPromise: Promise<void> | null = null

async function getFFmpeg(): Promise<ReturnType<typeof createFFmpeg>> {
  if (ffmpegInstance && ffmpegInstance.isLoaded()) return ffmpegInstance

  if (loading && loadedPromise) {
    await loadedPromise
    return ffmpegInstance!
  }

  ffmpegInstance = createFFmpeg({
    corePath: '/ffmpeg/ffmpeg-core.js',
    mainName: 'main',
    log: import.meta.env.DEV,
  })

  loading = true
  loadedPromise = ffmpegInstance.load()
  await loadedPromise
  loading = false

  return ffmpegInstance
}

/**
 * Detect the native resolution by creating a temporary video element.
 */
async function getVideoResolution(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({ w: v.videoWidth, h: v.videoHeight })
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ w: 1280, h: 720 })
    }
    v.src = url
  })
}

/**
 * Detect total video duration in seconds.
 */
async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(v.duration) ? v.duration : 30)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(30)
    }
    v.src = url
  })
}

/**
 * Build the FFmpeg scale + quality args based on input resolution.
 *
 * Strategy:
 *  - If input height > 720 → scale down to 720p, bitrate 1400k
 *  - If input height > 480 → keep 720p scale, bitrate 1100k
 *  - If input height ≤ 480 → keep native, bitrate 750k
 *  - Always: CRF 26, preset veryfast, AAC 128k
 */
function buildCompressionArgs(
  inputW: number,
  inputH: number
): { scale: string; videoBitrate: string } {
  if (inputH > 720) {
    // Portrait video: scale so height=720, width auto-even
    const outH = 720
    const outW = Math.round((inputW / inputH) * outH / 2) * 2
    return { scale: `${outW}:${outH}`, videoBitrate: '1400k' }
  }
  if (inputH > 480) {
    const outH = Math.min(inputH, 720)
    const outW = Math.round((inputW / inputH) * outH / 2) * 2
    return { scale: `${outW}:${outH}`, videoBitrate: '1100k' }
  }
  // ≤ 480p — keep native, just compress bitrate
  const outW = Math.round(inputW / 2) * 2
  return { scale: `${outW}:${inputH}`, videoBitrate: '750k' }
}

/**
/**
 * Trim a video file FAST using stream copy.
 *
 * The previous version re-encoded the video on the main thread (libx264 +
 * CRF 26) which froze the browser tab. Cloudflare Stream handles
 * transcoding server-side anyway, so client-side compression is redundant
 * and risky on low-end devices.
 *
 * Now we just trim with `-c copy` (no re-encode) which finishes in
 * milliseconds even for long inputs.
 */
export async function processVideo(
  file: File,
  startSec: number,
  durationSec: number,
  onProgress?: ProgressCallback
): Promise<ProcessResult> {
  onProgress?.(0, 'loading')

  // Fast path: file is already short enough → upload as-is
  if (file.size < 30 * 1024 * 1024 && durationSec >= (await getVideoDuration(file)) - 0.5) {
    onProgress?.(100, 'trimming')
    return {
      file,
      durationSec,
      originalSizeMB: file.size / 1024 / 1024,
      outputSizeMB: file.size / 1024 / 1024,
      compressionRatio: 1,
    }
  }

  const ff = await getFFmpeg()

  ff.setProgress(({ ratio }: { ratio: number }) => {
    const pct = Math.min(99, Math.round(ratio * 100))
    onProgress?.(pct, 'trimming')
  })

  const inputName = 'input.mp4'
  const outputName = 'output.mp4'
  const safeDuration = Math.max(1, Math.min(durationSec, 30))

  ff.FS('writeFile', inputName, await fetchFile(file))

  // Stream-copy trim — no re-encode, no UI blocking
  // -ss BEFORE -i = fast seek; -c copy = no re-encode
  const args = [
    '-ss', String(startSec),
    '-i', inputName,
    '-t', String(safeDuration),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    '-y',
    outputName,
  ]

  try {
    await ff.run(...args)
  } catch {
    // Stream copy failed (uncommon container/codec issue). Fall back to a
    // very light re-encode at the same resolution but veryfast preset.
    const fallbackArgs = [
      '-ss', String(startSec),
      '-i', inputName,
      '-t', String(safeDuration),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      '-y',
      outputName,
    ]
    await ff.run(...fallbackArgs)
  }

  const data = ff.FS('readFile', outputName)
  const blob = new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: 'video/mp4' })
  const outputFile = new File([blob], 'processed.mp4', { type: 'video/mp4' })

  try { ff.FS('unlink', inputName) } catch {}
  try { ff.FS('unlink', outputName) } catch {}

  onProgress?.(100, 'trimming')

  return {
    file: outputFile,
    durationSec: safeDuration,
    originalSizeMB: file.size / 1024 / 1024,
    outputSizeMB: outputFile.size / 1024 / 1024,
    compressionRatio: file.size / outputFile.size,
  }
}

/**
 * Extract a list of thumbnail images from a video file for the trim UI.
 * Returns an array of data-URLs (one per `count` evenly-spaced frames).
 */
export async function extractThumbnails(
  file: File,
  count: number = 12
): Promise<string[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.src = url

    const thumbs: string[] = []
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = 80
    canvas.height = 45 // 16:9

    video.onloadedmetadata = () => {
      const duration = video.duration
      const times = Array.from({ length: count }, (_, i) =>
        (i / (count - 1)) * duration
      )

      let i = 0
      const captureNext = () => {
        if (i >= times.length) {
          URL.revokeObjectURL(url)
          resolve(thumbs)
          return
        }
        video.currentTime = times[i]
      }

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        thumbs.push(canvas.toDataURL('image/jpeg', 0.6))
        i++
        captureNext()
      }

      video.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(thumbs)
      }

      captureNext()
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve([])
    }
  })
}
