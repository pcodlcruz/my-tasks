import { expect, test } from './fixtures/auth'

test.describe('Marca: nombre y logo', () => {
  test('el inicio de sesión muestra el logo, InsertTasks y el mensaje, y la pestaña se llama InsertTasks', async ({
    page,
  }) => {
    await page.goto('/login')

    await expect(page.getByTestId('brand-logo')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'InsertTasks' })).toBeVisible()
    await expect(page.getByText('Inserta tus tareas y prioriza lo que importa')).toBeVisible()
    await expect(page).toHaveTitle('InsertTasks')
  })

  test('en 360 px el botón de Google queda a la vista sin desplazarse', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto('/login')

    await expect(page.getByTestId('brand-logo')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeInViewport()
  })

  test('con sesión, la cabecera del tablero muestra el nombre y no lleva logo', async ({
    page,
    loginAsAdmin,
  }) => {
    await loginAsAdmin()

    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expect(page.getByRole('banner').getByText('InsertTasks')).toBeVisible()
    await expect(page.getByTestId('brand-logo')).toHaveCount(0)
  })
})
