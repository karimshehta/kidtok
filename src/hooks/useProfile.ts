import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

export interface ProfileUpdate {
  name?: string
  phone?: string
  bio?: string
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)

  return useMutation({
    mutationFn: async (data: ProfileUpdate) => {
      if (!userId) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('profiles')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['creator-profile'] })
    },
  })
}

export function useUploadAvatar() {
  const qc = useQueryClient()
  const userId = useAuth((s) => s.user?.id)

  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      if (!userId) throw new Error('Not authenticated')

      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${userId}/avatar.${ext}`

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadErr) throw uploadErr

      // Get public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const publicUrl = `${data.publicUrl}?t=${Date.now()}` // cache bust

      // Save to profile
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)

      if (updateErr) throw updateErr

      return publicUrl
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['creator-profile'] })
    },
  })
}

export interface UserProfile {
  id: string
  name: string | null
  phone: string | null
  avatar_url: string | null
  bio: string | null
  role: string
  language: string
}

export function useUserProfile() {
  const userId = useAuth((s) => s.user?.id)
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserProfile | null> => {
      const { supabase: sb } = await import('@/lib/supabase')
      const { data } = await sb
        .from('profiles')
        .select('id, name, phone, avatar_url, bio, role, language')
        .eq('id', userId!)
        .maybeSingle()
      return data as UserProfile | null
    },
  })
}
