import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase auto-detects the session from URL hash (detectSessionInUrl: true)
    // We just wait for it then route accordingly
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true })
      } else if (event === 'SIGNED_IN' && session) {
        navigate('/home', { replace: true })
      }
    })

    // Fallback - if no event in 3 seconds, redirect to login
    const timer = setTimeout(() => {
      navigate('/login', { replace: true })
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-light to-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-neutral-700">جارٍ توجيهك...</p>
      </div>
    </div>
  )
}
