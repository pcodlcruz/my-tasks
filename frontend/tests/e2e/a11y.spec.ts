import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { ADMIN_E2E_EMAIL, expect, test } from './fixtures/auth'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page, scope: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'n/a'}): ${violation.help}\n` +
      violation.nodes
        .map((node) => `  - ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
        .join('\n'),
  )
  expect(summary, `Violaciones de accesibilidad en ${scope}`).toEqual([])
}

interface NewTask {
  title: string
  urgent: boolean
  important: boolean
  scope: 'Laboral' | 'Personal'
}

async function createTask(page: Page, task: NewTask): Promise<void> {
  await page.getByRole('button', { name: '+ Nueva tarea' }).click()
  await page.getByLabel('Título').fill(task.title)
  await page.getByLabel('Descripción').fill('Detalle de la tarea')
  if (task.urgent) await page.getByRole('checkbox', { name: 'Marcar como urgente' }).check()
  if (task.important) await page.getByRole('checkbox', { name: 'Marcar como importante' }).check()
  await page.getByRole('dialog').getByRole('radio', { name: task.scope }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

const ONE_TASK_PER_QUADRANT: NewTask[] = [
  { title: 'Tarea hacer ahora', urgent: true, important: true, scope: 'Laboral' },
  { title: 'Tarea planificar', urgent: false, important: true, scope: 'Personal' },
  { title: 'Tarea delegar', urgent: true, important: false, scope: 'Laboral' },
  { title: 'Tarea eliminar', urgent: false, important: false, scope: 'Personal' },
]

async function goTo(
  page: Page,
  link: 'Tablero' | 'Programadas' | 'Historial' | 'Papelera',
): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: link })
    .click()
}

async function goToAdmin(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Accesos' })
    .click()
}

test.describe('Accesibilidad WCAG 2.1 AA', () => {
  test('la pantalla de inicio de sesión no tiene violaciones', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /iniciar sesión con google/i })).toBeVisible()

    await expectNoViolations(page, 'S1 · Iniciar sesión')
  })

  test('el tablero vacío y con tareas en los 4 cuadrantes no tiene violaciones', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`a11y-tablero-${crypto.randomUUID()}@example.com`)
    await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
    await expectNoViolations(page, 'S3 · Tablero vacío')

    for (const task of ONE_TASK_PER_QUADRANT) {
      await createTask(page, task)
    }
    await page
      .locator('article', { hasText: 'Tarea planificar' })
      .getByRole('button', { name: 'Fijar' })
      .click()
    await expect(
      page.locator('article', { hasText: 'Tarea planificar' }).getByLabel('Fijada'),
    ).toBeVisible()

    await expectNoViolations(page, 'S3 · Tablero con tareas')
  })

  test('el tablero en móvil no tiene violaciones', async ({ page, loginAsGoogleUser }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsGoogleUser(`a11y-movil-${crypto.randomUUID()}@example.com`)
    await createTask(page, ONE_TASK_PER_QUADRANT[0] as NewTask)

    await expectNoViolations(page, 'S3 · Tablero (móvil)')
  })

  test('el formulario de tarea (crear y editar) no tiene violaciones', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`a11y-formulario-${crypto.randomUUID()}@example.com`)
    await page.getByRole('button', { name: '+ Nueva tarea' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoViolations(page, 'S4 · Formulario (crear)')

    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expectNoViolations(page, 'S4 · Formulario con errores en línea')

    await page.getByRole('button', { name: 'Cancelar' }).click()
    await createTask(page, ONE_TASK_PER_QUADRANT[0] as NewTask)
    await page.getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoViolations(page, 'S4 · Formulario (editar)')
  })

  test('el historial (vacío y con tareas) no tiene violaciones', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`a11y-historial-${crypto.randomUUID()}@example.com`)
    await goTo(page, 'Historial')
    await expect(page.getByText('Aún no has completado ninguna tarea')).toBeVisible()
    await expectNoViolations(page, 'S5 · Historial vacío')

    await goTo(page, 'Tablero')
    await createTask(page, ONE_TASK_PER_QUADRANT[0] as NewTask)
    await createTask(page, ONE_TASK_PER_QUADRANT[1] as NewTask)
    await page
      .locator('article', { hasText: 'Tarea hacer ahora' })
      .getByRole('button', { name: 'Completar' })
      .click()
    await page
      .locator('article', { hasText: 'Tarea planificar' })
      .getByRole('button', { name: 'Completar' })
      .click()
    await goTo(page, 'Historial')
    await expect(page.locator('article')).toHaveCount(2)

    await expectNoViolations(page, 'S5 · Historial con tareas')
  })

  test('la papelera (vacía, con tareas, con confirmación y con aviso) no tiene violaciones', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`a11y-papelera-${crypto.randomUUID()}@example.com`)
    await goTo(page, 'Papelera')
    await expect(page.getByText('La papelera está vacía')).toBeVisible()
    await expectNoViolations(page, 'S6 · Papelera vacía')

    await goTo(page, 'Tablero')
    await createTask(page, ONE_TASK_PER_QUADRANT[0] as NewTask)
    await page.getByRole('button', { name: 'Mover a la papelera' }).click()
    await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible()
    await expectNoViolations(page, 'Tablero con aviso "Deshacer"')

    await goTo(page, 'Papelera')
    await expect(page.locator('article')).toHaveCount(1)
    await expectNoViolations(page, 'S6 · Papelera con tareas')

    await page.getByRole('button', { name: 'Eliminar definitivamente' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expectNoViolations(page, 'S6 · Diálogo de confirmación')
  })

  test('ninguna pantalla desborda en horizontal en móvil (reflow, WCAG 1.4.10)', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAsGoogleUser(`a11y-reflow-${crypto.randomUUID()}@example.com`)
    await createTask(page, {
      title:
        'Una tarea con un título bastante largo para comprobar cómo se ajusta en pantallas estrechas',
      urgent: true,
      important: true,
      scope: 'Laboral',
    })

    async function expectNoHorizontalOverflow(screen: string): Promise<void> {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, `Desbordamiento horizontal en ${screen}`).toBeLessThanOrEqual(0)
    }

    await expectNoHorizontalOverflow('Tablero')
    await page.getByRole('button', { name: 'Completar' }).click()
    await goTo(page, 'Historial')
    await expect(page.getByRole('heading', { name: 'Historial', level: 1 })).toBeVisible()
    await expect(page.locator('article')).toHaveCount(1)
    await expectNoHorizontalOverflow('Historial')
    await page.getByRole('button', { name: 'Mover a la papelera' }).click()
    await goTo(page, 'Papelera')
    await expect(page.getByRole('heading', { name: 'Papelera', level: 1 })).toBeVisible()
    await expect(page.locator('article')).toHaveCount(1)
    await expectNoHorizontalOverflow('Papelera')
  })

  // 320 CSS px is the width WCAG 1.4.10 uses for reflow, and the administrator has the most
  // tabs. The header must wrap instead of overflowing: its content differs in width between
  // fonts, so a layout that only just fits at 390 px fails on another machine.
  test('la cabecera, el marcador y «Perfil» no desbordan a 320 px con las pestañas del administrador', async ({
    page,
    loginAsAdmin,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await loginAsAdmin()
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible()

    await expect(page.getByRole('region', { name: 'Marcador del día' })).toContainText(
      'tareas completadas hoy',
    )
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(
      overflow,
      'Desbordamiento horizontal de la cabecera y el marcador a 320 px',
    ).toBeLessThanOrEqual(0)
    await goTo(page, 'Programadas')
    await expect(page.getByRole('heading', { name: 'Tareas programadas', level: 1 })).toBeVisible()
    const schedulesOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(
      schedulesOverflow,
      'Desbordamiento horizontal en Programadas a 320 px',
    ).toBeLessThanOrEqual(0)
    await page.getByRole('link', { name: 'Perfil' }).click()
    await expect(page.getByRole('region', { name: 'Progreso y juego' })).toBeVisible()
    const profileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(profileOverflow, 'Desbordamiento horizontal en Perfil a 320 px').toBeLessThanOrEqual(0)
    await goToAdmin(page)
    const adminOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(adminOverflow, 'Desbordamiento horizontal en Accesos a 320 px').toBeLessThanOrEqual(0)
  })

  test('los cuadrantes se distinguen por texto y no solo por color', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`a11y-texto-${crypto.randomUUID()}@example.com`)

    for (const label of ['Hacer ahora', 'Planificar', 'Delegar', 'Eliminar']) {
      const section = page.locator('section').filter({
        has: page.getByRole('heading', { name: label, exact: true }),
      })
      await expect(section).toContainText(/\d+ tareas?/)
      await expect(section).toContainText('No hay tareas en este cuadrante.')
    }
  })

  test('se puede crear una tarea solo con teclado y el foco vuelve al botón al cerrar el formulario', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`a11y-teclado-${crypto.randomUUID()}@example.com`)
    const newTaskButton = page.getByRole('button', { name: '+ Nueva tarea' })

    await newTaskButton.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('Título')).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(newTaskButton).toBeFocused()
  })

  test('los elementos interactivos muestran un indicador de foco visible', async ({
    page,
    loginAsGoogleUser,
  }) => {
    await loginAsGoogleUser(`a11y-foco-${crypto.randomUUID()}@example.com`)
    const newTaskButton = page.getByRole('button', { name: '+ Nueva tarea' })

    await page.keyboard.press('Tab')
    await newTaskButton.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')

    const outline = await newTaskButton.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      }
    })
    const hasOutline = outline.outlineStyle !== 'none' && outline.outlineWidth !== '0px'
    const hasRing = outline.boxShadow !== 'none'
    expect(hasOutline || hasRing).toBe(true)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`las pantallas de la aplicación no tienen violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      loginAsGoogleUser,
    }) => {
      // The profile is left on "Sistema", so the theme follows the emulated browser scheme.
      await page.emulateMedia({ colorScheme })
      await loginAsGoogleUser(`a11y-tema-${colorScheme}-${crypto.randomUUID()}@example.com`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)

      await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Marcador del día' })).toContainText(
        'tareas completadas hoy',
      )
      await expectNoViolations(page, `S3 v3 · Tablero con el marcador (${colorScheme})`)

      await goTo(page, 'Historial')
      await expect(page.getByText('Aún no has completado ninguna tarea')).toBeVisible()
      await expectNoViolations(page, `S5 · Historial (${colorScheme})`)

      await goTo(page, 'Papelera')
      await expect(page.getByText('La papelera está vacía')).toBeVisible()
      await expectNoViolations(page, `S6 · Papelera (${colorScheme})`)

      await page.getByRole('link', { name: 'Perfil' }).click()
      await expect(page.getByRole('radiogroup', { name: 'Tema' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Progreso y juego' })).toBeVisible()
      await expectNoViolations(page, `S7 v2 · Perfil con «Progreso y juego» (${colorScheme})`)
    })

    test(`el marcador con la meta cumplida no tiene violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      loginAsGoogleUser,
    }) => {
      await page.emulateMedia({ colorScheme })
      await loginAsGoogleUser(`a11y-marcador-${colorScheme}-${crypto.randomUUID()}@example.com`)
      await page.getByRole('link', { name: 'Perfil' }).click()
      const settings = page.getByRole('region', { name: 'Progreso y juego' })
      await settings.getByRole('button', { name: 'Disminuir meta diaria' }).click()
      await expect(settings).toContainText('2 tareas')
      await settings.getByRole('button', { name: 'Disminuir meta diaria' }).click()
      await expect(settings).toContainText('1 tarea')
      await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()

      await goTo(page, 'Tablero')
      await createTask(page, ONE_TASK_PER_QUADRANT[0] as NewTask)
      await createTask(page, ONE_TASK_PER_QUADRANT[1] as NewTask)
      await page
        .locator('article', { hasText: 'Tarea hacer ahora' })
        .getByRole('button', { name: 'Completar' })
        .click()
      await page
        .locator('article', { hasText: 'Tarea planificar' })
        .getByRole('button', { name: 'Completar' })
        .click()
      const scoreboard = page.getByRole('region', { name: 'Marcador del día' })
      await expect(scoreboard).toContainText('2 de 1 tarea completada hoy')
      await expect(scoreboard).toContainText('Meta cumplida')

      await expectNoViolations(page, `S3 v3 · Marcador por encima de la meta (${colorScheme})`)
    })

    test(`el formulario y la confirmación no tienen violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      loginAsGoogleUser,
    }) => {
      await page.emulateMedia({ colorScheme })
      await loginAsGoogleUser(`a11y-dialogos-${colorScheme}-${crypto.randomUUID()}@example.com`)
      await page.getByRole('button', { name: '+ Nueva tarea' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, `S4 · Formulario (${colorScheme})`)
      await page.getByRole('button', { name: 'Cancelar' }).click()

      await page.getByRole('link', { name: 'Perfil' }).click()
      await page.getByRole('button', { name: 'Restablecer valores por defecto' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await expectNoViolations(page, `S7 · Confirmación de restablecer (${colorScheme})`)
    })

    test(`la administración de accesos no tiene violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      loginAsAdmin,
    }) => {
      await page.emulateMedia({ colorScheme })
      await loginAsAdmin()
      await expect(page.getByRole('heading', { name: 'Hacer ahora' })).toBeVisible()
      await goToAdmin(page)
      await expect(page.getByRole('heading', { name: 'Accesos', level: 1 })).toBeVisible()

      await expectNoViolations(page, `/admin/access (${colorScheme}, ${ADMIN_E2E_EMAIL})`)
    })

    test(`"Necesitas una invitación" no tiene violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      loginAsGoogleUser,
    }) => {
      await page.emulateMedia({ colorScheme })
      await loginAsGoogleUser(`a11y-extrana-${colorScheme}-${crypto.randomUUID()}@example.com`, {
        invited: false,
      })
      await expect(page.getByRole('heading', { name: 'Necesitas una invitación' })).toBeVisible()

      await expectNoViolations(page, `Necesitas una invitación (${colorScheme})`)
    })

    test(`el inicio de sesión no tiene violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/login')
      await expect(page.getByRole('button', { name: /iniciar sesión con google/i })).toBeVisible()

      await expectNoViolations(page, `S1 · Iniciar sesión (${colorScheme})`)
    })
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`una celebración y el modo arcade desactivado no tienen violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      loginAsGoogleUser,
    }) => {
      await page.emulateMedia({ colorScheme })
      await loginAsGoogleUser(`a11y-arcade-${colorScheme}-${crypto.randomUUID()}@example.com`)
      await createTask(page, ONE_TASK_PER_QUADRANT[0] as NewTask)
      await createTask(page, ONE_TASK_PER_QUADRANT[1] as NewTask)

      await page
        .locator('article', { hasText: 'Tarea hacer ahora' })
        .getByRole('button', { name: 'Completar' })
        .click()
      await expect(page.locator('[data-celebrations]')).toContainText('Logro: Primera moneda')
      await expect(page.getByRole('region', { name: 'Marcador del día' })).toContainText(
        '100 puntos',
      )
      await expectNoViolations(page, `S3-c · Celebración y marcador arcade (${colorScheme})`)

      await page.getByRole('link', { name: 'Perfil' }).click()
      const toggle = page.getByRole('switch', { name: 'Modo arcade' })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
      await expect(page.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible()
      await expectNoViolations(page, `S7 v2 · Modo arcade desactivado (${colorScheme})`)
      await goTo(page, 'Tablero')
      await expect(page.getByRole('region', { name: 'Marcador del día' })).toContainText(
        'Hoy 1 de 3',
      )
      await expectNoViolations(page, `S3 v3 · Tablero sin modo arcade (${colorScheme})`)
    })
  }

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`las tareas programadas y su formulario no tienen violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
      loginAsGoogleUser,
    }) => {
      await page.emulateMedia({ colorScheme })
      await loginAsGoogleUser(`a11y-programadas-${colorScheme}-${crypto.randomUUID()}@example.com`)
      await goTo(page, 'Programadas')
      await expect(page.getByText('Aún no tienes tareas programadas')).toBeVisible()
      await expectNoViolations(page, `S10 · Programadas vacía (${colorScheme})`)

      await page.getByRole('button', { name: 'Crear la primera programación' }).click()
      const form = page.getByRole('dialog', { name: 'Nueva programación' })
      await expect(form).toBeVisible()
      await expectNoViolations(page, `S11 · Formulario (${colorScheme})`)

      await form
        .getByRole('radiogroup', { name: 'Repetición' })
        .getByRole('radio', { name: 'Días de la semana' })
        .check()
      await form.getByRole('button', { name: 'Guardar' }).click()
      await expect(form.getByText('Elige al menos un día de la semana.')).toBeVisible()
      await expectNoViolations(page, `S11 · Formulario con errores en línea (${colorScheme})`)

      await form.getByLabel('Título').fill('Informe semanal')
      await form.getByLabel('Descripción').fill('Enviar el resumen')
      await form.getByRole('radio', { name: 'Laboral' }).check()
      await form
        .getByRole('group', { name: 'Días de la semana' })
        .getByRole('button', { name: 'Lunes' })
        .click()
      await expect(form.getByText(/^Próxima aparición:/)).toBeVisible()
      await form.getByRole('button', { name: 'Guardar' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Informe semanal' })).toBeVisible()
      await expectNoViolations(page, `S10 · Con una programación (${colorScheme})`)

      await page.getByRole('button', { name: 'Eliminar' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await expectNoViolations(page, `S10 · Confirmar eliminar (${colorScheme})`)
    })
  }

  test.describe('inicio de jornada (S8)', () => {
    test.use({ startOfDay: true })

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`«PULSA START» y la misión no tienen violaciones en tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
        page,
        loginAsGoogleUser,
      }) => {
        await page.emulateMedia({ colorScheme })
        await loginAsGoogleUser(`a11y-s8-${colorScheme}-${crypto.randomUUID()}@example.com`)
        const review = page.getByRole('dialog', { name: 'PULSA START' })
        await expect(review).toContainText('PARTIDA NUEVA')
        await expectNoViolations(page, `S8 · Partida nueva sin tareas (${colorScheme})`)
        await review.getByRole('button', { name: 'Empezar' }).click()

        await createTask(page, ONE_TASK_PER_QUADRANT[0] as NewTask)
        await createTask(page, { ...(ONE_TASK_PER_QUADRANT[0] as NewTask), title: 'Otra urgente' })
        await page
          .getByRole('region', { name: 'Marcador del día' })
          .getByRole('button', { name: /PULSA START/ })
          .click()
        await review.getByRole('button', { name: 'Añadir a la misión: Tarea hacer ahora' }).click()
        await expect(review).toContainText('Misión del día: 1 de 5 elegidas')
        await expectNoViolations(page, `S8 · Misión elegida (${colorScheme})`)

        await review.getByRole('button', { name: 'Empezar' }).click()
        await expect(page.locator('article', { hasText: 'Tarea hacer ahora' })).toContainText(
          'Misión del día',
        )
        await expectNoViolations(page, `S3 v3 · Tarea de la misión (${colorScheme})`)
      })
    }
  })
})
