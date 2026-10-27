import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_NAME, APP_TAGLINE } from '../../../src/lib/brand'

// `npm test` runs from the frontend directory.
const INDEX_HTML = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')

describe('brand', () => {
  it('names the application InsertTasks', () => {
    expect(APP_NAME).toBe('InsertTasks')
  })

  it('states the purpose of the application in the sign-in message', () => {
    expect(APP_TAGLINE).toBe('Inserta tus tareas y prioriza lo que importa')
  })

  it('uses the same name as the title of the tab (index.html cannot import the constant)', () => {
    const title = /<title>([^<]*)<\/title>/.exec(INDEX_HTML)?.[1]

    expect(title).toBe(APP_NAME)
  })
})
