import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  initialized: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name?: string, emailRedirectTo?: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  init: async () => {
    set({ loading: true })
    try {
      // Clear stale refresh tokens
      let sessionData
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error?.message?.includes('Refresh Token') || error?.message?.includes('refresh_token')) {
          await supabase.auth.signOut()
          set({ user: null, session: null, loading: false, initialized: true })
          return
        }
        sessionData = data
      } catch {
        set({ user: null, session: null, loading: false, initialized: true })
        return
      }
      const { data } = { data: sessionData }
      set({ session: data.session, user: data.session?.user ?? null })

      supabase.auth.onAuthStateChange((event, session) => {
        // Handle token refresh errors
        if (event === 'TOKEN_REFRESHED' && !session) {
          supabase.auth.signOut()
          set({ user: null, session: null })
          return
        }
        set({ session, user: session?.user ?? null })
      })
    } finally {
      set({ loading: false, initialized: true })
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUp: async (email, password, name, emailRedirectTo) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: name ? { full_name: name, name } : undefined,
        emailRedirectTo,
      },
    })
    if (error) throw error
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
