import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { useServerClock } from './fixtures/clock'

// 10:00 in Madrid (UTC+1 in November) on Sunday 1 November 2026, and 04:01 on the Monday and the
// Wednesday after it, just as each of those progress days starts.
const SUNDAY_MORNING = '2026-11-01T09:00:00Z'
const MONDAY_0401 = '2026-11-02T03:01:00Z'
const WEDNESDAY_0401 = '2026-11-04T03:01:00Z'

test.use({ startOfDay: true, timezoneId: 'Europe/Madrid' })

function startOfDay(page: Page) {
  return page.getByRole('dialog', { name: 'PULSA START' })
}

function card(page: Page, title: string) {
  return page.locator('article', { hasText: title })
}

function row(page: Page, title: string) {
  return page.getByRole('heading', { name: title }).locator('xpath=ancestor::li')
}

async function goTo(page: Page, link: 'Tablero' | 'Programadas'): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: link })
    .click()
}

async function closeStartOfDay(page: Page): Promise<void> {
  await startOfDay(page).getByRole('button', { name: 'Empezar' }).click()
  await expect(startOfDay(page)).toHaveCount(0)
}

interface NewSchedule {
  title: string
  repetition: 'Días de la semana' | 'Una vez'
  weekdays?: string[]
  date?: string
}

async function createSchedule(page: Page, schedule: NewSchedule): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva programación' }).click()
  const form = page.getByRole('dialog', { name: 'Nueva programación' })
  await form.getByLabel('Título').fill(schedule.title)
  await form.getByLabel('Descripción').fill('Detalle de la tarea')
  await form.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  await form.getByRole('radio', { name: 'Laboral' }).check()
  await form
    .getByRole('radiogroup', { name: 'Repetición' })
    .getByRole('radio', { name: schedule.repetition })
    .check()
  for (const day of schedule.weekdays ?? []) {
    await form
      .getByRole('group', { name: 'Días de la semana' })
      .getByRole('button', { name: day })
      .click()
  }
  if (schedule.date !== undefined) await form.getByLabel('Fecha').fill(schedule.date)
  await form.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.describe('Tareas programadas (US4)', () => {
  test('aparecen solas el día que toca, sin duplicados, y se pausan y eliminan', async ({
    page,
    loginAsGoogleUser,
  }) => {
    const setNow = await useServerClock(page, SUNDAY_MORNING)
    await loginAsGoogleUser(`programadas-${crypto.randomUUID()}@example.com`)
    await closeStartOfDay(page)

    // A weekly one for Mondays and Wednesdays, and a one-off for tomorrow (the Monday).
    await goTo(page, 'Programadas')
    await expect(page.getByText('Aún no tienes tareas programadas')).toBeVisible()
    await createSchedule(page, {
      title: 'Informe semanal',
      repetition: 'Días de la semana',
      weekdays: ['Lunes', 'Miércoles'],
    })
    await createSchedule(page, {
      title: 'Reunión de equipo',
      repetition: 'Una vez',
      date: '2026-11-02',
    })
    await expect(row(page, 'Informe semanal')).toContainText('Lunes y miércoles')
    await expect(row(page, 'Informe semanal')).toContainText('Próxima aparición: mañana')
    await expect(row(page, 'Reunión de equipo')).toContainText('Una vez · 2 nov')

    // Monday 04:01: both are on the board with their mark, and in the start-of-day review.
    setNow(MONDAY_0401)
    await page.goto('/')
    await expect(startOfDay(page)).toBeVisible()
    const scheduledToday = startOfDay(page).getByRole('group', { name: 'Programadas de hoy' })
    await expect(scheduledToday).toContainText('Informe semanal')
    await expect(scheduledToday).toContainText('Reunión de equipo')
    await closeStartOfDay(page)
    const planned = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Planificar', exact: true }) })
    await expect(planned.locator('article', { hasText: 'Informe semanal' })).toContainText(
      'Programada',
    )
    await expect(card(page, 'Informe semanal')).not.toContainText('Pendiente desde')

    // Wednesday, without having completed it: no duplicate, and it says since when.
    setNow(WEDNESDAY_0401)
    await page.goto('/')
    await closeStartOfDay(page)
    await expect(card(page, 'Informe semanal')).toHaveCount(1)
    await expect(card(page, 'Informe semanal')).toContainText('Pendiente desde el lun 2')

    // The one-off has finished: it cannot be paused. The weekly one can, and then deleted; the
    // task it generated stays on the board.
    await goTo(page, 'Programadas')
    await expect(row(page, 'Reunión de equipo')).toContainText('Terminada')
    await expect(
      row(page, 'Reunión de equipo').getByRole('button', { name: 'Pausar' }),
    ).toHaveCount(0)
    await row(page, 'Informe semanal').getByRole('button', { name: 'Pausar' }).click()
    await expect(row(page, 'Informe semanal')).toContainText('Pausada')
    await expect(row(page, 'Informe semanal')).toContainText('Sin próxima aparición')

    await row(page, 'Informe semanal').getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.getByRole('alertdialog')).toContainText(
      'Las tareas que ya ha generado se quedan en el tablero.',
    )
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.getByRole('heading', { name: 'Informe semanal' })).toHaveCount(0)

    await goTo(page, 'Tablero')
    await expect(card(page, 'Informe semanal')).toHaveCount(1)
  })
})
