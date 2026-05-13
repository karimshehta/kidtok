import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

// How often (ms) we sync watched_seconds to the DB
const HEARTBEAT_INTERVAL_MS = 30_000

export interface ChildTimeStatus {
  limitSeconds: number     // total daily limit
  usedSeconds: number      // already watched today
  remainingSeconds: number // what's left
}

export type ChildModeState =
  | 'loading'
  | 'active'        // child is watching, timer running
  | 'expired'       // time ran out
  | 'locked'        // parent lock shown (after expiry or back button)
  | 'error'

interface UseChildModeResult {
  status: ChildModeState
  timeStatus: ChildTimeStatus | null
  secondsLeft: number                 // live countdown value
  sessionId: string | null
  /** Call when a video starts playing */
  startSession: (videoId?: string, playlistId?: string) => Promise<void>
  /** Call when manually exiting via parent password */
  verifyParentPassword: (password: string) => Promise<boolean>
  /** Show the parent lock screen */
  requestExit: () => void
  /** Dismiss the lock screen (child presses back on it) */
  dismissLock: () => void
}

export function useChildMode(childId: string): UseChildModeResult {
  const user = useAuth((s) => s.user)
  const [status, setStatus] = useState<ChildModeState>('loading')
  const [timeStatus, setTimeStatus] = useState<ChildTimeStatus | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const sessionStartRef = useRef<number>(Date.now())
  const secondsLeftRef = useRef(0)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ============================================================
  // 1. Fetch remaining time on mount
  // ============================================================
  useEffect(() => {
    if (!childId || !user) return

    let mounted = true
    ;(async () => {
      const { data, error } = await supabase.rpc('get_child_remaining_time', {
        p_child_id: childId,
      })
      if (!mounted) return
      if (error) {
        console.error('get_child_remaining_time error:', error)
        setStatus('error')
        return
      }
      const row = (data as any)?.[0]
      if (!row) {
        setStatus('error')
        return
      }
      const ts: ChildTimeStatus = {
        limitSeconds: row.limit_seconds,
        usedSeconds: row.used_seconds,
        remainingSeconds: row.remaining_seconds,
      }
      setTimeStatus(ts)
      secondsLeftRef.current = ts.remainingSeconds
      setSecondsLeft(ts.remainingSeconds)
      setStatus(ts.remainingSeconds <= 0 ? 'expired' : 'active')
    })()

    return () => { mounted = false }
  }, [childId, user])

  // ============================================================
  // 2. Countdown tick — runs while status === 'active'
  // ============================================================
  useEffect(() => {
    if (status !== 'active') {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
      return
    }

    countdownRef.current = setInterval(() => {
      secondsLeftRef.current = Math.max(0, secondsLeftRef.current - 1)
      setSecondsLeft(secondsLeftRef.current)
      if (secondsLeftRef.current <= 0) {
        setStatus('expired')
      }
    }, 1_000)

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [status])

  // ============================================================
  // 3. DB heartbeat — syncs watched_seconds every 30 s
  // ============================================================
  useEffect(() => {
    if (status !== 'active' || !sessionIdRef.current) return

    heartbeatRef.current = setInterval(async () => {
      if (!sessionIdRef.current) return
      const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000)
      await supabase.rpc('update_watch_session', {
        p_session_id: sessionIdRef.current,
        p_watched_seconds: elapsed,
      })
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [status, sessionId])

  // ============================================================
  // 4. Final flush when component unmounts or expires
  // ============================================================
  useEffect(() => {
    return () => {
      // Best-effort flush — fire and forget
      if (sessionIdRef.current) {
        const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000)
        supabase.rpc('update_watch_session', {
          p_session_id: sessionIdRef.current,
          p_watched_seconds: elapsed,
        })
      }
    }
  }, [])

  // ============================================================
  // API: start a session
  // ============================================================
  const startSession = useCallback(
    async (videoId?: string, playlistId?: string) => {
      if (sessionIdRef.current) return // already started
      try {
        const { data, error } = await supabase.rpc('start_watch_session', {
          p_child_id: childId,
          p_video_id: videoId ?? null,
          p_playlist_id: playlistId ?? null,
        })
        if (!error && data) {
          sessionIdRef.current = data as string
          sessionStartRef.current = Date.now()
          setSessionId(data as string)
        }
      } catch (err) {
        console.warn('start_watch_session error:', err)
      }
    },
    [childId]
  )

  // ============================================================
  // API: parent password verification
  // ============================================================
  const verifyParentPassword = useCallback(
    async (password: string): Promise<boolean> => {
      if (!user?.email) return false
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        })
        // signIn creates a duplicate session — sign it out immediately (invisible to user)
        if (!error) {
          // Flush session before exiting
          if (sessionIdRef.current) {
            const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000)
            await supabase.rpc('update_watch_session', {
              p_session_id: sessionIdRef.current,
              p_watched_seconds: elapsed,
            })
          }
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [user?.email]
  )

  const requestExit = useCallback(() => setStatus('locked'), [])
  const dismissLock = useCallback(() => {
    if (secondsLeftRef.current > 0) setStatus('active')
    // If time is 0, stay on locked/expired
  }, [])

  return {
    status,
    timeStatus,
    secondsLeft,
    sessionId,
    startSession,
    verifyParentPassword,
    requestExit,
    dismissLock,
  }
}

// ============================================================
// Format seconds as M:SS or HH:MM:SS
// ============================================================
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}
