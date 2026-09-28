export type Scope = 'work' | 'personal'

export type Quadrant = 'do_now' | 'schedule' | 'delegate' | 'eliminate'

export type Status = 'active' | 'completed'

export const SCOPE_LABELS: Record<Scope, string> = {
  work: 'Laboral',
  personal: 'Personal',
}

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  do_now: 'Hacer ahora',
  schedule: 'Planificar',
  delegate: 'Delegar',
  eliminate: 'Eliminar',
}

export interface Task {
  id: string
  title: string
  description: string
  urgent: boolean
  important: boolean
  quadrant: Quadrant
  scope: Scope
  pinned: boolean
  status: Status
  in_trash: boolean
  created_at: string
  updated_at: string
  completed_at: string | null
  trashed_at: string | null
  purge_at: string | null
}

export interface TaskCreate {
  title: string
  description: string
  urgent: boolean
  important: boolean
  scope: Scope
}

export type TaskUpdate = Partial<TaskCreate> & { pinned?: boolean }

export interface TaskPage {
  items: Task[]
  next_cursor: string | null
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>[]
}
