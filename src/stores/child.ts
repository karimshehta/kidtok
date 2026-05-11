import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ChildState {
  selectedChildId: string | null
  setSelectedChild: (id: string | null) => void
}

export const useSelectedChild = create<ChildState>()(
  persist(
    (set) => ({
      selectedChildId: null,
      setSelectedChild: (id) => set({ selectedChildId: id }),
    }),
    { name: 'kidtok-selected-child' }
  )
)
