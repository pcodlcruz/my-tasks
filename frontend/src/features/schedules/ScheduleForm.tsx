import { useEffect, useRef, useState } from 'react'
import { useCreateSchedule, useUpdateSchedule } from '../../api/schedules'
import {
  QUADRANT_LABELS,
  type Quadrant,
  type Recurrence,
  type Schedule,
  type ScheduleCreate,
  type ScheduleUpdate,
  type Scope,
  type Weekday,
  quadrantFor,
} from '../../api/types'
import { useRestoreFocus } from '../../app/useRestoreFocus'
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type TaskFormErrors,
  validateTaskForm,
} from '../task-form/taskFormSchema'
import { describeDay, startingOccurrence } from './recurrenceLabel'

interface ScheduleFormProps {
  // The progress day today is, in the person's zone: the date of a one-off cannot be before it.
  today: string
  onClose: () => void
  // Editing this one; without it, a new schedule.
  schedule?: Schedule
}

type Kind = Recurrence['kind']

const KINDS: { value: Kind; label: string }[] = [
  { value: 'once', label: 'Una vez' },
  { value: 'daily', label: 'Cada día' },
  { value: 'weekly', label: 'Días de la semana' },
  { value: 'monthly', label: 'Un día del mes' },
]

const WEEKDAYS: { value: Weekday; short: string; name: string }[] = [
  { value: 1, short: 'L', name: 'Lunes' },
  { value: 2, short: 'M', name: 'Martes' },
  { value: 3, short: 'X', name: 'Miércoles' },
  { value: 4, short: 'J', name: 'Jueves' },
  { value: 5, short: 'V', name: 'Viernes' },
  { value: 6, short: 'S', name: 'Sábado' },
  { value: 7, short: 'D', name: 'Domingo' },
]

const SCOPE_OPTIONS: { value: Scope; label: string; hint: string }[] = [
  { value: 'work', label: 'Laboral', hint: 'Proyectos y trabajo' },
  { value: 'personal', label: 'Personal', hint: 'Hogar, salud y vida' },
]

// Full literal class names on purpose (see Quadrant.tsx): Tailwind's scanner
// does not generate utilities built from templates.
const QUADRANT_PREVIEW_SURFACE: Record<Quadrant, string> = {
  do_now: 'bg-quadrant-do-now-surface',
  schedule: 'bg-quadrant-schedule-surface',
  delegate: 'bg-quadrant-delegate-surface',
  eliminate: 'bg-quadrant-eliminate-surface',
}

const INPUT =
  'rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20'
const FIELD_ERROR = 'text-xs font-medium text-error'

interface ScheduleFormErrors extends TaskFormErrors {
  recurrence?: string
}

interface RecurrenceDraft {
  kind: Kind
  date: string
  weekdays: Weekday[]
  monthDay: string
}

function draftFrom(rule: Recurrence | undefined): RecurrenceDraft {
  const draft: RecurrenceDraft = { kind: 'daily', date: '', weekdays: [], monthDay: '1' }
  if (rule === undefined) return draft
  switch (rule.kind) {
    case 'once':
      return { ...draft, kind: 'once', date: rule.date }
    case 'weekly':
      return { ...draft, kind: 'weekly', weekdays: [...rule.weekdays] }
    case 'monthly':
      return { ...draft, kind: 'monthly', monthDay: String(rule.month_day) }
    case 'daily':
      return draft
  }
}

function toggleWeekday(days: readonly Weekday[], day: Weekday): Weekday[] {
  return (days.includes(day) ? days.filter((value) => value !== day) : [...days, day]).sort(
    (a, b) => a - b,
  )
}

// The repetition the person has chosen, or why it is not valid yet.
function buildRecurrence(
  draft: RecurrenceDraft,
  today: string,
): { rule: Recurrence } | { error: string } {
  switch (draft.kind) {
    case 'daily':
      return { rule: { kind: 'daily' } }
    case 'once':
      if (draft.date === '') return { error: 'Elige una fecha.' }
      if (draft.date < today) return { error: 'La fecha no puede ser anterior a hoy.' }
      return { rule: { kind: 'once', date: draft.date } }
    case 'weekly':
      if (draft.weekdays.length === 0) return { error: 'Elige al menos un día de la semana.' }
      return { rule: { kind: 'weekly', weekdays: draft.weekdays } }
    case 'monthly': {
      const day = Number(draft.monthDay)
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        return { error: 'Elige un día entre 1 y 31.' }
      }
      return { rule: { kind: 'monthly', month_day: day } }
    }
  }
}

function sameRecurrence(a: Recurrence, b: Recurrence): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Only what differs from the saved schedule: the repetition in particular makes the server work
// out the next occurrence again, so it is not sent when it was not touched.
function changesFrom(schedule: Schedule, values: ScheduleCreate): ScheduleUpdate {
  const changes: ScheduleUpdate = {}
  if (values.title !== schedule.title) changes.title = values.title
  if (values.description !== schedule.description) changes.description = values.description
  if (values.urgent !== schedule.urgent) changes.urgent = values.urgent
  if (values.important !== schedule.important) changes.important = values.important
  if (values.scope !== schedule.scope) changes.scope = values.scope
  if (!sameRecurrence(values.recurrence, schedule.recurrence)) {
    changes.recurrence = values.recurrence
  }
  return changes
}

// Creating and editing a scheduled task (S11): the fields of a task (same texts and checks as the
// task form) plus how it repeats, with a preview of when it next appears. The server checks it
// all again; a failure is reported by the hook and the form stays open with what was typed.
export function ScheduleForm({ today, onClose, schedule }: ScheduleFormProps): JSX.Element {
  useRestoreFocus()
  const dialogRef = useRef<HTMLDivElement>(null)
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const isEditing = schedule !== undefined
  const isPending = isEditing ? updateSchedule.isPending : createSchedule.isPending

  const [title, setTitle] = useState(schedule?.title ?? '')
  const [description, setDescription] = useState(schedule?.description ?? '')
  const [urgent, setUrgent] = useState(schedule?.urgent ?? false)
  const [important, setImportant] = useState(schedule?.important ?? false)
  const [scope, setScope] = useState<Scope | null>(schedule?.scope ?? null)
  const [draft, setDraft] = useState<RecurrenceDraft>(() => draftFrom(schedule?.recurrence))
  const [errors, setErrors] = useState<ScheduleFormErrors>({})

  // Initial focus once, on opening: `onClose` is a new function on every render of the page.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('input, textarea')?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || dialogRef.current === null) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const quadrant = quadrantFor(urgent, important)
  const built = buildRecurrence(draft, today)
  const next =
    'rule' in built
      ? startingOccurrence(built.rule, today, schedule?.last_generated_for ?? null)
      : null

  function chooseKind(kind: Kind): void {
    setDraft((current) => ({ ...current, kind }))
    setErrors((current) => ({ ...current, recurrence: undefined }))
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const validation: ScheduleFormErrors = validateTaskForm({
      title,
      description,
      urgent,
      important,
      scope,
    })
    if ('error' in built) validation.recurrence = built.error
    setErrors(validation)
    if (Object.keys(validation).length > 0 || scope === null || 'error' in built) return

    const values: ScheduleCreate = {
      title: title.trim(),
      description: description.trim(),
      urgent,
      important,
      scope,
      recurrence: built.rule,
    }
    try {
      if (isEditing) {
        const data = changesFrom(schedule, values)
        if (Object.keys(data).length > 0) {
          await updateSchedule.mutateAsync({ id: schedule.id, data })
        }
      } else {
        await createSchedule.mutateAsync(values)
      }
    } catch {
      // The hook already reports the failure with a toast; the form stays open so nothing that
      // was typed is lost.
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-form-title"
        className="flex max-h-[90vh] w-full max-w-[620px] flex-col overflow-y-auto rounded-2xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 id="schedule-form-title" className="text-xl font-semibold text-text">
            {isEditing ? 'Editar programación' : 'Nueva programación'}
          </h2>
          <button
            type="button"
            aria-label="Cerrar modal"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt hover:text-text"
          >
            ✕
          </button>
        </div>

        <form
          noValidate
          className="flex flex-col gap-5 p-6"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="schedule-title" className="text-sm font-semibold text-text">
                Título
              </label>
              <span className="text-xs text-text-muted">
                {title.length}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            <input
              id="schedule-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={errors.title !== undefined}
              className={INPUT}
            />
            {errors.title && (
              <p role="alert" className={FIELD_ERROR}>
                {errors.title}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="schedule-description" className="text-sm font-semibold text-text">
                Descripción
              </label>
              <span className="text-xs text-text-muted">
                {description.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="schedule-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-invalid={errors.description !== undefined}
              className={`min-h-[84px] resize-y ${INPUT}`}
            />
            {errors.description && (
              <p role="alert" className={FIELD_ERROR}>
                {errors.description}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface-alt p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Priorización Eisenhower
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface p-3">
                <span className="text-sm font-semibold text-text">¿Es Urgente?</span>
                <input
                  type="checkbox"
                  aria-label="Marcar como urgente"
                  checked={urgent}
                  onChange={(event) => setUrgent(event.target.checked)}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface p-3">
                <span className="text-sm font-semibold text-text">¿Es Importante?</span>
                <input
                  type="checkbox"
                  aria-label="Marcar como importante"
                  checked={important}
                  onChange={(event) => setImportant(event.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-text">Ámbito de la tarea</span>
            <div
              role="radiogroup"
              aria-label="Seleccionar ámbito de tarea"
              className="grid grid-cols-2 gap-3"
            >
              {SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-border bg-surface p-3"
                >
                  <input
                    type="radio"
                    name="schedule_scope"
                    value={option.value}
                    aria-label={option.label}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                  />
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold text-text">{option.label}</span>
                    <span className="text-[11px] leading-none text-text-muted">{option.hint}</span>
                  </div>
                </label>
              ))}
            </div>
            {errors.scope && (
              <p role="alert" className={FIELD_ERROR}>
                {errors.scope}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-alt p-4">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Repetición
            </span>
            <div
              role="radiogroup"
              aria-label="Repetición"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {KINDS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 bg-surface p-3 ${
                    draft.kind === option.value ? 'border-primary' : 'border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="schedule_kind"
                    value={option.value}
                    aria-label={option.label}
                    checked={draft.kind === option.value}
                    onChange={() => chooseKind(option.value)}
                  />
                  <span className="text-sm font-semibold text-text">{option.label}</span>
                </label>
              ))}
            </div>

            {draft.kind === 'once' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="schedule-date" className="text-sm font-semibold text-text">
                  Fecha
                </label>
                <input
                  id="schedule-date"
                  type="date"
                  min={today}
                  value={draft.date}
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                  aria-invalid={errors.recurrence !== undefined}
                  className={`max-w-[14rem] ${INPUT}`}
                />
              </div>
            )}

            {draft.kind === 'weekly' && (
              <div role="group" aria-label="Días de la semana" className="flex flex-wrap gap-2">
                {WEEKDAYS.map((weekday) => {
                  const chosen = draft.weekdays.includes(weekday.value)
                  return (
                    <button
                      key={weekday.value}
                      type="button"
                      aria-label={weekday.name}
                      aria-pressed={chosen}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          weekdays: toggleWeekday(draft.weekdays, weekday.value),
                        })
                      }
                      className={
                        chosen
                          ? 'flex h-9 w-9 items-center justify-center rounded-lg border-2 border-primary bg-quadrant-schedule-surface text-caption font-semibold text-primary'
                          : 'flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-caption text-text-muted hover:bg-surface-alt'
                      }
                    >
                      {weekday.short}
                    </button>
                  )
                })}
              </div>
            )}

            {draft.kind === 'monthly' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="schedule-month-day" className="text-sm font-semibold text-text">
                  Día del mes
                </label>
                <input
                  id="schedule-month-day"
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  value={draft.monthDay}
                  onChange={(event) => setDraft({ ...draft, monthDay: event.target.value })}
                  aria-invalid={errors.recurrence !== undefined}
                  className={`max-w-[8rem] ${INPUT}`}
                />
                {Number(draft.monthDay) >= 29 && (
                  <p className="text-xs text-text-muted">En los meses más cortos, el último día.</p>
                )}
              </div>
            )}

            {errors.recurrence && (
              <p role="alert" className={FIELD_ERROR}>
                {errors.recurrence}
              </p>
            )}

            {'rule' in built && next !== null && (
              <p aria-live="polite" className="text-sm font-semibold text-text">
                Próxima aparición: {describeDay(next, today)}
              </p>
            )}
          </div>

          <div
            className={`flex items-center justify-between rounded-xl border p-3.5 ${QUADRANT_PREVIEW_SURFACE[quadrant]}`}
          >
            <span className="text-sm font-bold text-text">Irá a: {QUADRANT_LABELS[quadrant]}</span>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-alt"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
