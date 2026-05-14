import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Shield, Clock, Loader2, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import AdminLayout from '@/components/AdminLayout'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface AuditEntry {
  id: string
  admin_id: string
  action: string
  target_type: string | null
  target_id: string | null
  old_value: any
  new_value: any
  created_at: string
  admin_name?: string | null
}

export default function AdminSecurity() {
  const { t } = useTranslation()

  const { data: entries = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from('admin_audit_log')
        .select('*, admin:admin_id(name)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data || []).map((r: any) => ({
        ...r,
        admin_name: r.admin?.name || r.admin_id?.slice(0, 8),
      }))
    },
  })

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-7 h-7 text-primary" />
              Security & Audit Log
            </h1>
            <p className="text-neutral-700 text-sm mt-1">
              All admin actions are logged here. Role changes, deletions, etc.
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-outline inline-flex items-center gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </header>

        {/* Security checklist */}
        <div className="card mb-6 bg-green-50 border border-green-200">
          <h2 className="font-bold text-green-800 mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-600" />
            Security Status
          </h2>
          <div className="space-y-2 text-sm">
            <SecurityCheck
              ok
              label="Admin role checked from DB (profiles table)"
              detail="is_admin() reads from public.profiles, never from user metadata"
            />
            <SecurityCheck
              ok
              label="Users cannot self-promote to admin via API"
              detail="RLS WITH CHECK prevents users from changing their own role column"
            />
            <SecurityCheck
              ok
              label="New users always get 'parent' role"
              detail="handle_new_user() trigger always inserts role='parent'"
            />
            <SecurityCheck
              ok
              label="Role changes are logged"
              detail="trg_log_role_change trigger records every role modification"
            />
            <SecurityCheck
              ok
              label="Edge Functions read role from DB"
              detail="creator-upload-url checks profile.role via service client"
            />
            <SecurityCheck
              ok
              label="Anon role revoked from profiles"
              detail="Unauthenticated requests cannot read/write profiles"
            />
          </div>
        </div>

        {/* Audit log */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : entries.length === 0 ? (
          <div className="card text-center py-10 text-neutral-700">
            <Shield className="w-10 h-10 mx-auto mb-2 text-neutral-300" />
            No admin actions logged yet
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-neutral-700">
                <tr>
                  <th className="text-start px-4 py-3 font-medium">Action</th>
                  <th className="text-start px-4 py-3 font-medium hidden sm:table-cell">Admin</th>
                  <th className="text-start px-4 py-3 font-medium hidden md:table-cell">Target</th>
                  <th className="text-start px-4 py-3 font-medium hidden md:table-cell">Change</th>
                  <th className="text-start px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-200 hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-xs font-semibold',
                        e.action === 'role_change' ? 'bg-amber-100 text-amber-800' :
                        e.action.includes('delete') ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      )}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-neutral-700">
                      {e.admin_name || '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-neutral-700">
                      {e.target_type && (
                        <span className="font-mono text-xs">
                          {e.target_type}: {e.target_id?.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {e.old_value && e.new_value && (
                        <span className="font-mono text-xs">
                          <span className="text-red-500">{JSON.stringify(e.old_value)}</span>
                          {' → '}
                          <span className="text-green-600">{JSON.stringify(e.new_value)}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(e.created_at), 'dd/MM HH:mm')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

function SecurityCheck({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn('text-lg flex-shrink-0', ok ? 'text-green-600' : 'text-red-500')}>
        {ok ? '✅' : '❌'}
      </span>
      <div>
        <div className="font-medium text-green-900">{label}</div>
        <div className="text-xs text-green-700">{detail}</div>
      </div>
    </div>
  )
}
