import type { Browser, Page } from '@playwright/test'
import { expect, hideStartOfDay, test } from './fixtures/auth'
import { useServerClock } from './fixtures/clock'

// Monday 2 November 2026, 10:00 in Madrid.
const MONDAY_MORNING = '2026-11-02T09:00:00Z'

// The announcements take turns (about 3 s each), so a later one may need a few seconds to show.
const QUEUE_TIMEOUT = 15_000

test.use({ timezoneId: 'Europe/Madrid' })

function scoreboard(page: Page) {
  return page.getByRole('region', { name: 'Marcador del día' })
}

function celebrations(page: Page) {
  return page.locator('[data-celebrations]')
}

async function createTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva tarea' }).click()
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Descripción').fill('Detalle de la tarea')
  await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  await page.getByRole('dialog').getByRole('radio', { name: 'Personal' }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function complete(page: Page, title: string): Promise<void> {
  await page
    .locator('article', { hasText: title })
    .getByRole('button', { name: 'Completar' })
    .click()
}

async function setArcadeMode(page: Page, on: boolean): Promise<void> {
  await page.getByRole('link', { name: /^Perfil de / }).click()
  const toggle = page
    .getByRole('region', { name: 'Progreso y juego' })
    .getByRole('switch', { name: 'Modo arcade' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(on))
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Tablero' })
    .click()
}

async function signInElsewhere(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({ timezoneId: 'Europe/Madrid' })
  const other = await context.newPage()
  await hideStartOfDay(other)
  await useServerClock(other, MONDAY_MORNING)
  await other.goto('/login')
  await other.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
  await other.evaluate(async (userEmail) => {
    await window.__mytasksTestLogin?.(userEmail)
  }, email)
  return other
}

test.describe('Puntuación, niveles y logros (US3)', () => {
  test('la primera tarea da la primera moneda y la meta celebra la fase', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await useServerClock(page, MONDAY_MORNING)
    await loginAsGoogleUser(`arcade-${crypto.randomUUID()}@example.com`)
    await expect(scoreboard(page)).toContainText('0 puntos')
    for (const title of ['Una', 'Dos', 'Tres']) {
      await createTask(page, title)
    }

    await complete(page, 'Una')
    await expect(celebrations(page)).toContainText('Logro: Primera moneda')
    await expect(scoreboard(page)).toContainText('100 puntos')

    await complete(page, 'Dos')
    await complete(page, 'Tres')
    await expect(scoreboard(page)).toContainText('3 de 3 tareas completadas hoy')
    await expect(celebrations(page)).toContainText('¡FASE SUPERADA! +500', {
      timeout: QUEUE_TIMEOUT,
    })
  })

  test('cada anuncio se ve en un solo navegador', async ({ page, browser, loginAsGoogleUser }) => {
    const email = `arcade-dos-${crypto.randomUUID()}@example.com`
    await useServerClock(page, MONDAY_MORNING)
    await loginAsGoogleUser(email)
    await createTask(page, 'Moneda')
    const other = await signInElsewhere(browser, email)
    await expect(scoreboard(other)).toContainText('0 de 3 tareas completadas hoy')

    const acknowledged = page.waitForResponse(
      (response) => response.url().endsWith('/api/v1/me/progress/ack') && response.ok(),
    )
    await complete(page, 'Moneda')
    await expect(celebrations(page)).toContainText('Logro: Primera moneda')
    await acknowledged

    await other.reload()
    await expect(scoreboard(other)).toContainText('1 de 3 tareas completadas hoy')
    await expect(scoreboard(other)).toContainText('100 puntos')
    await expect(celebrations(other)).toBeEmpty()
    await other.context().close()
  })

  test('sin el modo arcade no hay puntuación ni celebraciones, y al volver la cuenta sigue', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await useServerClock(page, MONDAY_MORNING)
    await loginAsGoogleUser(`arcade-off-${crypto.randomUUID()}@example.com`)
    await createTask(page, 'Sin arcade')

    await setArcadeMode(page, false)
    await expect(scoreboard(page)).toContainText('0 de 3 tareas completadas hoy')
    await expect(scoreboard(page)).not.toContainText(/puntos|NIVEL/)

    await complete(page, 'Sin arcade')
    await expect(scoreboard(page)).toContainText('1 de 3 tareas completadas hoy')
    await expect(scoreboard(page)).not.toContainText(/puntos|NIVEL/)
    await expect(celebrations(page)).toBeEmpty()

    // Back on: the points earned in between are there, and the kept announcement shows now.
    await setArcadeMode(page, true)
    await expect(scoreboard(page)).toContainText('100 puntos')
    await expect(celebrations(page)).toContainText('Logro: Primera moneda')
  })

  test.describe('con el movimiento reducido', () => {
    test.use({ reducedMotion: 'reduce' })

    test('la celebración aparece sin animación', async ({ page, loginAsGoogleUser }) => {
      await useServerClock(page, MONDAY_MORNING)
      await loginAsGoogleUser(`arcade-quieto-${crypto.randomUUID()}@example.com`)
      await createTask(page, 'Quieta')

      await complete(page, 'Quieta')

      const card = celebrations(page).locator('div').filter({ hasText: 'Logro: Primera moneda' })
      await expect(card.first()).toBeVisible()
      await expect(celebrations(page).locator('.animate-pop')).toHaveCount(0)
      const animation = await card
        .first()
        .evaluate((element) => getComputedStyle(element).animationName)
      expect(animation).toBe('none')
    })
  })
})
