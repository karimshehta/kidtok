import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  init: () => Promise<void>
  setSession: (session: Session | null) => void
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  init: async () => {
    // Listen FIRST so any auth event during initial load is captured
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })

    const { data } = await supabase.auth.getSession()
    set({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    })
  },

  // Called explicitly by login/signup pages right after a successful auth call
  // so the store is in sync BEFORE we navigate to a protected route.
  setSession: (session) => set({ session, user: session?.user ?? null }),

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))
