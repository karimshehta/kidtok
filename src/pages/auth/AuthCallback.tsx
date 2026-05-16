import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/stores/auth'
import OpenInAppBanner from '@/components/OpenInAppBanner'

export default function AuthCallback() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const loading = useAuth((s) => s.loading)

  useEffect(() => {
    if (loading) return
    if (user) {
      navigate('/home', { replace: true })
    } else {
      const timer = setTimeout(() => navigate('/login', { replace: true }), 1500)
      return () => clearTimeout(timer)
    }
  }, [user, loading, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-primary-light to-white">
      <OpenInAppBanner />
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-neutral-700">{t('auth.redirecting')}</p>
      </div>
    </div>
  )
}
