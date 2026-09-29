import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'

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

async function goTo(page: Page, link: 'Tablero' | 'Historial' | 'Papelera'): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: link })
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
})
