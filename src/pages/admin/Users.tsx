import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Users as UsersIcon,
  Search,
  Shield,
  User as UserIcon,
  Sparkles,
  Loader2,
} from 'lucide-react'
import AdminLayout from '@/components/AdminLayout'
import { useAdminUsers, useUpdateUserRole } from '@/hooks/useFeed'
import { cn } from '@/lib/utils'

type Role = 'parent' | 'creator' | 'admin'

const ROLE_STYLES: Record<Role, { color: string; bg: string; icon: typeof UserIcon }> = {
  parent:  { color: 'text-neutral-900', bg: 'bg-neutral-300', icon: UserIcon },
  creator: { color: 'text-purple-700',  bg: 'bg-purple-100',  icon: Sparkles },
  admin:   { color: 'text-amber-700',   bg: 'bg-amber-100',   icon: Shield },
}

export default function AdminUsers() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')

  const { data: users = [], isLoading } = useAdminUsers({ search, role: roleFilter })
  const updateMut = useUpdateUserRole()

  const handleChangeRole = async (user_id: string, role: Role) => {
    try {
      await updateMut.mutateAsync({ user_id, role })
      toast.success(t('admin.users.roleChanged'))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="w-7 h-7 text-primary" />
            {t('admin.users.title')}
          </h1>
          <p className="text-neutral-700 text-sm mt-1">{t('admin.users.subtitle')}</p>
        </header>

        {/* Filters */}
        <div className="card mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-700" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field ps-10 !py-1.5 !text-sm"
              placeholder={t('admin.users.searchPlaceholder')}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}
            className="input-field !py-1.5 !text-sm max-w-[180px]"
          >
            <option value="all">{t('admin.users.roleAll')}</option>
            <option value="parent">{t('admin.users.roleParent')}</option>
            <option value="creator">{t('admin.users.roleCreator')}</option>
            <option value="admin">{t('admin.users.roleAdmin')}</option>
          </select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : users.length === 0 ? (
          <div className="card text-center py-12 text-neutral-700">
            {t('admin.users.empty')}
          </div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-200/50 text-neutral-700">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">{t('profile.nameLabel')}</th>
                  <th className="text-start px-4 py-3 font-medium hidden sm:table-cell">
                    {t('admin.users.filterRole')}
                  </th>
                  <th className="text-end px-4 py-3 font-medium">{t('admin.users.changeRole')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => {
                  const role = (u.role || 'parent') as Role
                  const s = ROLE_STYLES[role]
                  const Icon = s.icon
                  return (
                    <tr key={u.id} className="border-t border-neutral-300">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.name || '—'}</div>
                        {u.phone && (
                          <div className="text-xs text-neutral-700" dir="ltr">{u.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                            s.bg,
                            s.color
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {t(`admin.users.role${role.charAt(0).toUpperCase() + role.slice(1)}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <select
                          value={role}
                          onChange={(e) => handleChangeRole(u.id, e.target.value as Role)}
                          disabled={updateMut.isPending}
                          className="input-field !py-1 !text-xs max-w-[140px]"
                        >
                          <option value="parent">{t('admin.users.roleParent')}</option>
                          <option value="creator">{t('admin.users.roleCreator')}</option>
                          <option value="admin">{t('admin.users.roleAdmin')}</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
