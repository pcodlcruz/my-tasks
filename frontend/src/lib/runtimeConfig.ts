// Runtime configuration of the SPA.
//
// The same image is served in every environment, so nothing environment-specific can be
// baked into the bundle at build time. The container writes `/config.js` on startup, which
// sets `window.__APP_CONFIG__`; locally (Vite dev server, e2e) the values come from
// `import.meta.env` instead. Everything in here is public: never put a secret in it.

export interface RawRuntimeConfig {
  API_BASE_URL?: string
  FIREBASE_API_KEY?: string
  FIREBASE_AUTH_DOMAIN?: string
  FIREBASE_PROJECT_ID?: string
  APP_VERSION?: string
  USE_EMULATORS?: string
}

export interface RuntimeConfig {
  apiBaseUrl: string
  firebaseApiKey: string
  firebaseAuthDomain: string
  firebaseProjectId: string
  appVersion: string
  useEmulators: boolean
}

declare global {
  interface Window {
    __APP_CONFIG__?: RawRuntimeConfig
  }
}

type BuildEnv = Record<string, unknown>

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]']
const DEFAULT_APP_VERSION = 'dev'

function pick(
  runtime: RawRuntimeConfig | undefined,
  env: BuildEnv,
  key: keyof RawRuntimeConfig,
): string | undefined {
  const fromRuntime = runtime?.[key]
  if (typeof fromRuntime === 'string' && fromRuntime !== '') {
    return fromRuntime
  }
  const fromEnv = env[`VITE_${key}`]
  return typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : undefined
}

export function resolveRuntimeConfig(
  runtime: RawRuntimeConfig | undefined,
  env: BuildEnv,
  hostname: string,
): RuntimeConfig {
  // The emulators are a local-only mode: the host check makes it impossible to switch
  // them on (and expose the test login) in a deployed environment, whatever the config says.
  const emulatorsRequested = pick(runtime, env, 'USE_EMULATORS') === 'true'

  return {
    apiBaseUrl: pick(runtime, env, 'API_BASE_URL') ?? '',
    firebaseApiKey: pick(runtime, env, 'FIREBASE_API_KEY') ?? '',
    firebaseAuthDomain: pick(runtime, env, 'FIREBASE_AUTH_DOMAIN') ?? '',
    firebaseProjectId: pick(runtime, env, 'FIREBASE_PROJECT_ID') ?? '',
    appVersion: pick(runtime, env, 'APP_VERSION') ?? DEFAULT_APP_VERSION,
    useEmulators: emulatorsRequested && LOCAL_HOSTNAMES.includes(hostname),
  }
}

export const runtimeConfig: RuntimeConfig = resolveRuntimeConfig(
  window.__APP_CONFIG__,
  import.meta.env,
  window.location.hostname,
)
