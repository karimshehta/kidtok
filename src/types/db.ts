// Domain types matching the Supabase schema

export interface Age {
  id: number
  name_ar: string
  name_en: string
  min_age: number
  max_age: number
  sort_order: number
}

export interface Interest {
  id: number
  name_ar: string
  name_en: string
  image_url: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
}

export type Gender = 'male' | 'female'

export interface Child {
  id: string
  parent_id: string
  name: string
  image_url: string | null
  gender: Gender | null
  age_id: number | null
  created_at: string
  updated_at: string
  // joined
  age?: Age | null
  interests?: Interest[]
}

export interface Playlist {
  id: string
  child_id: string
  parent_id: string
  name: string
  description: string | null
  image_url: string | null
  created_at: string
  updated_at: string
  // counts
  video_count?: number
}

export interface Video {
  id: string
  youtube_id: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  duration_seconds: number | null
  channel_name: string | null
  channel_id: string | null
  age_id: number | null
  interest_id: number | null
  is_suggested: boolean
  added_count: number
  is_active: boolean
  source: 'youtube' | 'creator'
  added_by: string | null
  created_at: string
}

export interface PlaylistVideo {
  id: string
  playlist_id: string
  video_id: string
  position: number
  added_at: string
  video?: Video
}
