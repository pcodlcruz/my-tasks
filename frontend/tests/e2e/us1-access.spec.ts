import { expect, test } from './fixtures/auth'

test.describe('US1 · Acceder con Google y ver solo mis tareas', () => {
  test('el primer acceso con Google muestra el tablero vacío con los 4 cuadrantes', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us1-primer-acceso-${crypto.randomUUID()}@example.com`)

    await expect(page).toHaveURL('/')
    for (const label of ['Hacer ahora', 'Planificar', 'Delegar', 'Eliminar']) {
      await expect(page.getByRole('heading', { name: label })).toBeVisible()
    }
    await expect(page.getByText('No hay tareas en este cuadrante.')).toHaveCount(4)
  })

  test('acceder a /historial sin sesión redirige a /login y vuelve a /historial tras entrar', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await page.goto('/historial')
    await expect(page).toHaveURL(/\/login$/)

    await loginAsGoogleUser(`us1-redireccion-${crypto.randomUUID()}@example.com`)

    await expect(page).toHaveURL('/historial')
  })

  test('cerrar sesión vuelve a /login', async ({ page, loginAsGoogleUser }) => {
    await loginAsGoogleUser(`us1-logout-${crypto.randomUUID()}@example.com`)
    await expect(page).toHaveURL('/')

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()

    await expect(page).toHaveURL(/\/login$/)
  })
})
