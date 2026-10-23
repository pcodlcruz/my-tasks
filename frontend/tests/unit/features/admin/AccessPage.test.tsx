import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessList } from '../../../../src/api/types'

const useAccessListMock = vi.fn()
const useInviteUserMock = vi.fn()
const inviteMutate = vi.fn()
const revokeInvitationMutate = vi.fn()
const revokeUserMutate = vi.fn()

vi.mock('../../../../src/api/access', () => ({
  useAccessList: () => useAccessListMock(),
  useInviteUser: () => useInviteUserMock(),
  useRevokeInvitation: () => ({ mutate: revokeInvitationMutate, isPending: false }),
  useRevokeUserAccess: () => ({ mutate: revokeUserMutate, isPending: false }),
}))
vi.mock('../../../../src/lib/firebase', () => ({ auth: { currentUser: null, signOut: vi.fn() } }))
vi.mock('firebase/auth', () => ({ getIdToken: vi.fn() }))

const CREATED_AT = '2026-10-20T09:30:00.000Z'

const ACCESS: AccessList = {
  invitations: [
    { email: 'ana@example.com', status: 'pending', created_at: CREATED_AT, accepted_at: null },
    {
      email: 'bob@example.com',
      status: 'accepted',
      created_at: CREATED_AT,
      accepted_at: CREATED_AT,
    },
    { email: 'eva@example.com', status: 'revoked', created_at: CREATED_AT, accepted_at: null },
  ],
  accounts: [
    {
      uid: 'uid-admin',
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
      created_at: CREATED_AT,
    },
    {
      uid: 'uid-bob',
      email: 'bob@example.com',
      role: 'user',
      status: 'active',
      created_at: CREATED_AT,
    },
    {
      uid: 'uid-eva',
      email: 'eva@example.com',
      role: 'user',
      status: 'revoked',
      created_at: CREATED_AT,
    },
  ],
}

function listResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { data: ACCESS, isLoading: false, isError: false, refetch: vi.fn(), ...overrides }
}

function inviteResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: inviteMutate, isPending: false, error: null, reset: vi.fn(), ...overrides }
}

async function renderAccessPage(): Promise<void> {
  const { AccessPage } = await import('../../../../src/features/admin/AccessPage')
  render(<AccessPage />)
}

async function apiError(code: string, message: string): Promise<Error> {
  const { ApiClientError } = await import('../../../../src/lib/apiClient')
  return new ApiClientError({ code, message })
}

describe('<AccessPage>', () => {
  beforeEach(() => {
    useAccessListMock.mockReset()
    useInviteUserMock.mockReset()
    inviteMutate.mockReset()
    revokeInvitationMutate.mockReset()
    revokeUserMutate.mockReset()
    useAccessListMock.mockReturnValue(listResult())
    useInviteUserMock.mockReturnValue(inviteResult())
  })

  describe('listado', () => {
    it('muestra las invitaciones con su estado', async () => {
      await renderAccessPage()

      const list = screen.getByRole('list', { name: 'Invitaciones' })
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(3)
      expect(items[0]).toHaveTextContent('ana@example.com')
      expect(items[0]).toHaveTextContent('Pendiente')
      expect(items[1]).toHaveTextContent('Aceptada')
      expect(items[2]).toHaveTextContent('Revocada')
    })

    it('muestra las cuentas con su rol y su estado', async () => {
      await renderAccessPage()

      const items = within(screen.getByRole('list', { name: 'Personas con cuenta' })).getAllByRole(
        'listitem',
      )
      expect(items).toHaveLength(3)
      expect(items[0]).toHaveTextContent('admin@example.com')
      expect(items[0]).toHaveTextContent('Administrador')
      expect(items[1]).toHaveTextContent('Usuario')
      expect(items[1]).toHaveTextContent('Activa')
      expect(items[2]).toHaveTextContent('Sin acceso')
    })

    it('cuenta las invitaciones pendientes frente al máximo', async () => {
      await renderAccessPage()

      expect(screen.getByText('1 de 50 invitaciones pendientes')).toBeInTheDocument()
    })

    it('avisa de que solo se ven las 100 más recientes cuando una lista llega al tope', async () => {
      const accounts = Array.from({ length: 100 }, (_, index) => ({
        uid: `uid-${index}`,
        email: `persona${index}@example.com`,
        role: 'user' as const,
        status: 'active' as const,
        created_at: CREATED_AT,
      }))
      useAccessListMock.mockReturnValue(listResult({ data: { invitations: [], accounts } }))

      await renderAccessPage()

      expect(screen.getByText(/se muestran las 100 más recientes/i)).toBeInTheDocument()
    })

    it('no muestra ese aviso con listas cortas', async () => {
      await renderAccessPage()

      expect(screen.queryByText(/se muestran las 100 más recientes/i)).not.toBeInTheDocument()
    })

    it('muestra estados vacíos cuando no hay invitaciones ni cuentas', async () => {
      useAccessListMock.mockReturnValue(listResult({ data: { invitations: [], accounts: [] } }))

      await renderAccessPage()

      expect(screen.getByText('No hay invitaciones.')).toBeInTheDocument()
      expect(screen.getByText('Todavía no hay personas con cuenta.')).toBeInTheDocument()
    })

    it('muestra un esqueleto de carga mientras se obtienen los accesos', async () => {
      useAccessListMock.mockReturnValue(listResult({ data: undefined, isLoading: true }))

      await renderAccessPage()

      expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
    })

    it('muestra un error con "Reintentar" si falla la carga', async () => {
      const refetch = vi.fn()
      useAccessListMock.mockReturnValue(listResult({ data: undefined, isError: true, refetch }))
      const user = userEvent.setup()

      await renderAccessPage()

      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudieron cargar los accesos/i)
      await user.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(refetch).toHaveBeenCalledOnce()
    })
  })

  describe('invitar', () => {
    it('envía el correo sin espacios al pulsar "Invitar"', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.type(
        screen.getByLabelText('Correo de la persona a invitar'),
        '  nueva@example.com  ',
      )
      await user.click(screen.getByRole('button', { name: 'Invitar' }))

      expect(inviteMutate).toHaveBeenCalledWith('nueva@example.com', expect.anything())
    })

    it('se puede invitar solo con el teclado: escribir y pulsar Intro', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.tab()
      expect(screen.getByLabelText('Correo de la persona a invitar')).toHaveFocus()
      await user.keyboard('nueva@example.com{Enter}')

      expect(inviteMutate).toHaveBeenCalledWith('nueva@example.com', expect.anything())
    })

    it('vacía el campo cuando la invitación se crea', async () => {
      inviteMutate.mockImplementation((_email: string, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.()
      })
      const user = userEvent.setup()
      await renderAccessPage()
      const input = screen.getByLabelText('Correo de la persona a invitar')

      await user.type(input, 'nueva@example.com')
      await user.click(screen.getByRole('button', { name: 'Invitar' }))

      expect(input).toHaveValue('')
    })

    it.each(['', '   ', 'sin-arroba', 'a@b', 'dos@@example.com', 'con espacio@example.com'])(
      'rechaza «%s» sin llamar al servidor y lo explica',
      async (value) => {
        const user = userEvent.setup()
        await renderAccessPage()
        const input = screen.getByLabelText('Correo de la persona a invitar')

        if (value.trim() !== '') await user.type(input, value)
        await user.click(screen.getByRole('button', { name: 'Invitar' }))

        expect(inviteMutate).not.toHaveBeenCalled()
        expect(screen.getByRole('alert')).toHaveTextContent('Escribe un correo válido.')
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input).toHaveAccessibleDescription('Escribe un correo válido.')
      },
    )

    it('rechaza un correo de más de 254 caracteres', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.click(screen.getByLabelText('Correo de la persona a invitar'))
      await user.paste(`${'a'.repeat(250)}@example.com`)
      await user.click(screen.getByRole('button', { name: 'Invitar' }))

      expect(inviteMutate).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent('Escribe un correo válido.')
    })

    it('quita el error de validación en cuanto se vuelve a escribir', async () => {
      const user = userEvent.setup()
      await renderAccessPage()
      await user.click(screen.getByRole('button', { name: 'Invitar' }))
      expect(screen.getByRole('alert')).toBeInTheDocument()

      await user.type(screen.getByLabelText('Correo de la persona a invitar'), 'a')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('muestra el mensaje del servidor cuando la persona ya tiene acceso (409)', async () => {
      useInviteUserMock.mockReturnValue(
        inviteResult({ error: await apiError('already_active', 'Esa persona ya tiene acceso.') }),
      )

      await renderAccessPage()

      expect(screen.getByRole('alert')).toHaveTextContent('Esa persona ya tiene acceso.')
    })

    it('muestra el mensaje del servidor cuando se alcanza el máximo de pendientes (409)', async () => {
      const message = 'Hay 50 invitaciones pendientes. Revoca alguna o espera a que se acepte.'
      useInviteUserMock.mockReturnValue(
        inviteResult({ error: await apiError('invitation_limit_reached', message) }),
      )

      await renderAccessPage()

      expect(screen.getByRole('alert')).toHaveTextContent(message)
    })

    it('muestra un mensaje de correo no válido si el servidor responde 422', async () => {
      useInviteUserMock.mockReturnValue(
        inviteResult({
          error: await apiError('validation_error', 'El correo no tiene un formato válido.'),
        }),
      )

      await renderAccessPage()

      expect(screen.getByRole('alert')).toHaveTextContent('Escribe un correo válido.')
    })

    it('muestra un mensaje genérico ante cualquier otro error', async () => {
      useInviteUserMock.mockReturnValue(inviteResult({ error: new Error('boom') }))

      await renderAccessPage()

      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se pudo crear la invitación. Inténtalo de nuevo.',
      )
    })

    it('deshabilita el botón mientras se envía', async () => {
      useInviteUserMock.mockReturnValue(inviteResult({ isPending: true }))

      await renderAccessPage()

      expect(screen.getByRole('button', { name: 'Invitar' })).toBeDisabled()
    })
  })

  describe('revocar una invitación', () => {
    it('solo ofrece revocar las invitaciones pendientes', async () => {
      await renderAccessPage()

      expect(
        screen.getByRole('button', { name: 'Revocar invitación de ana@example.com' }),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Revocar invitación/ })).toHaveLength(1)
    })

    it('pide confirmación y no revoca si se cancela', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.click(
        screen.getByRole('button', { name: 'Revocar invitación de ana@example.com' }),
      )
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveTextContent('ana@example.com')
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

      expect(revokeInvitationMutate).not.toHaveBeenCalled()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('revoca la invitación al confirmar', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.click(
        screen.getByRole('button', { name: 'Revocar invitación de ana@example.com' }),
      )
      const dialog = screen.getByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Revocar invitación' }))

      expect(revokeInvitationMutate).toHaveBeenCalledWith('ana@example.com')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('cierra el diálogo con Escape sin revocar', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.click(
        screen.getByRole('button', { name: 'Revocar invitación de ana@example.com' }),
      )
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(revokeInvitationMutate).not.toHaveBeenCalled()
    })
  })

  describe('retirar el acceso a una cuenta', () => {
    it('solo ofrece retirar el acceso a usuarios activos, nunca a administradores ni a cuentas ya revocadas', async () => {
      await renderAccessPage()

      expect(
        screen.getByRole('button', { name: 'Retirar acceso a bob@example.com' }),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Retirar acceso/ })).toHaveLength(1)
    })

    it('explica que las tareas se conservan y no retira el acceso si se cancela', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.click(screen.getByRole('button', { name: 'Retirar acceso a bob@example.com' }))
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveTextContent('bob@example.com')
      expect(dialog).toHaveTextContent(/sus tareas se conservan/i)
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

      expect(revokeUserMutate).not.toHaveBeenCalled()
    })

    it('retira el acceso por uid al confirmar', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.click(screen.getByRole('button', { name: 'Retirar acceso a bob@example.com' }))
      const dialog = screen.getByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: 'Retirar acceso' }))

      expect(revokeUserMutate).toHaveBeenCalledWith('uid-bob')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('cierra el diálogo con Escape sin retirar el acceso', async () => {
      const user = userEvent.setup()
      await renderAccessPage()

      await user.click(screen.getByRole('button', { name: 'Retirar acceso a bob@example.com' }))
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(revokeUserMutate).not.toHaveBeenCalled()
    })
  })
})
