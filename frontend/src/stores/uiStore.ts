import { create } from 'zustand'
import type { Scope } from '../api/types'

export type ScopeFilterValue = 'all' | Scope

interface UiState {
  scopeFilter: ScopeFilterValue
  // Whether the filter already took its starting value from the profile. It lives here, not in
  // the page, so it survives the board being left and opened again and reloads of the profile.
  scopeInitialized: boolean
  setScopeFilter: (value: ScopeFilterValue) => void
  // Sets the filter from the profile's default scope, once per session; later calls do nothing.
  initializeScope: (value: ScopeFilterValue) => void
  // Back to the starting state (a different person signed in).
  reset: () => void
}

const INITIAL_STATE = { scopeFilter: 'all' as ScopeFilterValue, scopeInitialized: false }

export const useUiStore = create<UiState>((set, get) => ({
  ...INITIAL_STATE,
  setScopeFilter: (value) => set({ scopeFilter: value, scopeInitialized: true }),
  initializeScope: (value) => {
    if (!get().scopeInitialized) set({ scopeFilter: value, scopeInitialized: true })
  },
  reset: () => set(INITIAL_STATE),
}))
