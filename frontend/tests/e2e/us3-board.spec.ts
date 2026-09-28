import { expect, test } from './fixtures/auth'

async function createTask(
  page: import('@playwright/test').Page,
  options: { title: string; urgent: boolean; important: boolean; scope: 'Laboral' | 'Personal' },
): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva tarea' }).click()
  await page.getByLabel('Título').fill(options.title)
  await page.getByLabel('Descripción').fill('Detalle de la tarea')
  if (options.urgent) {
    await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check()
  }
  if (options.important) {
    await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  }
  await page.getByRole('dialog').getByRole('radio', { name: options.scope }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

function quadrantSection(
  page: import('@playwright/test').Page,
  quadrant: string,
): ReturnType<import('@playwright/test').Page['locator']> {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: quadrant, exact: true }) })
}

test.describe('US3 · Ver el estado de todas mis tareas de un vistazo', () => {
  test('editar una tarea de Planificar marcándola urgente la mueve a Hacer ahora', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us3-editar-${crypto.randomUUID()}@example.com`)

    await createTask(page, {
      title: 'Tarea a mover',
      urgent: false,
      important: true,
      scope: 'Laboral',
    })
    await expect(quadrantSection(page, 'Planificar').getByText('Tarea a mover')).toBeVisible()

    await quadrantSection(page, 'Planificar').getByRole('button', { name: 'Editar' }).click()
    await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check()
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect(quadrantSection(page, 'Hacer ahora').getByText('Tarea a mover')).toBeVisible()
    await expect(quadrantSection(page, 'Planificar').getByText('Tarea a mover')).toHaveCount(0)
  })

  test('fijar y desfijar la tarea más reciente de un cuadrante la reordena', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us3-fijar-${crypto.randomUUID()}@example.com`)

    await createTask(page, {
      title: 'Primera tarea',
      urgent: true,
      important: true,
      scope: 'Personal',
    })
    await createTask(page, {
      title: 'Segunda tarea (más reciente)',
      urgent: true,
      important: true,
      scope: 'Personal',
    })

    const section = quadrantSection(page, 'Hacer ahora')
    const titles = section.locator('article p')
    await expect(titles.first()).toHaveText('Primera tarea')

    await section
      .locator('article', { hasText: 'Segunda tarea (más reciente)' })
      .getByRole('button', { name: 'Fijar' })
      .click()
    await expect(titles.first()).toHaveText(/Segunda tarea/)

    await section
      .locator('article', { hasText: 'Segunda tarea (más reciente)' })
      .getByRole('button', { name: 'Desfijar' })
      .click()
    await expect(titles.first()).toHaveText('Primera tarea')
  })
})
