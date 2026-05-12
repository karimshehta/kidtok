import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import type { Child } from '@/types/db'

export function useChildren() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['children', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Child[]> => {
      const { data, error } = await supabase
        .from('children')
        .select('*, age:ages(*), child_interests(interest:interests(*))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((c: any) => ({
        ...c,
        interests: (c.child_interests || []).map((ci: any) => ci.interest).filter(Boolean),
      }))
    },
  })
}

export function useChild(id: string | undefined) {
  return useQuery({
    queryKey: ['child', id],
    enabled: !!id,
    queryFn: async (): Promise<Child> => {
      const { data, error } = await supabase
        .from('children')
        .select('*, age:ages(*), child_interests(interest:interests(*))')
        .eq('id', id!)
        .single()
      if (error) throw error
      const child: any = data
      return {
        ...child,
        interests: (child.child_interests || []).map((ci: any) => ci.interest).filter(Boolean),
      }
    },
  })
}

interface ChildInput {
  name: string
  gender: 'male' | 'female' | null
  age_id: number | null
  interest_ids: number[]
}

export function useCreateChild() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)
  return useMutation({
    mutationFn: async (input: ChildInput) => {
      if (!userId) throw new Error('Not authenticated')

      const { data: child, error } = await supabase
        .from('children')
        .insert({
          parent_id: userId,
          name: input.name,
          gender: input.gender,
          age_id: input.age_id,
        })
        .select()
        .single()
      if (error) throw error

      if (input.interest_ids.length > 0) {
        const rows = input.interest_ids.map((interest_id) => ({
          child_id: child.id,
          interest_id,
        }))
        const { error: e2 } = await supabase.from('child_interests').insert(rows)
        if (e2) throw e2
      }

      return child
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['children'] }),
  })
}

export function useUpdateChild(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ChildInput) => {
      const { error } = await supabase
        .from('children')
        .update({
          name: input.name,
          gender: input.gender,
          age_id: input.age_id,
        })
        .eq('id', id)
      if (error) throw error

      // Replace interests
      await supabase.from('child_interests').delete().eq('child_id', id)
      if (input.interest_ids.length > 0) {
        const rows = input.interest_ids.map((interest_id) => ({
          child_id: id,
          interest_id,
        }))
        const { error: e2 } = await supabase.from('child_interests').insert(rows)
        if (e2) throw e2
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['children'] })
      qc.invalidateQueries({ queryKey: ['child', id] })
    },
  })
}

export function useDeleteChild() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('children').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['children'] }),
  })
}
