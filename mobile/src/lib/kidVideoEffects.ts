import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'

import { getKidVoice } from '@/lib/kidVoices'

const BASE_SAMPLE_RATE = 48_000

type FfmpegKitModule = {
  FFmpegKit: {
    executeWithArguments: (args: string[]) => Promise<any>
  }
  FFprobeKit: {
    getMediaInformation: (filePath: string) => Promise<any>
  }
  ReturnCode: {
    isSuccess: (returnCode: any) => boolean
  }
}

let ffmpegModulePromise: Promise<FfmpegKitModule | null> | null = null

async function loadFfmpegKit(): Promise<FfmpegKitModule | null> {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') {
    return null
  }

  if (!ffmpegModulePromise) {
    ffmpegModulePromise = import('@wokcito/ffmpeg-kit-react-native')
      .then((mod) => mod as unknown as FfmpegKitModule)
      .catch((error) => {
        console.warn('[kid-video-effects] FFmpegKit is unavailable:', error)
        return null
      })
  }

  return ffmpegModulePromise
}

function toFfmpegFilePath(uri: string) {
  if (uri.startsWith('file://')) return decodeURIComponent(uri.replace('file://', ''))
  return uri
}

export function isGeneratedKidVoiceUri(uri?: string | null) {
  return !!uri && uri.includes('/kidtok_voice_')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

// Curated character profiles. Pitch is intentionally subtle; most of the
// identity comes from EQ, dynamics and a restrained texture. This keeps speech
// understandable for children and avoids the old chipmunk/slow-motion sound.
const CHARACTER_FX: Record<string, string> = {
  natural: 'equalizer=f=2600:t=q:w=1.2:g=1.5',
  bright: 'treble=g=2.5:f=3500,equalizer=f=4500:t=q:w=1.1:g=1.5',
  story: 'bass=g=1.8:f=180,aecho=0.75:0.18:55:0.08',
  robot: 'highpass=f=180,lowpass=f=4200,acrusher=bits=10:mode=log:aa=1,tremolo=f=32:d=0.32,aecho=0.8:0.2:18:0.08',
  cartoon: 'treble=g=2:f=3600,flanger=delay=2:depth=2:regen=8:width=40:speed=0.4',
  giant: 'bass=g=4:f=140,treble=g=-1.5,aecho=0.8:0.2:45:0.1',
  space: 'highpass=f=280,lowpass=f=3500,aecho=0.75:0.25:45|95:0.12|0.06',
  magic: 'treble=g=3:f=4500,flanger=delay=2:depth=1.5:regen=5:width=35:speed=0.3,aecho=0.85:0.18:60:0.08',
}

// Phone mics pick up handling rumble and hiss that the character effects
// (bass boosts, pitch-downs) would otherwise amplify into an ugly hum at the
// start of clips. Clean first, colour later.
const CLEANUP_FX = 'highpass=f=95,afftdn=nr=8:nf=-34,acompressor=threshold=-18dB:ratio=2:attack=15:release=180:makeup=1.8dB'

/**
 * The editor preview and the final upload intentionally use the same helper.
 * `force` is reserved for callers that need to re-render an already generated
 * clip; normal callers avoid stacking an effect on a file twice.
 */
export type KidVoiceEffectOptions = {
  force?: boolean
}

async function hasAudioTrack(filePath: string): Promise<boolean | null> {
  const ffmpeg = await loadFfmpegKit()
  if (!ffmpeg) return null

  try {
    const session = await ffmpeg.FFprobeKit.getMediaInformation(filePath)
    const media = session.getMediaInformation()
    const streams = media?.getStreams?.() || []
    return streams.some((stream: any) => stream.getType?.() === 'audio')
  } catch (error) {
    // FFprobe is only a guard. FFmpeg may still be available even if the
    // inspection call is interrupted while the camera finishes its file.
    console.warn('[kid-video-effects] Could not inspect audio stream:', error)
    return null
  }
}

export async function applyKidVoiceEffect(
  uri: string,
  voiceKey?: string | null,
  options: KidVoiceEffectOptions = {},
): Promise<string> {
  const voice = getKidVoice(voiceKey)
  if (!voice || Platform.OS === 'web') return uri
  if (isGeneratedKidVoiceUri(uri) && !options.force) return uri

  const ffmpeg = await loadFfmpegKit()
  if (!ffmpeg) {
    console.warn('[kid-video-effects] Skipping voice effect because FFmpegKit is unavailable on this platform')
    return uri
  }

  const cacheDir = FileSystem.cacheDirectory
  if (!cacheDir) return uri

  // FFmpegKit is most reliable with local file paths. If a content:// URI ever
  // reaches this point, skip the effect rather than blocking upload.
  if (uri.startsWith('content://')) {
    console.warn('[kid-video-effects] Skipping voice effect for content URI')
    return uri
  }

  // Match the bundled spoken preview. Camera audio is normalised to 48 kHz
  // first so the pitch ratio is stable across Android devices.
  const pitchFactor = clamp(Number(voice.pitchFactor || 1), 0.72, 1.32)
  const characterFx = CHARACTER_FX[voice.effectId]
  const hasPitch = Math.abs(pitchFactor - 1) >= 0.02
  if (!hasPitch && !characterFx) return uri

  const inputPath = toFfmpegFilePath(uri)
  const sourceHasAudio = await hasAudioTrack(inputPath)
  if (sourceHasAudio === false) {
    // A video without a microphone track cannot receive a voice filter. Keep
    // publishing it rather than turning a recoverable media issue into a
    // failed post.
    console.warn('[kid-video-effects] Source video has no audio stream')
    return uri
  }
  const outputUri = `${cacheDir}kidtok_voice_${Date.now()}.mp4`
  const outputPath = toFfmpegFilePath(outputUri)
  const shiftedRate = Math.max(8_000, Math.round(BASE_SAMPLE_RATE * pitchFactor))
  const tempoCorrection = clamp(1 / pitchFactor, 0.5, 2)
  const audioFilter = [
    `aresample=${BASE_SAMPLE_RATE}`,
    CLEANUP_FX,
    ...(hasPitch
      ? [`asetrate=${shiftedRate}`, `aresample=${BASE_SAMPLE_RATE}`, `atempo=${tempoCorrection.toFixed(4)}`]
      : []),
    ...(characterFx ? [characterFx] : []),
    // Effects add energy (bass boosts, echoes) — keep peaks from clipping.
    // level=disabled stops alimiter's auto make-up gain from pushing the
    // limited signal back up to 0 dBFS, keeping real headroom for AAC.
    'alimiter=limit=0.92:level=disabled',
  ].join(',')

  const args = [
    '-y',
    '-i', inputPath,
    '-map', '0:v:0?',
    '-map', '0:a:0?',
    '-map_metadata', '0',
    '-c:v', 'copy',
    '-filter:a', audioFilter,
    '-c:a', 'aac',
    '-ar', String(BASE_SAMPLE_RATE),
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-shortest',
    outputPath,
  ]

  try {
    const session = await ffmpeg.FFmpegKit.executeWithArguments(args)
    const returnCode = await session.getReturnCode()

    if (!ffmpeg.ReturnCode.isSuccess(returnCode)) {
      const output = await session.getOutput().catch(() => '')
      console.warn('[kid-video-effects] FFmpeg voice effect failed:', output?.slice?.(-400) || returnCode?.getValue?.())
      await cleanupKidVoiceEffectFile(outputUri)
      return uri
    }

    const info = await FileSystem.getInfoAsync(outputUri)
    if (!info.exists || !info.size) {
      await cleanupKidVoiceEffectFile(outputUri)
      return uri
    }

    // A few Android encoders report success while producing a video-only
    // output when their source is still being finalized. Verify the result
    // before choosing it for upload; fallback keeps the child's original
    // audio instead of publishing a silent clip.
    const outputHasAudio = await hasAudioTrack(outputPath)
    if (outputHasAudio === false) {
      console.warn('[kid-video-effects] Generated video has no audio stream')
      await cleanupKidVoiceEffectFile(outputUri)
      return uri
    }

    return outputUri
  } catch (err) {
    console.warn('[kid-video-effects] Could not apply voice effect:', err)
    await cleanupKidVoiceEffectFile(outputUri)
    return uri
  }
}

/**
 * Uploads must never silently downgrade a selected voice to the raw camera
 * audio.  The best-effort helper above is still useful for previews, while
 * this strict wrapper gives publish flows a deterministic failure they can
 * explain to the child and let them retry or choose "No voice".
 */
export async function requireKidVoiceEffect(uri: string, voiceKey: string): Promise<string> {
  const renderedUri = await applyKidVoiceEffect(uri, voiceKey)
  if (renderedUri === uri) {
    if (Platform.OS === 'android') {
      // Android store builds intentionally do not link FFmpegKit because its
      // native binaries can block Google Play's 16 KB page-size compliance.
      // Keep publishing the child's video instead of turning an optional voice
      // choice into a hard upload failure.
      return uri
    }
    const error = new Error('KID_VOICE_EFFECT_UNAVAILABLE')
    error.name = 'KidVoiceEffectError'
    throw error
  }
  return renderedUri
}

export function isKidVoiceEffectUnavailable(error: unknown) {
  return error instanceof Error && error.name === 'KidVoiceEffectError'
}

/**
 * Prepares a WebView-AR clip for preview/upload: converts WebM (VP8/Opus from
 * MediaRecorder on Android) into H.264/AAC MP4 — required by iOS playback and
 * friendlier to Cloudflare — and applies the chosen character voice in the
 * same ffmpeg pass. MP4 recordings keep their video track untouched.
 */
export async function prepareWebArClip(uri: string, voiceKey?: string | null): Promise<string> {
  if (Platform.OS === 'web') return uri
  if (isGeneratedKidVoiceUri(uri)) return uri
  const ffmpeg = await loadFfmpegKit()
  if (!ffmpeg) {
    console.warn('[kid-video-effects] Skipping WebAR clip preparation because FFmpegKit is unavailable on this platform')
    return uri
  }

  const cacheDir = FileSystem.cacheDirectory
  if (!cacheDir) return uri

  const isWebm = uri.toLowerCase().endsWith('.webm')
  const voice = getKidVoice(voiceKey)
  const pitchFactor = voice ? clamp(Number(voice.pitchFactor || 1), 0.72, 1.32) : 1
  const hasPitch = Math.abs(pitchFactor - 1) >= 0.02
  const characterFx = voice ? CHARACTER_FX[voice.effectId] : undefined

  // Nothing to change: already mp4 and no voice requested.
  if (!isWebm && !hasPitch && !characterFx) return uri

  const inputPath = toFfmpegFilePath(uri)
  // Normalization-only output must NOT carry the kidtok_voice_ prefix:
  // applyKidVoiceEffect treats that prefix as "already voiced" and would
  // silently skip applying the chosen voice to the preview.
  const outputUri = voice
    ? `${cacheDir}kidtok_voice_${Date.now()}.mp4`
    : `${cacheDir}kidtok_webar_norm_${Date.now()}.mp4`
  const outputPath = toFfmpegFilePath(outputUri)
  const shiftedRate = Math.max(8_000, Math.round(BASE_SAMPLE_RATE * pitchFactor))
  const tempoCorrection = clamp(1 / pitchFactor, 0.5, 2)
  const audioFilter = [
    CLEANUP_FX,
    ...(hasPitch
      ? [`asetrate=${shiftedRate}`, `aresample=${BASE_SAMPLE_RATE}`, `atempo=${tempoCorrection.toFixed(4)}`]
      : []),
    ...(characterFx ? [characterFx] : []),
    'alimiter=limit=0.92:level=disabled',
  ].join(',')

  const args = [
    '-y',
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    ...(isWebm
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'copy']),
    '-filter:a', audioFilter,
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputPath,
  ]

  try {
    const session = await ffmpeg.FFmpegKit.executeWithArguments(args)
    const returnCode = await session.getReturnCode()
    if (!ffmpeg.ReturnCode.isSuccess(returnCode)) {
      const output = await session.getOutput().catch(() => '')
      console.warn('[kid-video-effects] WebAR prepare failed:', output?.slice?.(-400) || returnCode?.getValue?.())
      await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => {})
      return uri
    }
    const info = await FileSystem.getInfoAsync(outputUri)
    if (!info.exists || !info.size) {
      await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => {})
      return uri
    }
    return outputUri
  } catch (err) {
    console.warn('[kid-video-effects] Could not prepare WebAR clip:', err)
    await FileSystem.deleteAsync(outputUri, { idempotent: true }).catch(() => {})
    return uri
  }
}

export async function cleanupKidVoiceEffectFile(uri?: string | null) {
  if (!isGeneratedKidVoiceUri(uri)) return
  try {
    await FileSystem.deleteAsync(uri as string, { idempotent: true })
  } catch {
    // Temporary cache cleanup is best-effort only.
  }
}
