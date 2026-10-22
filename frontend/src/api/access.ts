import { apiFetch } from '../lib/apiClient'
import type { Account } from './types'

// Also the call that turns a pending invitation into an account the first time the
// invited person signs in, so it must run once after every sign-in.
export function getMe(): Promise<Account> {
  return apiFetch<Account>('/api/v1/me')
}
