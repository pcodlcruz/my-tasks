import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../../src/api/types'

const useSessionMock = vi.fn()
const useIsAdminMock = vi.fn()
const useProfileMock = vi.fn()
const useAvatarUrlMock = vi.fn()

vi.mock('../../../src/features/auth/useSession', () => ({
  useSession: () => useSessionMock(),
}))

vi.mock('../../../src/features/auth/useIsAdmin', () => ({
  useIsAdmin: () => useIsAdminMock(),
}))

vi.mock('../../../src/api/profile', () => ({
  useProfile: () => useProfileMock(),
  useAvatarUrl: (...args: unknown[]) => useAvatarUrlMock(...args),
}))

const PROFILE: Profile = {
  theme: 'system',
  density: 'comfortable',
  default_scope: 'all',
  board_order: 'oldest',
  history_days: null,
  display_name: null,
  avatar: { kind: 'initials', preset: null, version: 0 },
  daily_goal: 3,
  active_weekdays: [1, 2, 3, 4, 5, 6, 7],
  timezone: 'Europe/Madrid',
  morning_review: true,
  arcade_mode: true,
}

function profileResult(profile: Partial<Profile> = {}): Record<string, unknown> {
  return { data: { ...PROFILE, ...profile }, isPending: false, isError: false }
}

function signedIn(user: Record<string, unknown> = {}): void {
  useSessionMock.mockReturnValue({
    user: { uid: 'u1', displayName: 'Ana Cruz', email: 'ana@example.com', ...user },
    signOut: vi.fn(),
  })
}

async function renderHeader(path = '/'): Promise<void> {
  const { AppHeader } = await import('../../../src/app/AppHeader')
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>,
  )
}

function profileLink(name: string | RegExp = /^Perfil de /): HTMLElement {
  return screen.getByRole('link', { name })
}

describe('<AppHeader>', () => {
  beforeEach(() => {
    useSessionMock.mockReset()
    useIsAdminMock.mockReset()
    useProfileMock.mockReset()
    useAvatarUrlMock.mockReset()
    useAvatarUrlMock.mockReturnValue(undefined)
    signedIn()
    useIsAdminMock.mockReturnValue(false)
    useProfileMock.mockReturnValue(profileResult())
  })

  it('muestra el nombre InsertTasks y no el nombre anterior', async () => {
    await renderHeader()

    expect(screen.getByText('InsertTasks')).toBeInTheDocument()
    expect(screen.queryByText(/mytasks/i)).toBeNull()
  })

  it('no lleva el logo: la insignia no se lee a tamaño de cabecera, solo el texto', async () => {
    await renderHeader()

    expect(screen.queryByTestId('brand-logo')).toBeNull()
  })

  describe('enlace al perfil', () => {
    it('es un único enlace «Perfil de <nombre>» a /perfil con el avatar y el nombre dentro', async () => {
      await renderHeader()

      const links = screen.getAllByRole('link', { name: /^Perfil de / })
      expect(links).toHaveLength(1)
      const link = profileLink('Perfil de Ana Cruz')
      expect(link).toHaveAttribute('href', '/perfil')
      expect(link).toHaveTextContent('AC')
      expect(within(link).getByText('Ana Cruz')).toBeInTheDocument()
    })

    it('usa el nombre elegido en el perfil antes que ningún otro', async () => {
      useProfileMock.mockReturnValue(profileResult({ display_name: 'Ana 🌱' }))

      await renderHeader()

      expect(profileLink('Perfil de Ana 🌱')).toBeInTheDocument()
    })

    it('sin nombre en el perfil usa el de Google', async () => {
      await renderHeader()

      expect(profileLink('Perfil de Ana Cruz')).toBeInTheDocument()
    })

    it('sin nombre de Google usa el correo', async () => {
      signedIn({ displayName: null })

      await renderHeader()

      expect(profileLink('Perfil de ana@example.com')).toBeInTheDocument()
    })

    it('mientras carga el perfil usa el nombre de Google y muestra las iniciales, no un hueco', async () => {
      useProfileMock.mockReturnValue({ data: undefined, isPending: true, isError: false })

      await renderHeader()

      expect(profileLink('Perfil de Ana Cruz')).toHaveTextContent('AC')
    })

    it('si el perfil falla sigue mostrando el nombre de Google y las iniciales', async () => {
      useProfileMock.mockReturnValue({ data: undefined, isPending: false, isError: true })

      await renderHeader()

      expect(profileLink('Perfil de Ana Cruz')).toHaveTextContent('AC')
    })

    it('muestra el avatar del catálogo elegido, decorativo (el nombre ya va en el enlace)', async () => {
      useProfileMock.mockReturnValue(
        profileResult({ avatar: { kind: 'preset', preset: 'avatar-02', version: 1 } }),
      )

      await renderHeader()

      const link = profileLink('Perfil de Ana Cruz')
      const image = link.querySelector('img')
      expect(image?.getAttribute('src')).toBeTruthy()
      expect(image?.getAttribute('alt')).toBe('')
    })

    it('muestra la imagen subida como avatar, decorativa, con el blob: URL descargado', async () => {
      const avatar = { kind: 'upload' as const, preset: null, version: 4 }
      useProfileMock.mockReturnValue(profileResult({ avatar }))
      useAvatarUrlMock.mockReturnValue('blob:imagen-subida')

      await renderHeader()

      const image = profileLink('Perfil de Ana Cruz').querySelector('img')
      expect(image?.getAttribute('src')).toBe('blob:imagen-subida')
      expect(image?.getAttribute('alt')).toBe('')
      expect(useAvatarUrlMock).toHaveBeenCalledWith(avatar)
    })

    it('mientras se descarga la imagen subida muestra las iniciales, no un hueco', async () => {
      useProfileMock.mockReturnValue(
        profileResult({ avatar: { kind: 'upload', preset: null, version: 4 } }),
      )
      useAvatarUrlMock.mockReturnValue(undefined)

      await renderHeader()

      const link = profileLink('Perfil de Ana Cruz')
      expect(link).toHaveTextContent('AC')
      expect(link.querySelector('img')).toBeNull()
    })

    it('recorta un nombre largo con puntos suspensivos', async () => {
      useProfileMock.mockReturnValue(profileResult({ display_name: 'N'.repeat(50) }))

      await renderHeader()

      const name = within(profileLink(/^Perfil de N+$/)).getByText('N'.repeat(50))
      expect(name.className).toContain('truncate')
      expect(name.className).toMatch(/max-w-/)
    })

    it('en móvil muestra solo el avatar: el nombre se oculta por debajo del punto de corte', async () => {
      await renderHeader()

      const name = within(profileLink('Perfil de Ana Cruz')).getByText('Ana Cruz')
      expect(name.className).toContain('hidden')
      expect(name.className).toContain('sm:inline')
    })

    it('un nombre con HTML se muestra como texto, sin crear elementos', async () => {
      useProfileMock.mockReturnValue(profileResult({ display_name: '<b>Ana</b><img src=x>' }))

      await renderHeader()

      const link = profileLink(/^Perfil de /)
      expect(link).toHaveTextContent('<b>Ana</b><img src=x>')
      expect(link.querySelector('b')).toBeNull()
      expect(link.querySelector('img[src="x"]')).toBeNull()
    })

    it('no entra en las pestañas principales', async () => {
      await renderHeader()

      const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
      expect(within(nav).queryByRole('link', { name: /^Perfil/ })).not.toBeInTheDocument()
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Tablero', 'Progreso', 'Programadas', 'Historial', 'Papelera'])
    })

    it('está activo (aria-current) solo en /perfil', async () => {
      await renderHeader('/perfil')

      expect(profileLink('Perfil de Ana Cruz')).toHaveAttribute('aria-current', 'page')
    })

    it('no está activo en el resto de rutas', async () => {
      await renderHeader('/historial')

      expect(profileLink('Perfil de Ana Cruz')).not.toHaveAttribute('aria-current')
    })
  })

  it('mantiene «Cerrar sesión»', async () => {
    await renderHeader()

    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('para el administrador añade «Accesos» a las pestañas', async () => {
    useIsAdminMock.mockReturnValue(true)

    await renderHeader()

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByRole('link', { name: 'Accesos' })).toBeInTheDocument()
  })

  describe('pestañas de S3 v3', () => {
    it('cada pestaña lleva un icono decorativo y se llama solo por su texto', async () => {
      useIsAdminMock.mockReturnValue(true)

      await renderHeader()

      const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
      const links = within(nav).getAllByRole('link')
      expect(links.map((link) => link.textContent)).toEqual([
        'Tablero',
        'Progreso',
        'Programadas',
        'Historial',
        'Papelera',
        'Accesos',
      ])
      for (const link of links) {
        expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      }
    })

    it('en móvil la fila de pestañas se desplaza sola en vez de ensanchar la página', async () => {
      await renderHeader()

      const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
      expect(nav.className).toContain('overflow-x-auto')
      expect(nav.className).toContain('min-w-0')
      for (const link of within(nav).getAllByRole('link')) {
        expect(link.className).toContain('whitespace-nowrap')
      }
    })
  })
})
