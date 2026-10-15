import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  signInWithCredential,
} from 'firebase/auth'
import { runtimeConfig } from './runtimeConfig'

declare global {
  interface Window {
    __mytasksTestLogin?: (email: string) => Promise<void>
  }
}

const firebaseApp = initializeApp({
  apiKey: runtimeConfig.firebaseApiKey,
  authDomain: runtimeConfig.firebaseAuthDomain,
  projectId: runtimeConfig.firebaseProjectId,
})

export const auth = getAuth(firebaseApp)

if (runtimeConfig.useEmulators) {
  connectAuthEmulator(auth, `http://${runtimeConfig.firebaseAuthDomain}:9099`, {
    disableWarnings: true,
  })

  // Emulator mode only: lets the e2e tests (Playwright) sign in with a fake
  // Google account without going through the real Google popup.
  window.__mytasksTestLogin = async (email: string) => {
    const fakeIdToken = JSON.stringify({
      sub: crypto.randomUUID(),
      email,
      email_verified: true,
    })
    await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken))
  }
}
