import { supabase } from '@/lib/supabase'

function isMissingAdminBlockRpc(message: string) {
  return (
    message.includes('get_admin_blocked_user_ids') ||
    message.includes('is_admin_blocked_user') ||
    message.includes('Could not find the function') ||
    message.includes('schema cache')
  )
}

export async function fetchAdminBlockedUserIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_admin_blocked_user_ids')
  if (error) {
    const message = String(error.message || '')
    if (isMissingAdminBlockRpc(message)) {
      console.warn('[admin-blocks] RPC is not deployed yet; no global admin blocks applied.')
      return []
    }
    throw error
  }

  const rows = Array.isArray(data) ? data : []
  return rows
    .map((row: any) => {
      if (typeof row === 'string') return row
      if (typeof row?.user_id === 'string') return row.user_id
      if (typeof row?.id === 'string') return row.id
      return null
    })
    .filter(Boolean) as string[]
}

export async function fetchIsAdminBlockedUser(userId: string): Promise<boolean> {
  if (!userId) return false
  const { data, error } = await supabase.rpc('is_admin_blocked_user', { p_user_id: userId })
  if (error) {
    const message = String(error.message || '')
    if (isMissingAdminBlockRpc(message)) return false
    throw error
  }
  return data === true
}
