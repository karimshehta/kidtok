import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Lock,
  Loader2,
  Play,
  Clock,
  Eye,
  EyeOff,
  Home,
  AlertTriangle,
  Moon,
} from 'lucide-react'
import { useChild } from '@/hooks/useChildren'
import { usePlaylists, usePlaylistVideos } from '@/hooks/usePlaylists'
import { useChildMode, formatTime } from '@/hooks/useChildMode'
import VideoPlayer from '@/components/VideoPlayer'
import ChildAvatar from '@/components/ChildAvatar'
import type { Playlist, PlaylistVideo } from '@/types/db'
import { cn } from '@/lib/utils'
import { getYouTubeThumbnail } from '@/lib/youtube'

export default function ChildMode() {
  const { childId } = useParams<{ childId: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const { data: child, isLoading: childLoading } = useChild(childId)
  const { data: playlists = [] } = usePlaylists(childId)

  const {
    status,
    timeStatus,
    secondsLeft,
    startSession,
    verifyParentPassword,
    requestExit,
    dismissLock,
  } = useChildMode(childId!)

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null)
  const [playingPV, setPlayingPV] = useState<PlaylistVideo | null>(null)

  const [showExitModal, setShowExitModal] = useState(false)

  // Open exit modal whenever status goes to locked
  useEffect(() => {
    if (status === 'locked') setShowExitModal(true)
    else setShowExitModal(false)
  }, [status])
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => null)
    return () => {
      document.exitFullscreen?.().catch(() => null)
    }
  }, [])

  // Start session when mode becomes active
  useEffect(() => {
    if (status === 'active' && childId) {
      startSession()
    }
  }, [status, childId, startSession])

  // Show warnings
  useEffect(() => {
    if (status !== 'active') return
    if (secondsLeft === 300) toast(t('childMode.warning5min'), { icon: '⏰' })
    if (secondsLeft === 60) toast(t('childMode.warning1min'), { icon: '⚠️' })
  }, [secondsLeft, status, t])

  if (childLoading || status === 'loading') {
    return (
      <ChildShell>
        <div className="flex flex-col items-center justify-center gap-4 h-full">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-white text-lg">{t('childMode.loading')}</p>
        </div>
      </ChildShell>
    )
  }

  if (status === 'error') {
    return (
      <ChildShell>
        <div className="flex flex-col items-center justify-center gap-4 h-full text-white text-center px-6">
          <AlertTriangle className="w-14 h-14 text-amber-300" />
          <p>{t('common.errorGeneric')}</p>
          <button onClick={() => navigate('/children')} className="btn-primary">{t('common.back')}</button>
        </div>
      </ChildShell>
    )
  }

  // ============================================================
  // TIME EXPIRED screen
  // ============================================================
  if (status === 'expired') {
    return (
      <ChildShell>
        <div className="flex flex-col items-center justify-center gap-6 h-full text-white text-center px-6">
          <Moon className="w-24 h-24 text-yellow-300" />
          <h1 className="text-3xl font-extrabold">{t('childMode.timeUp')}</h1>
          <p className="text-white/80 max-w-xs">{t('childMode.timeUpBody')}</p>
          {timeStatus && (
            <div className="bg-white/15 backdrop-blur rounded-2xl px-6 py-3 text-sm">
              {t('childMode.usedOf', {
                used: formatTime(timeStatus.usedSeconds + (timeStatus.limitSeconds - secondsLeft)),
                total: formatTime(timeStatus.limitSeconds),
              })}
            </div>
          )}
          <button
            onClick={requestExit}
            className="inline-flex items-center gap-2 bg-white text-neutral-900 font-bold px-8 py-4 rounded-full shadow-lg"
          >
            <Lock className="w-5 h-5" />
            {t('childMode.exitButton')}
          </button>
        </div>
        <ParentLockModal
          open={showExitModal}
          onVerify={verifyParentPassword}
          onCancel={dismissLock}
          onSuccess={() => navigate('/children')}
        />
      </ChildShell>
    )
  }

  // ============================================================
  // LOCKED screen (parent wants to exit)
  // ============================================================
  if (status === 'locked') {
    return (
      <ChildShell>
        <div className="flex flex-col items-center justify-center h-full">
          <ParentLockModal
            open
            onVerify={verifyParentPassword}
            onCancel={dismissLock}
            onSuccess={() => navigate('/children')}
          />
        </div>
      </ChildShell>
    )
  }

  // ============================================================
  // MAIN child mode: playlists / videos
  // ============================================================
  return (
    <ChildShell>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        {child && (
          <div className="flex items-center gap-3">
            <ChildAvatar name={child.name} imageUrl={child.image_url} gender={child.gender} size="md" />
            <div>
              <div className="text-white font-bold text-lg">{child.name}</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <TimerBadge seconds={secondsLeft} limitSeconds={timeStatus?.limitSeconds ?? 0} />
          <button
            onClick={requestExit}
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
            aria-label="exit"
          >
            <Lock className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {selectedPlaylist ? (
          <PlaylistVideos
            playlist={selectedPlaylist}
            onBack={() => setSelectedPlaylist(null)}
            onPlay={(pv) => {
              setPlayingPV(pv)
            }}
          />
        ) : (
          <PlaylistGrid
            playlists={playlists}
            onSelect={setSelectedPlaylist}
          />
        )}
      </div>

      {/* Parent lock modal */}
      <ParentLockModal
        open={showExitModal}
        onVerify={verifyParentPassword}
        onCancel={dismissLock}
        onSuccess={() => navigate('/children')}
      />

      {/* Video player */}
      <VideoPlayer
        open={!!playingPV}
        onClose={() => setPlayingPV(null)}
        youtubeId={playingPV?.video?.youtube_id || null}
        cloudflareUid={playingPV?.video?.source === 'creator' ? (playingPV?.video?.thumbnail_url?.match(/cloudflarestream\.com\/([^/]+)/)?.[1] || null) : null}
        title={playingPV?.video?.title}
        channel={playingPV?.video?.channel_name}
      />
    </ChildShell>
  )
}

// ============================================================
// Shell: full-screen gradient background
// ============================================================
function ChildShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-gradient-to-br from-primary via-secondary to-purple-600 flex flex-col overflow-hidden"
      style={{ touchAction: 'manipulation' }}
    >
      {children}
    </div>
  )
}

// ============================================================
// Timer badge (circular + countdown text)
// ============================================================
function TimerBadge({ seconds, limitSeconds }: { seconds: number; limitSeconds: number }) {
  const { t } = useTranslation()
  const pct = limitSeconds > 0 ? Math.max(0, seconds / limitSeconds) : 0
  const r = 18
  const circumference = 2 * Math.PI * r
  const strokeDash = circumference * pct

  const isWarning = seconds < 300 && seconds > 60
  const isCritical = seconds <= 60

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-12 h-12">
        <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
          <circle cx="24" cy="24" r={r} fill="transparent" stroke="rgba(255,255,255,0.25)" strokeWidth={4} />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="transparent"
            stroke={isCritical ? '#ff4444' : isWarning ? '#ffaa00' : 'white'}
            strokeWidth={4}
            strokeDasharray={circumference}
            strokeDashoffset={circumference - strokeDash}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Clock className={cn('w-5 h-5', isCritical ? 'text-red-400' : 'text-white')} />
        </div>
      </div>
      <span className={cn(
        'font-mono font-bold text-lg',
        isCritical ? 'text-red-300' : isWarning ? 'text-amber-300' : 'text-white'
      )}>
        {formatTime(seconds)}
      </span>
    </div>
  )
}

// ============================================================
// Playlist grid
// ============================================================
function PlaylistGrid({ playlists, onSelect }: { playlists: Playlist[]; onSelect: (p: Playlist) => void }) {
  const { t } = useTranslation()
  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-white text-center">
        <Home className="w-16 h-16 opacity-50" />
        <p className="opacity-80">{t('childMode.noPlaylists')}</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 pt-4">
      {playlists.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-3xl p-4 text-white text-center transition-colors active:scale-95"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Play className="w-8 h-8 text-white ms-1" fill="white" />
          </div>
          <div className="font-bold line-clamp-2 text-sm">{p.name}</div>
          <div className="text-xs opacity-70 mt-1">{t('playlists.videoCount', { count: p.video_count ?? 0 })}</div>
        </button>
      ))}
    </div>
  )
}

// ============================================================
// Videos in a playlist
// ============================================================
function PlaylistVideos({
  playlist,
  onBack,
  onPlay,
}: {
  playlist: Playlist
  onBack: () => void
  onPlay: (pv: PlaylistVideo) => void
}) {
  const { t } = useTranslation()
  const { data: items = [], isLoading } = usePlaylistVideos(playlist.id)

  return (
    <div>
      <button
        onClick={onBack}
        className="text-white/80 text-sm mb-4 inline-flex items-center gap-2 mt-2"
      >
        ←  {playlist.name}
      </button>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>
      ) : items.length === 0 ? (
        <p className="text-white/70 text-center py-8">{t('childMode.playlistEmpty')}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((pv) => {
            if (!pv.video) return null
            const ytId = pv.video.youtube_id
            return (
              <button
                key={pv.id}
                onClick={() => onPlay(pv)}
                className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-2xl overflow-hidden text-white text-left active:scale-95 transition-transform"
              >
                <div className="aspect-video bg-black/30 relative">
                  <img
                    src={pv.video.thumbnail_url || (ytId ? getYouTubeThumbnail(ytId) : '')}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      if (ytId) (e.currentTarget as HTMLImageElement).src = getYouTubeThumbnail(ytId, 'default')
                    }}
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-5 h-5 text-primary ms-0.5" fill="currentColor" />
                    </div>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-xs font-semibold line-clamp-2">{pv.video.title || 'Video'}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Parent lock modal
// ============================================================
interface ParentLockModalProps {
  open: boolean
  onVerify: (password: string) => Promise<boolean>
  onCancel: () => void
  onSuccess: () => void
}

function ParentLockModal({ open, onVerify, onCancel, onSuccess }: ParentLockModalProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError(false)
    const ok = await onVerify(password)
    setLoading(false)
    if (ok) {
      onSuccess()
    } else {
      setError(true)
      setPassword('')
    }
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">{t('childMode.locked')}</h2>
          <p className="text-sm text-neutral-700 mt-1">{t('childMode.lockedBody')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">{t('childMode.passwordLabel')}</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(false)
                }}
                className={cn('input-field pe-12', error && 'border-danger')}
                placeholder={t('childMode.passwordPlaceholder')}
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-neutral-700"
              >
                {showPwd ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {error && (
              <p className="text-danger text-xs mt-1">{t('childMode.wrongPassword')}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!password || loading}
            className="btn-primary w-full inline-flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('childMode.verifying')}</> : t('childMode.unlockButton')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-outline w-full"
          >
            {t('childMode.cancelButton')}
          </button>
        </form>
      </div>
    </div>
  )
}
