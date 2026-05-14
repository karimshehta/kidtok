import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Sparkles,
  Check,
  CreditCard,
  Wallet,
  ArrowRight,
  Loader2,
  Shield,
  X,
  Crown,
  Coins,
} from 'lucide-react'
import { usePublicPlans, useMySubscription, useSubscribe, type SubscriptionPlan } from '@/hooks/useSubscription'
import { useCoinBalance, useCoinConfig } from '@/hooks/useCoins'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

export default function SubscriptionPlans() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'
  const navigate = useNavigate()

  const { data: plans = [], isLoading } = usePublicPlans()
  const { data: mySub } = useMySubscription()
  const { data: coinBalance = 0 } = useCoinBalance()
  const { coinsForMonthly, coinsForYearly, monthlyDiscountPct, yearlyDiscountPct } = useCoinConfig()
  const qc = useQueryClient()
  const [redeemingCoins, setRedeemingCoins] = useState(false)

  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const [methodOpen, setMethodOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)

  // Track which plan is currently snapped
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.idx)
            if (!isNaN(idx)) setActiveIdx(idx)
          }
        })
      },
      { root: container, threshold: [0, 0.6, 1] }
    )
    container.querySelectorAll('[data-plan-card]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [plans.length])

  const handleSubscribeClick = (plan: SubscriptionPlan) => {
    if (plan.plan_type === 'free') {
      toast.success(t('subscription.free.current'))
      return
    }
    setSelectedPlan(plan)
    setMethodOpen(true)
  }

  const handleRedeemCoins = async (plan: SubscriptionPlan) => {
    const isMonthly = plan.duration_days <= 31
    const coinsNeeded = isMonthly ? coinsForMonthly : coinsForYearly
    if (coinBalance < coinsNeeded) {
      toast.error(t('coins.notEnough', { need: coinsNeeded, have: coinBalance }))
      return
    }
    setRedeemingCoins(true)
    try {
      const { error } = await supabase.rpc('my_redeem_subscription_with_coins', {
        p_plan_id: plan.id,
      })
      if (error) {
        if (error.message.includes('INSUFFICIENT_COINS')) {
          toast.error(t('coins.notEnough', { need: coinsNeeded, have: coinBalance }))
        } else {
          toast.error(error.message)
        }
        return
      }
      await qc.invalidateQueries({ queryKey: ['my-subscription'] })
      await qc.invalidateQueries({ queryKey: ['coins'] })
      await qc.invalidateQueries({ queryKey: ['coin-transactions'] })
      toast.success(t('coins.redeemSuccess', { plan: lang === 'ar' ? plan.name_ar : plan.name_en }))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRedeemingCoins(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-black overflow-hidden">
      {/* Close button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 end-4 z-30 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur flex items-center justify-center text-white"
        aria-label="close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Current subscription pill (sticky top) */}
      {mySub && (
        <div className="fixed top-4 start-4 z-30 bg-white/15 backdrop-blur rounded-full px-3 py-1.5 text-xs text-white flex items-center gap-2">
          <Crown className="w-3.5 h-3.5 text-amber-300" />
          <span>{lang === 'ar' ? mySub.plan_name_ar : mySub.plan_name_en}</span>
          {mySub.days_remaining > 0 && (
            <span className="opacity-70">• {t('subscription.expiresIn', { days: mySub.days_remaining })}</span>
          )}
        </div>
      )}

      {/* Plans scroll container */}
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {plans.map((plan, idx) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            idx={idx}
            isActive={idx === activeIdx}
            isCurrent={mySub?.plan_id === plan.id}
            onSubscribe={() => handleSubscribeClick(plan)}
                  onRedeemCoins={handleRedeemCoins}
                  coinBalance={coinBalance}
                  coinsForMonthly={coinsForMonthly}
                  coinsForYearly={coinsForYearly}
                  monthlyDiscountPct={monthlyDiscountPct}
                  yearlyDiscountPct={yearlyDiscountPct}
                  redeemingCoins={redeemingCoins}
          />
        ))}
      </div>

      {/* Pagination dots */}
      {plans.length > 1 && (
        <div className="fixed end-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
          {plans.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                'w-1.5 rounded-full transition-all',
                idx === activeIdx ? 'h-8 bg-white' : 'h-1.5 bg-white/40'
              )}
            />
          ))}
        </div>
      )}

      {/* Payment method picker */}
      <PaymentMethodPicker
        open={methodOpen}
        plan={selectedPlan}
        onClose={() => {
          setMethodOpen(false)
          setSelectedPlan(null)
        }}
      />
    </div>
  )
}

// ============================================================
// Single plan card — full viewport snap
// ============================================================
function PlanCard({
  plan,
  idx,
  isActive,
  isCurrent,
  onSubscribe,
  onRedeemCoins,
  coinBalance,
  coinsForMonthly,
  coinsForYearly,
  monthlyDiscountPct,
  yearlyDiscountPct,
  redeemingCoins,
}: {
  plan: SubscriptionPlan
  idx: number
  isActive: boolean
  isCurrent: boolean
  onSubscribe: () => void
  onRedeemCoins: (plan: SubscriptionPlan) => void
  coinBalance: number
  coinsForMonthly: number
  coinsForYearly: number
  monthlyDiscountPct: number
  yearlyDiscountPct: number
  redeemingCoins: boolean
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'ar' | 'en'

  const isFree = plan.plan_type === 'free'
  const name = lang === 'ar' ? plan.name_ar : plan.name_en
  const description = lang === 'ar' ? plan.description_ar : plan.description_en

  // Different gradient per plan to make swiping feel exciting
  const gradients = [
    'from-purple-600 via-pink-600 to-rose-500',
    'from-primary via-cyan-500 to-blue-600',
    'from-amber-500 via-orange-600 to-red-600',
  ]
  const gradient = gradients[idx % gradients.length]

  // Features built from the plan record
  const features: { key: string; value?: string | number }[] = []
  if (!plan.has_ads) features.push({ key: 'noAds' })
  if (plan.max_children && plan.max_children > 1) features.push({ key: 'multiChildren', value: plan.max_children })
  if (plan.max_playlists) features.push({ key: 'manyPlaylists', value: plan.max_playlists })
  if (plan.max_videos_per_playlist) features.push({ key: 'moreVideos', value: plan.max_videos_per_playlist })
  if (plan.has_insights) features.push({ key: 'insights' })
  if (plan.has_games) features.push({ key: 'games' })
  if (plan.has_free_courses) features.push({ key: 'freeCourses' })
  if (plan.daily_time_minutes) features.push({ key: 'anytime', value: plan.daily_time_minutes })

  return (
    <div
      data-plan-card
      data-idx={idx}
      className={cn(
        'relative h-[100dvh] w-full snap-start snap-always flex flex-col',
        'bg-gradient-to-br',
        gradient
      )}
    >
      {/* Background sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <FloatingSparkles seed={idx} active={isActive} />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-32 text-white text-center">
        {/* Badge */}
        <div className={cn(
          'inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-4 py-2 mb-6 text-sm font-semibold',
          isActive && 'animate-pulse-subtle'
        )}>
          {isFree ? <Sparkles className="w-4 h-4" /> : <Crown className="w-4 h-4 text-amber-300" />}
          {isFree ? t('subscription.free.title') : t('subscription.proBadge')}
        </div>

        {/* Plan name */}
        <h1 className="text-4xl md:text-6xl font-extrabold mb-3 leading-tight">{name}</h1>
        {description && (
          <p className="text-white/85 mb-8 max-w-xs">{description}</p>
        )}

        {/* Price */}
        {!isFree ? (
          <div className="mb-8">
            {plan.old_price && plan.old_price > plan.price && (
              <div className="text-lg text-white/60 line-through mb-1">
                {plan.old_price} {plan.currency || t('subscription.egp')}
              </div>
            )}
            <div className="flex items-baseline gap-1 justify-center">
              <span className="text-5xl md:text-7xl font-extrabold">{Number(plan.price).toFixed(2)}</span>
              <span className="text-xl font-medium opacity-80">{plan.currency || t('subscription.egp')}</span>
            </div>
            <div className="text-sm text-white/70 mt-1">{t('subscription.perMonth')}</div>
          </div>
        ) : (
          <div className="text-3xl font-bold mb-8">{t('subscription.free.title')}</div>
        )}

        {/* Features */}
        <ul className="space-y-2.5 mb-2 max-w-xs w-full">
          {features.slice(0, 5).map((f) => (
            <li key={f.key} className="flex items-center gap-3 text-start text-sm">
              <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <span>
                {t(`subscription.features.${f.key}`, {
                  count: f.value as number,
                  minutes: f.value as number,
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom sticky CTA */}
      <div className="absolute bottom-0 inset-x-0 z-20 p-4 pb-8 bg-gradient-to-t from-black/40 to-transparent">
        <button
          onClick={onSubscribe}
          disabled={isCurrent}
          className={cn(
            'w-full max-w-md mx-auto py-4 rounded-full font-bold text-lg shadow-2xl',
            'flex items-center justify-center gap-2 transition-all',
            isCurrent
              ? 'bg-white/15 text-white/60 backdrop-blur cursor-not-allowed'
              : 'bg-white text-neutral-900 hover:scale-[1.02] active:scale-[0.98]'
          )}
        >
          {isCurrent ? (
            <>
              <Check className="w-5 h-5" />
              {t('subscription.currentlyOn')}
            </>
          ) : (
            <>
              {isFree ? t('subscription.free.cta') : t('subscription.subscribe')}
              <ArrowRight className="w-5 h-5 rtl:rotate-180" />
            </>
          )}
        </button>

        {/* Coin redemption CTA */}
        {!isFree && !isCurrent && (() => {
          const isMonthly = plan.duration_days <= 31
          const coinsNeeded = isMonthly ? coinsForMonthly : coinsForYearly
          const discountPct = isMonthly ? monthlyDiscountPct : yearlyDiscountPct
          const isFullDiscount = discountPct >= 100
          const canRedeem = coinBalance >= coinsNeeded
          return (
            <button
              type="button"
              onClick={() => onRedeemCoins(plan)}
              disabled={redeemingCoins || !canRedeem || !isFullDiscount}
              className={cn(
                'w-full mt-2 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all',
                canRedeem && isFullDiscount
                  ? 'bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40'
                  : 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed'
              )}
            >
              {redeemingCoins ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  {!isFullDiscount
                    ? t('coins.fullDiscountOnly')
                    : canRedeem
                    ? t('coins.redeemWith', { n: coinsNeeded, pct: discountPct })
                    : t('coins.needMore', { need: coinsNeeded, have: coinBalance })}
                </>
              )}
            </button>
          )
        })()}
        {!isFree && !isCurrent && (
          <p className="text-center text-xs text-white/70 mt-3 inline-flex items-center gap-1 justify-center w-full">
            <Shield className="w-3 h-3" />
            {t('subscription.subscribeSecure')}
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Floating sparkles (visual flourish)
// ============================================================
function FloatingSparkles({ seed, active }: { seed: number; active: boolean }) {
  const stars = Array.from({ length: 14 }, (_, i) => {
    const x = ((seed * 31 + i * 47) % 100)
    const y = ((seed * 17 + i * 73) % 100)
    const size = 8 + ((seed + i) % 12)
    const delay = ((i * 0.4) % 2.5).toFixed(2)
    return { x, y, size, delay }
  })
  return (
    <>
      {stars.map((s, i) => (
        <Sparkles
          key={i}
          className={cn(
            'absolute text-white/30',
            active && 'animate-float'
          )}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </>
  )
}

// ============================================================
// Payment method picker (bottom sheet)
// ============================================================
function PaymentMethodPicker({
  open,
  plan,
  onClose,
}: {
  open: boolean
  plan: SubscriptionPlan | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const subscribeMut = useSubscribe()
  const [walletPhone, setWalletPhone] = useState('')
  const [showWalletInput, setShowWalletInput] = useState(false)

  useEffect(() => {
    if (!open) {
      setShowWalletInput(false)
      setWalletPhone('')
    }
  }, [open])

  if (!open || !plan) return null

  const startPayment = async (method: 'card' | 'wallet' | 'apple_pay') => {
    try {
      const res = await subscribeMut.mutateAsync({
        plan_id: plan.id,
        payment_method: method,
        wallet_phone: method === 'wallet' ? walletPhone : undefined,
      })
      if (method === 'wallet') {
        toast.success(t('subscription.walletSent'))
        onClose()
        return
      }
      if (res.payment_url) {
        toast.loading(t('subscription.redirecting'))
        // Redirect to Paymob iframe / Apple Pay
        window.location.href = res.payment_url
      }
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 pb-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">{t('subscription.paymentMethod')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-200 rounded-full"
            aria-label="close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showWalletInput ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium block mb-1">
                {t('subscription.walletPhonePrompt')}
              </span>
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={walletPhone}
                onChange={(e) => setWalletPhone(e.target.value)}
                className="input-field"
                placeholder={t('subscription.walletPhonePlaceholder')}
                autoFocus
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowWalletInput(false)}
                className="btn-outline flex-1"
              >
                {t('common.back')}
              </button>
              <button
                onClick={() => startPayment('wallet')}
                disabled={!walletPhone || subscribeMut.isPending}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
              >
                {subscribeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('subscription.subscribe')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <MethodButton
              icon={CreditCard}
              label={t('subscription.methodCard')}
              onClick={() => startPayment('card')}
              loading={subscribeMut.isPending}
            />
            <MethodButton
              icon={Wallet}
              label={t('subscription.methodWallet')}
              onClick={() => setShowWalletInput(true)}
              loading={subscribeMut.isPending}
            />
            <MethodButton
              icon={ApplePayIcon}
              label={t('subscription.methodApplePay')}
              onClick={() => startPayment('apple_pay')}
              loading={subscribeMut.isPending}
            />
          </div>
        )}

        <p className="text-center text-xs text-neutral-700 mt-4 inline-flex items-center gap-1 justify-center w-full">
          <Shield className="w-3 h-3" />
          {t('subscription.subscribeSecure')}
        </p>
      </div>
    </div>
  )
}

function MethodButton({
  icon: Icon,
  label,
  onClick,
  loading,
}: {
  icon: any
  label: string
  onClick: () => void
  loading: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center gap-4 p-4 border border-neutral-300 rounded-2xl hover:bg-neutral-200/50 hover:border-primary transition-colors text-start"
    >
      <Icon className="w-6 h-6 text-primary" />
      <span className="flex-1 font-medium">{label}</span>
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5 text-neutral-700 rtl:rotate-180" />}
    </button>
  )
}

function ApplePayIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.05 12.04c-.03-2.32 1.9-3.43 1.99-3.49-1.09-1.59-2.78-1.81-3.38-1.83-1.44-.15-2.81.85-3.54.85s-1.86-.83-3.06-.81c-1.57.02-3.03.92-3.84 2.32-1.65 2.85-.42 7.07 1.18 9.38.79 1.13 1.7 2.4 2.9 2.36 1.18-.05 1.62-.76 3.04-.76s1.83.76 3.06.74c1.27-.02 2.07-1.14 2.84-2.28.91-1.31 1.27-2.59 1.29-2.66-.03-.01-2.47-.95-2.5-3.79zM14.93 5.16c.65-.79 1.09-1.89.97-2.98-.94.04-2.07.63-2.74 1.41-.6.7-1.13 1.82-.99 2.89 1.05.08 2.12-.53 2.76-1.32z" />
    </svg>
  )
}
