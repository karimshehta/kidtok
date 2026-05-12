import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useMySubscription } from '@/hooks/useSubscription'

export default function SubscriptionSuccess() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { refetch } = useMySubscription()
  const [confetti, setConfetti] = useState<{ x: number; y: number; color: string; delay: number }[]>([])

  useEffect(() => {
    // Re-fetch subscription so the badge updates
    refetch()
    // Lightweight confetti
    const colors = ['#03BBE5', '#F96286', '#FFD93D', '#6BCB77', '#A78BFA']
    setConfetti(
      Array.from({ length: 36 }, (_, i) => ({
        x: Math.random() * 100,
        y: -20 + Math.random() * 20,
        color: colors[i % colors.length],
        delay: Math.random() * 0.8,
      }))
    )
  }, [refetch])

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-primary via-secondary to-purple-600 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Confetti */}
      {confetti.map((c, i) => (
        <div
          key={i}
          className="absolute w-2 h-3 rounded-sm animate-confetti"
          style={{
            left: `${c.x}%`,
            top: `${c.y}%`,
            background: c.color,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}

      <div className="relative bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center animate-bounce-slow">
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          {t('subscription.successTitle')}
        </h1>
        <p className="text-neutral-700 mb-6">{t('subscription.successBody')}</p>
        <button
          onClick={() => navigate('/feed', { replace: true })}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 text-lg py-4"
        >
          <Sparkles className="w-5 h-5" />
          {t('subscription.successButton')}
        </button>
      </div>
    </div>
  )
}
