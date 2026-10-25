import { randomBytes } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`
}

// A minimal PNG encoder, so the tests carry no binary fixtures: 8-bit RGB, no interlacing.
function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function makePng(width: number, height: number, fillRow: (row: Buffer, y: number) => void): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB
  const rows: Buffer[] = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3) // first byte: filter "none"
    fillRow(row.subarray(1), y)
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function solidPng(color: [number, number, number], width = 160, height = 120): Buffer {
  return makePng(width, height, (row) => {
    for (let x = 0; x < width; x += 1) row.set(color, x * 3)
  })
}

// Pure noise does not compress: about 3 MB, over the 2 MB limit.
function bigNoisePng(): Buffer {
  return makePng(1000, 1000, (row) => row.set(randomBytes(row.length)))
}

async function openProfile(page: Page): Promise<void> {
  await page.getByRole('link', { name: /^Perfil/ }).click()
  await expect(page.getByLabel('Nombre para mostrar')).toBeVisible()
}

function headerAvatar(page: Page) {
  return page
    .getByRole('banner')
    .getByRole('link', { name: /^Perfil de / })
    .locator('img')
}

function dialog(page: Page) {
  return page.getByRole('dialog', { name: 'Elegir avatar' })
}

async function openUploadTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Elegir avatar' }).click()
  await dialog(page).getByRole('tab', { name: 'Subir imagen' }).click()
}

async function chooseFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await dialog(page).getByLabel('Elegir archivo').setInputFiles(file)
}

async function uploadPicture(page: Page, buffer: Buffer): Promise<void> {
  await openUploadTab(page)
  await chooseFile(page, { name: 'foto.png', mimeType: 'image/png', buffer })
  await expect(dialog(page).getByRole('application', { name: /encuadre/i })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Guardar avatar' }).click()
}

async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByRole('main').getByRole('status')).toHaveText('Guardado')
}

test.describe('Perfil · imagen propia', () => {
  test('se sube, se encuadra, se sustituye y se quita', async ({ page, loginAsGoogleUser }) => {
    await loginAsGoogleUser(uniqueEmail('avatar-subir'))
    await expect(headerAvatar(page)).toHaveCount(0)
    await openProfile(page)

    await openUploadTab(page)
    await chooseFile(page, {
      name: 'roja.png',
      mimeType: 'image/png',
      buffer: solidPng([200, 30, 30]),
    })
    const cropper = dialog(page).getByRole('application', { name: /encuadre/i })
    await expect(cropper).toBeVisible()
    await expect(dialog(page).getByTestId('crop-preview')).toBeVisible()
    const zoom = dialog(page).getByRole('slider', { name: 'Zoom' })
    await cropper.focus()
    await page.keyboard.press('+')
    expect(Number(await zoom.inputValue())).toBeGreaterThan(1)
    await page.keyboard.press('ArrowRight')
    await dialog(page).getByRole('button', { name: 'Guardar avatar' }).click()

    await expect(dialog(page)).toHaveCount(0)
    await expectSaved(page)
    await expect(headerAvatar(page)).toHaveCount(1)
    await expect(page.getByRole('img', { name: 'Tu imagen de avatar' })).toBeVisible()
    const first = await headerAvatar(page).getAttribute('src')
    expect(first).toMatch(/^blob:/)

    await uploadPicture(page, solidPng([30, 30, 200]))
    await expect(dialog(page)).toHaveCount(0)
    await expectSaved(page)
    await expect(headerAvatar(page)).not.toHaveAttribute('src', first as string)

    await page.getByRole('button', { name: 'Quitar avatar' }).click()
    await expectSaved(page)
    await expect(headerAvatar(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Quitar avatar' })).toHaveCount(0)
  })

  test('la imagen sigue tras recargar y en otro navegador, sin errores en la consola', async ({
    page,
    browser,
    loginAsGoogleUser,
  }) => {
    // The dev server sends no CSP, so what this checks is that nothing fails in the console;
    // the policy itself (img-src with blob:) is covered by the nginx entrypoint test.
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text())
    })
    const email = uniqueEmail('avatar-persistir')
    await loginAsGoogleUser(email)
    await openProfile(page)
    await uploadPicture(page, solidPng([20, 140, 60]))
    await expect(dialog(page)).toHaveCount(0)
    await expectSaved(page)

    await page.reload()

    await expect(headerAvatar(page)).toHaveCount(1)
    await expect(headerAvatar(page)).toHaveAttribute('src', /^blob:/)
    const loaded = await headerAvatar(page).evaluate(
      (image) =>
        (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
    )
    expect(loaded).toBe(true)

    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await otherPage.goto('/login')
    await otherPage.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
    await otherPage.evaluate(async (userEmail) => {
      await window.__mytasksTestLogin?.(userEmail)
    }, email)
    await expect(headerAvatar(otherPage)).toHaveAttribute('src', /^blob:/)
    await other.close()
    expect(problems.filter((text) => /Content Security Policy|blob:/i.test(text))).toEqual([])
  })

  test('los archivos no válidos se rechazan con un mensaje claro y el avatar anterior no cambia', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('avatar-invalidos'))
    await openProfile(page)
    await uploadPicture(page, solidPng([200, 30, 30]))
    await expect(dialog(page)).toHaveCount(0)
    await expectSaved(page)
    const before = await headerAvatar(page).getAttribute('src')
    await openUploadTab(page)

    await chooseFile(page, {
      name: 'nota.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hola'),
    })
    await expect(dialog(page).getByRole('alert')).toHaveText(
      'El archivo debe ser una imagen JPEG, PNG o WebP.',
    )

    await chooseFile(page, { name: 'enorme.png', mimeType: 'image/png', buffer: bigNoisePng() })
    await expect(dialog(page).getByRole('alert')).toHaveText('La imagen supera los 2 MB.')

    await chooseFile(page, {
      name: 'falsa.png',
      mimeType: 'image/png',
      buffer: Buffer.from('esto es un texto renombrado a .png'),
    })
    await expect(dialog(page).getByRole('alert')).toHaveText('No se pudo leer la imagen.')

    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(headerAvatar(page)).toHaveAttribute('src', before as string)
  })

  test('elegir uno del catálogo con una imagen subida la sustituye', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(uniqueEmail('avatar-catalogo'))
    await openProfile(page)
    await uploadPicture(page, solidPng([200, 30, 30]))
    await expect(dialog(page)).toHaveCount(0)
    await expectSaved(page)

    await page.getByRole('button', { name: 'Elegir avatar' }).click()
    await dialog(page).getByRole('radio', { name: 'Zorro' }).check()
    await dialog(page).getByRole('button', { name: 'Guardar avatar' }).click()

    await expect(dialog(page)).toHaveCount(0)
    await expectSaved(page)
    // Vite inlines the SVG as a data: URI, whose text carries the avatar's <title>.
    await expect(headerAvatar(page)).toHaveAttribute('src', /Zorro/)
  })

  test('tras diez subidas en una hora, la siguiente pide esperar unos minutos', async ({
    page,
    loginAsGoogleUser,
  }) => {
    test.setTimeout(180_000)
    await loginAsGoogleUser(uniqueEmail('avatar-limite'))
    await openProfile(page)
    for (let index = 0; index < 10; index += 1) {
      await uploadPicture(page, solidPng([index * 20, 40, 120]))
      await expect(dialog(page)).toHaveCount(0)
      await expectSaved(page)
    }
    const before = await headerAvatar(page).getAttribute('src')

    await uploadPicture(page, solidPng([255, 255, 0]))

    await expect(dialog(page).getByRole('alert')).toHaveText(
      'Has subido demasiadas imágenes. Espera unos minutos.',
    )
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Guardar avatar' }).waitFor()
    await page.keyboard.press('Escape')
    await expect(headerAvatar(page)).toHaveAttribute('src', before as string)
  })
})
