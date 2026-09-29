import { getIdToken } from 'firebase/auth'
import type { ApiError } from '../api/types'
import { auth } from './firebase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string

export class ApiClientError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>[]

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ApiClientError'
    this.code = error.code
    this.details = error.details
  }
}

// The task changed (or disappeared) from another tab or window: invalid
// transition (409) or missing/purged task (404).
export function isStaleTaskError(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    (error.code === 'invalid_transition' || error.code === 'not_found')
  )
}

// Errors whose message, already written in Spanish by the server, is shown as is.
const USER_FACING_ERROR_CODES = ['task_limit_reached', 'auth_unavailable']

export function isUserFacingError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError && USER_FACING_ERROR_CODES.includes(error.code)
}

async function toApiError(response: Response): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as ApiError
    return new ApiClientError(body)
  } catch {
    return new ApiClientError({ code: 'error', message: response.statusText })
  }
}

async function handleUnauthorized(): Promise<void> {
  await auth.signOut()
  window.location.assign('/login?reason=expired')
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const user = auth.currentUser
  if (user) {
    const token = await getIdToken(user)
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })

  if (response.status === 401) {
    await handleUnauthorized()
    throw await toApiError(response)
  }
  if (!response.ok) {
    throw await toApiError(response)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}
