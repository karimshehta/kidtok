/**
 * Discover.tsx — Kid-friendly content discovery
 *
 * Two-tab layout:
 *   1. Suggested for you  — admin-curated, filtered by interests + age
 *   2. Your content       — videos already in a child's playlists
 *
 * UX principles:
 *   - Chips (not dropdowns) for fast scanning + tappable on mobile
 *   - Big colorful cards with emoji-rich category labels
 *   - Optimistic UI on "Add" — feels instant
 *   - Empty states with playful illustrations
 *   - Skeleton loaders (no spinners)
 */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, Sparkles, Heart, X, ChevronDown, Loader2, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { useInterests, useAges } from '@/hooks/useReference'
import { useChildren } from '@/hooks/useChildren'
import { cn } from '@/lib/utils'
import { getYouTubeThumbnail } from '@/lib/youtube'

interface SuggestedVideo {
  id: string
  title: string
  thumbnail_url: string | null
  channel_name: string | null
  source: 'youtube' | 'creator'
  youtube_id: string | null
  duration_seconds: number | null
  age_id: number | null
  interest_id: number | null
}

// ════════════════════════════════════════════════════════════════════════════
// Chip — reusable pill button
// ════════════════════════════════════════════════════════════════════════════
function Chip({
  active, onClick, icon, label, color = 'primary',
}: {
  active: boolean; onClick: () => void; icon?: string; label: string; color?: 'primary' | 'secondary'
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-semibold whitespace-nowrap transition-all text-sm',
        'border-2 active:scale-95',
        active
          ? color === 'secondary'
            ? 'bg-secondary text-white border-secondary shadow-md shadow-secondary/30'
            : 'bg-primary text-white border-primary shadow-md shadow-primary/30'
          : 'bg-white text-neutral-800 border-neutral-200 hover:border-primary/50'
      )}
    >
      {icon && <span className="text-base leading-none">{icon}</span>}
      {label}
    </button>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Video Card
// ════════════════════════════════════════════════════════════════════════════
function VideoCard({
  video, onAdd, added, adding, lang,
}: {
  video: SuggestedVideo; onAdd: () => void; added: boolean; adding: boolean; lang: 'ar' | 'en'
}) {
  const thumb = video.thumbnail_url
    || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id, 'max') : '')

  return (
    <div className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all">
      <div className="relative aspect-video bg-neutral-100">
        {thumb && (
          <img
            src={thumb}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement
              if (video.youtube_id) img.src = getYouTubeThumbnail(video.youtube_id, 'default')
            }}
          />
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-xl">
            <Play className="w-6 h-6 text-primary ms-0.5" fill="currentColor" />
          </div>
        </div>
        {video.duration_seconds && (
          <span className="absolute end-2 bottom-2 px-2 py-0.5 rounded-md bg-black/85 text-white text-[11px] font-medium">
            {Math.floor(video.duration_seconds / 60)}:{String(video.duration_seconds % 60).padStart(2, '0')}
          </span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <h3 className="font-bold text-sm line-clamp-2 leading-snug">{video.title}</h3>
        {video.channel_name && (
          <p className="text-xs text-neutral-600 truncate">{video.channel_name}</p>
        )}
        <button
          onClick={onAdd}
          disabled={added || adding}
          className={cn(
            'w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl font-bold text-sm transition-all active:scale-95',
            added
              ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
              : 'bg-primary text-white hover:bg-primary/90 shadow-sm'
          )}
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" />
            : added ? <><Check className="w-4 h-4" /> {lang === 'ar' ? 'تمت الإضافة' : 'Added'}</>
            : <><Plus className="w-4 h-4" /> {lang === 'ar' ? 'إضافة' : 'Add'}</>
          }
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════
type Tab = 'suggested' | 'yours'

export default function Discover() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en'
  const userId = useAuth(s => s.user?.id)
  const qc = useQueryClient()

  const [tab, setTab]               = useState<Tab>('suggested')
  const [interestId, setInterestId] = useState<number | null>(null)
  const [ageId, setAgeId]           = useState<number | null>(null)
  const [addedIds, setAddedIds]     = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState<{ videoId: string } | null>(null)

  const { data: interests = [] } = useInterests()
  const { data: ages = [] }      = useAges()
  const { data: children = [] }  = useChildren()

  // ── Suggested videos ──────────────────────────────────────────────────────
  const { data: suggested = [], isLoading: suggestedLoading } = useQuery({
    queryKey: ['suggested-videos', interestId, ageId],
    enabled: tab === 'suggested',
    queryFn: async (): Promise<SuggestedVideo[]> => {
      const { data, error } = await supabase.rpc('get_suggested_videos', {
        p_interest_id: interestId,
        p_age_id: ageId,
        p_limit: 50,
        p_offset: 0,
      })
      if (error) throw error
      return (data || []) as SuggestedVideo[]
    },
  })

  // ── Your content (videos in any of user's children's playlists) ──────────
  const { data: yourVideos = [], isLoading: yoursLoading } = useQuery({
    queryKey: ['your-content', userId, interestId, ageId],
    enabled: tab === 'yours' && !!userId,
    queryFn: async (): Promise<SuggestedVideo[]> => {
      // Get videos through the parent's playlists
      const { data: pls } = await supabase
        .from('playlists')
        .select('id')
        .eq('user_id', userId!)
      const playlistIds = (pls || []).map((p: any) => p.id)
      if (playlistIds.length === 0) return []

      let q = supabase
        .from('playlist_videos')
        .select('video:videos(id, title, thumbnail_url, channel_name, source, youtube_id, duration_seconds, age_id, interest_id)')
        .in('playlist_id', playlistIds)
        .limit(100)
      const { data, error } = await q
      if (error) throw error
      const videos = (data || []).map((row: any) => row.video).filter(Boolean) as SuggestedVideo[]
      // Apply filters client-side
      return videos.filter(v =>
        (!interestId || v.interest_id === interestId) &&
        (!ageId      || v.age_id === ageId)
      )
    },
  })

  // ── Add to playlist mutation ──────────────────────────────────────────────
  const addMut = useMutation({
    mutationFn: async ({ videoId, playlistId }: { videoId: string; playlistId: string }) => {
      // Get next position
      const { data: existing } = await supabase
        .from('playlist_videos')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
      const nextPos = (existing?.[0]?.position ?? -1) + 1

      const { error } = await supabase
        .from('playlist_videos')
        .insert({ playlist_id: playlistId, video_id: videoId, position: nextPos })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      setAddedIds(prev => new Set(prev).add(vars.videoId))
      qc.invalidateQueries({ queryKey: ['your-content'] })
      qc.invalidateQueries({ queryKey: ['playlists'] })
      toast.success(lang === 'ar' ? '✅ تمت الإضافة' : '✅ Added')
    },
    onError: (err: any) => {
      const msg = err?.message || ''
      if (msg.includes('duplicate')) {
        toast(lang === 'ar' ? 'موجود بالفعل' : 'Already in playlist')
      } else {
        toast.error(msg || (lang === 'ar' ? 'فشلت الإضافة' : 'Add failed'))
      }
    },
  })

  // ── Handle Add → opens playlist picker if user has > 1 ────────────────────
  const handleAdd = async (videoId: string) => {
    if (!userId) {
      toast.error(lang === 'ar' ? 'سجّل دخولك أولاً' : 'Sign in first')
      return
    }
    // Get user playlists
    const { data: pls } = await supabase
      .from('playlists')
      .select('id, name')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const playlists = pls || []
    if (playlists.length === 0) {
      // Auto-create default playlist
      const { data: newPl, error } = await supabase
        .from('playlists')
        .insert({ user_id: userId, name: lang === 'ar' ? 'المفضلة' : 'Favorites' })
        .select()
        .single()
      if (error) { toast.error(error.message); return }
      addMut.mutate({ videoId, playlistId: newPl.id })
      return
    }
    if (playlists.length === 1) {
      addMut.mutate({ videoId, playlistId: playlists[0].id })
      return
    }
    // Multiple — show picker
    setPickerOpen({ videoId })
  }

  const videos     = tab === 'suggested' ? suggested : yourVideos
  const isLoading  = tab === 'suggested' ? suggestedLoading : yoursLoading
  const hasFilters = interestId !== null || ageId !== null

  return (
    <div className="max-w-6xl mx-auto px-4 py-4">
      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-neutral-200 mb-5">
        <TabButton active={tab === 'suggested'} onClick={() => setTab('suggested')}
          icon={<Sparkles className="w-4 h-4" />}
          label={lang === 'ar' ? 'مقترح لك' : 'Suggested for you'}
        />
        <TabButton active={tab === 'yours'} onClick={() => setTab('yours')}
          icon={<Heart className="w-4 h-4" />}
          label={lang === 'ar' ? 'محتواك' : 'Your content'}
        />
      </div>

      {/* ── Filter chips ──────────────────────────────────────────────── */}
      <div className="space-y-3 mb-5">
        {/* Interests row */}
        <div>
          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-2">
            {lang === 'ar' ? 'الاهتمامات' : 'Interests'}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-smooth">
            <Chip active={interestId === null} onClick={() => setInterestId(null)}
              label={lang === 'ar' ? 'الكل' : 'All'}
            />
            {interests.map(i => (
              <Chip key={i.id}
                active={interestId === i.id}
                onClick={() => setInterestId(interestId === i.id ? null : i.id)}
                icon={i.icon || '✨'}
                label={lang === 'ar' ? i.name_ar : i.name_en}
              />
            ))}
          </div>
        </div>

        {/* Age row */}
        <div>
          <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-2">
            {lang === 'ar' ? 'العمر' : 'Age'}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <Chip active={ageId === null} onClick={() => setAgeId(null)}
              label={lang === 'ar' ? 'الكل' : 'All'}
              color="secondary"
            />
            {ages.map(a => (
              <Chip key={a.id}
                active={ageId === a.id}
                onClick={() => setAgeId(ageId === a.id ? null : a.id)}
                label={lang === 'ar' ? a.name_ar : a.name_en}
                color="secondary"
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Active filters summary ───────────────────────────────────── */}
      {hasFilters && (
        <div className="text-xs text-neutral-600 mb-3 inline-flex items-center gap-2">
          <span>{lang === 'ar' ? `${videos.length} نتيجة` : `${videos.length} results`}</span>
          <button onClick={() => { setInterestId(null); setAgeId(null) }}
            className="text-primary hover:underline inline-flex items-center gap-1">
            <X className="w-3 h-3" /> {lang === 'ar' ? 'مسح الفلاتر' : 'Clear filters'}
          </button>
        </div>
      )}

      {/* ── Content grid ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-neutral-100 rounded-2xl aspect-[4/5] animate-pulse" />
          ))}
        </div>
      ) : videos.length === 0 ? (
        <EmptyState tab={tab} hasFilters={hasFilters} lang={lang} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {videos.map(v => (
            <VideoCard key={v.id} video={v} lang={lang}
              onAdd={() => handleAdd(v.id)}
              added={addedIds.has(v.id)}
              adding={addMut.isPending && addMut.variables?.videoId === v.id}
            />
          ))}
        </div>
      )}

      {/* ── Playlist picker modal ────────────────────────────────────── */}
      {pickerOpen && userId && (
        <PlaylistPicker
          userId={userId}
          videoId={pickerOpen.videoId}
          lang={lang}
          onClose={() => setPickerOpen(null)}
          onPick={(plId) => {
            addMut.mutate({ videoId: pickerOpen.videoId, playlistId: plId })
            setPickerOpen(null)
          }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════════════
function TabButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 py-3 font-bold text-sm border-b-2 -mb-px transition-colors',
        active ? 'border-primary text-primary' : 'border-transparent text-neutral-500 hover:text-neutral-700'
      )}
    >
      {icon}{label}
    </button>
  )
}

function EmptyState({ tab, hasFilters, lang }: { tab: Tab; hasFilters: boolean; lang: 'ar' | 'en' }) {
  const isAr = lang === 'ar'
  return (
    <div className="text-center py-16">
      <div className="text-6xl mb-3">{tab === 'suggested' ? '🎬' : '⭐'}</div>
      <h3 className="font-bold text-lg mb-1">
        {tab === 'suggested'
          ? (isAr ? 'مفيش فيديوهات مطابقة' : 'No videos match these filters')
          : (isAr ? 'مفيش محتوى محفوظ بعد' : 'No saved content yet')}
      </h3>
      <p className="text-sm text-neutral-600 max-w-sm mx-auto">
        {tab === 'suggested'
          ? (hasFilters
              ? (isAr ? 'جرّب تغيير الاهتمام أو العمر' : 'Try changing the interest or age filter')
              : (isAr ? 'هتظهر الفيديوهات لما الـ admin يضيفها' : 'Content will appear once admins add it'))
          : (isAr ? 'ضيف فيديوهات من تبويب "مقترح لك"' : 'Add videos from the Suggested tab')}
      </p>
    </div>
  )
}

function PlaylistPicker({ userId, videoId, lang, onClose, onPick }: {
  userId: string; videoId: string; lang: 'ar' | 'en'
  onClose: () => void; onPick: (id: string) => void
}) {
  const { data: pls = [] } = useQuery({
    queryKey: ['user-playlists', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlists')
        .select('id, name, child_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-md w-full p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{lang === 'ar' ? 'إضافة إلى' : 'Add to playlist'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          {pls.map((p: any) => (
            <button key={p.id} onClick={() => onPick(p.id)}
              className="w-full text-start p-3 rounded-xl border-2 border-neutral-200 hover:border-primary hover:bg-primary/5 transition-colors flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xl">
                🎵
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.name}</div>
              </div>
              <Plus className="w-5 h-5 text-primary" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
