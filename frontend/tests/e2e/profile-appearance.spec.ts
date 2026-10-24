import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`
}

async function openProfile(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Perfil' }).click()
  await expect(page.getByRole('heading', { name: 'Perfil', level: 1 })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Tema' })).toBeVisible()
}

async function chooseTheme(page: Page, label: 'Claro' | 'Oscuro' | 'Sistema'): Promise<void> {
  await page.getByRole('radiogroup', { name: 'Tema' }).getByRole('radio', { name: label }).check()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Guardado')
}

async function chooseDensity(page: Page, label: 'Cómoda' | 'Compacta'): Promise<void> {
  await page
    .getByRole('radiogroup', { name: 'Densidad' })
    .getByRole('radio', { name: label })
    .check()
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Guardado')
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

function theme(page: Page): Promise<string | null> {
  return page.locator('html').getAttribute('data-theme')
}

test.describe('Perfil · apariencia', () => {
  test('elegir "Oscuro" cambia toda la aplicación y persiste al recargar y en otro navegador', async ({
    page,
    browser,
    loginAsGoogleUser,
  }) => {
    const email = uniqueEmail('perfil-oscuro')
    await page.emulateMedia({ colorScheme: 'light' })
    await loginAsGoogleUser(email)
    await openProfile(page)

    await chooseTheme(page, 'Oscuro')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Tablero' })
      .click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    const otherBrowser = await browser.newContext({ colorScheme: 'light' })
    const otherPage = await otherBrowser.newPage()
    await otherPage.goto('/login')
    await otherPage.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
    await otherPage.evaluate(async (userEmail) => {
      await window.__mytasksTestLogin?.(userEmail)
    }, email)
    await expect(otherPage.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expect(otherPage.locator('html')).toHaveAttribute('data-theme', 'dark')
    await otherBrowser.close()
  })

  test('al recargar, el tema ya está en <html> antes de que llegue el perfil (sin destello)', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await loginAsGoogleUser(uniqueEmail('perfil-destello'))
    await openProfile(page)
    await chooseTheme(page, 'Oscuro')
    // The profile never arrives: only the local cache read by theme-init.js can explain "dark",
    // since the browser itself is in light mode.
    await page.route('**/api/v1/me/profile', () => new Promise<void>(() => undefined))

    await page.reload({ waitUntil: 'domcontentloaded' })

    expect(await theme(page)).toBe('dark')
    await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable')
    await page.waitForTimeout(500)
    expect(await theme(page)).toBe('dark')
  })

  test('"Sistema" sigue el tema del navegador', async ({ page, loginAsGoogleUser }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await loginAsGoogleUser(uniqueEmail('perfil-sistema'))
    await openProfile(page)
    await chooseTheme(page, 'Oscuro')
    await chooseTheme(page, 'Sistema')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('con la densidad compacta cada tarjeta ocupa al menos un 25 % menos de alto', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('perfil-densidad'))
    for (const title of ['Primera tarea', 'Segunda tarea', 'Tercera tarea']) {
      await createTask(page, title)
    }
    const card = page.locator('article').first()
    const comfortable = (await card.boundingBox())?.height ?? 0

    await openProfile(page)
    await chooseDensity(page, 'Compacta')
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Tablero' })
      .click()
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
    const compact = (await page.locator('article').first().boundingBox())?.height ?? 0

    expect(comfortable).toBeGreaterThan(0)
    expect(compact).toBeLessThanOrEqual(comfortable * 0.75)

    await openProfile(page)
    await chooseDensity(page, 'Cómoda')
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Tablero' })
      .click()
    const restored = (await page.locator('article').first().boundingBox())?.height ?? 0
    expect(Math.round(restored)).toBe(Math.round(comfortable))
  })

  test('si falla el guardado, avisa con "Reintentar", el control vuelve al valor guardado y la aplicación sigue usable', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await loginAsGoogleUser(uniqueEmail('perfil-fallo'))
    await openProfile(page)
    let failing = true
    await page.route('**/api/v1/me/profile', async (route) => {
      if (route.request().method() === 'PATCH' && failing) {
        await route.abort('connectionrefused')
        return
      }
      await route.continue()
    })

    await page
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Oscuro' })
      .check()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('No se pudo guardar el cambio. Inténtalo de nuevo.')
    await expect(page.getByRole('radio', { name: 'Sistema' })).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Tablero' })
      .click()
    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()

    await openProfile(page)
    failing = false
    await page
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Oscuro' })
      .check()
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Guardado')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('una cuenta sin perfil ve la aplicación como antes de la función', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await loginAsGoogleUser(uniqueEmail('perfil-sin-cambios'))
    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()

    expect(await theme(page)).toBe('light')
    await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable')
    const colors = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      primaryButton: getComputedStyle(
        [...document.querySelectorAll('button')].find((button) =>
          button.textContent?.includes('Nueva tarea'),
        ) as Element,
      ).backgroundColor,
      heading: getComputedStyle(document.querySelector('h1') as Element).color,
    }))
    expect(colors).toEqual({
      body: 'rgb(255, 255, 255)',
      primaryButton: 'rgb(29, 78, 216)',
      heading: 'rgb(15, 23, 42)',
    })
  })

  test('"Restablecer valores por defecto" confirma y devuelve tema, densidad y demás a sus valores', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await loginAsGoogleUser(uniqueEmail('perfil-restablecer'))
    await openProfile(page)
    await chooseTheme(page, 'Oscuro')
    await chooseDensity(page, 'Compacta')

    await page.getByRole('button', { name: 'Restablecer valores por defecto' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restablecer' }).click()

    await expect(page.getByRole('radio', { name: 'Sistema' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Cómoda' })).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable')
  })
})
