import { expect, test } from './fixtures/auth'

const COMBINATIONS: { urgent: boolean; important: boolean; quadrant: string }[] = [
  { urgent: true, important: true, quadrant: 'Hacer ahora' },
  { urgent: false, important: true, quadrant: 'Planificar' },
  { urgent: true, important: false, quadrant: 'Delegar' },
  { urgent: false, important: false, quadrant: 'Eliminar' },
]

test.describe('US2 · Capturar una tarea y verla clasificada', () => {
  test('crea una tarea por cada combinación y aparece en su cuadrante sin recargar', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us2-crear-${crypto.randomUUID()}@example.com`)

    for (const combo of COMBINATIONS) {
      await page.getByRole('button', { name: '+ Nueva tarea' }).click()
      const title = `Tarea ${combo.quadrant}`
      await page.getByLabel('Título').fill(title)
      await page.getByLabel('Descripción').fill('Detalle de la tarea')
      if (combo.urgent) {
        await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check()
      }
      if (combo.important) {
        await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
      }
      await page.getByRole('radio', { name: 'Laboral' }).check()
      await page.getByRole('button', { name: 'Guardar' }).click()

      await expect(page.getByRole('dialog')).toHaveCount(0)
      const section = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: combo.quadrant, exact: true }) })
      await expect(section.getByText(title)).toBeVisible()
    }
  })

  test('guardar con descripción de solo espacios muestra el error y no cierra el formulario', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us2-validacion-${crypto.randomUUID()}@example.com`)

    await page.getByRole('button', { name: '+ Nueva tarea' }).click()
    await page.getByLabel('Título').fill('Tarea de prueba')
    await page.getByLabel('Descripción').fill('   ')
    await page.getByRole('radio', { name: 'Personal' }).check()
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(page.getByText('La descripción no puede estar vacía.')).toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
