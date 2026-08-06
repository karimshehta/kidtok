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
    if (isMissingAdminBlockRpc(message)) return []
    throw error
  }

  return (Array.isArray(data) ? data : [])
    .map((row: any) => (typeof row === 'string' ? row : row?.user_id || row?.id))
    .filter(Boolean)
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
