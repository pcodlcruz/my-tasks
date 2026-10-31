import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Progress, Task } from '../../../../src/api/types'

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

const markReviewSeenMutate = vi.fn()
const setMissionMutate = vi.fn<(ids: string[], options?: MutateOptions) => void>()

vi.mock('../../../../src/api/progress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/api/progress')>()),
  useMarkReviewSeen: () => ({ mutate: markReviewSeenMutate, isPending: false }),
  useSetMission: () => ({ mutate: setMissionMutate, isPending: false }),
}))

vi.mock('../../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))

const PROGRESS: Progress = {
  today: '2026-11-03',
  goal: 3,
  completed_count: 0,
  goal_met: false,
  is_active_day: true,
  mission: { task_ids: [], completed_ids: [], cleared: false },
  show_review: true,
  streak: 4,
  streak_at_stake: true,
  arcade: { score: 0, level: 1, level_name: 'Novato', next_level_at: 1000, points_today: 0 },
  last_day: {
    date: '2026-11-02',
    active: true,
    goal: 3,
    completed_count: 4,
    goal_met: true,
    mission_cleared: false,
    points: 200,
    closed: true,
  },
  announcements: [],
  notices: [],
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Tarea ${id}`,
    description: 'Detalle',
    urgent: true,
    important: true,
    quadrant: 'do_now',
    scope: 'work',
    pinned: false,
    status: 'active',
    in_trash: false,
    created_at: '2026-10-31T08:00:00Z',
    updated_at: '2026-10-31T08:00:00Z',
    completed_at: null,
    trashed_at: null,
    purge_at: null,
    schedule_id: null,
    scheduled_for: null,
    ...overrides,
  }
}

const TASKS: Task[] = [
  task('a'),
  task('b'),
  task('p', { urgent: false, quadrant: 'schedule' }),
  task('s', {
    urgent: false,
    important: false,
    quadrant: 'eliminate',
    scheduled_for: '2026-11-03',
  }),
]

interface Options {
  progress?: Progress
  tasks?: Task[]
  // The tasks have not arrived yet (`tasks` is then `undefined`).
  loading?: boolean
}

async function renderDialog({
  progress = PROGRESS,
  tasks = TASKS,
  loading = false,
}: Options = {}): Promise<{
  onClose: ReturnType<typeof vi.fn>
  onCreateTask: ReturnType<typeof vi.fn>
}> {
  const { StartOfDayDialog } = await import('../../../../src/features/progress/StartOfDayDialog')
  const onClose = vi.fn()
  const onCreateTask = vi.fn()
  render(
    <StartOfDayDialog
      progress={progress}
      tasks={loading ? undefined : tasks}
      onClose={onClose}
      onCreateTask={onCreateTask}
    />,
  )
  return { onClose, onCreateTask }
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'PULSA START' })
}

describe('<StartOfDayDialog>', () => {
  beforeEach(() => {
    markReviewSeenMutate.mockReset()
    setMissionMutate.mockReset()
  })

  it('resume ayer, la racha y la meta de hoy', async () => {
    await renderDialog()

    const summary = within(dialog())
    expect(summary.getByRole('group', { name: 'Ayer' })).toHaveTextContent('4/3')
    expect(summary.getByRole('group', { name: 'Ayer' })).toHaveTextContent('Fase superada')
    expect(summary.getByRole('group', { name: 'Racha' })).toHaveTextContent('4 días')
    expect(summary.getByRole('group', { name: 'Meta de hoy' })).toHaveTextContent('3 tareas')
  })

  it('si el último día activo no fue ayer, lo dice así', async () => {
    await renderDialog({
      progress: {
        ...PROGRESS,
        last_day: { ...PROGRESS.last_day!, date: '2026-10-30', goal_met: false },
      },
    })

    const last = screen.getByRole('group', { name: 'Último día activo' })
    expect(last).toHaveTextContent('Meta no cumplida')
  })

  it('el primer día muestra «PARTIDA NUEVA»', async () => {
    await renderDialog({ progress: { ...PROGRESS, last_day: null, streak: 0 } })

    expect(dialog()).toHaveTextContent('PARTIDA NUEVA')
    expect(screen.queryByRole('group', { name: 'Ayer' })).not.toBeInTheDocument()
  })

  it('lista «Hacer ahora» y las programadas de hoy, y no las demás tareas', async () => {
    await renderDialog()

    expect(
      within(screen.getByRole('group', { name: 'Hacer ahora' })).getAllByRole('button'),
    ).toHaveLength(2)
    const scheduled = screen.getByRole('group', { name: 'Programadas de hoy' })
    expect(within(scheduled).getByRole('button', { name: /Tarea s/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tarea p/ })).not.toBeInTheDocument()
  })

  it('sin tareas activas invita a crear la primera en vez de mostrar listas vacías', async () => {
    const { onCreateTask } = await renderDialog({ tasks: [] })

    expect(dialog()).toHaveTextContent('Aún no tienes tareas activas.')
    expect(screen.queryByRole('group', { name: 'Hacer ahora' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Crear la primera tarea' }))
    expect(markReviewSeenMutate).toHaveBeenCalledOnce()
    expect(onCreateTask).toHaveBeenCalledOnce()
  })

  it('mientras cargan las tareas lo anuncia', async () => {
    await renderDialog({ loading: true })

    expect(screen.getByRole('status', { name: 'Cargando tareas' })).toBeInTheDocument()
  })

  it('es modal, empieza con el foco dentro y lo atrapa con Tab', async () => {
    await renderDialog()

    expect(dialog()).toHaveAttribute('aria-modal', 'true')
    expect(dialog()).toContainElement(document.activeElement as HTMLElement)
    const start = screen.getByRole('button', { name: 'Empezar' })
    start.focus()
    await userEvent.tab()
    expect(dialog()).toContainElement(document.activeElement as HTMLElement)
    await userEvent.tab({ shift: true })
    expect(start).toHaveFocus()
  })

  it('«Empezar» sin cambios marca la revisión como vista y cierra, sin tocar la misión', async () => {
    const { onClose } = await renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))

    expect(setMissionMutate).not.toHaveBeenCalled()
    expect(markReviewSeenMutate).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape marca la revisión como vista y devuelve el foco a quien la abrió', async () => {
    const { StartOfDayDialog } = await import('../../../../src/features/progress/StartOfDayDialog')
    function Opener(): JSX.Element {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          {open && (
            <StartOfDayDialog
              progress={PROGRESS}
              tasks={TASKS}
              onClose={() => setOpen(false)}
              onCreateTask={vi.fn()}
            />
          )}
        </>
      )
    }
    render(<Opener />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(dialog()).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    expect(markReviewSeenMutate).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })

  it('con tareas elegidas, «Empezar» guarda la misión y luego cierra', async () => {
    setMissionMutate.mockImplementation((_ids, options) => options?.onSuccess?.())
    const { onClose } = await renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Añadir a la misión: Tarea a' }))
    await userEvent.click(screen.getByRole('button', { name: 'Añadir a la misión: Tarea s' }))
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))

    expect(setMissionMutate).toHaveBeenCalledWith(['a', 's'], expect.anything())
    expect(markReviewSeenMutate).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('si el servidor rechaza la misión, avisa, conserva la selección y no cierra', async () => {
    const { ApiClientError } = await import('../../../../src/lib/apiClient')
    setMissionMutate.mockImplementation((_ids, options) =>
      options?.onError?.(new ApiClientError({ code: 'mission_invalid_task', message: 'SECRETO' })),
    )
    const { onClose } = await renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Añadir a la misión: Tarea a' }))
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))

    expect(within(dialog()).getByRole('alert')).toHaveTextContent(
      'Alguna de esas tareas ya no está activa.',
    )
    expect(dialog()).not.toHaveTextContent('SECRETO')
    expect(screen.getByRole('button', { name: 'Añadir a la misión: Tarea a' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(markReviewSeenMutate).not.toHaveBeenCalled()
  })

  it('parte de la misión que ya hay hoy', async () => {
    await renderDialog({
      progress: { ...PROGRESS, mission: { task_ids: ['b'], completed_ids: [], cleared: false } },
    })

    expect(screen.getByRole('button', { name: 'Añadir a la misión: Tarea b' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(dialog()).toHaveTextContent('Misión del día: 1 de 5 elegidas')
  })
})
