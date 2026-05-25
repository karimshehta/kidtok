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

// ─── List users — direct query (no RPC dependency) ────────────────────────────
export function useAdminUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: ['admin', 'users-v2', filters],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AdminUser[]> => {
      // Try RPC first (richer data with email + counts)
      try {
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
        if (!error && data && Array.isArray(data)) return data as AdminUser[]
      } catch {}

      // Fallback: direct query on profiles (no email, simpler counts)
      let q = supabase.from('profiles').select('*', { count: 'exact' })

      if (filters.role && filters.role !== 'all') q = q.eq('role', filters.role)
      if (filters.verified !== null && filters.verified !== undefined) q = q.eq('is_verified', filters.verified)
      if (filters.banned !== null && filters.banned !== undefined)     q = q.eq('is_banned', filters.banned)
      if (filters.search?.trim()) {
        const s = filters.search.trim()
        q = q.or(`name.ilike.%${s}%,username.ilike.%${s}%`)
      }

      const sortCol = filters.sortBy ?? 'created_at'
      q = q.order(sortCol, { ascending: !(filters.sortDesc ?? true) })

      const offset = filters.offset ?? 0
      const limit  = filters.limit  ?? 50
      q = q.range(offset, offset + limit - 1)

      const { data, error, count } = await q
      if (error) throw error

      return ((data || []) as any[]).map(p => ({
        id:              p.id,
        name:            p.name,
        username:        p.username,
        email:           null,
        avatar_url:      p.avatar_url,
        role:            p.role,
        is_verified:     p.is_verified ?? false,
        is_banned:       p.is_banned ?? false,
        banned_at:       p.banned_at,
        ban_reason:      p.ban_reason,
        bio:             p.bio,
        country:         p.country,
        coin_balance:    0,
        email_confirmed_at: null,
        created_at:      p.created_at,
        last_active_at:  p.last_active_at,
        followers_count: p.followers_count ?? 0,
        following_count: p.following_count ?? 0,
        uploads_count:   0,
        watched_count:   0,
        active_plan_name: null,
        total_count:     count ?? 0,
      })) as AdminUser[]
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
      // Try RPC first
      try {
        const { data, error } = await supabase.rpc('admin_user_stats')
        if (!error && data) return data as UserStats
      } catch {}

      // Fallback: compute basic stats client-side
      const { data: profiles } = await supabase.from('profiles').select('role, is_verified, is_banned, created_at, last_active_at')
      const rows = profiles || []
      const now = Date.now()
      const oneDay = 86_400_000
      const sevenDays = 7 * oneDay
      return {
        total:           rows.length,
        verified:        rows.filter((r: any) => r.is_verified).length,
        banned:          rows.filter((r: any) => r.is_banned).length,
        parents:         rows.filter((r: any) => r.role === 'parent').length,
        creators:        rows.filter((r: any) => r.role === 'creator').length,
        admins:          rows.filter((r: any) => r.role === 'admin').length,
        premium:         0,
        active_today:    rows.filter((r: any) => r.last_active_at && (now - new Date(r.last_active_at).getTime()) < oneDay).length,
        new_this_week:   rows.filter((r: any) => (now - new Date(r.created_at).getTime()) < sevenDays).length,
        email_confirmed: 0,
      }
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
      const days = vars.days || 30
      const expires = new Date(Date.now() + days * 86400_000).toISOString()

      // Cancel any existing active subscription first
      await supabase.from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', vars.user_id)
        .eq('status', 'active')

      const { error } = await supabase.from('subscriptions').insert({
        user_id:          vars.user_id,
        plan_id:          parseInt(vars.plan_id, 10),  // plan_id is int in schema
        status:           'active',
        expires_at:       expires,
        payment_provider: 'manual',
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const cancelPremium = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.from('subscriptions')
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
