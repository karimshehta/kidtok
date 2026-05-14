import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LogIn, Eye, X, Coins, Sparkles } from 'lucide-react'
import { useCoinConfig } from '@/hooks/useCoins'
import { useAuth } from '@/stores/auth'
import RewardedAdModal from './RewardedAdModal'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'kidtok_onboarding_v1'

export default function OnboardingModal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const { onboardingEnabled, coinsPerAd } = useCoinConfig()

  const [open, setOpen] = useState(false)
  const [showAd, setShowAd] = useState(false)

  useEffect(() => {
    // Don't show if logged in or already seen
    if (user) return
    if (!onboardingEnabled) return
    if (localStorage.getItem(STORAGE_KEY)) return

    // Delay so the app finishes loading first
    const t = setTimeout(() => setOpen(true), 1200)
    return () => clearTimeout(t)
  }, [user, onboardingEnabled])

  const dismiss = (action: 'skip' | 'login' | 'ad_done') => {
    localStorage.setItem(STORAGE_KEY, action)
    setOpen(false)
    if (action === 'login') navigate('/login')
  }

  if (!open) return null

  if (showAd) {
    return (
      <RewardedAdModal
        onDone={() => { setShowAd(false); dismiss('ad_done') }}
        onClose={() => setShowAd(false)}
        anonymous
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl">
        {/* Hero gradient */}
        <div className="bg-gradient-to-br from-primary via-secondary to-purple-500 px-6 pt-8 pb-6 text-white text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-white/20 backdrop-blur flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold mb-1">{t('onboarding.welcome')}</h1>
          <p className="text-white/85 text-sm">{t('onboarding.subtitle')}</p>
        </div>

        <div className="p-5 space-y-3">
          {/* Watch Ad */}
          <button
            onClick={() => setShowAd(true)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-300 hover:border-amber-500 transition-colors text-start"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-400 flex items-center justify-center flex-shrink-0">
              <Eye className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-bold flex items-center gap-2">
                {t('onboarding.watchAd')}
                <span className="flex items-center gap-1 text-amber-600 text-sm font-bold">
                  +{coinsPerAd}
                  <Coins className="w-4 h-4 text-amber-500" />
                </span>
              </div>
              <div className="text-xs text-neutral-700">{t('onboarding.watchAdHint')}</div>
            </div>
          </button>

          {/* Login */}
          <button
            onClick={() => dismiss('login')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-primary/5 border-2 border-primary/20 hover:border-primary transition-colors text-start"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center flex-shrink-0">
              <LogIn className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-bold">{t('onboarding.login')}</div>
              <div className="text-xs text-neutral-700">{t('onboarding.loginHint')}</div>
            </div>
          </button>

          {/* Skip */}
          <button
            onClick={() => dismiss('skip')}
            className="w-full text-center text-sm text-neutral-700 hover:text-neutral-900 py-2"
          >
            {t('onboarding.skip')} →
          </button>
        </div>
      </div>
    </div>
  )
}
