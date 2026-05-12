import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Age, Interest } from '@/types/db'

export function useAges() {
  return useQuery({
    queryKey: ['ages'],
    queryFn: async (): Promise<Age[]> => {
      const { data, error } = await supabase
        .from('ages')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as Age[]
    },
    staleTime: 1000 * 60 * 60, // 1 hour - rarely changes
  })
}

export function useInterests() {
  return useQuery({
    queryKey: ['interests'],
    queryFn: async (): Promise<Interest[]> => {
      const { data, error } = await supabase
        .from('interests')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Interest[]
    },
    staleTime: 1000 * 60 * 60,
  })
}
