import { expect, test } from './fixtures/auth'

function formScopeRadio(
  page: import('@playwright/test').Page,
  label: string,
): ReturnType<import('@playwright/test').Page['getByRole']> {
  return page
    .getByRole('radiogroup', { name: 'Seleccionar ámbito de tarea' })
    .getByRole('radio', { name: label })
}

function filterScopeOption(
  page: import('@playwright/test').Page,
  label: string,
): ReturnType<import('@playwright/test').Page['getByText']> {
  // The radio on this screen is visually hidden (sr-only) on purpose (the
  // selection is shown through the visible text's styling, not a native radio);
  // a real user clicks the text, so the test does too.
  return page
    .getByRole('radiogroup', { name: 'Filtrar por ámbito' })
    .getByText(label, { exact: true })
}

test.describe('US4 · Distinguir tareas laborales de personales', () => {
  test('filtrar por Laboral y volver a Todas', async ({ page, loginAsGoogleUser }) => {
    await loginAsGoogleUser(`us4-filtrar-${crypto.randomUUID()}@example.com`)

    await page.getByRole('button', { name: '+ Nueva tarea' }).click()
    await page.getByLabel('Título').fill('Tarea laboral')
    await page.getByLabel('Descripción').fill('Detalle')
    await formScopeRadio(page, 'Laboral').check()
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('button', { name: '+ Nueva tarea' }).click()
    await page.getByLabel('Título').fill('Tarea personal')
    await page.getByLabel('Descripción').fill('Detalle')
    await formScopeRadio(page, 'Personal').check()
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(page.getByText('Tarea laboral')).toBeVisible()
    await expect(page.getByText('Tarea personal')).toBeVisible()

    await filterScopeOption(page, 'Laboral').click()
    await expect(page.getByText('Tarea laboral')).toBeVisible()
    await expect(page.getByText('Tarea personal')).toHaveCount(0)

    await filterScopeOption(page, 'Todas').click()
    await expect(page.getByText('Tarea laboral')).toBeVisible()
    await expect(page.getByText('Tarea personal')).toBeVisible()
  })

  test('cambiar el ámbito de una tarea la saca del filtro activo sin recargar', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us4-cambiar-ambito-${crypto.randomUUID()}@example.com`)

    await page.getByRole('button', { name: '+ Nueva tarea' }).click()
    await page.getByLabel('Título').fill('Tarea a mover de ámbito')
    await page.getByLabel('Descripción').fill('Detalle')
    await formScopeRadio(page, 'Laboral').check()
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await filterScopeOption(page, 'Laboral').click()
    await expect(page.getByText('Tarea a mover de ámbito')).toBeVisible()

    await page.getByRole('button', { name: 'Editar' }).click()
    await formScopeRadio(page, 'Personal').check()
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Tarea a mover de ámbito')).toHaveCount(0)
  })

  test('crear sin ámbito no deja guardar', async ({ page, loginAsGoogleUser }) => {
    await loginAsGoogleUser(`us4-sin-ambito-${crypto.randomUUID()}@example.com`)

    await page.getByRole('button', { name: '+ Nueva tarea' }).click()
    await page.getByLabel('Título').fill('Tarea sin ámbito')
    await page.getByLabel('Descripción').fill('Detalle')
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('Elige un ámbito.')).toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
