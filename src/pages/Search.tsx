import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search as SearchIcon, X, Play, Users, Video, Loader2, TrendingUp } from 'lucide-react'
import AppLayout from '@/components/AppLayout'
import { useSearch, useFallbackSearch } from '@/hooks/useSearch'
import { useIsFollowing, useToggleFollow } from '@/hooks/useSocial'
import { getYouTubeThumbnail } from '@/lib/youtube'
import { useAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'

type Tab = 'all' | 'videos' | 'creators'

export default function SearchPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebounce(query, 350)

  const { data: results, isLoading, isError } = useSearch(debouncedQuery)
  const { data: fallback } = useFallbackSearch(debouncedQuery)

  const data = isError ? fallback : results
  const videos = data?.videos || []
  const creators = data?.creators || []
  const hasResults = videos.length > 0 || creators.length > 0
  const isSearching = debouncedQuery.length >= 2

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-4 max-w-2xl">
        {/* Search input */}
        <div className="relative mb-4">
          <SearchIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-700" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-field ps-10 pe-10"
            placeholder={t('search.placeholder')}
            autoFocus
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-700 hover:text-neutral-900"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tabs */}
        {isSearching && hasResults && (
          <div className="flex gap-1 mb-4 border-b border-neutral-200">
            {(['all', 'videos', 'creators'] as Tab[]).map((tabItem) => (
              <button
                key={tabItem}
                onClick={() => setTab(tabItem)}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                  tab === tabItem
                    ? 'border-primary text-primary'
                    : 'border-transparent text-neutral-700 hover:text-neutral-900'
                )}
              >
                {tabItem === 'all' ? 'الكل' : tabItem === 'videos' ? t('search.tabVideos') : t('search.tabCreators')}
                {tabItem === 'videos' && videos.length > 0 && (
                  <span className="ms-1 text-xs text-neutral-700">({videos.length})</span>
                )}
                {tabItem === 'creators' && creators.length > 0 && (
                  <span className="ms-1 text-xs text-neutral-700">({creators.length})</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && isSearching && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty state */}
        {!isSearching && (
          <div className="text-center py-16">
            <TrendingUp className="w-12 h-12 mx-auto text-neutral-300 mb-3" />
            <h2 className="font-bold text-lg mb-1">{t('search.discoverTitle')}</h2>
            <p className="text-neutral-700 text-sm">{t('search.discoverBody')}</p>
          </div>
        )}

        {/* No results */}
        {isSearching && !isLoading && !hasResults && (
          <div className="text-center py-16">
            <SearchIcon className="w-12 h-12 mx-auto text-neutral-300 mb-3" />
            <h2 className="font-bold mb-1">{t('search.noResults')}</h2>
            <p className="text-neutral-700 text-sm">{t('search.noResultsHint', { query: debouncedQuery })}</p>
          </div>
        )}

        {/* Results */}
        {isSearching && !isLoading && hasResults && (
          <div className="space-y-6">
            {/* Creators section */}
            {(tab === 'all' || tab === 'creators') && creators.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t('search.tabCreators')}
                </h2>
                <div className="space-y-2">
                  {creators.map((c) => (
                    <CreatorSearchCard
                      key={c.id}
                      creator={c}
                      onClick={() => navigate(`/creator/${c.id}`)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Videos section */}
            {(tab === 'all' || tab === 'videos') && videos.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  {t('search.tabVideos')}
                </h2>
                <div className="space-y-3">
                  {videos.map((v, idx) => (
                    <VideoSearchCard
                      key={v.id}
                      video={v}
                      onClick={() => {
                        // Navigate to a search result feed
                        // For now navigate to creator profile or playlist
                        if (v.creator_id) navigate(`/creator/${v.creator_id}`)
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

// ── Creator card ──
function CreatorSearchCard({ creator, onClick }: { creator: any; onClick: () => void }) {
  const { t } = useTranslation()
  const currentUserId = useAuth((s) => s.user?.id)
  const isOwn = currentUserId === creator.id
  const { data: isFollowing = false } = useIsFollowing(creator.id)
  const toggleMut = useToggleFollow(creator.id)

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 card hover:shadow-md transition-shadow text-start"
    >
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-lg flex-shrink-0 overflow-hidden">
        {creator.avatar_url
          ? <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
          : creator.name?.charAt(0)?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0 text-start">
        <div className="font-semibold truncate">{creator.name}</div>
        {creator.bio && <div className="text-xs text-neutral-700 truncate">{creator.bio}</div>}
        <div className="text-xs text-neutral-700 mt-0.5">
          {creator.video_count || 0} {t('creator.profile.videos')} · {creator.follower_count || 0} {t('creator.profile.followers')}
        </div>
      </div>
      {!isOwn && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMut.mutate(isFollowing) }}
          className={cn(
            'text-xs px-3 py-1.5 rounded-full font-semibold flex-shrink-0',
            isFollowing
              ? 'border border-neutral-300 text-neutral-900'
              : 'bg-primary text-white'
          )}
        >
          {isFollowing ? t('creator.profile.following') : t('creator.profile.follow')}
        </button>
      )}
    </button>
  )
}

// ── Video card ──
function VideoSearchCard({ video, onClick }: { video: any; onClick: () => void }) {
  const { t } = useTranslation()
  const thumb = video.thumbnail_url || (video.youtube_id ? getYouTubeThumbnail(video.youtube_id) : '')

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex gap-3 card p-3 hover:shadow-md transition-shadow text-start group"
    >
      <div className="relative w-28 aspect-video rounded-lg overflow-hidden bg-neutral-300 flex-shrink-0">
        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="w-6 h-6 text-white ms-0.5" fill="white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold line-clamp-2 mb-1">{video.title || 'Untitled'}</h3>
        {video.channel_name && (
          <p className="text-xs text-neutral-700 truncate">{video.channel_name}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-neutral-700 mt-1">
          {video.like_count > 0 && <span>❤️ {video.like_count}</span>}
          {video.view_count > 0 && <span>👁 {video.view_count}</span>}
        </div>
      </div>
    </button>
  )
}
