import { useState, useMemo, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import {
  Users as UsersIcon, Search, Shield, User as UserIcon, Sparkles,
  Loader2, Filter, MoreVertical, Ban, CheckCircle2, XCircle,
  Coins, Crown, Trash2, Copy, X, ChevronLeft, ChevronRight, BadgeCheck,
  TrendingUp, UserCheck, AlertCircle, Mail, Globe,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAdminUsers, useAdminUserStats, useAdminUserActions } from '@/hooks/useAdminUsers'
import { supabase } from '@/lib/supabase'
import type { AdminUser, UserFilters, Role } from '@/hooks/useAdminUsers'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

// ════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════
const ROLE_BADGES: Record<Role, { bg: string; text: string; icon: typeof UserIcon }> = {
  parent:  { bg: 'bg-blue-100 text-blue-800',   text: 'User',  icon: UserIcon },
  creator: { bg: 'bg-blue-100 text-blue-800',   text: 'User',  icon: UserIcon },
  admin:   { bg: 'bg-amber-100 text-amber-800', text: 'Admin', icon: Shield },
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  const diff = (Date.now() - date.getTime()) / 86400_000
  if (diff < 1) return 'today'
  if (diff < 7) return `${Math.floor(diff)}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return date.toLocaleDateString()
}

// Compact numeric formatter for view counts (1.2K, 3.4M, …)
function formatCompact(n: number | null | undefined): string {
  if (!n) return '0'
  if (n < 1000)       return n.toString()
  if (n < 1_000_000)  return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.0', '') + 'K'
  if (n < 1e9)        return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace('.0', '') + 'M'
  return (n / 1e9).toFixed(1).replace('.0', '') + 'B'
}

// ════════════════════════════════════════════════════════════════════════════
// Stat Card
// ════════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, color = 'blue', loading }: {
  icon: any; label: string; value: number | string; color?: string; loading?: boolean
}) {
  const colorMap: Record<string, string> = {
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    purple:  'bg-purple-50 text-purple-700 border-purple-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    green:   'bg-green-50 text-green-700 border-green-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-neutral-50 text-neutral-700 border-neutral-200',
  }
  return (
    <div className={cn('rounded-xl border p-3 flex flex-col gap-1', colorMap[color])}>
      <div className="flex items-center gap-2 text-xs font-medium">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold">
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : value.toLocaleString()}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Confirm Dialog
// ════════════════════════════════════════════════════════════════════════════
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose, loading }: {
  open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean
  onConfirm: () => void; onClose: () => void; loading?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <p className="text-neutral-700 text-sm mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-sm font-medium">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-bold text-white inline-flex items-center gap-2 disabled:opacity-60',
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'
            )}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// User Detail Modal
// ════════════════════════════════════════════════════════════════════════════
function UserDetailModal({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { setRole, setVerified, adjustCoins, grantPremium, cancelPremium } = useAdminUserActions()
  const [coinDelta, setCoinDelta] = useState('')
  const [planDays, setPlanDays] = useState('30')

  // Fetch available plans for the dropdown
  const { data: plans = [] } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data } = await supabase
        .from('subscription_plans')
        .select('id, name_ar, name_en, price, currency')
        .order('price', { ascending: true })
      return data || []
    },
    staleTime: 3600_000,
  })

  if (!user) return null

  const handleAdjustCoins = async () => {
    const delta = parseInt(coinDelta, 10)
    if (isNaN(delta) || delta === 0) { toast.error('Enter a valid number'); return }
    try {
      await adjustCoins.mutateAsync({ user_id: user.id, delta })
      toast.success(`Coins ${delta > 0 ? '+' : ''}${delta} → user`)
      setCoinDelta('')
    } catch (e) { toast.error((e as Error).message) }
  }

  const RoleIcon = ROLE_BADGES[user.role].icon

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 p-5 flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 overflow-hidden flex-shrink-0">
            {user.avatar_url
              ? <img src={user.avatar_url} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-8 h-8 text-primary" /></div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold truncate">{user.name || 'Unnamed'}</h2>
              {user.is_verified && <BadgeCheck className="w-5 h-5 text-blue-600" />}
              {user.is_banned && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold">BANNED</span>}
            </div>
            {user.username && <p className="text-sm text-primary">@{user.username}</p>}
            <p className="text-sm text-neutral-600 truncate">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="User ID" value={
              <button onClick={() => { navigator.clipboard.writeText(user.id); toast.success('ID copied') }}
                className="font-mono text-xs hover:text-primary inline-flex items-center gap-1">
                {user.id.slice(0, 8)}… <Copy className="w-3 h-3" />
              </button>
            } />
            <Info label="Role" value={
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold', ROLE_BADGES[user.role].bg)}>
                <RoleIcon className="w-3 h-3" />{ROLE_BADGES[user.role].text}
              </span>
            } />
            <Info label="Email confirmed" value={user.email_confirmed_at
              ? <span className="text-green-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{formatDate(user.email_confirmed_at)}</span>
              : <span className="text-red-700 inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Not confirmed</span>
            } />
            <Info label="Plan" value={user.active_plan_name ?
              <span className="inline-flex items-center gap-1 text-amber-700"><Crown className="w-3.5 h-3.5" />{user.active_plan_name}</span>
              : <span className="text-neutral-600">Free</span>
            } />
            <Info label="Joined" value={formatDate(user.created_at)} />
            <Info label="Last active" value={formatDate(user.last_active_at)} />
            <Info label="Coins" value={<span className="font-bold inline-flex items-center gap-1"><Coins className="w-3.5 h-3.5 text-amber-600" />{user.coin_balance}</span>} />
            <Info label="Uploads" value={user.uploads_count.toLocaleString()} />
            <Info label="Total views" value={formatCompact(user.total_views)} />
            <Info label="Followers" value={user.followers_count.toLocaleString()} />
            <Info label="Following" value={user.following_count.toLocaleString()} />
          </div>

          {user.bio && (
            <div className="bg-neutral-50 p-3 rounded-lg text-sm">
              <p className="text-xs text-neutral-500 mb-1">Bio</p>
              {user.bio}
            </div>
          )}

          {user.is_banned && user.ban_reason && (
            <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm">
              <p className="text-xs text-red-700 font-bold mb-1">Ban reason</p>
              <p className="text-red-900">{user.ban_reason}</p>
            </div>
          )}

          {/* Quick actions */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wide">Quick actions</h4>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={user.role === 'admin' ? 'admin' : 'parent'}
                onChange={(e) => setRole.mutate({ user_id: user.id, role: e.target.value as Role })}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="parent">User</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => setVerified.mutate({ user_id: user.id, verified: !user.is_verified })}
                className={cn('rounded-lg px-3 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5',
                  user.is_verified ? 'bg-neutral-100' : 'bg-blue-50 text-blue-700 border border-blue-200')}
              >
                <BadgeCheck className="w-4 h-4" />
                {user.is_verified ? 'Remove verification' : 'Mark verified'}
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-bold text-amber-900 uppercase mb-2 inline-flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" />Adjust coins
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={coinDelta}
                  onChange={(e) => setCoinDelta(e.target.value)}
                  placeholder="+10 or -5"
                  className="flex-1 rounded-md border border-amber-300 px-3 py-1.5 text-sm bg-white"
                />
                <button
                  onClick={handleAdjustCoins}
                  disabled={adjustCoins.isPending || !coinDelta}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm font-bold disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
              <p className="text-xs text-amber-800 mt-2">Current balance: <strong>{user.coin_balance}</strong></p>
            </div>

            {/* ── Plan assignment ─────────────────────────────────────── */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-purple-900 uppercase tracking-wide inline-flex items-center gap-1">
                <Crown className="w-3.5 h-3.5" />Subscription plan
              </p>
              <div className="flex items-center gap-2 text-xs text-purple-800">
                <span>Current:</span>
                <span className="font-bold">{user.active_plan_name || 'Free'}</span>
              </div>
              {/* Grant plan */}
              <div className="flex gap-2">
                <select
                  id="plan-select"
                  className="flex-1 rounded-md border border-purple-300 px-2 py-1.5 text-sm bg-white"
                >
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name_ar} — {p.price} {p.currency}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={planDays}
                  onChange={(e) => setPlanDays(e.target.value)}
                  min={1}
                  placeholder="Days"
                  className="w-20 rounded-md border border-purple-300 px-2 py-1.5 text-sm bg-white"
                />
                <button
                  onClick={() => {
                    const sel = document.getElementById('plan-select') as HTMLSelectElement
                    if (!sel?.value) return
                    grantPremium.mutate({ user_id: user.id, plan_id: sel.value, days: parseInt(planDays, 10) || 30 },
                      { onSuccess: () => toast.success('Plan assigned'), onError: (e) => toast.error((e as Error).message) })
                  }}
                  disabled={grantPremium.isPending}
                  className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-md text-sm font-bold disabled:opacity-50 whitespace-nowrap"
                >
                  {grantPremium.isPending ? '…' : 'Grant'}
                </button>
              </div>
              {/* Cancel plan */}
              {user.active_plan_name && (
                <button
                  onClick={() => cancelPremium.mutate(user.id,
                    { onSuccess: () => toast.success('Plan cancelled'), onError: (e) => toast.error((e as Error).message) })}
                  disabled={cancelPremium.isPending}
                  className="w-full py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 rounded-md border border-red-200 disabled:opacity-50"
                >
                  {cancelPremium.isPending ? '…' : 'Cancel current plan'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <div className="font-medium text-neutral-900">{value}</div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function AdminUsers() {
  const [filters, setFilters] = useState<UserFilters>({
    sortBy: 'created_at',
    sortDesc: true,
    limit: PAGE_SIZE,
    offset: 0,
  })
  const [page, setPage]                 = useState(0)
  const [searchInput, setSearchInput]   = useState('')
  const [showFilters, setShowFilters]   = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [openMenuId, setOpenMenuId]     = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    user: AdminUser; type: 'ban' | 'unban' | 'delete'
  } | null>(null)

  const { data: users = [], isLoading, isFetching } = useAdminUsers({ ...filters, offset: page * PAGE_SIZE })
  const { data: stats } = useAdminUserStats()
  const { setBan, deleteUser } = useAdminUserActions()

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => ({ ...f, search: searchInput }))
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const total = users[0]?.total_count ?? 0
  const totalPages = Math.ceil(Number(total) / PAGE_SIZE)

  const setFilter = (patch: Partial<UserFilters>) => {
    setFilters(f => ({ ...f, ...patch }))
    setPage(0)
  }

  // ── Confirm handler ────────────────────────────────────────────────────────
  const executeConfirm = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'ban') {
        await setBan.mutateAsync({ user_id: confirmAction.user.id, banned: true })
        toast.success(`Banned ${confirmAction.user.name || 'user'}`)
      } else if (confirmAction.type === 'unban') {
        await setBan.mutateAsync({ user_id: confirmAction.user.id, banned: false })
        toast.success('Unbanned')
      } else if (confirmAction.type === 'delete') {
        await deleteUser.mutateAsync(confirmAction.user.id)
        toast.success('User deleted')
      }
      setConfirmAction(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl">
        {/* Header */}
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UsersIcon className="w-7 h-7 text-primary" />
              Users
            </h1>
            <p className="text-neutral-700 text-sm mt-1">Manage all platform users, roles, and permissions.</p>
          </div>
        </header>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={UsersIcon}    label="Total users"    value={stats?.total ?? 0}          color="blue"    loading={!stats} />
          <StatCard icon={Shield}       label="Admins"         value={stats?.admins ?? 0}         color="amber"   loading={!stats} />
          <StatCard icon={BadgeCheck}   label="Verified"       value={stats?.verified ?? 0}       color="blue"    loading={!stats} />
          <StatCard icon={Crown}        label="Premium"        value={stats?.premium ?? 0}        color="amber"   loading={!stats} />
          <StatCard icon={Ban}          label="Banned"         value={stats?.banned ?? 0}         color="red"     loading={!stats} />
          <StatCard icon={UserCheck}    label="Active today"   value={stats?.active_today ?? 0}   color="green"   loading={!stats} />
          <StatCard icon={TrendingUp}   label="New this week"  value={stats?.new_this_week ?? 0}  color="green"   loading={!stats} />
          <StatCard icon={Mail}         label="Email confirmed" value={stats?.email_confirmed ?? 0} color="neutral" loading={!stats} />
        </div>

        {/* Search + Filters bar */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur pb-3 mb-3 border-b border-neutral-200">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, username, email, or user ID..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 bg-white text-sm focus:border-primary outline-none"
              />
            </div>
            <button
              onClick={() => setShowFilters(s => !s)}
              className={cn('px-3 py-2.5 rounded-xl border text-sm font-medium inline-flex items-center gap-2',
                showFilters ? 'bg-primary text-white border-primary' : 'border-neutral-300 hover:bg-neutral-50')}
            >
              <Filter className="w-4 h-4" />Filters
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3">
              <FilterSelect label="Role" value={filters.role || 'all'} onChange={(v) => setFilter({ role: v as any })}
                options={[['all','All users'],['admin','Admins only']]} />
              <FilterSelect label="Verified" value={String(filters.verified ?? '')} onChange={(v) => setFilter({ verified: v === '' ? null : v === 'true' })}
                options={[['','Any'],['true','Verified ✓'],['false','Unverified']]} />
              <FilterSelect label="Premium" value={String(filters.premium ?? '')} onChange={(v) => setFilter({ premium: v === '' ? null : v === 'true' })}
                options={[['','Any'],['true','Premium'],['false','Free']]} />
              <FilterSelect label="Status" value={String(filters.banned ?? '')} onChange={(v) => setFilter({ banned: v === '' ? null : v === 'true' })}
                options={[['','Any'],['false','Active'],['true','Banned']]} />
              <FilterSelect label="Uploads" value={String(filters.hasUploads ?? '')} onChange={(v) => setFilter({ hasUploads: v === '' ? null : v === 'true' })}
                options={[['','Any'],['true','Has uploads'],['false','No uploads']]} />
              <FilterSelect label="Sort by" value={filters.sortBy || 'created_at'} onChange={(v) => setFilter({ sortBy: v as any })}
                options={[['created_at','Joined'],['last_active_at','Last active'],['name','Name'],['coin_balance','Coins']]} />
              <FilterSelect label="Order" value={String(filters.sortDesc)} onChange={(v) => setFilter({ sortDesc: v === 'true' })}
                options={[['true','Descending'],['false','Ascending']]} />
              <button onClick={() => { setFilters({ sortBy: 'created_at', sortDesc: true, limit: PAGE_SIZE, offset: 0 }); setSearchInput('') }}
                className="px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 self-end">
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* Users Table */}
        <div className="rounded-xl border border-neutral-200 overflow-visible bg-white">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr className="text-left text-xs font-bold text-neutral-600 uppercase tracking-wide">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3 hidden md:table-cell">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 hidden lg:table-cell">Status</th>
                <th className="px-4 py-3 hidden lg:table-cell">Plan</th>
                <th className="px-4 py-3 hidden md:table-cell text-right">Stats</th>
                <th className="px-4 py-3 hidden md:table-cell">Joined</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin inline-block text-primary" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-neutral-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                  No users match these filters.
                </td></tr>
              ) : (
                users.map(user => {
                  const RoleIcon = ROLE_BADGES[user.role].icon
                  return (
                    <tr key={user.id} className="hover:bg-neutral-50 transition-colors">
                      {/* User cell */}
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedUser(user)} className="flex items-center gap-3 text-left">
                          <div className="w-9 h-9 rounded-full bg-primary/10 overflow-hidden flex-shrink-0">
                            {user.avatar_url
                              ? <img src={user.avatar_url} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><UserIcon className="w-4 h-4 text-primary" /></div>
                            }
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm truncate">{user.name || 'Unnamed'}</span>
                              {user.is_verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />}
                            </div>
                            {user.username && <p className="text-xs text-primary">@{user.username}</p>}
                          </div>
                        </button>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-neutral-700 max-w-[180px] truncate">
                        {user.email}
                      </td>
                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold', ROLE_BADGES[user.role].bg)}>
                          <RoleIcon className="w-3 h-3" />{ROLE_BADGES[user.role].text}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {user.is_banned ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold">Banned</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-bold">Active</span>
                        )}
                      </td>
                      {/* Plan */}
                      <td className="px-4 py-3 hidden lg:table-cell text-xs">
                        {user.active_plan_name ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                            <Crown className="w-3 h-3" />{user.active_plan_name}
                          </span>
                        ) : <span className="text-neutral-500">Free</span>}
                      </td>
                      {/* Stats */}
                      <td className="px-4 py-3 hidden md:table-cell text-right">
                        <div className="text-xs space-x-2 whitespace-nowrap">
                          <span className="text-neutral-500" title="Videos uploaded">📹 {user.uploads_count}</span>
                          <span className="text-blue-600" title="Total views across uploads">👁 {formatCompact(user.total_views)}</span>
                          <span className="text-amber-600 font-medium" title="Coin balance">🪙 {user.coin_balance}</span>
                        </div>
                      </td>
                      {/* Joined */}
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-neutral-600">
                        {formatDate(user.created_at)}
                      </td>
                      {/* Actions */}
                      <td className={cn('px-4 py-3 relative overflow-visible', openMenuId === user.id && 'z-50')}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === user.id ? null : user.id) }}
                          className="p-1 hover:bg-neutral-200 rounded"
                        >
                          <MoreVertical className="w-4 h-4 text-neutral-500" />
                        </button>
                        {openMenuId === user.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-2 top-10 z-[80] bg-white border border-neutral-200 rounded-lg shadow-xl py-1 min-w-[190px]">
                              <MenuItem icon={UserIcon} label="View details" onClick={() => { setSelectedUser(user); setOpenMenuId(null) }} />
                              <MenuItem icon={Copy} label="Copy ID" onClick={() => { navigator.clipboard.writeText(user.id); toast.success('ID copied'); setOpenMenuId(null) }} />
                              <hr className="my-1 border-neutral-100" />
                              {user.is_banned ? (
                                <MenuItem icon={CheckCircle2} label="Unban user" onClick={() => { setConfirmAction({ user, type: 'unban' }); setOpenMenuId(null) }} />
                              ) : (
                                <MenuItem icon={Ban} label="Ban user" danger onClick={() => { setConfirmAction({ user, type: 'ban' }); setOpenMenuId(null) }} />
                              )}
                              <MenuItem icon={Trash2} label="Delete user" danger onClick={() => { setConfirmAction({ user, type: 'delete' }); setOpenMenuId(null) }} />
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {users.length > 0 && (
            <div className="flex items-center justify-between p-3 border-t border-neutral-200 bg-neutral-50">
              <p className="text-xs text-neutral-600">
                Showing <strong>{page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, Number(total))}</strong> of <strong>{Number(total).toLocaleString()}</strong>
                {isFetching && <Loader2 className="w-3 h-3 animate-spin inline-block ml-2" />}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium px-2">Page {page + 1} / {totalPages || 1}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page + 1 >= totalPages}
                  className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.type === 'ban' ? 'Ban user?' :
          confirmAction?.type === 'unban' ? 'Unban user?' :
          'Delete user permanently?'
        }
        message={
          confirmAction?.type === 'delete'
            ? `This will permanently delete ${confirmAction.user.name || 'this user'} and all their data. This cannot be undone.`
            : `Are you sure you want to ${confirmAction?.type} ${confirmAction?.user.name || 'this user'}?`
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : confirmAction?.type === 'ban' ? 'Ban' : 'Unban'}
        danger={confirmAction?.type !== 'unban'}
        loading={setBan.isPending || deleteUser.isPending}
        onConfirm={executeConfirm}
        onClose={() => setConfirmAction(null)}
      />
    </AdminLayout>
  )
}

// ════════════════════════════════════════════════════════════════════════════
function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div>
      <label className="text-xs font-medium text-neutral-600 mb-1 block">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn('w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 inline-flex items-center gap-2',
        danger && 'text-red-700 hover:bg-red-50')}>
      <Icon className="w-4 h-4" />{label}
    </button>
  )
}
