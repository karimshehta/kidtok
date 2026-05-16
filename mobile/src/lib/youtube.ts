export function getYouTubeThumbnail(videoId: string, quality: 'default' | 'hq' | 'max' = 'hq'): string {
  const map = { default: 'default', hq: 'hqdefault', max: 'maxresdefault' }
  return `https://img.youtube.com/vi/${videoId}/${map[quality]}.jpg`
}
