import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, ThumbsDown, MessageCircle, Gift } from 'lucide-react'
import { useMyInteraction, useSetInteraction } from '@/hooks/useSocial'
import CommentsSheet from '@/components/CommentsSheet'
import type { Video } from '@/types/db'
import { cn } from '@/lib/utils'

interface Props {
  video: Video
  className?: string
}

export default function VideoSocialActions({ video, className }: Props) {
  const { t } = useTranslation()
  const [commentsOpen, setCommentsOpen] = useState(false)

  const { data: myInteraction } = useMyInteraction(video.id)
  const interactMut = useSetInteraction(video.id)

  const liked = myInteraction === 'like'
  const disliked = myInteraction === 'dislike'

  const handleLike = () => {
    interactMut.mutate(liked ? null : 'like')
  }
  const handleDislike = () => {
    interactMut.mutate(disliked ? null : 'dislike')
  }

  const likeCount = video.like_count ?? 0
  const dislikeCount = video.dislike_count ?? 0
  const commentCount = video.comment_count ?? 0

  return (
    <>
      <div className={cn('flex flex-col items-center gap-4', className)}>
        {/* Like */}
        <ActionBtn
          icon={<Heart className={cn('w-6 h-6', liked ? 'fill-rose-500 text-rose-500' : 'text-white')} />}
          label={fmtCount(likeCount)}
          onClick={handleLike}
          active={liked}
        />

        {/* Dislike */}
        <ActionBtn
          icon={<ThumbsDown className={cn('w-6 h-6', disliked ? 'fill-neutral-300 text-neutral-300' : 'text-white')} />}
          label={fmtCount(dislikeCount)}
          onClick={handleDislike}
          active={disliked}
        />

        {/* Comments */}
        <ActionBtn
          icon={<MessageCircle className="w-6 h-6 text-white" />}
          label={fmtCount(commentCount)}
          onClick={() => setCommentsOpen(true)}
        />

        {/* Gift — coming soon */}
        <div className="flex flex-col items-center gap-1 relative">
          <button
            type="button"
            onClick={() => {}} // coming soon
            className="w-11 h-11 rounded-full bg-white/15 backdrop-blur flex items-center justify-center"
          >
            <Gift className="w-6 h-6 text-amber-300" />
          </button>
          <span className="text-[9px] text-white/70 font-medium">{t('social.gift')}</span>
          <div className="absolute -top-2 -end-1 bg-amber-400 text-[8px] font-bold text-neutral-900 px-1 rounded-full">
            {t('social.soon')}
          </div>
        </div>
      </div>

      <CommentsSheet
        video={video}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </>
  )
}

function ActionBtn({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1"
    >
      <div className={cn(
        'w-11 h-11 rounded-full backdrop-blur flex items-center justify-center transition-all',
        active ? 'bg-white/25 scale-110' : 'bg-white/15 hover:bg-white/25'
      )}>
        {icon}
      </div>
      {label !== '0' && (
        <span className="text-[11px] text-white font-semibold">{label}</span>
      )}
    </button>
  )
}

function fmtCount(n: number): string {
  if (n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
