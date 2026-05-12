import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/stores/auth'

export default function AuthCallback() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const loading = useAuth((s) => s.loading)

  useEffect(() => {
    // Wait until the auth store finishes its initial session check.
    // By then, Supabase has parsed the URL hash and populated the store.
    if (loading) return

    if (user) {
      navigate('/home', { replace: true })
    } else {
      // Tiny grace period in case the OAuth flow is still settling
      const timer = setTimeout(() => {
        navigate('/login', { replace: true })
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [user, loading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-light to-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-neutral-700">جارٍ توجيهك...</p>
      </div>
    </div>
  )
}
