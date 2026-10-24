import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessList, Profile } from '../../../../src/api/types'

vi.mock('../../../../src/api/access', () => ({
  useAccessList: () => ({
    data: ACCESS,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useInviteUser: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useRevokeInvitation: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeUserAccess: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))
vi.mock('firebase/auth', () => ({ getIdToken: vi.fn() }))

const ACCESS: AccessList = {
  invitations: [],
  accounts: [
    {
      uid: 'uid-admin',
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
      created_at: '2026-10-20T09:30:00.000Z',
    },
  ],
}

const PROFILE: Profile = {
  theme: 'system',
  density: 'comfortable',
  default_scope: 'all',
  board_order: 'oldest',
  history_days: null,
  display_name: 'Ana Cruz',
  avatar: { kind: 'initials', preset: null, version: 0 },
}

const onChange = vi.fn()
const onChooseAvatar = vi.fn()
const onRemoveAvatar = vi.fn()

async function renderSection(
  profile: Partial<Profile> = {},
  props: { googleName?: string | null; email?: string; avatarUrl?: string } = {},
): Promise<ReturnType<typeof render>> {
  const { IdentitySection } = await import('../../../../src/features/profile/IdentitySection')
  return render(
    <IdentitySection
      profile={{ ...PROFILE, ...profile }}
      uid="uid-1"
      googleName={props.googleName === undefined ? 'Ana Cruz López' : props.googleName}
      email={props.email ?? 'ana@example.com'}
      avatarUrl={props.avatarUrl}
      onChange={onChange}
      onChooseAvatar={onChooseAvatar}
      onRemoveAvatar={onRemoveAvatar}
    />,
  )
}

function nameInput(): HTMLInputElement {
  return screen.getByLabelText('Nombre para mostrar')
}

describe('<IdentitySection>', () => {
  beforeEach(() => {
    onChange.mockReset()
    onChooseAvatar.mockReset()
    onRemoveAvatar.mockReset()
  })

  it('muestra el nombre guardado, el contador y el correo en solo lectura', async () => {
    await renderSection()

    expect(nameInput()).toHaveValue('Ana Cruz')
    expect(screen.getByText('8/50')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /correo/i })).not.toBeInTheDocument()
  })

  it('el contador sube mientras se escribe y cuenta caracteres, no unidades', async () => {
    await renderSection({ display_name: null })

    await userEvent.type(nameInput(), 'Ana 🌱')

    expect(screen.getByText('5/50')).toBeInTheDocument()
  })

  it('guarda el nombre recortado al pulsar «Guardar»', async () => {
    await renderSection({ display_name: null })

    await userEvent.type(nameInput(), '  Ana 🌱  ')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ display_name: 'Ana 🌱' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('guarda con Intro', async () => {
    await renderSection({ display_name: null })

    await userEvent.type(nameInput(), 'Ana{Enter}')

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ display_name: 'Ana' })
  })

  it.each([
    ['vacío', ''],
    ['solo espacios', '     '],
  ])('rechaza un nombre %s con un mensaje claro y no guarda nada', async (_, typed) => {
    await renderSection()

    await userEvent.clear(nameInput())
    if (typed) await userEvent.type(nameInput(), typed)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe un nombre de 1 a 50 caracteres o usa el de Google.',
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('acepta un nombre de 50 caracteres y rechaza uno de 51 sin guardar', async () => {
    await renderSection({ display_name: null })
    await userEvent.type(nameInput(), 'a'.repeat(50))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    onChange.mockReset()

    await userEvent.type(nameInput(), 'a')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByText('51/50')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El nombre no puede superar los 50 caracteres.',
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('rechaza caracteres de control', async () => {
    await renderSection({ display_name: null })

    await userEvent.type(nameInput(), 'Ana‮Bel')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'El nombre no puede contener caracteres de control.',
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('el error se asocia al campo y se quita al corregir el nombre', async () => {
    await renderSection()
    await userEvent.clear(nameInput())
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput().getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id)

    await userEvent.type(nameInput(), 'Eva')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(nameInput()).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('conserva el valor guardado del perfil cuando el nuevo no es válido', async () => {
    const { rerender } = await renderSection()
    const { IdentitySection } = await import('../../../../src/features/profile/IdentitySection')
    await userEvent.clear(nameInput())
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    rerender(
      <IdentitySection
        profile={PROFILE}
        uid="uid-1"
        googleName="Ana Cruz López"
        email="ana@example.com"
        onChange={onChange}
        onChooseAvatar={onChooseAvatar}
        onRemoveAvatar={onRemoveAvatar}
      />,
    )

    expect(onChange).not.toHaveBeenCalled()
    expect(PROFILE.display_name).toBe('Ana Cruz')
  })

  it('el campo se actualiza cuando cambia el nombre guardado en el perfil', async () => {
    const { rerender } = await renderSection({ display_name: null })
    const { IdentitySection } = await import('../../../../src/features/profile/IdentitySection')

    rerender(
      <IdentitySection
        profile={{ ...PROFILE, display_name: 'Eva' }}
        uid="uid-1"
        googleName="Ana Cruz López"
        email="ana@example.com"
        onChange={onChange}
        onChooseAvatar={onChooseAvatar}
        onRemoveAvatar={onRemoveAvatar}
      />,
    )

    expect(nameInput()).toHaveValue('Eva')
  })

  it('explica qué nombre se usará si se deja en blanco: el de Google', async () => {
    await renderSection()

    expect(
      screen.getByText('Si lo dejas en blanco se usará el de tu cuenta de Google: Ana Cruz López'),
    ).toBeInTheDocument()
  })

  it('sin nombre de Google, dice que se usará el correo', async () => {
    await renderSection({}, { googleName: null })

    expect(
      screen.getByText('Si lo dejas en blanco se usará tu correo: ana@example.com'),
    ).toBeInTheDocument()
  })

  it('«Usar el de Google» vuelve al nombre de la cuenta', async () => {
    await renderSection()

    await userEvent.click(screen.getByRole('button', { name: 'Usar el de Google' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ display_name: null })
  })

  it('«Usar el de Google» está desactivado si ya se usa el de Google', async () => {
    await renderSection({ display_name: null })

    expect(screen.getByRole('button', { name: 'Usar el de Google' })).toBeDisabled()
  })

  it('un nombre con HTML se muestra como texto literal, sin crear elementos', async () => {
    const name = '<img src=x onerror=alert(1)>'
    const { container } = await renderSection({ display_name: name })

    expect(nameInput()).toHaveValue(name)
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
  })

  it('«Quitar avatar» solo aparece si hay uno elegido', async () => {
    const { unmount } = await renderSection({
      avatar: { kind: 'initials', preset: null, version: 0 },
    })
    expect(screen.queryByRole('button', { name: 'Quitar avatar' })).not.toBeInTheDocument()
    unmount()

    await renderSection({ avatar: { kind: 'preset', preset: 'avatar-03', version: 1 } })

    await userEvent.click(screen.getByRole('button', { name: 'Quitar avatar' }))
    expect(onRemoveAvatar).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('«Quitar avatar» también aparece con una imagen subida', async () => {
    await renderSection({ avatar: { kind: 'upload', preset: null, version: 2 } })

    expect(screen.getByRole('button', { name: 'Quitar avatar' })).toBeInTheDocument()
  })

  it('muestra la imagen subida como avatar grande', async () => {
    const { container } = await renderSection(
      { avatar: { kind: 'upload', preset: null, version: 2 } },
      { avatarUrl: 'blob:mi-imagen' },
    )

    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:mi-imagen')
  })

  it('«Elegir avatar» abre el selector', async () => {
    await renderSection()

    await userEvent.click(screen.getByRole('button', { name: 'Elegir avatar' }))

    expect(onChooseAvatar).toHaveBeenCalledOnce()
  })

  it('muestra el avatar grande con las iniciales cuando no hay ninguno elegido', async () => {
    await renderSection()

    expect(screen.getByRole('img', { name: /iniciales AC/i })).toBeInTheDocument()
  })
})

describe('administración de accesos (FR-017)', () => {
  it('sigue mostrando el correo de la cuenta y no el nombre elegido', async () => {
    const { AccessPage } = await import('../../../../src/features/admin/AccessPage')
    render(<AccessPage />)

    expect(screen.getAllByText('admin@example.com').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument()
  })
})
