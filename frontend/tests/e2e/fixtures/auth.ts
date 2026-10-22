import { test as base, expect } from '@playwright/test'

// Must match BOOTSTRAP_ADMIN_EMAIL in the backend web server of playwright.config.ts.
export const ADMIN_E2E_EMAIL = 'admin-e2e@example.com'

const FIRESTORE_DOCUMENTS =
  'http://127.0.0.1:8080/v1/projects/demo-mytasks/databases/(default)/documents'

interface LoginOptions {
  // Whether the address is invited before signing in (default). The invitation is what
  // lets the first sign-in create the account; `false` signs in as a stranger.
  invited?: boolean
}

interface AuthFixtures {
  loginAsGoogleUser: (email: string, options?: LoginOptions) => Promise<void>
  loginAsAdmin: () => Promise<void>
}

// Seeds the invitation straight into the Firestore emulator from the test process, never
// from the app bundle. The emulator accepts the fixed "owner" token, which bypasses rules.
async function seedInvitation(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  const response = await fetch(
    `${FIRESTORE_DOCUMENTS}/invitations/${encodeURIComponent(normalized)}`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          email: { stringValue: normalized },
          status: { stringValue: 'pending' },
          invited_by: { stringValue: 'e2e' },
          created_at: { timestampValue: new Date().toISOString() },
          accepted_at: { nullValue: null },
          accepted_uid: { nullValue: null },
        },
      }),
    },
  )
  if (!response.ok) {
    throw new Error(`Could not seed the invitation for ${normalized}: ${response.status}`)
  }
}

export const test = base.extend<AuthFixtures>({
  loginAsGoogleUser: async ({ page }, use) => {
    await use(async (email: string, options: LoginOptions = {}) => {
      if (options.invited ?? true) {
        await seedInvitation(email)
      }
      // Does not navigate to /login if we are already there (e.g. after a
      // ProtectedRoute redirect): a page.goto would lose the origin route state
      // (location.state.from) that the redirect preserves.
      if (!page.url().includes('/login')) {
        await page.goto('/login')
      }
      await page.waitForFunction(() => typeof window.__mytasksTestLogin === 'function')
      await page.evaluate(async (userEmail) => {
        await window.__mytasksTestLogin?.(userEmail)
      }, email)
    })
  },

  // The administrator comes from the bootstrap address configured for the test backend,
  // so it is never invited: it is the one account that exists without an invitation.
  loginAsAdmin: async ({ loginAsGoogleUser }, use) => {
    await use(() => loginAsGoogleUser(ADMIN_E2E_EMAIL, { invited: false }))
  },
})

export { expect }
