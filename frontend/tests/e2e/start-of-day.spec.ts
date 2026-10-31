import type { Browser, Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { useServerClock } from './fixtures/clock'

// 04:01 in Madrid (UTC+1 in November), just after each progress day starts.
const TUESDAY_0401 = '2026-11-03T03:01:00Z'
const WEDNESDAY_0401 = '2026-11-04T03:01:00Z'
const THURSDAY_0401 = '2026-11-05T03:01:00Z'

test.use({ startOfDay: true, timezoneId: 'Europe/Madrid' })

function startOfDay(page: Page) {
  return page.getByRole('dialog', { name: 'PULSA START' })
}

function scoreboard(page: Page) {
  return page.getByRole('region', { name: 'Marcador del día' })
}

// The board is loaded (and so the review would have opened) once the scoreboard and the
// quadrants are there.
async function expectBoardWithoutReview(page: Page): Promise<void> {
  await expect(scoreboard(page)).toContainText('tareas completadas hoy')
  await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
  await expect(startOfDay(page)).toHaveCount(0)
}

async function createDoNowTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva tarea' }).click()
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Descripción').fill('Detalle de la tarea')
  await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check()
  await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  await page.getByRole('dialog').getByRole('radio', { name: 'Laboral' }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

function card(page: Page, title: string) {
  return page.locator('article', { hasText: title })
}

async function signInElsewhere(browser: Browser, email: string, instant: string): Promise<Page> {
  const context = await browser.newContext({ timezoneId: 'Europe/Madrid' })
  const other = await context.newPage()
  await useServerClock(other, instant)
  await other.goto('/login')
  await other.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
  await other.evaluate(async (userEmail) => {
    await window.__mytasksTestLogin?.(userEmail)
  }, email)
  return other
}

async function openProfileSettings(page: Page) {
  await page.getByRole('link', { name: /^Perfil de / }).click()
  return page.getByRole('region', { name: 'Progreso y juego' })
}

async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()
}

async function goToBoard(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Tablero' })
    .click()
}

test.describe('Inicio de jornada y misión (US2)', () => {
  test('sale una vez al día en cualquier dispositivo, se reabre y elige la misión', async ({
    page,
    browser,
    loginAsGoogleUser,
  }) => {
    const email = `inicio-jornada-${crypto.randomUUID()}@example.com`
    await useServerClock(page, TUESDAY_0401)
    await loginAsGoogleUser(email)

    // First opening of the day: the review, as a new game with nothing to choose yet.
    await expect(startOfDay(page)).toBeVisible()
    await expect(startOfDay(page)).toContainText('PARTIDA NUEVA')
    await expect(startOfDay(page)).toContainText('Aún no tienes tareas activas.')
    await startOfDay(page).getByRole('button', { name: 'Empezar' }).click()
    await expectBoardWithoutReview(page)

    // Seen today: not on reload, nor with the same account in another browser.
    await page.reload()
    await expectBoardWithoutReview(page)
    const other = await signInElsewhere(browser, email, TUESDAY_0401)
    await expectBoardWithoutReview(other)
    await other.context().close()

    // It can be opened again by hand.
    for (const title of ['Misión A', 'Misión B', 'Misión C']) {
      await createDoNowTask(page, title)
    }
    await scoreboard(page)
      .getByRole('button', { name: /PULSA START/ })
      .click()
    await expect(startOfDay(page)).toBeVisible()

    // Two tasks as today's mission.
    await startOfDay(page).getByRole('button', { name: 'Añadir a la misión: Misión A' }).click()
    await startOfDay(page).getByRole('button', { name: 'Añadir a la misión: Misión B' }).click()
    await expect(startOfDay(page)).toContainText('Misión del día: 2 de 5 elegidas')
    await startOfDay(page).getByRole('button', { name: 'Empezar' }).click()
    await expect(startOfDay(page)).toHaveCount(0)

    await expect(card(page, 'Misión A')).toContainText('Misión del día')
    await expect(card(page, 'Misión B')).toContainText('Misión del día')
    await expect(card(page, 'Misión C')).not.toContainText('Misión del día')
    await expect(scoreboard(page)).toContainText('Misión 0/2')

    await card(page, 'Misión A').getByRole('button', { name: 'Completar' }).click()
    await expect(scoreboard(page)).toContainText('Misión 1/2')
    await card(page, 'Misión B').getByRole('button', { name: 'Completar' }).click()
    await expect(scoreboard(page)).toContainText('Misión 2/2 cumplida')

    // A third one from its card on the board.
    await card(page, 'Misión C').getByRole('button', { name: 'Añadir a la misión' }).click()
    await expect(card(page, 'Misión C')).toContainText('Misión del día')
    await expect(scoreboard(page)).toContainText('Misión 2/3')
  })

  test('vuelve a salir al día siguiente, y no sale si se desactiva en «Perfil»', async ({
    page,
    loginAsGoogleUser,
  }) => {
    const setNow = await useServerClock(page, TUESDAY_0401)
    await loginAsGoogleUser(`inicio-jornada-off-${crypto.randomUUID()}@example.com`)
    await startOfDay(page).getByRole('button', { name: 'Empezar' }).click()
    await expectBoardWithoutReview(page)

    // A new active day: it shows again, now with yesterday's result.
    setNow(WEDNESDAY_0401)
    await page.reload()
    await expect(startOfDay(page)).toBeVisible()
    await expect(startOfDay(page).getByRole('group', { name: 'Ayer' })).toContainText('0/3')
    await startOfDay(page).getByRole('button', { name: 'Empezar' }).click()

    const settings = await openProfileSettings(page)
    const toggle = settings.getByRole('switch', { name: 'Mostrar el inicio de jornada' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expectSaved(page)

    setNow(THURSDAY_0401)
    await goToBoard(page)
    await page.reload()
    await expectBoardWithoutReview(page)
  })

  test('no sale en un día no activo', async ({ page, loginAsGoogleUser }) => {
    const setNow = await useServerClock(page, TUESDAY_0401)
    await loginAsGoogleUser(`inicio-jornada-descanso-${crypto.randomUUID()}@example.com`)
    await startOfDay(page).getByRole('button', { name: 'Empezar' }).click()
    await expectBoardWithoutReview(page)

    const settings = await openProfileSettings(page)
    await settings.getByRole('button', { name: 'Miércoles' }).click()
    await expect(settings.getByRole('button', { name: 'Miércoles' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expectSaved(page)

    setNow(WEDNESDAY_0401)
    await goToBoard(page)
    await page.reload()
    await expectBoardWithoutReview(page)
    await expect(scoreboard(page)).toContainText('Hoy no es día activo')
  })
})
