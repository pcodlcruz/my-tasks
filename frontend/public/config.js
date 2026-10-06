// Runtime configuration (public values only: never put a secret here).
//
// In a deployed container this file is regenerated on startup from the service's
// environment variables (nginx/docker-entrypoint.d/40-runtime-config.sh). Locally the
// Vite dev server serves it as is: the empty values make src/lib/runtimeConfig.ts fall
// back to the VITE_* variables of .env.
window.__APP_CONFIG__ = {
  API_BASE_URL: '',
  FIREBASE_API_KEY: '',
  FIREBASE_AUTH_DOMAIN: '',
  FIREBASE_PROJECT_ID: '',
  APP_VERSION: '',
  USE_EMULATORS: '',
}
