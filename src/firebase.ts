import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import type { FirebaseOptions } from 'firebase/app';

// Iniettata da vite.config.ts (file locale o secret FIREBASE_CONFIG).
declare const __FIREBASE_CONFIG__: FirebaseOptions & { firestoreDatabaseId?: string };
const config = __FIREBASE_CONFIG__;

export const app = initializeApp(config);

const settings = (() => {
  try {
    // Cache offline: l'albero resta consultabile anche senza connessione.
    return { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) };
  } catch {
    return {};
  }
})();

export const db =
  config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
    ? initializeFirestore(app, settings, config.firestoreDatabaseId)
    : initializeFirestore(app, settings);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Traduce gli errori Firebase in messaggi comprensibili. */
export function describeFirebaseError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'permission-denied': 'Permesso negato: solo l’amministratore verificato può modificare l’archivio.',
    'unavailable': 'Servizio non raggiungibile. Controlla la connessione e riprova.',
    'auth/popup-closed-by-user': 'Accesso annullato.',
    'auth/cancelled-popup-request': 'Accesso annullato.',
    'auth/popup-blocked': 'Il browser ha bloccato la finestra di accesso. Consenti i popup per questo sito.',
    'auth/unauthorized-domain':
      'Questo dominio non è autorizzato in Firebase Authentication. Aggiungilo in Console → Authentication → Settings → Authorized domains.',
    'auth/network-request-failed': 'Errore di rete durante l’accesso.',
  };
  if (map[code]) return map[code];
  if (err instanceof Error) return err.message;
  return String(err);
}
