type NotificationLike = {
  type?: string | null
  deep_link?: string | null
  data?: any
}

function valueFromData(data: any, keys: string[]) {
  if (!data || typeof data !== 'object') return null
  for (const key of keys) {
    const value = data[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  if (data.extra && typeof data.extra === 'object') {
    for (const key of keys) {
      const value = data.extra[key]
      if (value != null && String(value).trim()) return String(value).trim()
    }
  }
  return null
}

function normalizeDeepLink(value?: string | null) {
  const link = String(value || '').trim()
  if (!link || link === '/notifications' || link === 'notifications') return null
  if (link.startsWith('/(tabs)/feed')) return link.replace('/(tabs)/feed', '/feed')
  return link
}

export function getNotificationTargetPath(notification: NotificationLike) {
  const type = String(notification.type || '').toLowerCase()
  const data = notification.data || {}
  const videoId = valueFromData(data, ['video_id', 'videoId'])
  const creatorVideoId = valueFromData(data, ['creator_video_id', 'creatorVideoId'])
  const profileId = valueFromData(data, ['profile_id', 'profileId', 'sender_id', 'senderId', 'follower_id', 'followerId', 'commenter_id', 'commenterId', 'liker_id', 'likerId'])

  if (type === 'comment' && videoId) {
    return `/feed?videoId=${encodeURIComponent(videoId)}&openComments=1`
  }

  if ((type === 'like' || type === 'gift') && videoId) {
    return `/feed?videoId=${encodeURIComponent(videoId)}`
  }

  if (creatorVideoId) {
    return `/feed?videoId=${encodeURIComponent(creatorVideoId)}${type === 'comment' ? '&openComments=1' : ''}`
  }

  const normalizedDeepLink = normalizeDeepLink(notification.deep_link)
  if (normalizedDeepLink) return normalizedDeepLink

  if ((type === 'follow' || type === 'gift') && profileId) {
    return `/creator/${encodeURIComponent(profileId)}`
  }

  return '/notifications'
}
