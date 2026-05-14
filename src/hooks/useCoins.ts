import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

export interface CoinTransaction {
  id: string
  amount: number
  type: 'ad_reward' | 'subscription_discount' | 'admin_grant' | 'admin_deduct' | 'referral'
  notes: string | null
  created_at: string
}

export interface CoinConfig {
  coinsPerAd: number
  coinsForMonthly: number
  coinsForYearly: number
  monthlyDiscountPct: number
  yearlyDiscountPct: number
  cooldownMin: number
  onboardingEnabled: boolean
}

/** Current user's coin balance */
export function useCoinBalance() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['coins', userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('my_coin_balance')
      if (error) throw error
      return (data as number) ?? 0
    },
  })
}

/** Coin transaction history */
export function useCoinTransactions() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['coin-transactions', userId],
    enabled: !!userId,
    queryFn: async (): Promise<CoinTransaction[]> => {
      const { data, error } = await supabase
        .from('coin_transactions')
        .select('id, amount, type, notes, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data || []) as CoinTransaction[]
    },
  })
}

/** Coin-related app settings */
export function useCoinConfig(): CoinConfig {
  const { data: settings } = useQuery({
    queryKey: ['app-settings', 'public'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .eq('is_public', true)
      return Object.fromEntries((data || []).map((r: any) => [r.key, r.value || '']))
    },
    staleTime: 5 * 60_000,
  })

  return {
    coinsPerAd:        parseInt(settings?.['coins_per_ad']              || '5',   10),
    coinsForMonthly:   parseInt(settings?.['coins_for_monthly']         || '100', 10),
    coinsForYearly:    parseInt(settings?.['coins_for_yearly']          || '200', 10),
    monthlyDiscountPct:parseInt(settings?.['monthly_discount_pct']      || '100', 10),
    yearlyDiscountPct: parseInt(settings?.['yearly_discount_pct']       || '50',  10),
    cooldownMin:       parseInt(settings?.['ad_reward_cooldown_min']    || '30',  10),
    onboardingEnabled: settings?.['coins_onboarding_enabled'] !== 'false',
  }
}

/** Call reward-coins Edge Function after watching an ad */
export function useClaimAdReward() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)

  return useMutation({
    mutationFn: async (): Promise<{ coins_earned: number; new_balance: number }> => {
      const { data, error } = await supabase.functions.invoke('reward-coins', { body: {} })
      if (error) {
        const ctx = (error as any)?.context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json()
            const msg = body?.error?.message || body?.message || error.message
            throw new Error(msg)
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr
          }
        }
        throw new Error(error.message)
      }
      return data as { coins_earned: number; new_balance: number }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coins', userId] })
      qc.invalidateQueries({ queryKey: ['coin-transactions', userId] })
    },
  })
}
