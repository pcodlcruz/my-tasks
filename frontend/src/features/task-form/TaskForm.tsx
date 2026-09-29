import { useEffect, useRef, useState } from 'react'
import { QUADRANT_LABELS, type Quadrant, type Scope, type Task, quadrantFor } from '../../api/types'
import { useCreateTask, useUpdateTask } from '../../api/tasks'
import { useRestoreFocus } from '../../app/useRestoreFocus'
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  type TaskFormErrors,
  validateTaskForm,
} from './taskFormSchema'

interface TaskFormProps {
  onClose: () => void
  task?: Task
}

const SCOPE_OPTIONS: { value: Scope; label: string; hint: string }[] = [
  { value: 'work', label: 'Laboral', hint: 'Proyectos y trabajo' },
  { value: 'personal', label: 'Personal', hint: 'Hogar, salud y vida' },
]

// Nombres de clase completos y literales a propósito (ver Quadrant.tsx): el
// escáner de Tailwind no genera utilidades construidas con plantillas.
const QUADRANT_PREVIEW_SURFACE: Record<Quadrant, string> = {
  do_now: 'bg-quadrant-do-now-surface',
  schedule: 'bg-quadrant-schedule-surface',
  delegate: 'bg-quadrant-delegate-surface',
  eliminate: 'bg-quadrant-eliminate-surface',
}

export function TaskForm({ onClose, task }: TaskFormProps): JSX.Element {
  useRestoreFocus()
  const dialogRef = useRef<HTMLDivElement>(null)
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const isEditing = task !== undefined
  const isPending = isEditing ? updateTask.isPending : createTask.isPending

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [urgent, setUrgent] = useState(task?.urgent ?? false)
  const [important, setImportant] = useState(task?.important ?? false)
  const [scope, setScope] = useState<Scope | null>(task?.scope ?? null)
  const [errors, setErrors] = useState<TaskFormErrors>({})

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || dialogRef.current === null) {
        return
      }
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) {
        return
      }
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
    dialogRef.current?.querySelector<HTMLElement>('input, textarea')?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const quadrant = quadrantFor(urgent, important)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const validationErrors = validateTaskForm({ title, description, urgent, important, scope })
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0 || scope === null) {
      return
    }
    const values = {
      title: title.trim(),
      description: description.trim(),
      urgent,
      important,
      scope,
    }
    if (isEditing) {
      await updateTask.mutateAsync({ taskId: task.id, data: values })
    } else {
      await createTask.mutateAsync(values)
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
        aria-labelledby="task-form-title"
        className="flex max-h-[90vh] w-full max-w-[620px] flex-col overflow-y-auto rounded-2xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h2 id="task-form-title" className="text-xl font-semibold text-text">
            {isEditing ? 'Editar tarea' : 'Nueva tarea'}
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

        <form className="flex flex-col gap-5 p-6" onSubmit={(event) => void handleSubmit(event)}>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="task-title" className="text-sm font-semibold text-text">
                Título
              </label>
              <span className="text-xs text-text-muted">
                {title.length}/{TITLE_MAX_LENGTH}
              </span>
            </div>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={errors.title !== undefined}
              className="rounded-lg border border-border px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {errors.title && (
              <p role="alert" className="text-xs font-medium text-error">
                {errors.title}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="task-description" className="text-sm font-semibold text-text">
                Descripción
              </label>
              <span className="text-xs text-text-muted">
                {description.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id="task-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              aria-invalid={errors.description !== undefined}
              className="min-h-[84px] resize-y rounded-lg border border-border px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {errors.description && (
              <p role="alert" className="text-xs font-medium text-error">
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
                    name="task_scope"
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
              <p role="alert" className="text-xs font-medium text-error">
                {errors.scope}
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
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
