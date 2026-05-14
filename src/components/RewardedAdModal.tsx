import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Coins, Loader2, CheckCircle2 } from 'lucide-react'
import { useClaimAdReward, useCoinConfig } from '@/hooks/useCoins'
import { useAds } from '@/hooks/useAds'
import { AdSlot } from '@/components/AdSlot'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

interface Props {
  onDone: (coinsEarned: number) => void
  onClose: () => void
  anonymous?: boolean   // true when called from onboarding (before login)
}

const AD_WATCH_SECONDS = 5   // minimum seconds to watch before claiming

export default function RewardedAdModal({ onDone, onClose, anonymous }: Props) {
  const { t } = useTranslation()
  const { coinsPerAd } = useCoinConfig()
  const { publisherId, feedUnitId } = useAds()
  const claimMut = useClaimAdReward()

  const [countdown, setCountdown] = useState(AD_WATCH_SECONDS)
  const [phase, setPhase] = useState<'watching' | 'claimable' | 'claiming' | 'done'>('watching')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start countdown immediately
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(intervalRef.current!)
          setPhase('claimable')
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const handleClaim = async () => {
    if (anonymous) {
      // Guest user — just grant coins client-side (goodwill gesture)
      // Actual coins only credited when they log in
      setPhase('done')
      setTimeout(() => onDone(coinsPerAd), 800)
      return
    }

    setPhase('claiming')
    try {
      const result = await claimMut.mutateAsync()
      setPhase('done')
      setTimeout(() => onDone(result.coins_earned), 800)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('COOLDOWN')) {
        toast(msg, { icon: '⏰' })
      } else {
        toast.error(msg)
      }
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" />
            <span className="font-bold">{t('coins.watchingAd')}</span>
          </div>
          {phase !== 'watching' && (
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-full">
              <X className="w-5 h-5 text-neutral-700" />
            </button>
          )}
        </div>

        {/* Ad area */}
        <div className="relative">
          <div className="min-h-[200px] bg-neutral-100 flex items-center justify-center p-4">
            {publisherId ? (
              <AdSlot
                unitId={feedUnitId || ''}
                publisherId={publisherId}
                format="rectangle"
                className="w-full min-h-[150px]"
              />
            ) : (
              <div className="w-full h-[200px] bg-gradient-to-br from-neutral-200 to-neutral-300 rounded-xl flex items-center justify-center text-neutral-700 text-sm">
                {t('coins.adPlaceholder')}
              </div>
            )}
          </div>

          {/* Countdown overlay */}
          {phase === 'watching' && (
            <div className="absolute top-3 end-3 w-10 h-10 rounded-full bg-black/70 flex items-center justify-center">
              <span className="text-white font-bold text-lg">{countdown}</span>
            </div>
          )}
        </div>

        {/* Bottom action */}
        <div className="p-5">
          {phase === 'done' ? (
            <div className="flex items-center justify-center gap-3 py-3">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
              <div>
                <div className="font-bold text-green-700">{t('coins.claimed')}</div>
                <div className="text-sm text-neutral-700">+{coinsPerAd} {t('coins.coins')}</div>
              </div>
            </div>
          ) : phase === 'watching' ? (
            <div className="text-center">
              <p className="text-sm text-neutral-700 mb-1">{t('coins.watchToEarn', { n: AD_WATCH_SECONDS })}</p>
              <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-1000"
                  style={{ width: `${((AD_WATCH_SECONDS - countdown) / AD_WATCH_SECONDS) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleClaim}
              disabled={phase === 'claiming'}
              className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 text-neutral-900 font-extrabold py-4 rounded-2xl text-lg flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              {phase === 'claiming'
                ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('coins.claiming')}</>
                : <><Coins className="w-5 h-5" /> {t('coins.claimCoins', { n: coinsPerAd })}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
