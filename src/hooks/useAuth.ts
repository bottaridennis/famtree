import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { isAdminEmail } from '../config';
import type { AppUser } from '../types';

const toAppUser = (u: User): AppUser => ({
  uid: u.uid,
  email: u.email ?? '',
  displayName: u.displayName,
  photoURL: u.photoURL,
  emailVerified: u.emailVerified,
  isAdmin: isAdminEmail(u.email) && u.emailVerified,
});

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Solo in sviluppo: `?mock&admin` simula l'amministratore per provare l'interfaccia.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('admin')) {
      setUser({ uid: 'dev', email: 'dev@example.com', displayName: 'Dev Admin', photoURL: null, emailVerified: true, isAdmin: true });
      setReady(true);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
        setUser(u ? toAppUser(u) : null);
        setReady(true);
      });
  }, []);

  const login = useCallback(() => signInWithPopup(auth, googleProvider), []);
  const logout = useCallback(() => signOut(auth), []);
  const refresh = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setUser(toAppUser(auth.currentUser));
  }, []);

  /** Admin per email ma con indirizzo non ancora verificato. */
  const needsVerification = !!user && isAdminEmail(user.email) && !user.emailVerified;

  return { user, ready, login, logout, refresh, needsVerification };
}
