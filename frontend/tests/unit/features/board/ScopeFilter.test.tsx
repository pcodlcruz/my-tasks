import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '../../../../src/stores/uiStore'

async function renderScopeFilter(): Promise<void> {
  const { ScopeFilter } = await import('../../../../src/features/board/ScopeFilter')
  render(<ScopeFilter />)
}

describe('<ScopeFilter>', () => {
  beforeEach(() => {
    useUiStore.setState({ scopeFilter: 'all' })
  })

  it('muestra tres opciones exclusivas con "Todas" seleccionada por defecto', async () => {
    await renderScopeFilter()

    const group = screen.getByRole('radiogroup', { name: /ámbito/i })
    expect(within(group).getByRole('radio', { name: /Todas/ })).toBeChecked()
    expect(within(group).getByRole('radio', { name: /Laboral/ })).not.toBeChecked()
    expect(within(group).getByRole('radio', { name: /Personal/ })).not.toBeChecked()
  })

  it('un clic cambia el filtro activo en el store', async () => {
    await renderScopeFilter()

    await userEvent.click(screen.getByRole('radio', { name: /Laboral/ }))

    expect(useUiStore.getState().scopeFilter).toBe('work')
    expect(screen.getByRole('radio', { name: /Laboral/ })).toBeChecked()
  })

  it('conserva el estado del filtro al volver a montar (navegación)', async () => {
    await renderScopeFilter()
    await userEvent.click(screen.getByRole('radio', { name: /Personal/ }))

    // Simula salir de la página (desmontar) y volver a entrar (montar de nuevo).
    await renderScopeFilter()

    expect(useUiStore.getState().scopeFilter).toBe('personal')
  })
})
