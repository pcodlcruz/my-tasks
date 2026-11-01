import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { useServerClock } from './fixtures/clock'

// 10:00 in Madrid (UTC+1 in November) on each day; 04:01 on the Sunday after, when the week's
// days have been closed.
const TUESDAY = '2026-11-03T09:00:00Z'
const WEDNESDAY = '2026-11-04T09:00:00Z'
const SATURDAY = '2026-11-07T09:00:00Z'
const SUNDAY_0401 = '2026-11-08T03:01:00Z'

test.use({ timezoneId: 'Europe/Madrid' })

function card(page: Page, title: string) {
  return page.locator('article', { hasText: title })
}

async function createTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva tarea' }).click()
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Descripción').fill('Detalle de la tarea')
  await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  await page.getByRole('dialog').getByRole('radio', { name: 'Laboral' }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function createAndComplete(page: Page, titles: string[]): Promise<void> {
  for (const title of titles) {
    await createTask(page, title)
    await card(page, title).getByRole('button', { name: 'Completar' }).click()
    await expect(card(page, title)).toHaveCount(0)
  }
}

test.describe('Historial de progreso (US5)', () => {
  test('el calendario distingue los días y el detalle lista sus tareas', async ({
    page,
    loginAsGoogleUser,
  }) => {
    const setNow = await useServerClock(page, TUESDAY)
    await loginAsGoogleUser(`historial-${crypto.randomUUID()}@example.com`)

    // Saturday is not an active day for this person.
    await page.getByRole('link', { name: 'Perfil' }).click()
    const settings = page.getByRole('region', { name: 'Progreso y juego' })
    await settings.getByRole('button', { name: 'Sábado' }).click()
    await expect(settings.getByRole('button', { name: 'Sábado' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Tablero' })
      .click()

    // Tuesday: goal met (3 of 3). Wednesday: one task only. Saturday: a day off, with one.
    await createAndComplete(page, ['Martes uno', 'Martes dos', 'Martes tres'])
    setNow(WEDNESDAY)
    await page.goto('/')
    await createAndComplete(page, ['Miércoles uno'])
    setNow(SATURDAY)
    await page.goto('/')
    await createAndComplete(page, ['Sábado uno'])

    setNow(SUNDAY_0401)
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Progreso' })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Progreso y estadísticas', level: 1 }),
    ).toBeVisible()

    // The three days are told apart by text, not only by color.
    const calendar = page.getByRole('group', { name: 'Actividad de las últimas 12 semanas' })
    await expect(
      calendar.getByRole('button', { name: /3 de noviembre.*meta cumplida, 3 tareas/i }),
    ).toBeVisible()
    await expect(
      calendar.getByRole('button', { name: /4 de noviembre.*meta sin cumplir, 1 tarea/i }),
    ).toBeVisible()
    await expect(
      calendar.getByRole('button', { name: /7 de noviembre.*día de descanso/i }),
    ).toBeVisible()

    // Choosing a day lists its tasks.
    await calendar.getByRole('button', { name: /3 de noviembre/i }).click()
    const detail = page.getByRole('region', { name: /3 de noviembre/i })
    await expect(detail).toContainText('3 de 3')
    await expect(detail).toContainText('Meta cumplida')
    for (const title of ['Martes uno', 'Martes dos', 'Martes tres']) {
      await expect(detail).toContainText(title)
    }
    await calendar.getByRole('button', { name: /4 de noviembre/i }).click()
    await expect(page.getByRole('region', { name: /4 de noviembre/i })).toContainText(
      'Miércoles uno',
    )

    // The statistics and the trophy room, with «Primera moneda» and the day it was won.
    await expect(page.getByRole('region', { name: 'Estadísticas' })).toContainText('5 tareas')
    const trophies = page.getByRole('region', { name: 'Sala de trofeos' })
    await expect(trophies.locator('li', { hasText: 'Primera moneda' })).toContainText('3 nov')
    await expect(trophies.locator('li', { hasText: '500 tareas' })).toContainText('Bloqueado')
  })

  test('sin modo arcade no hay sala de trofeos ni puntos', async ({ page, loginAsGoogleUser }) => {
    await useServerClock(page, TUESDAY)
    await loginAsGoogleUser(`historial-sin-arcade-${crypto.randomUUID()}@example.com`)
    await page.getByRole('link', { name: 'Perfil' }).click()
    const toggle = page.getByRole('switch', { name: 'Modo arcade' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()

    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Progreso' })
      .click()

    await expect(page.getByRole('region', { name: 'Estadísticas' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Sala de trofeos' })).toHaveCount(0)
  })
})
