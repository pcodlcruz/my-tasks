import { expect, test } from './fixtures/auth'

test.describe('Acceso solo por invitación', () => {
  test('un desconocido ve que necesita una invitación y no llega al tablero', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`desconocido-${crypto.randomUUID()}@example.com`, { invited: false })

    await expect(page.getByRole('heading', { name: 'Necesitas una invitación' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ Nueva tarea' })).toHaveCount(0)
  })

  test('la pantalla sin acceso permite cerrar sesión y vuelve a /login', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`desconocido-${crypto.randomUUID()}@example.com`, { invited: false })
    await expect(page.getByRole('heading', { name: 'Necesitas una invitación' })).toBeVisible()

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()

    await expect(page).toHaveURL(/\/login$/)
  })

  test('una persona invitada entra al tablero con su primera sesión', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`invitada-${crypto.randomUUID()}@example.com`)

    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Necesitas una invitación' })).toHaveCount(0)
  })

  test('el administrador de bootstrap entra sin invitación', async ({ page, loginAsAdmin }) => {
    await loginAsAdmin()

    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
  })
})
