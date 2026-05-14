import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Grid3x3, Play, Loader2, UserPlus, UserCheck, Video, Heart, Eye } from 'lucide-react'
import {
  useCreatorProfile,
  useCreatorVideos,
  useIsFollowing,
  useToggleFollow,
} from '@/hooks/useSocial'
import { useAuth } from '@/stores/auth'
import type { Video as VideoType } from '@/types/db'
import { getYouTubeThumbnail } from '@/lib/youtube'
import { cn } from '@/lib/utils'

export default function CreatorProfile() {
  const { userId } = useParams<{ userId: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentUserId = useAuth((s) => s.user?.id)
  const isOwn = currentUserId === userId

  const { data: profile, isLoading: profileLoading } = useCreatorProfile(userId)
  const { data: videos = [], isLoading: videosLoading } = useCreatorVideos(userId)
  const { data: isFollowing = false } = useIsFollowing(userId)
  const toggleFollowMut = useToggleFollow(userId!)

  const isLoading = profileLoading || videosLoading

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-3">
        <Video className="w-12 h-12 text-neutral-700" />
        <p className="text-neutral-700">{t('creator.profile.notFound')}</p>
        <button onClick={() => navigate(-1)} className="btn-outline">{t('common.back')}</button>
      </div>
    )
  }

  const initials = profile.name?.charAt(0)?.toUpperCase() || '?'

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-neutral-200 flex items-center px-4 py-3 gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-neutral-100 rounded-full">
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
        </button>
        <span className="font-bold flex-1 truncate">{profile.name || t('creator.profile.title')}</span>
      </div>

      {/* Profile section */}
      <div className="px-4 pt-6 pb-4 text-center">
        {/* Avatar */}
        <div className="relative inline-block mb-3">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.name || ''}
              className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-white shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-4xl font-extrabold mx-auto shadow-lg">
              {initials}
            </div>
          )}
        </div>

        <h1 className="text-xl font-extrabold mb-1">{profile.name || 'Creator'}</h1>
        {profile.bio && <p className="text-sm text-neutral-700 mb-3 max-w-xs mx-auto">{profile.bio}</p>}

        {/* Stats row */}
        <div className="flex justify-center gap-8 mb-4">
          <StatCell label={t('creator.profile.videos')} value={profile.video_count} />
          <StatCell label={t('creator.profile.followers')} value={profile.follower_count} />
          <StatCell label={t('creator.profile.likes')} value={profile.total_likes} />
        </div>

        {/* Follow button (only shown for other creators) */}
        {!isOwn && (
          <button
            onClick={() => toggleFollowMut.mutate(isFollowing)}
            disabled={toggleFollowMut.isPending}
            className={cn(
              'inline-flex items-center gap-2 px-8 py-2.5 rounded-full font-bold text-sm transition-all',
              isFollowing
                ? 'border-2 border-neutral-300 text-neutral-900 hover:border-danger hover:text-danger'
                : 'bg-primary text-white hover:bg-primary/90'
            )}
          >
            {isFollowing
              ? <><UserCheck className="w-4 h-4" />{t('creator.profile.following')}</>
              : <><UserPlus className="w-4 h-4" />{t('creator.profile.follow')}</>}
          </button>
        )}

        {isOwn && (
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => navigate('/creator/videos')}
              className="btn-outline text-sm"
            >
              {t('creator.myVideos.title')}
            </button>
            <button
              onClick={() => navigate('/creator/upload')}
              className="btn-primary text-sm"
            >
              {t('creator.upload.title')}
            </button>
          </div>
        )}
      </div>

      {/* Videos grid */}
      <div className="border-t border-neutral-200">
        <div className="flex px-4 py-2 border-b border-neutral-200">
          <button className="flex items-center gap-2 text-sm font-semibold text-primary border-b-2 border-primary pb-1 px-2">
            <Grid3x3 className="w-4 h-4" />
            {t('creator.profile.videos')}
          </button>
        </div>

        {videos.length === 0 ? (
          <div className="text-center py-12">
            <Video className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
            <p className="text-sm text-neutral-700">{t('creator.profile.noVideos')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {videos.map((v, idx) => (
              <VideoThumbnailCard
                key={v.id}
                video={v}
                index={idx}
                onPlay={() => navigate(`/creator/${userId}/feed?start=${idx}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-extrabold">{fmtCount(value)}</div>
      <div className="text-xs text-neutral-700">{label}</div>
    </div>
  )
}

function VideoThumbnailCard({
  video,
  index,
  onPlay,
}: {
  video: VideoType
  index: number
  onPlay: () => void
}) {
  const thumb = video.thumbnail_url || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id) : '')
  return (
    <button
      type="button"
      onClick={onPlay}
      className="relative aspect-[9/16] bg-neutral-300 overflow-hidden group"
    >
      {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
        <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 ms-1" fill="white" />
      </div>
      {/* Stats overlay */}
      {(video.like_count ?? 0) > 0 && (
        <div className="absolute bottom-1 start-1 flex items-center gap-1 text-white text-xs">
          <Heart className="w-3 h-3 fill-white" />
          <span>{fmtCount(video.like_count ?? 0)}</span>
        </div>
      )}
      {(video.view_count ?? 0) > 0 && (
        <div className="absolute bottom-1 end-1 flex items-center gap-1 text-white text-xs">
          <Eye className="w-3 h-3" />
          <span>{fmtCount(video.view_count ?? 0)}</span>
        </div>
      )}
    </button>
  )
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
