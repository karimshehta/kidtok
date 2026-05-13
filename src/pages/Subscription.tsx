/**
 * /subscription — smart router:
 *   - Has active paid sub → SubscriptionManagement
 *   - No sub / free plan → TikTok-style plan picker
 */
import { Navigate } from 'react-router-dom'
import { useMySubscription } from '@/hooks/useSubscription'
import SubscriptionPlans from './subscription/Plans'
import SubscriptionManagement from './subscription/Management'
import { Loader2 } from 'lucide-react'

export default function Subscription() {
  const { data: sub, isLoading } = useMySubscription()

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    )
  }

  // Active paid sub → management screen
  if (sub && sub.plan_code !== 'free') {
    return <SubscriptionManagement sub={sub} />
  }

  // No sub / free → plans picker
  return <SubscriptionPlans />
}
