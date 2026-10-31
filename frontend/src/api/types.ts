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
  // Set on the tasks a schedule generated (feature 007): its id and the progress day it was for.
  schedule_id: string | null
  scheduled_for: string | null
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
  // Progress settings of feature 007. `timezone` is null until the device's one is first sent.
  daily_goal: number
  active_weekdays: Weekday[]
  timezone: string | null
  morning_review: boolean
  arcade_mode: boolean
}

// ISO weekdays: 1 = Monday … 7 = Sunday.
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const DAILY_GOAL_MIN = 1
export const DAILY_GOAL_MAX = 20

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
  daily_goal?: number
  active_weekdays?: Weekday[]
  // Once set it cannot be emptied again: the server refuses `null`.
  timezone?: string
  morning_review?: boolean
  arcade_mode?: boolean
}

// Daily progress and arcade scoring (/api/v1/me/progress, feature 007). Every figure comes from
// the server: the client never sends a score, a streak or a level.
// A progress day, `YYYY-MM-DD`: it runs from 04:00 to 03:59 in the person's time zone.
export type ProgressDate = string

export interface ProgressDay {
  date: ProgressDate
  active: boolean
  goal: number
  completed_count: number
  goal_met: boolean
  mission_cleared: boolean
  // `null` with the arcade mode off.
  points: number | null
  closed: boolean
}

export type AnnouncementKind =
  'phase_clear' | 'mission_clear' | 'level_up' | 'achievement' | 'new_record'

export interface Announcement {
  id: string
  kind: AnnouncementKind
  // The level reached, the achievement id or the record, depending on `kind`.
  value: string | number | null
}

export interface Notice {
  id: string
  kind: 'schedule_skipped_limit'
  schedule_id: string
  schedule_title: string | null
  day: ProgressDate
}

export interface Mission {
  task_ids: string[]
  completed_ids: string[]
  cleared: boolean
}

export interface ArcadeScore {
  score: number
  level: number
  level_name: string
  // `null` on the last level.
  next_level_at: number | null
  points_today: number
}

export interface Progress {
  today: ProgressDate
  goal: number
  completed_count: number
  goal_met: boolean
  is_active_day: boolean
  mission: Mission
  show_review: boolean
  streak: number
  streak_at_stake: boolean
  // `null` with the arcade mode off.
  arcade: ArcadeScore | null
  last_day: ProgressDay | null
  announcements: Announcement[]
  notices: Notice[]
}
