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

export function quadrantFor(urgent: boolean, important: boolean): Quadrant {
  if (urgent && important) return 'do_now'
  if (!urgent && important) return 'schedule'
  if (urgent && !important) return 'delegate'
  return 'eliminate'
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

export type Role = 'user' | 'admin'

// The account behind the signed-in Google user (GET /api/v1/me).
export interface Account {
  uid: string
  email: string
  role: Role
}

// Administration (/api/v1/admin). The role is only cosmetic here: the server decides.
export type AccountStatus = 'active' | 'revoked'

export type InvitationStatus = 'pending' | 'accepted' | 'revoked'

export interface AccountEntry extends Account {
  status: AccountStatus
  created_at: string
}

export interface Invitation {
  email: string
  status: InvitationStatus
  created_at: string
  accepted_at: string | null
}

export interface AccessList {
  invitations: Invitation[]
  accounts: AccountEntry[]
}

export type InviteOutcome = 'invited' | 'already_pending' | 'reactivated'

export interface InviteResult {
  outcome: InviteOutcome
  email: string
}

// The server caps both lists at this many items (the newest) and the pending invitations at
// MAX_PENDING_INVITATIONS. Kept in step with backend/src/mytasks_api/services/access_service.py.
export const ACCESS_LIST_LIMIT = 100
export const MAX_PENDING_INVITATIONS = 50

// Profile and preferences (/api/v1/me/profile).
export type Theme = 'light' | 'dark' | 'system'

export type Density = 'comfortable' | 'compact'

export type DefaultScope = 'all' | 'work' | 'personal'

export type BoardOrder = 'oldest' | 'newest'

// `null` means the whole history.
export type HistoryDays = 30 | 90 | null

export type AvatarKind = 'initials' | 'preset' | 'upload'

export interface Avatar {
  kind: AvatarKind
  preset: string | null
  version: number
}

export interface Profile {
  theme: Theme
  density: Density
  default_scope: DefaultScope
  board_order: BoardOrder
  history_days: HistoryDays
  display_name: string | null
  avatar: Avatar
}

// What a profile update may ask for: `upload` is only ever set by uploading an image.
export type AvatarChoice = { kind: 'initials' } | { kind: 'preset'; preset: string }

export interface ProfileUpdate {
  theme?: Theme
  density?: Density
  default_scope?: DefaultScope
  board_order?: BoardOrder
  history_days?: HistoryDays
  display_name?: string | null
  avatar?: AvatarChoice
}
