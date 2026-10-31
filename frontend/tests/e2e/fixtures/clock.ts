import type { Page } from '@playwright/test'

// The progress day is computed by the server from its clock, which `X-Test-Now` sets in local
// only (research R15). Every API request of the page carries it, so completing a task and
// reading the scoreboard happen at the same simulated instant. The browser keeps the real clock
// (no page.clock): the Firebase ID tokens are checked against real time.
const API = 'http://localhost:8000/api/**'

// Returns the function that moves the server clock for the following requests. `fallback` lets
// the other handlers (the one that hides the start-of-day review) see the request too.
export async function useServerClock(
  page: Page,
  start: string,
): Promise<(instant: string) => void> {
  let now = start
  await page.route(API, async (route) => {
    await route.fallback({ headers: { ...route.request().headers(), 'x-test-now': now } })
  })
  return (instant: string) => {
    now = instant
  }
}
