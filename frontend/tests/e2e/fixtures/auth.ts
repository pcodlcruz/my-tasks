import { test as base, expect } from '@playwright/test'

interface AuthFixtures {
  loginAsGoogleUser: (email: string) => Promise<void>
}

export const test = base.extend<AuthFixtures>({
  loginAsGoogleUser: async ({ page }, use) => {
    await use(async (email: string) => {
      // No navega a /login si ya estamos ahí (p. ej. tras una redirección de
      // ProtectedRoute): un page.goto perdería el estado de ruta de origen
      // (location.state.from) que esa redirección conserva.
      if (!page.url().includes('/login')) {
        await page.goto('/login')
      }
      await page.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
      await page.evaluate(async (userEmail) => {
        await window.__mytasksTestLogin?.(userEmail)
      }, email)
    })
  },
})

export { expect }
