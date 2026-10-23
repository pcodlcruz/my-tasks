import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

test.describe('US3 · Revocar y reinvitar', () => {
  test('quien pierde el acceso no entra, y al reinvitarlo recupera sus tareas', async ({
    page,
    loginAsAdmin,
    loginAsGoogleUser,
  }) => {
    const email = `ana-${crypto.randomUUID()}@example.com`
    const title = 'Tarea que debe sobrevivir'

    // The administrator invites; the invited person signs in and keeps a task.
    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()
    await page.getByLabel('Correo de la persona a invitar').fill(email)
    await page.getByRole('button', { name: 'Invitar' }).click()
    await expect(
      page
        .getByRole('list', { name: 'Invitaciones' })
        .getByRole('listitem')
        .filter({ hasText: email }),
    ).toContainText('Pendiente')
    await signOut(page)

    await loginAsGoogleUser(email, { invited: false })
    await page.getByRole('button', { name: '+ Nueva tarea' }).click()
    await page.getByLabel('Título').fill(title)
    await page.getByLabel('Descripción').fill('Detalle de la tarea')
    await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
    await page.getByRole('dialog').getByRole('radio', { name: 'Personal' }).check()
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText(title)).toBeVisible()
    await signOut(page)

    // The administrator withdraws the access, after confirming.
    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()
    await page.getByRole('button', { name: `Retirar acceso a ${email}` }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Retirar acceso', exact: true })
      .click()
    const account = page
      .getByRole('list', { name: 'Personas con cuenta' })
      .getByRole('listitem')
      .filter({ hasText: email })
    await expect(account).toContainText('Sin acceso')
    await expect(page.getByRole('button', { name: `Retirar acceso a ${email}` })).toHaveCount(0)
    await signOut(page)

    // Without access: the screen of strangers, and not a single task.
    await loginAsGoogleUser(email, { invited: false })
    await expect(page.getByRole('heading', { name: 'Necesitas una invitación' })).toBeVisible()
    await expect(page.getByText(title)).toHaveCount(0)
    await signOut(page)

    // Inviting the same address again restores the account.
    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()
    await page.getByLabel('Correo de la persona a invitar').fill(email)
    await page.getByRole('button', { name: 'Invitar' }).click()
    await expect(account).toContainText('Activa')
    await signOut(page)

    await loginAsGoogleUser(email, { invited: false })
    await expect(page.getByText(title)).toBeVisible()
  })

  test('el administrador puede revocar una invitación pendiente y la persona no entra', async ({
    page,
    loginAsAdmin,
    loginAsGoogleUser,
  }) => {
    const email = `revocada-${crypto.randomUUID()}@example.com`

    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()
    await page.getByLabel('Correo de la persona a invitar').fill(email)
    await page.getByRole('button', { name: 'Invitar' }).click()
    await page.getByRole('button', { name: `Revocar invitación de ${email}` }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Revocar invitación', exact: true })
      .click()
    await expect(
      page
        .getByRole('list', { name: 'Invitaciones' })
        .getByRole('listitem')
        .filter({ hasText: email }),
    ).toContainText('Revocada')
    await signOut(page)

    await loginAsGoogleUser(email, { invited: false })

    await expect(page.getByRole('heading', { name: 'Necesitas una invitación' })).toBeVisible()
  })

  test('un administrador no ofrece retirar el acceso a otro administrador', async ({
    page,
    loginAsAdmin,
  }) => {
    await loginAsAdmin()
    await page.getByRole('link', { name: 'Accesos' }).click()

    const admin = page
      .getByRole('list', { name: 'Personas con cuenta' })
      .getByRole('listitem')
      .filter({ hasText: 'admin-e2e@example.com' })
    await expect(admin).toContainText('Administrador')
    await expect(admin.getByRole('button')).toHaveCount(0)
  })
})
