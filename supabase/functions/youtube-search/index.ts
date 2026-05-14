// POST /functions/v1/youtube-search
//
// Auth: requires logged-in user.
// Body: { query: string }
// Returns filtered YouTube results safe for in-app embedding.

import { handlePreflight, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getServiceClient, requireUser } from '../_shared/supabase.ts'

interface SearchRequest {
  query?: string
  video_id?: string
}

interface YouTubeSearchItem {
  id?: { videoId?: string }
}

interface YouTubeVideoItem {
  id: string
  snippet?: {
    title?: string
    channelTitle?: string
    channelId?: string
    thumbnails?: Record<string, { url: string }>
  }
  contentDetails?: {
    duration?: string
  }
  status?: {
    embeddable?: boolean
  }
}

function parseDurationSeconds(value = 'PT0S'): number {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return 0
  const [, h = '0', m = '0', s = '0'] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

function csvSet(value?: string | null): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  )
}

function keywordList(value?: string | null): string[] {
  return (value || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const user = await requireUser(req)
  if (!user) return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')

  let body: SearchRequest
  try {
    body = (await req.json()) as SearchRequest
  } catch {
    return errorResponse('Invalid JSON', 400, 'BAD_JSON')
  }

  const query = (body.query || '').trim()
  const directVideoId = (body.video_id || '').trim()
  if (!directVideoId && query.length < 2) return errorResponse('Search query is too short', 400, 'QUERY_TOO_SHORT')
  if (query.length > 80) return errorResponse('Search query is too long', 400, 'QUERY_TOO_LONG')
  if (directVideoId && !/^[a-zA-Z0-9_-]{11}$/.test(directVideoId)) {
    return errorResponse('Invalid YouTube video id', 400, 'INVALID_VIDEO_ID')
  }

  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) return errorResponse('YouTube API is not configured', 500, 'YOUTUBE_API_KEY_MISSING')

  const admin = getServiceClient()
  const { data: settings } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'youtube_max_duration_seconds',
      'youtube_blocked_keywords',
      'youtube_blocked_channel_ids',
      'youtube_allowed_channel_ids',
      'youtube_require_approved_channels',
    ])

  const cfg: Record<string, string> = {}
  for (const row of settings || []) cfg[row.key] = row.value ?? ''

  const maxDuration = Math.max(30, Number.parseInt(cfg.youtube_max_duration_seconds || '1200', 10))
  const blockedKeywords = keywordList(cfg.youtube_blocked_keywords)
  const blockedChannels = csvSet(cfg.youtube_blocked_channel_ids)
  const allowedChannels = csvSet(cfg.youtube_allowed_channel_ids)
  const requireApprovedChannels = cfg.youtube_require_approved_channels === 'true'

  let ids: string[] = directVideoId ? [directVideoId] : []

  if (!directVideoId) {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
    searchUrl.searchParams.set('key', apiKey)
    searchUrl.searchParams.set('part', 'id')
    searchUrl.searchParams.set('q', query)
    searchUrl.searchParams.set('type', 'video')
    searchUrl.searchParams.set('maxResults', '12')
    searchUrl.searchParams.set('safeSearch', 'strict')
    searchUrl.searchParams.set('videoEmbeddable', 'true')
    searchUrl.searchParams.set('videoSyndicated', 'true')
    searchUrl.searchParams.set('fields', 'items(id/videoId)')

    const searchRes = await fetch(searchUrl)
    if (!searchRes.ok) {
      console.error('YouTube search error', searchRes.status, await searchRes.text())
      return errorResponse('YouTube search failed', 502, 'YOUTUBE_SEARCH_FAILED')
    }

    const searchJson = await searchRes.json()
    ids = ((searchJson.items || []) as YouTubeSearchItem[])
      .map((item) => item.id?.videoId)
      .filter(Boolean) as string[]
  }

  if (ids.length === 0) return jsonResponse({ ok: true, results: [] })

  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
  videosUrl.searchParams.set('key', apiKey)
  videosUrl.searchParams.set('part', 'snippet,contentDetails,status')
  videosUrl.searchParams.set('id', ids.join(','))
  videosUrl.searchParams.set(
    'fields',
    'items(id,snippet(title,channelTitle,channelId,thumbnails),contentDetails(duration),status(embeddable))'
  )

  const videosRes = await fetch(videosUrl)
  if (!videosRes.ok) {
    console.error('YouTube videos error', videosRes.status, await videosRes.text())
    return errorResponse('YouTube metadata lookup failed', 502, 'YOUTUBE_METADATA_FAILED')
  }

  const videosJson = await videosRes.json()
  const results = ((videosJson.items || []) as YouTubeVideoItem[])
    .filter((item) => item.status?.embeddable !== false)
    .map((item) => {
      const duration = parseDurationSeconds(item.contentDetails?.duration)
      const title = item.snippet?.title || 'YouTube Video'
      const channelName = item.snippet?.channelTitle || ''
      const channelId = item.snippet?.channelId || ''
      const text = `${title} ${channelName}`.toLowerCase()
      const thumbnail =
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.default?.url ||
        `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`

      return {
        youtube_id: item.id,
        title,
        channel_name: channelName,
        channel_id: channelId,
        thumbnail_url: thumbnail,
        duration_seconds: duration,
        blocked:
          duration <= 0 ||
          duration > maxDuration ||
          blockedChannels.has(channelId) ||
          (requireApprovedChannels && !allowedChannels.has(channelId)) ||
          blockedKeywords.some((kw) => text.includes(kw)),
      }
    })
    .filter((item) => !item.blocked)
    .map(({ blocked: _blocked, ...item }) => item)

  return jsonResponse({ ok: true, results })
})
