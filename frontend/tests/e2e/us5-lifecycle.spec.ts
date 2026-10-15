import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'

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

function boardCard(page: Page, title: string): ReturnType<Page['locator']> {
  return page.locator('article', { hasText: title })
}

async function goTo(page: Page, link: 'Tablero' | 'Historial' | 'Papelera'): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: link })
    .click()
}

test.describe('US5 · Completar tareas y consultar su historial', () => {
  test('completar la saca del tablero y la muestra en el historial; reabrirla la devuelve', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us5-completar-${crypto.randomUUID()}@example.com`)
    await createTask(page, 'Tarea a completar')

    await boardCard(page, 'Tarea a completar').getByRole('button', { name: 'Completar' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Tarea completada' })).toBeVisible()
    await expect(boardCard(page, 'Tarea a completar')).toHaveCount(0)

    await goTo(page, 'Historial')
    const historyRow = boardCard(page, 'Tarea a completar')
    await expect(historyRow).toBeVisible()
    await expect(historyRow.getByRole('button', { name: 'Editar' })).toHaveCount(0)

    await historyRow.getByRole('button', { name: 'Reabrir' }).click()
    await expect(boardCard(page, 'Tarea a completar')).toHaveCount(0)
    await expect(page.getByText('Aún no has completado ninguna tarea')).toBeVisible()

    await goTo(page, 'Tablero')
    await expect(boardCard(page, 'Tarea a completar')).toBeVisible()
  })

  test('mover a la papelera una activa: "Deshacer" la devuelve y "Restaurar" también', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us5-papelera-activa-${crypto.randomUUID()}@example.com`)
    await createTask(page, 'Tarea activa')

    await boardCard(page, 'Tarea activa')
      .getByRole('button', { name: 'Mover a la papelera' })
      .click()
    await expect(boardCard(page, 'Tarea activa')).toHaveCount(0)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(boardCard(page, 'Tarea activa')).toBeVisible()

    await boardCard(page, 'Tarea activa')
      .getByRole('button', { name: 'Mover a la papelera' })
      .click()
    await expect(boardCard(page, 'Tarea activa')).toHaveCount(0)
    await goTo(page, 'Papelera')
    const trashRow = boardCard(page, 'Tarea activa')
    await expect(trashRow).toContainText('Activa')
    await expect(trashRow).toContainText('Se eliminará en 30 días')

    await trashRow.getByRole('button', { name: 'Restaurar' }).click()
    await expect(page.getByText('La papelera está vacía')).toBeVisible()
    await goTo(page, 'Tablero')
    await expect(boardCard(page, 'Tarea activa')).toBeVisible()
  })

  test('mover a la papelera una completada y restaurarla la devuelve al historial', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us5-papelera-completada-${crypto.randomUUID()}@example.com`)
    await createTask(page, 'Tarea completada')
    await boardCard(page, 'Tarea completada').getByRole('button', { name: 'Completar' }).click()
    await goTo(page, 'Historial')

    await boardCard(page, 'Tarea completada')
      .getByRole('button', { name: 'Mover a la papelera' })
      .click()
    await expect(boardCard(page, 'Tarea completada')).toHaveCount(0)

    await goTo(page, 'Papelera')
    await expect(boardCard(page, 'Tarea completada')).toContainText('Completada')
    await boardCard(page, 'Tarea completada').getByRole('button', { name: 'Restaurar' }).click()

    await goTo(page, 'Historial')
    await expect(boardCard(page, 'Tarea completada')).toBeVisible()
  })

  test('borrar definitivamente pide confirmación y elimina la tarea de todas las vistas', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`us5-borrar-${crypto.randomUUID()}@example.com`)
    await createTask(page, 'Tarea a borrar')
    await boardCard(page, 'Tarea a borrar')
      .getByRole('button', { name: 'Mover a la papelera' })
      .click()
    await goTo(page, 'Papelera')

    await boardCard(page, 'Tarea a borrar')
      .getByRole('button', { name: 'Eliminar definitivamente' })
      .click()
    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(boardCard(page, 'Tarea a borrar')).toBeVisible()

    await boardCard(page, 'Tarea a borrar')
      .getByRole('button', { name: 'Eliminar definitivamente' })
      .click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Eliminar definitivamente' })
      .click()

    await expect(page.getByText('La papelera está vacía')).toBeVisible()
    await goTo(page, 'Tablero')
    await expect(boardCard(page, 'Tarea a borrar')).toHaveCount(0)
    await goTo(page, 'Historial')
    await expect(page.getByText('Aún no has completado ninguna tarea')).toBeVisible()
  })

  test('cerrar sesión y volver a entrar conserva el estado de las tareas (FR-015)', async ({
    page,
    loginAsGoogleUser,
  }) => {
    const email = `us5-persistencia-${crypto.randomUUID()}@example.com`
    await loginAsGoogleUser(email)
    await createTask(page, 'Tarea persistente')
    await boardCard(page, 'Tarea persistente').getByRole('button', { name: 'Completar' }).click()
    await expect(boardCard(page, 'Tarea persistente')).toHaveCount(0)

    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await expect(page).toHaveURL(/\/login/)
    await loginAsGoogleUser(email)
    await goTo(page, 'Historial')

    await expect(boardCard(page, 'Tarea persistente')).toBeVisible()
  })
})
