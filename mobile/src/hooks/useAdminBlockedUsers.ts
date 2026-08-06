import { useQuery } from '@tanstack/react-query'
import { fetchAdminBlockedUserIds, fetchIsAdminBlockedUser } from '@/lib/adminBlocks'

export function useAdminBlockedUserIds(enabled = true) {
  return useQuery({
    queryKey: ['admin-blocked-user-ids'],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    queryFn: fetchAdminBlockedUserIds,
  })
}

export function useIsAdminBlockedUser(userId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['admin-blocked-user', userId],
    enabled: enabled && !!userId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
    queryFn: () => fetchIsAdminBlockedUser(String(userId || '')),
  })
}
