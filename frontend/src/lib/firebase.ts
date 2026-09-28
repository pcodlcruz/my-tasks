import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  signInWithCredential,
} from 'firebase/auth'

declare global {
  interface Window {
    __mytasksTestLogin?: (email: string) => Promise<void>
  }
}

const firebaseApp = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
})

export const auth = getAuth(firebaseApp)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, `http://${import.meta.env.VITE_FIREBASE_AUTH_DOMAIN}:9099`, {
    disableWarnings: true,
  })

  // Solo en modo emulador: permite a los tests e2e (Playwright) iniciar sesión con
  // una cuenta de Google ficticia sin pasar por el popup real de Google.
  window.__mytasksTestLogin = async (email: string) => {
    const fakeIdToken = JSON.stringify({
      sub: crypto.randomUUID(),
      email,
      email_verified: true,
    })
    await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken))
  }
}
