import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Send, Loader2, MessageCircle, Trash2 } from 'lucide-react'
import { useComments, useAddComment, useDeleteComment } from '@/hooks/useSocial'
import { useAuth } from '@/stores/auth'
import { format } from 'date-fns'
import type { Video } from '@/types/db'
import { cn } from '@/lib/utils'

interface Props {
  video: Video
  open: boolean
  onClose: () => void
}

export default function CommentsSheet({ video, open, onClose }: Props) {
  const { t } = useTranslation()
  const userId = useAuth((s) => s.user?.id)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')

  const { data: comments = [], isLoading } = useComments(open ? video.id : undefined)
  const addMut = useAddComment(video.id)
  const deleteMut = useDeleteComment(video.id)

  // Scroll to bottom on new comment
  useEffect(() => {
    if (comments.length > 0) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [comments.length])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || addMut.isPending) return
    setText('')
    await addMut.mutateAsync(trimmed)
    inputRef.current?.focus()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Sheet */}
      <div
        className="relative bg-white w-full max-h-[75vh] rounded-t-3xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-neutral-300 rounded-full mx-auto mt-3 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" />
            <h2 className="font-bold">
              {t('social.comments')} · {video.comment_count ?? 0}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-neutral-200 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comments list */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[120px]">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-10">
              <MessageCircle className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-700">{t('social.noComments')}</p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start gap-3 group">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {c.profile?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.profile?.name || 'User'}</span>
                    <span className="text-xs text-neutral-700">
                      {format(new Date(c.created_at), 'MMM d, HH:mm')}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5 break-words">{c.content}</p>
                </div>
                {c.user_id === userId && (
                  <button
                    onClick={() => deleteMut.mutate(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-neutral-200 rounded"
                    title={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-neutral-700" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="border-t border-neutral-200 px-4 py-3 flex items-center gap-3 bg-white pb-safe">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {userId ? 'أ' : '?'}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            maxLength={500}
            className="flex-1 bg-neutral-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            placeholder={t('social.addComment')}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || addMut.isPending}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all',
              text.trim() ? 'bg-primary text-white scale-105' : 'bg-neutral-200 text-neutral-700'
            )}
          >
            {addMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4 rtl:rotate-180" />}
          </button>
        </div>
      </div>
    </div>
  )
}
