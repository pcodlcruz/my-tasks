import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { useServerClock } from './fixtures/clock'

// Monday 2 November 2026, 10:00 in Madrid (UTC+1), and the next day at 04:01, just after the
// day changes.
const MONDAY_MORNING = '2026-11-02T09:00:00Z'
const TUESDAY_0401 = '2026-11-03T03:01:00Z'

test.use({ timezoneId: 'Europe/Madrid' })

function scoreboard(page: Page) {
  return page.getByRole('region', { name: 'Marcador del día' })
}

async function createTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva tarea' }).click()
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Descripción').fill('Detalle de la tarea')
  await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check()
  await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  await page.getByRole('dialog').getByRole('radio', { name: 'Laboral' }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function complete(page: Page, title: string): Promise<void> {
  await page
    .locator('article', { hasText: title })
    .getByRole('button', { name: 'Completar' })
    .click()
}

async function goTo(page: Page, link: 'Tablero' | 'Historial'): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: link })
    .click()
}

test.describe('Progreso del día (US1)', () => {
  test('el marcador sigue las tareas del día, celebra la meta, cambia a las 04:00 y sigue la meta del perfil', async ({
    page,
    loginAsGoogleUser,
  }) => {
    const setNow = await useServerClock(page, MONDAY_MORNING)
    await loginAsGoogleUser(`progreso-dia-${crypto.randomUUID()}@example.com`)

    // A new account: the default goal of 3 and nothing done yet.
    await expect(scoreboard(page)).toContainText('0 de 3 tareas completadas hoy')
    await expect(scoreboard(page)).not.toContainText('¡FASE SUPERADA!')

    for (const title of ['Primera', 'Segunda', 'Tercera']) {
      await createTask(page, title)
    }
    await complete(page, 'Primera')
    await expect(scoreboard(page)).toContainText('1 de 3 tareas completadas hoy')
    await complete(page, 'Segunda')
    await expect(scoreboard(page)).toContainText('2 de 3 tareas completadas hoy')

    // The third one meets the goal: no reload, and the goal is celebrated.
    await complete(page, 'Tercera')
    await expect(scoreboard(page)).toContainText('3 de 3 tareas completadas hoy')
    await expect(scoreboard(page)).toContainText('¡FASE SUPERADA!')

    // Reopening one the same day takes it out of today's progress.
    await goTo(page, 'Historial')
    await page
      .locator('article', { hasText: 'Segunda' })
      .getByRole('button', { name: 'Reabrir' })
      .click()
    await expect(page.locator('article', { hasText: 'Segunda' })).toHaveCount(0)
    await goTo(page, 'Tablero')
    await expect(scoreboard(page)).toContainText('2 de 3 tareas completadas hoy')
    await expect(scoreboard(page)).not.toContainText('¡FASE SUPERADA!')

    // At 04:01 a new progress day starts from zero.
    setNow(TUESDAY_0401)
    await page.reload()
    await expect(scoreboard(page)).toContainText('0 de 3 tareas completadas hoy')

    // A new goal in «Perfil» shows on today's scoreboard at once.
    await page.getByRole('link', { name: /^Perfil de / }).click()
    const settings = page.getByRole('region', { name: 'Progreso y juego' })
    await settings.getByRole('button', { name: 'Aumentar meta diaria' }).click()
    await expect(settings).toContainText('4 tareas')
    await settings.getByRole('button', { name: 'Aumentar meta diaria' }).click()
    await expect(settings).toContainText('5 tareas')
    await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()
    await goTo(page, 'Tablero')
    await expect(scoreboard(page)).toContainText('0 de 5 tareas completadas hoy')
  })

  test('la zona horaria del dispositivo se guarda sola la primera vez', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await useServerClock(page, MONDAY_MORNING)
    await loginAsGoogleUser(`progreso-zona-${crypto.randomUUID()}@example.com`)
    await expect(scoreboard(page)).toContainText('0 de 3 tareas completadas hoy')

    await page.getByRole('link', { name: /^Perfil de / }).click()

    await expect(page.getByRole('combobox', { name: 'Zona horaria' })).toHaveValue('Europe/Madrid')
    await expect(page.getByRole('button', { name: 'Usar esta' })).toHaveCount(0)
  })
})
