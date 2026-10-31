import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Announcement, Progress } from '../../../../src/api/types'

const useProgressMock = vi.fn()
const acknowledgeMutate = vi.fn()

vi.mock('../../../../src/api/progress', () => ({
  useProgress: () => useProgressMock(),
  useAcknowledge: () => ({ mutate: acknowledgeMutate }),
}))

const PROGRESS: Progress = {
  today: '2026-11-03',
  goal: 3,
  completed_count: 3,
  goal_met: true,
  is_active_day: true,
  mission: { task_ids: [], completed_ids: [], cleared: false },
  show_review: false,
  streak: 1,
  streak_at_stake: false,
  arcade: { score: 3450, level: 3, level_name: 'Jugador', next_level_at: 6000, points_today: 800 },
  last_day: null,
  announcements: [],
  notices: [],
}

function withAnnouncements(announcements: Announcement[], overrides: Partial<Progress> = {}) {
  return { data: { ...PROGRESS, announcements, ...overrides } }
}

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

async function renderCelebrations(): Promise<ReturnType<typeof render>> {
  const { Celebrations } = await import('../../../../src/features/progress/Celebrations')
  return render(<Celebrations />)
}

function region(): HTMLElement {
  const live = document.querySelector('[aria-live="polite"][data-celebrations]')
  if (!(live instanceof HTMLElement)) throw new Error('No hay región de celebraciones')
  return live
}

describe('<Celebrations>', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useProgressMock.mockReset()
    acknowledgeMutate.mockReset()
    stubReducedMotion(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([
    [{ id: '1', kind: 'phase_clear', value: 500 }, '¡FASE SUPERADA! +500'],
    [{ id: '2', kind: 'mission_clear', value: 300 }, '¡MISIÓN CUMPLIDA! +300'],
    [{ id: '3', kind: 'level_up', value: 3 }, '¡SUBES DE NIVEL!Nivel 3 · Jugador'],
    [{ id: '4', kind: 'achievement', value: 'first_coin' }, 'Logro: Primera moneda'],
    [{ id: '5', kind: 'new_record', value: 8 }, '¡NUEVO RÉCORD!'],
  ] as const)('el anuncio %o dice «%s»', async (announcement, text) => {
    useProgressMock.mockReturnValue(withAnnouncements([announcement]))

    await renderCelebrations()

    expect(region()).toHaveTextContent(text)
  })

  it('un nivel sin nombre en el marcador toma el del catálogo', async () => {
    useProgressMock.mockReturnValue(withAnnouncements([{ id: '1', kind: 'level_up', value: 2 }]))

    await renderCelebrations()

    expect(region()).toHaveTextContent('Nivel 2 · Aprendiz')
  })

  it('está en una región que no interrumpe y nunca se lleva el foco', async () => {
    const before = document.activeElement
    useProgressMock.mockReturnValue(
      withAnnouncements([{ id: '1', kind: 'phase_clear', value: 500 }]),
    )

    await renderCelebrations()

    expect(region()).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(before)
  })

  it('los muestra de uno en uno, en orden, y pasa al siguiente a los 3 s', async () => {
    useProgressMock.mockReturnValue(
      withAnnouncements([
        { id: '1', kind: 'achievement', value: 'first_coin' },
        { id: '2', kind: 'phase_clear', value: 500 },
      ]),
    )

    await renderCelebrations()
    expect(region()).toHaveTextContent('Logro: Primera moneda')
    expect(region()).not.toHaveTextContent('¡FASE SUPERADA!')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(region()).toHaveTextContent('¡FASE SUPERADA! +500')
    expect(region()).not.toHaveTextContent('Primera moneda')
  })

  it('«Cerrar» pasa al siguiente sin esperar', async () => {
    useProgressMock.mockReturnValue(
      withAnnouncements([
        { id: '1', kind: 'achievement', value: 'first_coin' },
        { id: '2', kind: 'phase_clear', value: 500 },
      ]),
    )
    await renderCelebrations()

    await act(async () => {
      screen.getByRole('button', { name: 'Cerrar' }).click()
    })

    expect(region()).toHaveTextContent('¡FASE SUPERADA! +500')
  })

  it('confirma cada anuncio una sola vez, al mostrarlo, aunque el progreso se recargue', async () => {
    const announcements: Announcement[] = [
      { id: '1', kind: 'achievement', value: 'first_coin' },
      { id: '2', kind: 'phase_clear', value: 500 },
    ]
    useProgressMock.mockReturnValue(withAnnouncements(announcements))
    const { rerender } = await renderCelebrations()
    const { Celebrations } = await import('../../../../src/features/progress/Celebrations')

    // A reload of the progress before the server has taken the confirmation into account.
    useProgressMock.mockReturnValue(withAnnouncements([...announcements]))
    rerender(<Celebrations />)
    expect(acknowledgeMutate.mock.calls).toEqual([[{ announcement_ids: ['1'] }]])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(acknowledgeMutate.mock.calls).toEqual([
      [{ announcement_ids: ['1'] }],
      [{ announcement_ids: ['2'] }],
    ])
    expect(region()).toBeEmptyDOMElement()
  })

  it('anima la aparición, salvo con el movimiento reducido', async () => {
    useProgressMock.mockReturnValue(
      withAnnouncements([{ id: '1', kind: 'phase_clear', value: 500 }]),
    )
    const { unmount } = await renderCelebrations()
    expect(region().innerHTML).toMatch(/animate-pop/)
    unmount()

    stubReducedMotion(true)
    await renderCelebrations()

    expect(region()).toHaveTextContent('¡FASE SUPERADA!')
    expect(region().innerHTML).not.toMatch(/animate-pop/)
  })

  it('con el modo arcade desactivado no muestra nada ni confirma nada', async () => {
    useProgressMock.mockReturnValue(
      withAnnouncements([{ id: '1', kind: 'phase_clear', value: 500 }], { arcade: null }),
    )

    await renderCelebrations()

    expect(region()).toBeEmptyDOMElement()
    expect(acknowledgeMutate).not.toHaveBeenCalled()
  })
})
