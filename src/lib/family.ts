import type { Gender, Person } from '../types';

export type PeopleIndex = Map<string, Person>;

export const indexPeople = (people: Person[]): PeopleIndex => new Map(people.map((p) => [p.id, p]));

export const fullName = (p?: Pick<Person, 'firstName' | 'lastName'> | null) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : '';

export const initials = (p: Pick<Person, 'firstName' | 'lastName'>) =>
  `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || '?';

export const isDeceased = (p: Pick<Person, 'deathDate' | 'deceased'>) => !!p.deceased || !!p.deathDate;

export const genderLabel: Record<Gender, string> = { male: 'Uomo', female: 'Donna', other: 'Altro' };

/** Ritorna l'anno da una data ISO (YYYY, YYYY-MM o YYYY-MM-DD). */
export const yearOf = (date?: string) => (date ? date.slice(0, 4) : '');

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Formatta una data ISO senza passare da `new Date()` (evita slittamenti di fuso orario). */
export function formatDate(date?: string): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
  if (!y) return date;
  if (!m) return String(y);
  if (!d) return `${MONTHS[m - 1]} ${y}`;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function lifespan(p: Person): string {
  const b = yearOf(p.birthDate);
  const d = yearOf(p.deathDate);
  if (!b && !d) return '';
  if (d) return `${b || '?'} – ${d}`;
  if (isDeceased(p)) return `${b} – ?`;
  return `n. ${b}`;
}

/** Età attuale (viventi) o età al decesso. */
export function ageOf(p: Person, today = new Date()): number | null {
  if (!p.birthDate) return null;
  const [by, bm = 1, bd = 1] = p.birthDate.split('-').map(Number);
  let ey: number, em: number, ed: number;
  if (isDeceased(p) && !p.deathDate) return null;
  if (p.deathDate) {
    [ey, em = 1, ed = 1] = p.deathDate.split('-').map(Number);
  } else {
    ey = today.getFullYear();
    em = today.getMonth() + 1;
    ed = today.getDate();
  }
  let age = ey - by;
  if (em < bm || (em === bm && ed < bd)) age--;
  return age >= 0 && age < 130 ? age : null;
}

export const parentsOf = (p: Person, idx: PeopleIndex) =>
  [p.fatherId, p.motherId].map((id) => (id ? idx.get(id) : undefined)).filter(Boolean) as Person[];

export const childrenOf = (id: string, people: Person[]) =>
  people
    .filter((c) => c.fatherId === id || c.motherId === id)
    .sort((a, b) => (a.birthDate || '9999').localeCompare(b.birthDate || '9999'));

export const spousesOf = (p: Person, idx: PeopleIndex, people: Person[]) => {
  const ids = new Set(p.spouseIds ?? []);
  // Tollera dati non simmetrici (vecchie versioni dell'app salvavano il legame da un solo lato).
  people.forEach((o) => o.spouseIds?.includes(p.id) && ids.add(o.id));
  ids.delete(p.id);
  return [...ids].map((id) => idx.get(id)).filter(Boolean) as Person[];
};

export const siblingsOf = (p: Person, people: Person[]) =>
  people
    .filter(
      (s) =>
        s.id !== p.id &&
        ((p.fatherId && s.fatherId === p.fatherId) || (p.motherId && s.motherId === p.motherId)),
    )
    .sort((a, b) => (a.birthDate || '9999').localeCompare(b.birthDate || '9999'));

export function ancestorsOf(id: string, idx: PeopleIndex): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const p = idx.get(stack.pop()!);
    if (!p) continue;
    for (const pid of [p.fatherId, p.motherId]) {
      if (pid && !out.has(pid) && pid !== id) {
        out.add(pid);
        stack.push(pid);
      }
    }
  }
  return out;
}

export function descendantsOf(id: string, people: Person[]): Set<string> {
  const byParent = new Map<string, string[]>();
  people.forEach((c) =>
    [c.fatherId, c.motherId].forEach((pid) => {
      if (!pid) return;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(c.id);
    }),
  );
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    for (const cid of byParent.get(stack.pop()!) ?? []) {
      if (!out.has(cid) && cid !== id) {
        out.add(cid);
        stack.push(cid);
      }
    }
  }
  return out;
}

/** Normalizza una stringa per la ricerca (minuscole, senza accenti). */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function matchesQuery(p: Person, q: string) {
  if (!q) return true;
  const hay = normalize(
    [p.firstName, p.lastName, p.nickname, p.birthPlace, p.occupation, yearOf(p.birthDate)].filter(Boolean).join(' '),
  );
  return normalize(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export interface FamilyStats {
  total: number;
  living: number;
  deceased: number;
  surnames: number;
  generations: number;
  oldestYear: string;
}

export function computeStats(people: Person[], generations: number): FamilyStats {
  const deceased = people.filter(isDeceased).length;
  const years = people.map((p) => yearOf(p.birthDate)).filter(Boolean).sort();
  return {
    total: people.length,
    living: people.length - deceased,
    deceased,
    surnames: new Set(people.map((p) => p.lastName.trim().toLowerCase())).size,
    generations,
    oldestYear: years[0] ?? '',
  };
}
