import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
export type Role = 'parent' | 'creator' | 'admin'

export interface AdminUser {
  id:              string
  name:            string | null
  username:        string | null
  email:           string | null
  avatar_url:      string | null
  role:            Role
  is_verified:     boolean
  is_banned:       boolean
  banned_at:       string | null
  ban_reason:      string | null
  bio:             string | null
  country:         string | null
  coin_balance:    number
  email_confirmed_at: string | null
  created_at:      string
  last_active_at:  string | null
  followers_count: number
  following_count: number
  uploads_count:   number
  watched_count:   number
  active_plan_name: string | null
  total_count:     number
}

export interface UserFilters {
  search?:      string
  role?:        Role | 'all'
  verified?:    boolean | null
  banned?:      boolean | null
  premium?:     boolean | null
  hasUploads?:  boolean | null
  joinedSince?: string | null
  activeSince?: string | null
  sortBy?:      'created_at' | 'last_active_at' | 'name' | 'coin_balance'
  sortDesc?:    boolean
  offset?:      number
  limit?:       number
}

// ─── List users with all filters ──────────────────────────────────────────────
export function useAdminUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'users-v2', filters],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AdminUser[]> => {
      const { data, error } = await supabase.rpc('admin_list_users', {
        p_search:       filters.search?.trim() || null,
        p_role:         filters.role && filters.role !== 'all' ? filters.role : null,
        p_verified:     filters.verified ?? null,
        p_banned:       filters.banned ?? null,
        p_premium:      filters.premium ?? null,
        p_has_uploads:  filters.hasUploads ?? null,
        p_joined_since: filters.joinedSince ?? null,
        p_active_since: filters.activeSince ?? null,
        p_sort_by:      filters.sortBy ?? 'created_at',
        p_sort_desc:    filters.sortDesc ?? true,
        p_offset:       filters.offset ?? 0,
        p_limit:        filters.limit ?? 50,
      })
      if (error) throw error
      return (data || []) as AdminUser[]
    },
  })
}

// ─── User stats for dashboard cards ───────────────────────────────────────────
export interface UserStats {
  total:           number
  verified:        number
  banned:          number
  parents:         number
  creators:        number
  admins:          number
  premium:         number
  active_today:    number
  new_this_week:   number
  email_confirmed: number
}

export function useAdminUserStats() {
  return useQuery({
    queryKey: ['admin', 'user-stats'],
    queryFn: async (): Promise<UserStats> => {
      const { data, error } = await supabase.rpc('admin_user_stats')
      if (error) throw error
      return data as UserStats
    },
    staleTime: 30_000,
  })
}

// ─── Admin actions ────────────────────────────────────────────────────────────
export function useAdminUserActions() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'users-v2'] })
    qc.invalidateQueries({ queryKey: ['admin', 'user-stats'] })
  }

  const setBan = useMutation({
    mutationFn: async (vars: { user_id: string; banned: boolean; reason?: string }) => {
      const { error } = await supabase.rpc('admin_set_ban', {
        p_user_id: vars.user_id,
        p_banned:  vars.banned,
        p_reason:  vars.reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setRole = useMutation({
    mutationFn: async (vars: { user_id: string; role: Role }) => {
      const { error } = await supabase.from('profiles')
        .update({ role: vars.role }).eq('id', vars.user_id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setVerified = useMutation({
    mutationFn: async (vars: { user_id: string; verified: boolean }) => {
      const { error } = await supabase.from('profiles')
        .update({ is_verified: vars.verified }).eq('id', vars.user_id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const adjustCoins = useMutation({
    mutationFn: async (vars: { user_id: string; delta: number; reason?: string }) => {
      const { data, error } = await supabase.rpc('admin_adjust_coins', {
        p_user_id: vars.user_id,
        p_delta:   vars.delta,
        p_reason:  vars.reason ?? 'Admin adjustment',
      })
      if (error) throw error
      return data as number
    },
    onSuccess: invalidate,
  })

  const grantPremium = useMutation({
    mutationFn: async (vars: { user_id: string; plan_id: string; days?: number }) => {
      const expires = vars.days
        ? new Date(Date.now() + vars.days * 86400_000).toISOString()
        : null
      const { error } = await supabase.from('user_subscriptions').insert({
        user_id: vars.user_id,
        plan_id: vars.plan_id,
        status:  'active',
        expires_at: expires,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const cancelPremium = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.from('user_subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', user_id)
        .eq('status', 'active')
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteUser = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.from('profiles').delete().eq('id', user_id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { setBan, setRole, setVerified, adjustCoins, grantPremium, cancelPremium, deleteUser }
}
