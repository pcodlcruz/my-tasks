import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../../../src/api/types'

vi.mock('../../../../src/lib/firebase', () => ({
  auth: { currentUser: null, signOut: vi.fn() },
}))

vi.mock('firebase/auth', () => ({
  getIdToken: vi.fn(),
}))

const PROFILE: Profile = {
  theme: 'system',
  density: 'comfortable',
  default_scope: 'all',
  board_order: 'oldest',
  history_days: null,
  display_name: null,
  avatar: { kind: 'initials', preset: null, version: 0 },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

interface Backend {
  profile: Profile
  patchStatus: number
  patchBodies: unknown[]
}

let backend: Backend

function installBackend(overrides: Partial<Backend> = {}): void {
  backend = { profile: PROFILE, patchStatus: 200, patchBodies: [], ...overrides }
  vi.mocked(fetch).mockImplementation((_url, init) => {
    if (init?.method === 'PATCH') {
      backend.patchBodies.push(JSON.parse(String(init.body)))
      if (backend.patchStatus !== 200) {
        return Promise.resolve(jsonResponse({ code: 'error', message: 'x' }, backend.patchStatus))
      }
      backend.profile = { ...backend.profile, ...(backend.patchBodies.at(-1) as Partial<Profile>) }
      return Promise.resolve(jsonResponse(backend.profile))
    }
    return Promise.resolve(jsonResponse(backend.profile))
  })
}

async function renderPage(): Promise<void> {
  const { ProfilePage } = await import('../../../../src/features/profile/ProfilePage')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>,
  )
}

function radio(group: string, name: string): HTMLElement {
  return within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name })
}

describe('<BoardPreferences> en la página de perfil', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('muestra los tres grupos con las opciones guardadas', async () => {
    installBackend({
      profile: { ...PROFILE, default_scope: 'work', board_order: 'newest', history_days: 90 },
    })

    await renderPage()

    expect(await screen.findByRole('heading', { name: 'Tablero e historial' })).toBeInTheDocument()
    expect(radio('Tablero por defecto', 'Laboral')).toBeChecked()
    expect(radio('Orden de las tareas', 'Más recientes primero')).toBeChecked()
    expect(radio('Historial', 'Últimos 90 días')).toBeChecked()
  })

  it('por defecto: «Todas», «Más antiguas primero» y historial completo', async () => {
    installBackend()

    await renderPage()

    await screen.findByRole('radiogroup', { name: 'Tablero por defecto' })
    expect(radio('Tablero por defecto', 'Todas')).toBeChecked()
    expect(radio('Orden de las tareas', 'Más antiguas primero')).toBeChecked()
    expect(radio('Historial', 'Todo')).toBeChecked()
  })

  it('guarda el tablero por defecto al elegirlo y anuncia «Guardado»', async () => {
    installBackend()
    await renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'Personal' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardado'))
    expect(backend.patchBodies).toEqual([{ default_scope: 'personal' }])
    expect(radio('Tablero por defecto', 'Personal')).toBeChecked()
  })

  it('guarda el orden al elegirlo', async () => {
    installBackend()
    await renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'Más recientes primero' }))

    await waitFor(() => expect(backend.patchBodies).toEqual([{ board_order: 'newest' }]))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardado'))
  })

  it('guarda el periodo del historial como número y «Todo» como null', async () => {
    installBackend()
    await renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'Últimos 30 días' }))
    await waitFor(() => expect(radio('Historial', 'Últimos 30 días')).toBeChecked())
    await userEvent.click(radio('Historial', 'Todo'))

    await waitFor(() =>
      expect(backend.patchBodies).toEqual([{ history_days: 30 }, { history_days: null }]),
    )
  })

  it('aclara que las tareas fijadas siempre aparecen arriba', async () => {
    installBackend()

    await renderPage()

    expect(
      await screen.findByText('Las tareas fijadas siempre aparecen arriba.'),
    ).toBeInTheDocument()
  })

  it('si falla al guardar, avisa y devuelve el control al valor guardado', async () => {
    installBackend({ patchStatus: 500 })
    await renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'Últimos 90 días' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el cambio. Inténtalo de nuevo.',
    )
    expect(radio('Historial', 'Todo')).toBeChecked()
    expect(radio('Historial', 'Últimos 90 días')).not.toBeChecked()
  })
})
