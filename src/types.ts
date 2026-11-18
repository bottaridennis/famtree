export type Gender = 'male' | 'female' | 'other';

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  gender: Gender;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  /** Defunto anche senza data di morte nota. */
  deceased?: boolean;
  deathPlace?: string;
  occupation?: string;
  fatherId?: string;
  motherId?: string;
  spouseIds?: string[];
  bio?: string;
  photoUrl?: string;
}

export type PersonDraft = Partial<Person>;

export interface AppUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
}
