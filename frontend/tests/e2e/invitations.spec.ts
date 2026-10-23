import { expect, test } from './fixtures/auth'

test.describe('US2 · Invitar a otra persona', () => {
  test('el administrador invita y la persona entra como user con la lista vacía', async ({
    page,
    loginAsAdmin,
    loginAsGoogleUser,
  }) => {
    const invitee = `invitada-${crypto.randomUUID()}@example.com`

    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()
    await page.getByLabel('Correo de la persona a invitar').fill(invitee)
    await page.getByRole('button', { name: 'Invitar' }).click()

    const invitation = page
      .getByRole('list', { name: 'Invitaciones' })
      .getByRole('listitem')
      .filter({ hasText: invitee })
    await expect(invitation).toContainText('Pendiente')
    await expect(page.getByLabel('Correo de la persona a invitar')).toHaveValue('')

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login$/)

    // The invitation was created through the interface, so the sign-in is not seeded.
    await loginAsGoogleUser(invitee, { invited: false })

    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Necesitas una invitación' })).toHaveCount(0)
    await expect(page.getByRole('article')).toHaveCount(0)
  })

  test('invitar un correo que ya tiene acceso muestra el aviso y no crea nada', async ({
    page,
    loginAsAdmin,
  }) => {
    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()

    await page.getByLabel('Correo de la persona a invitar').fill('admin-e2e@example.com')
    await page.getByRole('button', { name: 'Invitar' }).click()

    await expect(page.getByRole('alert')).toContainText('Esa persona ya tiene acceso.')
  })

  test('un correo mal escrito se rechaza en el formulario', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()

    await page.getByLabel('Correo de la persona a invitar').fill('sin-arroba')
    await page.getByRole('button', { name: 'Invitar' }).click()

    await expect(page.getByRole('alert')).toContainText('Escribe un correo válido.')
  })

  test('un user no ve la administración y /admin/access le devuelve al tablero', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`user-${crypto.randomUUID()}@example.com`)
    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Accesos' })).toHaveCount(0)

    await page.goto('/admin/access')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Accesos' })).toHaveCount(0)
  })
})
