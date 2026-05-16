import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

export type UserRole = 'parent' | 'creator' | 'admin' | null

export function useMyRole() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['my-role', userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 min
    queryFn: async (): Promise<UserRole> => {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      return (data?.role as UserRole) ?? 'parent'
    },
  })
}

export function useIsCreator() {
  const { data: role } = useMyRole()
  return role === 'creator' || role === 'admin'
}
