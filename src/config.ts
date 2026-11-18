/**
 * Email degli amministratori. Deve restare allineato con `isAdmin()` in firestore.rules:
 * il controllo lato client serve solo alla UI, la sicurezza vera è nelle regole.
 */
export const ADMIN_EMAILS = ['dennisbottari@gmail.com'];

export const APP_NAME = 'Famtree';
export const APP_TAGLINE = 'Archivio di famiglia';

export const isAdminEmail = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase());
