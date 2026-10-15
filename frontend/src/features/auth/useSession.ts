import {
  GoogleAuthProvider,
  type User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from '../../lib/firebase'

interface Session {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export function useSession(): Session {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser)
        setLoading(false)
      }),
    [],
  )

  async function signInWithGoogle(): Promise<void> {
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  async function signOut(): Promise<void> {
    await firebaseSignOut(auth)
  }

  return { user, loading, signInWithGoogle, signOut }
}
