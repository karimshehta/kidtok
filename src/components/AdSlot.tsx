import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Crown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

interface AdSlotProps {
  unitId: string
  publisherId: string
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical'
  fullWidthResponsive?: boolean
  className?: string
}

/**
 * Renders a Google AdSense ad unit.
 * In development (localhost) renders a clearly-labelled placeholder instead.
 */
export function AdSlot({
  unitId,
  publisherId,
  format = 'auto',
  fullWidthResponsive = true,
  className,
}: AdSlotProps) {
  const ref = useRef<HTMLModElement>(null)
  const pushed = useRef(false)
  const isDev = import.meta.env.DEV || !unitId || !publisherId

  useEffect(() => {
    if (isDev || pushed.current) return
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      pushed.current = true
    } catch (e) {
      console.warn('AdSense push error:', e)
    }
  }, [isDev])

  if (isDev) {
    return (
      <div
        className={cn(
          'bg-neutral-200/80 border border-dashed border-neutral-300 rounded flex items-center justify-center text-xs text-neutral-700 min-h-[60px]',
          className
        )}
      >
        Ad placeholder ({unitId || 'no unit ID'})
      </div>
    )
  }

  return (
    <ins
      ref={ref}
      className={cn('adsbygoogle', className)}
      style={{ display: 'block' }}
      data-ad-client={publisherId}
      data-ad-slot={unitId}
      data-ad-format={format}
      data-full-width-responsive={fullWidthResponsive}
    />
  )
}

// ============================================================
// Full-screen snap ad card for the TikTok-style feed
// ============================================================
interface FeedAdCardProps {
  idx: number
  unitId: string
  publisherId: string
  onSubscribeClick: () => void
}

export function FeedAdCard({ idx, unitId, publisherId, onSubscribeClick }: FeedAdCardProps) {
  const { t } = useTranslation()

  return (
    <div
      data-feed-item
      data-idx={idx}
      className="relative h-[100dvh] w-full snap-start snap-always bg-neutral-900 flex flex-col items-center justify-center"
    >
      {/* Sponsored label */}
      <div className="absolute top-20 inset-x-0 flex items-center justify-center z-10 pointer-events-none">
        <span className="bg-white/10 backdrop-blur text-white text-xs px-3 py-1 rounded-full">
          {t('ads.sponsored')}
        </span>
      </div>

      {/* Ad unit */}
      <div className="w-full max-w-sm px-4">
        <AdSlot
          unitId={unitId}
          publisherId={publisherId}
          format="rectangle"
          className="w-full min-h-[250px]"
        />
      </div>

      {/* Upgrade CTA */}
      <div className="absolute bottom-28 inset-x-0 px-6 flex flex-col items-center gap-3">
        <p className="text-white/70 text-sm text-center">{t('ads.removeAdsHint')}</p>
        <button
          onClick={onSubscribeClick}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-secondary text-white font-bold px-6 py-3 rounded-full shadow-lg"
        >
          <Crown className="w-4 h-4" />
          {t('ads.upgrade')}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Thin AppLayout banner ad
// ============================================================
interface BannerAdProps {
  unitId: string
  publisherId: string
}

export function BannerAd({ unitId, publisherId }: BannerAdProps) {
  const { t } = useTranslation()
  return (
    <div className="bg-neutral-200/30 border-b border-neutral-300 relative">
      <AdSlot
        unitId={unitId}
        publisherId={publisherId}
        format="horizontal"
        className="!min-h-[50px]"
      />
      <Link
        to="/subscription"
        className="absolute end-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
      >
        <Sparkles className="w-3 h-3" />
        {t('ads.removeAds')}
      </Link>
    </div>
  )
}
