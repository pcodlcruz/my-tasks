import { create } from 'zustand'
import type { Scope } from '../api/types'

export type ScopeFilterValue = 'all' | Scope

interface UiState {
  scopeFilter: ScopeFilterValue
  setScopeFilter: (value: ScopeFilterValue) => void
}

export const useUiStore = create<UiState>((set) => ({
  scopeFilter: 'all',
  setScopeFilter: (value) => set({ scopeFilter: value }),
}))
