import type { Page } from '@playwright/test'
import { expect, hideStartOfDay, test } from './fixtures/auth'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`
}

async function openProfile(page: Page): Promise<void> {
  await page.getByRole('link', { name: /^Perfil/ }).click()
  await expect(page.getByLabel('Nombre para mostrar')).toBeVisible()
}

async function saveName(page: Page, name: string): Promise<void> {
  const input = page.getByLabel('Nombre para mostrar')
  await input.fill(name)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
}

async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Guardado')
}

function headerLink(page: Page, name: string | RegExp = /^Perfil de /) {
  return page.getByRole('banner').getByRole('link', { name })
}

test.describe('Perfil · identidad', () => {
  test('el nombre elegido aparece en la cabecera y persiste al recargar y en otro navegador', async ({
    page,
    browser,
    loginAsGoogleUser,
  }) => {
    const email = uniqueEmail('perfil-nombre')
    await loginAsGoogleUser(email)
    await expect(headerLink(page, `Perfil de ${email}`)).toBeVisible()
    await openProfile(page)

    await saveName(page, '  Ana 🌱  ')
    await expectSaved(page)

    await expect(headerLink(page, 'Perfil de Ana 🌱')).toBeVisible()
    await page.reload()
    await expect(headerLink(page, 'Perfil de Ana 🌱')).toBeVisible()
    await expect(page.getByLabel('Nombre para mostrar')).toHaveValue('Ana 🌱')

    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto('/login')
    await otherPage.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
    await otherPage.evaluate(async (userEmail) => {
      await window.__mytasksTestLogin?.(userEmail)
    }, email)
    await expect(headerLink(otherPage, 'Perfil de Ana 🌱')).toBeVisible()
    await other.close()
  })

  test('un nombre vacío, de solo espacios o de 51 caracteres se rechaza y se conserva el anterior', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('perfil-validacion'))
    await openProfile(page)
    await saveName(page, 'Eva')
    await expectSaved(page)

    for (const [typed, message] of [
      ['', 'Escribe un nombre de 1 a 50 caracteres o usa el de Google.'],
      ['      ', 'Escribe un nombre de 1 a 50 caracteres o usa el de Google.'],
      ['a'.repeat(51), 'El nombre no puede superar los 50 caracteres.'],
    ] as const) {
      await saveName(page, typed)
      await expect(page.getByRole('alert')).toContainText(message)
      await expect(headerLink(page, 'Perfil de Eva')).toBeVisible()
    }

    await page.reload()
    await expect(page.getByLabel('Nombre para mostrar')).toHaveValue('Eva')
  })

  test('un nombre con HTML se muestra como texto literal y no ejecuta nada', async ({
    page,
    loginAsGoogleUser,
  }) => {
    const dialogs: string[] = []
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message())
      void dialog.dismiss()
    })
    await loginAsGoogleUser(uniqueEmail('perfil-html'))
    await openProfile(page)
    const name = '<img src=x onerror=alert(1)>'

    await saveName(page, name)
    await expectSaved(page)
    await page.reload()

    await expect(headerLink(page)).toContainText(name)
    await expect(page.getByLabel('Nombre para mostrar')).toHaveValue(name)
    await expect(page.locator('img[src="x"]')).toHaveCount(0)
    expect(dialogs).toEqual([])
  })

  test('«Usar el de Google» vuelve al nombre de la cuenta', async ({ page, loginAsGoogleUser }) => {
    const email = uniqueEmail('perfil-google')
    await loginAsGoogleUser(email)
    await openProfile(page)
    await saveName(page, 'Eva')
    await expectSaved(page)

    await page.getByRole('button', { name: 'Usar el de Google' }).click()

    await expect(headerLink(page, `Perfil de ${email}`)).toBeVisible()
    await expect(page.getByLabel('Nombre para mostrar')).toHaveValue('')
  })

  test('se elige un avatar del catálogo, persiste entre sesiones y se quita para volver a las iniciales', async ({
    page,
    browser,
    loginAsGoogleUser,
  }) => {
    const email = uniqueEmail('perfil-avatar')
    await loginAsGoogleUser(email)
    await expect(headerLink(page).locator('img')).toHaveCount(0)
    await openProfile(page)
    await expect(page.getByRole('button', { name: 'Quitar avatar' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Elegir avatar' }).click()
    const dialog = page.getByRole('dialog', { name: 'Elegir avatar' })
    await expect(dialog.getByRole('radio')).toHaveCount(12)
    await dialog.getByRole('radio', { name: 'Zorro' }).check()
    await dialog.getByRole('button', { name: 'Guardar avatar' }).click()
    await expect(dialog).toHaveCount(0)
    await expectSaved(page)

    await expect(headerLink(page).locator('img')).toHaveCount(1)
    await expect(page.getByRole('img', { name: 'Zorro' })).toBeVisible()
    await page.reload()
    await expect(headerLink(page).locator('img')).toHaveCount(1)

    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto('/login')
    await otherPage.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
    await otherPage.evaluate(async (userEmail) => {
      await window.__mytasksTestLogin?.(userEmail)
    }, email)
    await expect(headerLink(otherPage).locator('img')).toHaveCount(1)
    await other.close()

    await page.getByRole('button', { name: 'Quitar avatar' }).click()
    await expectSaved(page)
    await expect(headerLink(page).locator('img')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Quitar avatar' })).toHaveCount(0)
  })

  test('el selector se maneja con teclado y devuelve el foco al cerrarse', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('perfil-teclado'))
    await openProfile(page)
    const opener = page.getByRole('button', { name: 'Elegir avatar' })

    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Elegir avatar' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('la administración de accesos sigue mostrando el correo y no el nombre elegido', async ({
    page,
    browser,
    loginAsAdmin,
  }) => {
    // Checked on a newly invited account: the newest ones are always in the list, which shows
    // only the 100 most recent and would drop the (oldest) administrator's own account.
    const email = uniqueEmail('perfil-acceso')
    const name = 'Nombre Elegido Por Eva'
    await loginAsAdmin()
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Accesos' })
      .click()
    await page.getByLabel('Correo de la persona a invitar').fill(email)
    await page.getByRole('button', { name: 'Invitar' }).click()
    await expect(
      page
        .getByRole('list', { name: 'Invitaciones' })
        .getByRole('listitem')
        .filter({ hasText: email }),
    ).toContainText('Pendiente')

    const invited = await browser.newContext()
    const invitedPage = await invited.newPage()
    await hideStartOfDay(invitedPage)
    await invitedPage.goto('/login')
    await invitedPage.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
    await invitedPage.evaluate(async (userEmail) => {
      await window.__mytasksTestLogin?.(userEmail)
    }, email)
    await openProfile(invitedPage)
    await saveName(invitedPage, name)
    await expectSaved(invitedPage)
    await invited.close()

    await page.reload()

    const account = page
      .getByRole('list', { name: 'Personas con cuenta' })
      .getByRole('listitem')
      .filter({ hasText: email })
    await expect(account).toBeVisible()
    await expect(page.getByRole('main').getByText(name)).toHaveCount(0)
    await expect(page.getByRole('main')).not.toContainText(name)
  })
})
