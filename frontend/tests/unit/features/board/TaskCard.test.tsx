import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../../../src/api/types'
import { useToastStore } from '../../../../src/stores/toastStore'

const setMissionMutate = vi.fn()

vi.mock('../../../../src/api/tasks', () => ({
  useTogglePin: () => ({ togglePin: vi.fn(), isPending: false }),
  useCompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useTrashTask: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('../../../../src/api/progress', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/api/progress')>()),
  useSetMission: () => ({ mutate: setMissionMutate, isPending: false }),
}))

vi.mock('../../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))

const TASK: Task = {
  id: 'task-1',
  title: 'Preparar la demo',
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
}

async function renderCard(
  missionTaskIds?: string[],
  task: Task = TASK,
  today?: string,
): Promise<void> {
  const { TaskCard } = await import('../../../../src/features/board/TaskCard')
  render(<TaskCard task={task} onEdit={vi.fn()} missionTaskIds={missionTaskIds} today={today} />)
}

describe('<TaskCard> · misión del día', () => {
  beforeEach(() => {
    setMissionMutate.mockReset()
    useToastStore.setState({ toasts: [] })
  })

  it('una tarea de la misión lleva estrella y el texto «Misión del día»', async () => {
    await renderCard(['task-1'])

    const marker = screen.getByText('Misión del día')
    expect(marker.parentElement?.textContent).toContain('★')
    expect(marker.parentElement?.querySelector('[aria-hidden="true"]')).toHaveTextContent('★')
  })

  it('una tarea fuera de la misión no lleva la marca', async () => {
    await renderCard(['otra'])

    expect(screen.queryByText('Misión del día')).not.toBeInTheDocument()
  })

  it('«Añadir a la misión» envía la misión actual más la tarea', async () => {
    await renderCard(['a', 'b'])

    await userEvent.click(screen.getByRole('button', { name: 'Añadir a la misión' }))

    expect(setMissionMutate).toHaveBeenCalledWith(['a', 'b', 'task-1'], expect.anything())
  })

  it('«Quitar de la misión» envía la misión actual sin la tarea', async () => {
    await renderCard(['a', 'task-1', 'b'])

    await userEvent.click(screen.getByRole('button', { name: 'Quitar de la misión' }))

    expect(setMissionMutate).toHaveBeenCalledWith(['a', 'b'], expect.anything())
  })

  it('con 5 tareas en la misión no deja añadir más y dice por qué', async () => {
    await renderCard(['a', 'b', 'c', 'd', 'e'])

    const button = screen.getByRole('button', { name: 'Añadir a la misión' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('La misión ya tiene 5 tareas.')
  })

  it('con 5 tareas sí deja quitar una de ellas', async () => {
    await renderCard(['a', 'b', 'c', 'd', 'task-1'])

    expect(screen.getByRole('button', { name: 'Quitar de la misión' })).toBeEnabled()
  })

  it('si el servidor lo rechaza, avisa con un mensaje propio y la misión no cambia', async () => {
    const { ApiClientError } = await import('../../../../src/lib/apiClient')
    setMissionMutate.mockImplementation(
      (_ids: string[], options: { onError: (error: unknown) => void }) =>
        options.onError(new ApiClientError({ code: 'mission_invalid_task', message: 'SECRETO' })),
    )
    await renderCard(['a'])

    await userEvent.click(screen.getByRole('button', { name: 'Añadir a la misión' }))

    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
      'Alguna de esas tareas ya no está activa. Revisa la misión y vuelve a intentarlo.',
    ])
    expect(screen.queryByText('Misión del día')).not.toBeInTheDocument()
  })

  it('sin datos de la misión (el progreso no cargó) no ofrece el botón', async () => {
    await renderCard(undefined)

    expect(screen.queryByRole('button', { name: /misión/ })).not.toBeInTheDocument()
  })
})

describe('<TaskCard> · tareas programadas', () => {
  const SCHEDULED: Task = { ...TASK, schedule_id: 's1', scheduled_for: '2026-11-04' }

  it('una tarea normal no lleva la marca', async () => {
    await renderCard(undefined, TASK, '2026-11-04')

    expect(screen.queryByText('Programada')).not.toBeInTheDocument()
    expect(screen.queryByText(/Pendiente desde/)).not.toBeInTheDocument()
  })

  it('una programada lleva icono y el texto «Programada»', async () => {
    await renderCard(undefined, SCHEDULED, '2026-11-04')

    const mark = screen.getByText('Programada')
    expect(mark.parentElement?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText(/Pendiente desde/)).not.toBeInTheDocument()
  })

  it('si su día ya pasó dice desde cuándo está pendiente', async () => {
    await renderCard(undefined, { ...SCHEDULED, scheduled_for: '2026-11-02' }, '2026-11-04')

    expect(screen.getByText('Programada')).toBeInTheDocument()
    expect(screen.getByText('Pendiente desde el lun 2')).toBeInTheDocument()
  })

  it('sin saber qué día es hoy (el progreso no cargó) no habla de pendiente', async () => {
    await renderCard(undefined, { ...SCHEDULED, scheduled_for: '2026-11-02' }, undefined)

    expect(screen.getByText('Programada')).toBeInTheDocument()
    expect(screen.queryByText(/Pendiente desde/)).not.toBeInTheDocument()
  })

  it('puede ser a la vez programada y de la misión', async () => {
    await renderCard(['task-1'], SCHEDULED, '2026-11-04')

    expect(screen.getByText('Programada')).toBeInTheDocument()
    expect(screen.getByText('Misión del día')).toBeInTheDocument()
  })
})
