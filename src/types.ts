export type Gender = 'male' | 'female' | 'other';

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  deathDate?: string;
  gender: Gender;
  fatherId?: string;
  motherId?: string;
  spouseIds?: string[];
  bio?: string;
  photoUrl?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}
