import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

export interface SubscriptionPlan {
  id: number
  code: string
  name_ar: string
  name_en: string
  description_ar: string | null
  description_en: string | null
  price: number
  old_price: number | null
  currency: string
  duration_days: number
  plan_type: 'free' | 'paid'
  max_children: number | null
  max_playlists: number | null
  max_videos_per_playlist: number | null
  has_insights: boolean
  has_ads: boolean
  has_games: boolean
  has_free_courses: boolean
  daily_time_minutes: number | null
  is_active: boolean
  sort_order: number
}

export interface ActiveSubscription {
  id: string
  plan_id: number
  plan_code: string
  plan_name_ar: string
  plan_name_en: string
  status: string
  started_at: string
  expires_at: string
  paid_amount: number | null
  paid_currency: string | null
  days_remaining: number
}

/** Public: list of active subscription plans (visible to all authenticated users). */
export function usePublicPlans() {
  return useQuery({
    queryKey: ['plans', 'public'],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data || []) as SubscriptionPlan[]
    },
  })
}

/** Current user's active subscription, via the my_active_subscription() RPC. */
export function useMySubscription() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['my-subscription', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ActiveSubscription | null> => {
      const { data, error } = await supabase.rpc('my_active_subscription')
      if (error) throw error
      const rows = (data || []) as ActiveSubscription[]
      return rows[0] || null
    },
  })
}

interface SubscribeInput {
  plan_id: number
  payment_method?: 'card' | 'wallet' | 'apple_pay'
  wallet_phone?: string
}

interface SubscribeResponse {
  subscription_id: string
  method: string
  payment_url?: string
  wallet_response?: unknown
}

/** Invokes the Edge Function to create a Paymob payment intent. */
export function useSubscribe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SubscribeInput): Promise<SubscribeResponse> => {
      const { data, error } = await supabase.functions.invoke('subscription-create', {
        body: input,
      })
      if (error) {
        const msg = (error as any)?.context?.error?.message || (error as Error).message
        throw new Error(msg || 'EDGE_FUNCTION_FAILED')
      }
      return data as SubscribeResponse
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-subscription'] }),
  })
}

// ============================================================
// Admin plan management
// ============================================================

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return (data || []) as SubscriptionPlan[]
    },
  })
}

export function useUpdatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: number; patch: Partial<SubscriptionPlan> }) => {
      const { error } = await supabase
        .from('subscription_plans')
        .update(vars.patch)
        .eq('id', vars.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      qc.invalidateQueries({ queryKey: ['plans'] })
    },
  })
}
