export function extractYouTubeId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function getYouTubeThumbnail(videoId: string, quality: 'default' | 'hq' | 'max' = 'hq'): string {
  const map = { default: 'default', hq: 'hqdefault', max: 'maxresdefault' }
  return `https://img.youtube.com/vi/${videoId}/${map[quality]}.jpg`
}

export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export function getYouTubeEmbedUrl(videoId: string, autoplay = false): string {
  return `https://www.youtube.com/embed/${videoId}${autoplay ? '?autoplay=1' : ''}`
}

interface OEmbedResponse {
  title: string
  author_name: string
  author_url: string
  thumbnail_url: string
  html: string
}

/** Fetch video metadata via YouTube oembed (no API key needed). */
export async function fetchYouTubeOEmbed(videoId: string): Promise<OEmbedResponse | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
