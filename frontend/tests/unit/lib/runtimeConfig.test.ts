import { describe, expect, it } from 'vitest'
import { resolveRuntimeConfig } from '../../../src/lib/runtimeConfig'

const DEPLOYED_CONFIG = {
  API_BASE_URL: 'https://mytasks-api-123.europe-southwest1.run.app',
  FIREBASE_API_KEY: 'public-api-key',
  FIREBASE_AUTH_DOMAIN: 'mytasks-stg.firebaseapp.com',
  FIREBASE_PROJECT_ID: 'mytasks-stg',
  APP_VERSION: '3f9c2ab',
  USE_EMULATORS: 'false',
}

const LOCAL_ENV = {
  VITE_API_BASE_URL: 'http://localhost:8000',
  VITE_FIREBASE_API_KEY: 'fake-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
  VITE_FIREBASE_PROJECT_ID: 'demo-mytasks',
  VITE_USE_EMULATORS: 'true',
}

describe('resolveRuntimeConfig', () => {
  it('reads every value from window.__APP_CONFIG__ when it is present', () => {
    const config = resolveRuntimeConfig(DEPLOYED_CONFIG, {}, 'mytasks-web-123.run.app')

    expect(config).toEqual({
      apiBaseUrl: 'https://mytasks-api-123.europe-southwest1.run.app',
      firebaseApiKey: 'public-api-key',
      firebaseAuthDomain: 'mytasks-stg.firebaseapp.com',
      firebaseProjectId: 'mytasks-stg',
      appVersion: '3f9c2ab',
      useEmulators: false,
    })
  })

  it('falls back to import.meta.env when there is no runtime config', () => {
    const config = resolveRuntimeConfig(undefined, LOCAL_ENV, 'localhost')

    expect(config.apiBaseUrl).toBe('http://localhost:8000')
    expect(config.firebaseProjectId).toBe('demo-mytasks')
    expect(config.firebaseAuthDomain).toBe('localhost')
  })

  it('falls back to import.meta.env for empty runtime values', () => {
    const config = resolveRuntimeConfig(
      { API_BASE_URL: '', FIREBASE_PROJECT_ID: '' },
      LOCAL_ENV,
      'localhost',
    )

    expect(config.apiBaseUrl).toBe('http://localhost:8000')
    expect(config.firebaseProjectId).toBe('demo-mytasks')
  })

  it('prefers the runtime value over import.meta.env', () => {
    const config = resolveRuntimeConfig(DEPLOYED_CONFIG, LOCAL_ENV, 'localhost')

    expect(config.apiBaseUrl).toBe('https://mytasks-api-123.europe-southwest1.run.app')
  })

  it('defaults the app version to dev when none is configured', () => {
    expect(resolveRuntimeConfig(undefined, LOCAL_ENV, 'localhost').appVersion).toBe('dev')
  })

  it('enables the emulators only when requested on a local host', () => {
    const config = resolveRuntimeConfig(undefined, LOCAL_ENV, 'localhost')

    expect(config.useEmulators).toBe(true)
  })

  it.each(['mytasks-web-123.europe-southwest1.run.app', 'example.com', 'localhost.evil.com'])(
    'never enables the emulators on %s even when the config asks for them',
    (hostname) => {
      const fromEnv = resolveRuntimeConfig(undefined, LOCAL_ENV, hostname)
      const fromRuntime = resolveRuntimeConfig({ USE_EMULATORS: 'true' }, {}, hostname)

      expect(fromEnv.useEmulators).toBe(false)
      expect(fromRuntime.useEmulators).toBe(false)
    },
  )

  it.each(['localhost', '127.0.0.1', '[::1]'])('treats %s as a local host', (hostname) => {
    expect(resolveRuntimeConfig({ USE_EMULATORS: 'true' }, {}, hostname).useEmulators).toBe(true)
  })

  it('does not enable the emulators for values other than the string true', () => {
    const config = resolveRuntimeConfig({ USE_EMULATORS: '1' }, {}, 'localhost')

    expect(config.useEmulators).toBe(false)
  })
})
