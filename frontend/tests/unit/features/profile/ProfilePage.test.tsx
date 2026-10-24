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

const SAVE_ERROR = 'No se pudo guardar el cambio. Inténtalo de nuevo.'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

interface Backend {
  profile: Profile
  getStatus: number
  patchStatus: number
  patchBodies: unknown[]
  deleteCalls: number
}

let backend: Backend

function installBackend(overrides: Partial<Backend> = {}): void {
  backend = {
    profile: PROFILE,
    getStatus: 200,
    patchStatus: 200,
    patchBodies: [],
    deleteCalls: 0,
    ...overrides,
  }
  vi.mocked(fetch).mockImplementation((_url, init) => {
    const method = init?.method ?? 'GET'
    if (method === 'PATCH') {
      backend.patchBodies.push(JSON.parse(String(init?.body)))
      if (backend.patchStatus !== 200) {
        return Promise.resolve(
          jsonResponse(
            { code: 'validation_error', message: 'TEXTO INTERNO DEL SERVIDOR' },
            backend.patchStatus,
          ),
        )
      }
      backend.profile = { ...backend.profile, ...(backend.patchBodies.at(-1) as Partial<Profile>) }
      return Promise.resolve(jsonResponse(backend.profile))
    }
    if (method === 'DELETE') {
      backend.deleteCalls += 1
      backend.profile = {
        ...backend.profile,
        theme: 'system',
        density: 'comfortable',
        default_scope: 'all',
        board_order: 'oldest',
        history_days: null,
      }
      return Promise.resolve(jsonResponse(backend.profile))
    }
    if (backend.getStatus !== 200) {
      return Promise.resolve(jsonResponse({ code: 'error', message: 'x' }, backend.getStatus))
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

describe('<ProfilePage>', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    vi.stubGlobal('fetch', vi.fn())
  })

  it('muestra un estado de carga accesible mientras llega el perfil', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined))

    await renderPage()

    expect(screen.getByRole('heading', { name: 'Perfil', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Cargando perfil' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('si no se puede cargar, avisa con "Reintentar" y vuelve a pedirlo', async () => {
    installBackend({ getStatus: 500 })
    await renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo cargar tu perfil.')

    installBackend({ getStatus: 200 })
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra el tema y la densidad guardados como opciones exclusivas', async () => {
    installBackend({ profile: { ...PROFILE, theme: 'dark', density: 'compact' } })

    await renderPage()

    expect(await screen.findByRole('radio', { name: 'Oscuro' })).toBeChecked()
    expect(radio('Tema', 'Claro')).not.toBeChecked()
    expect(radio('Tema', 'Sistema')).not.toBeChecked()
    expect(radio('Densidad', 'Compacta')).toBeChecked()
    expect(radio('Densidad', 'Cómoda')).not.toBeChecked()
  })

  it('al elegir un tema, envía solo ese cambio y anuncia "Guardado" con role="status"', async () => {
    installBackend()
    await renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'Oscuro' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardado'))
    expect(backend.patchBodies).toEqual([{ theme: 'dark' }])
    expect(radio('Tema', 'Oscuro')).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('al elegir una densidad, envía solo ese cambio', async () => {
    installBackend()
    await renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'Compacta' }))

    await waitFor(() => expect(backend.patchBodies).toEqual([{ density: 'compact' }]))
  })

  it('anuncia "Guardando…" mientras espera al servidor', async () => {
    installBackend()
    await renderPage()
    await screen.findByRole('radiogroup', { name: 'Tema' })
    let finish: (response: Response) => void = () => undefined
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )

    await userEvent.click(radio('Tema', 'Oscuro'))

    expect(await screen.findByRole('status')).toHaveTextContent('Guardando')
    finish(jsonResponse({ ...PROFILE, theme: 'dark' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardado'))
  })

  it('si falla al guardar, avisa con role="alert", devuelve el control al valor guardado y permite reintentar', async () => {
    installBackend({ patchStatus: 500 })
    await renderPage()

    await userEvent.click(await screen.findByRole('radio', { name: 'Oscuro' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(SAVE_ERROR)
    expect(alert).not.toHaveTextContent('TEXTO INTERNO DEL SERVIDOR')
    expect(radio('Tema', 'Sistema')).toBeChecked()
    expect(radio('Tema', 'Oscuro')).not.toBeChecked()

    backend.patchStatus = 200
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardado'))
    expect(backend.patchBodies).toEqual([{ theme: 'dark' }, { theme: 'dark' }])
    expect(radio('Tema', 'Oscuro')).toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un cambio correcto posterior limpia el aviso de error', async () => {
    installBackend({ patchStatus: 500 })
    await renderPage()
    await userEvent.click(await screen.findByRole('radio', { name: 'Oscuro' }))
    await screen.findByRole('alert')

    backend.patchStatus = 200
    await userEvent.click(radio('Densidad', 'Compacta'))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('los grupos son navegables con el teclado y tienen nombre accesible', async () => {
    installBackend()
    await renderPage()
    const system = await screen.findByRole('radio', { name: 'Sistema' })

    system.focus()
    await userEvent.keyboard('{ArrowLeft}')

    await waitFor(() => expect(backend.patchBodies).toEqual([{ theme: 'dark' }]))
    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Densidad' })).toBeInTheDocument()
  })

  it('"Restablecer valores por defecto" pide confirmación y no hace nada si se cancela', async () => {
    installBackend({ profile: { ...PROFILE, theme: 'dark' } })
    await renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restablecer valores por defecto' }),
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(backend.deleteCalls).toBe(0)
    expect(radio('Tema', 'Oscuro')).toBeChecked()
  })

  it('al confirmar el restablecimiento, vuelven los valores por defecto y se anuncia "Guardado"', async () => {
    installBackend({ profile: { ...PROFILE, theme: 'dark', density: 'compact' } })
    await renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restablecer valores por defecto' }),
    )
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restablecer' }),
    )

    await waitFor(() => expect(backend.deleteCalls).toBe(1))
    await waitFor(() => expect(radio('Tema', 'Sistema')).toBeChecked())
    expect(radio('Densidad', 'Cómoda')).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Guardado')
  })

  it('aclara que restablecer no cambia el nombre ni el avatar', async () => {
    installBackend()
    await renderPage()

    expect(await screen.findByText('No cambia tu nombre ni tu avatar.')).toBeInTheDocument()
  })

  it('si falla el restablecimiento, avisa y mantiene los valores guardados', async () => {
    installBackend({ profile: { ...PROFILE, theme: 'dark' } })
    await renderPage()
    vi.mocked(fetch).mockImplementation((_url, init) =>
      Promise.resolve(
        init?.method === 'DELETE'
          ? jsonResponse({}, 500)
          : jsonResponse({ ...PROFILE, theme: 'dark' }),
      ),
    )

    await userEvent.click(
      await screen.findByRole('button', { name: 'Restablecer valores por defecto' }),
    )
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restablecer' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR)
    expect(radio('Tema', 'Oscuro')).toBeChecked()
  })
})
