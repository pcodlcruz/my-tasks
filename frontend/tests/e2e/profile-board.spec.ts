import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`
}

async function createTask(
  page: Page,
  title: string,
  scope: 'Laboral' | 'Personal' = 'Laboral',
): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva tarea' }).click()
  // The dialog focuses the title when it opens; filling before that happens lets a late focus
  // move the typing into the wrong field.
  await expect(page.getByLabel('Título')).toBeFocused()
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Descripción').fill('Detalle de la tarea')
  await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check()
  await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  await page.getByRole('dialog').getByRole('radio', { name: scope }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  // Generous: under the load of a full run the API can take a few seconds to answer.
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
}

async function goTo(page: Page, link: 'Tablero' | 'Historial' | 'Papelera'): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: link })
    .click()
}

async function openProfile(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Perfil' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Tablero por defecto' })).toBeVisible()
}

async function choose(page: Page, group: string, option: string): Promise<void> {
  await page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: option }).check()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Guardado')
}

// Titles of the "Hacer ahora" quadrant in display order; a pinned task carries a pin before it.
async function boardTitles(page: Page): Promise<string[]> {
  const texts = await page
    .locator('section', { has: page.getByRole('heading', { name: 'Hacer ahora', exact: true }) })
    .locator('article p.font-semibold')
    .allInnerTexts()
  return texts.map((text) => text.replace(/\s+/g, ''))
}

test.describe('Perfil · tablero e historial', () => {
  test('el tablero se abre con el ámbito por defecto y el filtro puntual no lo cambia', async ({
    page,
    loginAsGoogleUser,
  }) => {
    const email = uniqueEmail('perfil-ambito')
    await loginAsGoogleUser(email)
    await createTask(page, 'Tarea laboral', 'Laboral')
    await createTask(page, 'Tarea personal', 'Personal')
    await openProfile(page)
    await choose(page, 'Tablero por defecto', 'Laboral')

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await loginAsGoogleUser(email)
    // Signing in returns to the page the person was on (the profile): go to the board.
    await goTo(page, 'Tablero')

    await expect(page.getByRole('radio', { name: 'Laboral' })).toBeChecked()
    await expect(page.getByText('Tarea laboral')).toBeVisible()
    await expect(page.getByText('Tarea personal')).toHaveCount(0)

    await page.getByRole('radiogroup', { name: 'Filtrar por ámbito' }).getByText('Personal').click()
    await expect(page.getByText('Tarea personal')).toBeVisible()
    await page.reload()

    await expect(page.getByRole('radio', { name: 'Laboral' })).toBeChecked()
    await expect(page.getByText('Tarea laboral')).toBeVisible()
    await expect(page.getByText('Tarea personal')).toHaveCount(0)
  })

  test('un tablero por defecto sin tareas en ese ámbito muestra el estado vacío habitual', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('perfil-vacio'))
    await createTask(page, 'Solo laboral', 'Laboral')
    await openProfile(page)
    await choose(page, 'Tablero por defecto', 'Personal')

    await page.reload()
    await goTo(page, 'Tablero')

    await expect(page.getByRole('radio', { name: 'Personal' })).toBeChecked()
    await expect(page.getByText('No hay tareas en este cuadrante.')).toHaveCount(4)
    await expect(page.getByText('Solo laboral')).toHaveCount(0)
  })

  test('«Más recientes primero» invierte el orden y deja las fijadas arriba', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('perfil-orden'))
    for (const title of ['Primera', 'Segunda', 'Tercera']) {
      await createTask(page, title)
    }
    await page
      .locator('article', { hasText: 'Primera' })
      .getByRole('button', { name: 'Fijar' })
      .click()
    await expect(page.locator('article', { hasText: 'Primera' }).getByLabel('Fijada')).toBeVisible()
    await expect.poll(() => boardTitles(page)).toEqual(['📌Primera', 'Segunda', 'Tercera'])

    await openProfile(page)
    await choose(page, 'Orden de las tareas', 'Más recientes primero')
    await goTo(page, 'Tablero')

    await expect.poll(() => boardTitles(page)).toEqual(['📌Primera', 'Tercera', 'Segunda'])

    await openProfile(page)
    await choose(page, 'Orden de las tareas', 'Más antiguas primero')
    await goTo(page, 'Tablero')

    await expect.poll(() => boardTitles(page)).toEqual(['📌Primera', 'Segunda', 'Tercera'])
  })

  test('el periodo del historial muestra la franja y «Ver todo» vale solo para esa visita', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('perfil-historial'))
    await createTask(page, 'Tarea reciente')
    await page.getByRole('button', { name: 'Completar' }).click()
    await openProfile(page)
    await choose(page, 'Historial', 'Últimos 30 días')

    await goTo(page, 'Historial')

    await expect(page.getByText('Mostrando solo los últimos 30 días')).toBeVisible()
    await expect(page.getByText('Tarea reciente')).toBeVisible()

    await page.getByRole('button', { name: 'Ver todo' }).click()
    await expect(page.getByText(/Mostrando solo los últimos/)).toHaveCount(0)
    await expect(page.getByText('Tarea reciente')).toBeVisible()

    await goTo(page, 'Tablero')
    await goTo(page, 'Historial')
    await expect(page.getByText('Mostrando solo los últimos 30 días')).toBeVisible()

    await openProfile(page)
    await choose(page, 'Historial', 'Todo')
    await goTo(page, 'Historial')
    await expect(page.getByText(/Mostrando solo los últimos/)).toHaveCount(0)
  })
})
