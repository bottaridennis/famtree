import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Gender, Person, PersonDraft } from '../types';
import { isDeceased } from './family';

const COLLECTION = 'people';
const BATCH_LIMIT = 450;
const personRef = (id: string) => doc(db, COLLECTION, id);

const OPTIONAL_FIELDS = [
  'nickname',
  'birthDate',
  'birthPlace',
  'deathDate',
  'deathPlace',
  'occupation',
  'fatherId',
  'motherId',
  'bio',
  'photoUrl',
] as const;

/** Esegue scritture in più batch per rispettare il limite di 500 operazioni di Firestore. */
async function commitInChunks<T>(items: T[], apply: (batch: WriteBatch, item: T) => void) {
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    items.slice(i, i + BATCH_LIMIT).forEach((item) => apply(batch, item));
    await batch.commit();
  }
}

/**
 * Crea o aggiorna una persona mantenendo coerenti i legami di coppia su entrambi i lati
 * e rimuovendo davvero i campi svuotati (Firestore non accetta `undefined`).
 */
export async function savePerson(draft: PersonDraft, people: Person[]): Promise<string> {
  const isNew = !draft.id;
  const ref = isNew ? doc(collection(db, COLLECTION)) : personRef(draft.id!);
  const id = ref.id;
  const deceased = isDeceased(draft);

  const payload: Record<string, unknown> = {
    firstName: (draft.firstName ?? '').trim(),
    lastName: (draft.lastName ?? '').trim(),
    gender: draft.gender ?? 'other',
  };
  for (const key of OPTIONAL_FIELDS) {
    let value = typeof draft[key] === 'string' ? (draft[key] as string).trim() : '';
    if ((key === 'deathDate' || key === 'deathPlace') && !deceased) value = '';
    if ((key === 'fatherId' || key === 'motherId') && value === id) value = '';
    if (value) payload[key] = value;
    else if (!isNew) payload[key] = deleteField();
  }
  if (deceased) payload.deceased = true;
  else if (!isNew) payload.deceased = deleteField();

  const known = new Set(people.map((p) => p.id));
  const spouseIds = [...new Set(draft.spouseIds ?? [])].filter((s) => s !== id && known.has(s));
  payload.spouseIds = spouseIds;

  const batch = writeBatch(db);
  if (isNew) batch.set(ref, payload);
  else batch.update(ref, payload);

  // Sincronizza il legame sul coniuge.
  for (const s of spouseIds) {
    const spouse = people.find((p) => p.id === s);
    if (spouse && !spouse.spouseIds?.includes(id)) batch.update(personRef(s), { spouseIds: arrayUnion(id) });
  }
  if (!isNew) {
    for (const other of people) {
      if (other.id !== id && other.spouseIds?.includes(id) && !spouseIds.includes(other.id)) {
        batch.update(personRef(other.id), { spouseIds: arrayRemove(id) });
      }
    }
  }
  await batch.commit();
  return id;
}

/** Elimina una persona e ripulisce i riferimenti (figli e coniugi) che puntano a lei. */
export async function deletePerson(id: string, people: Person[]) {
  const batch = writeBatch(db);
  batch.delete(personRef(id));
  for (const p of people) {
    if (p.id === id) continue;
    const update: Record<string, unknown> = {};
    if (p.fatherId === id) update.fatherId = deleteField();
    if (p.motherId === id) update.motherId = deleteField();
    if (p.spouseIds?.includes(id)) update.spouseIds = arrayRemove(id);
    if (Object.keys(update).length) batch.update(personRef(p.id), update);
  }
  await batch.commit();
}

export async function deleteAll(people: Person[]) {
  await commitInChunks(people, (batch, p) => batch.delete(personRef(p.id)));
}

// --- Import / export ----------------------------------------------------------------------

export interface ArchiveFile {
  app: 'famtree';
  version: 1;
  exportedAt: string;
  people: Person[];
}

export function buildArchive(people: Person[]): ArchiveFile {
  return { app: 'famtree', version: 1, exportedAt: new Date().toISOString(), people };
}

const GENDERS: Gender[] = ['male', 'female', 'other'];

export function parseArchive(text: string): Person[] {
  const data = JSON.parse(text);
  const list: unknown[] = Array.isArray(data) ? data : data?.people;
  if (!Array.isArray(list)) throw new Error('File non valido: manca l’elenco delle persone.');
  return list.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id || typeof r.firstName !== 'string' || typeof r.lastName !== 'string') {
      throw new Error(`Voce ${i + 1} non valida: servono id, nome e cognome.`);
    }
    const person: Person = {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      gender: GENDERS.includes(r.gender as Gender) ? (r.gender as Gender) : 'other',
      spouseIds: Array.isArray(r.spouseIds) ? r.spouseIds.filter((s): s is string => typeof s === 'string') : [],
    };
    for (const key of OPTIONAL_FIELDS) if (typeof r[key] === 'string' && r[key]) person[key] = r[key] as string;
    if (r.deceased === true) person.deceased = true;
    return person;
  });
}

export async function importPeople(people: Person[]) {
  await commitInChunks(people, (batch, { id, ...data }) => batch.set(personRef(id), data));
}

/** Esporta in GEDCOM 5.5.1, lo standard di scambio dei software di genealogia. */
export function toGedcom(people: Person[]): string {
  const ids = new Map(people.map((p, i) => [p.id, `@I${i + 1}@`]));
  const families = new Map<string, { husb?: string; wife?: string; children: string[] }>();
  const famKey = (a?: string, b?: string) => `${a ?? ''}+${b ?? ''}`;
  const ensureFam = (father?: string, mother?: string) => {
    const k = famKey(father, mother);
    if (!families.has(k)) families.set(k, { husb: father, wife: mother, children: [] });
    return k;
  };
  const valid = (id?: string) => (id && ids.has(id) ? id : undefined);
  people.forEach((p) => {
    const f = valid(p.fatherId);
    const m = valid(p.motherId);
    if (f || m) families.get(ensureFam(f, m))!.children.push(p.id);
    p.spouseIds?.forEach((s) => {
      const sp = people.find((x) => x.id === s);
      if (!sp) return;
      const [h, w] = p.gender === 'female' && sp.gender !== 'female' ? [s, p.id] : [p.id, s];
      if (!families.has(famKey(w, h))) ensureFam(h, w);
    });
  });
  const famIds = new Map([...families.keys()].map((k, i) => [k, `@F${i + 1}@`]));
  const gedDate = (d?: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return [day ? String(+day) : '', m ? mon[+m - 1] : '', y].filter(Boolean).join(' ');
  };
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ');
  const out = ['0 HEAD', '1 SOUR FAMTREE', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
  people.forEach((p) => {
    out.push(`0 ${ids.get(p.id)} INDI`, `1 NAME ${clean(p.firstName)} /${clean(p.lastName)}/`);
    out.push(`1 SEX ${p.gender === 'male' ? 'M' : p.gender === 'female' ? 'F' : 'U'}`);
    if (p.birthDate || p.birthPlace) {
      out.push('1 BIRT');
      if (p.birthDate) out.push(`2 DATE ${gedDate(p.birthDate)}`);
      if (p.birthPlace) out.push(`2 PLAC ${clean(p.birthPlace)}`);
    }
    if (isDeceased(p)) {
      out.push(p.deathDate || p.deathPlace ? '1 DEAT' : '1 DEAT Y');
      if (p.deathDate) out.push(`2 DATE ${gedDate(p.deathDate)}`);
      if (p.deathPlace) out.push(`2 PLAC ${clean(p.deathPlace)}`);
    }
    if (p.occupation) out.push(`1 OCCU ${clean(p.occupation)}`);
    if (p.bio) out.push(`1 NOTE ${clean(p.bio)}`);
    families.forEach((f, k) => {
      if (f.children.includes(p.id)) out.push(`1 FAMC ${famIds.get(k)}`);
      if (f.husb === p.id || f.wife === p.id) out.push(`1 FAMS ${famIds.get(k)}`);
    });
  });
  families.forEach((f, k) => {
    out.push(`0 ${famIds.get(k)} FAM`);
    if (f.husb) out.push(`1 HUSB ${ids.get(f.husb)}`);
    if (f.wife) out.push(`1 WIFE ${ids.get(f.wife)}`);
    f.children.forEach((c) => out.push(`1 CHIL ${ids.get(c)}`));
  });
  out.push('0 TRLR');
  return out.join('\n');
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Dati dimostrativi ----------------------------------------------------------------------

/** Genera una famiglia d'esempio realistica su 5 generazioni (circa 50 persone). */
export async function generateDemo(onProgress?: (n: number) => void): Promise<number> {
  const people = buildDemoPeople(() => doc(collection(db, COLLECTION)).id);
  let done = 0;
  await commitInChunks(people, (batch, { id, ...data }) => {
    batch.set(personRef(id), data);
    onProgress?.(++done);
  });
  return people.length;
}

export function buildDemoPeople(newId: () => string): Person[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const usedNames = new Set<string>();
  const pickName = (list: string[]) => {
    const free = list.filter((n) => !usedNames.has(n));
    const name = pick(free.length ? free : list);
    usedNames.add(name);
    return name;
  };

  const male = ['Giovanni', 'Luca', 'Marco', 'Matteo', 'Alessandro', 'Francesco', 'Lorenzo', 'Riccardo', 'Gabriele', 'Leonardo', 'Tommaso', 'Edoardo', 'Federico', 'Pietro', 'Filippo', 'Davide', 'Andrea', 'Antonio', 'Giuseppe', 'Stefano', 'Paolo', 'Enrico'];
  const female = ['Maria', 'Elena', 'Giulia', 'Sofia', 'Beatrice', 'Chiara', 'Alice', 'Emma', 'Vittoria', 'Sara', 'Martina', 'Giorgia', 'Anna', 'Francesca', 'Elisa', 'Aurora', 'Ginevra', 'Greta', 'Matilde', 'Bianca', 'Adele', 'Irene'];
  const surnames = ['Bianchi', 'Verdi', 'Romano', 'Gallo', 'Costa', 'Fontana', 'Ricci', 'Bruno', 'Conti', 'Marino', 'Greco', 'Lombardi'];
  const places = ['Verona', 'Padova', 'Vicenza', 'Mantova', 'Brescia', 'Trento', 'Venezia', 'Bologna', 'Milano', 'Legnago'];
  // [maschile, femminile]
  const jobs: Record<number, [string, string][]> = {
    0: [['Agricoltore', 'Agricoltrice'], ['Fabbro', 'Sarta'], ['Maestro elementare', 'Maestra elementare'], ['Mugnaio', 'Ricamatrice'], ['Commerciante', 'Commerciante']],
    1: [['Operaio', 'Operaia'], ['Insegnante', 'Insegnante'], ['Infermiere', 'Infermiera'], ['Ragioniere', 'Ragioniera'], ['Meccanico', 'Impiegata comunale']],
    2: [['Ingegnere', 'Ingegnera'], ['Medico', 'Medica'], ['Architetto', 'Architetta'], ['Sviluppatore software', 'Sviluppatrice software'], ['Avvocato', 'Avvocata'], ['Grafico', 'Grafica']],
    3: [['Studente', 'Studentessa']],
  };

  const people: Person[] = [];
  const date = (year: number) =>
    `${year}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`;

  const make = (gender: Gender, lastName: string, year: number, generation: number, father?: Person, mother?: Person) => {
    const p: Person = {
      id: newId(),
      firstName: pickName(gender === 'male' ? male : female),
      lastName,
      gender,
      birthDate: date(year),
      birthPlace: pick(places),
      occupation: pick(jobs[generation])[gender === 'female' ? 1 : 0],
      spouseIds: [],
    };
    if (father) p.fatherId = father.id;
    if (mother) p.motherId = mother.id;
    const deathAge = 68 + Math.floor(rand() * 25);
    if (year + deathAge < 2024 && generation < 2) {
      p.deathDate = date(year + deathAge);
      p.deathPlace = pick(places);
    }
    people.push(p);
    return p;
  };
  const marry = (a: Person, b: Person) => {
    a.spouseIds!.push(b.id);
    b.spouseIds!.push(a.id);
  };
  const coupleFor = (blood: Person, year: number, generation: number) => {
    const spouse = make(blood.gender === 'male' ? 'female' : 'male', pick(surnames), year + Math.round(rand() * 6 - 3), generation);
    marry(blood, spouse);
    return blood.gender === 'male' ? [blood, spouse] : [spouse, blood];
  };

  const greatGrandpa = make('male', 'Rossi', 1890, 0);
  const greatGrandma = make('female', 'Ferrari', 1894, 0);
  marry(greatGrandpa, greatGrandma);
  greatGrandpa.bio = 'Capostipite della famiglia: mezzadro nella bassa veronese, combatté sul Piave nel 1917.';
  const founder = make('male', 'Rossi', 1922, 0, greatGrandpa, greatGrandma);
  founder.bio = 'Lasciò la campagna veronese per aprire una bottega di falegnameria.';
  const founderWife = make('female', 'Bianchi', 1926, 0);
  founderWife.bio = 'Ricamatrice instancabile, custode delle ricette e delle storie di famiglia.';
  marry(founder, founderWife);

  // Genitori di un coniuge acquisito: mostra l'incrocio di due stirpi.
  const otherFather = make('male', 'Conti', 1925, 0);
  const otherMother = make('female', 'Marino', 1929, 0);
  marry(otherFather, otherMother);

  for (let i = 0; i < 4; i++) {
    const year = 1948 + i * 4;
    const child = make(i % 2 === 0 ? 'male' : 'female', 'Rossi', year, 1, founder, founderWife);
    let father: Person, mother: Person;
    if (i === 1) {
      const husband = make('male', 'Conti', year - 2, 1, otherFather, otherMother);
      marry(child, husband);
      [father, mother] = [husband, child];
    } else {
      [father, mother] = coupleFor(child, year, 1);
    }
    const kids = 2 + Math.floor(rand() * 2);
    for (let j = 0; j < kids; j++) {
      const y3 = 1975 + i * 3 + j * 3;
      const g3 = make(rand() > 0.5 ? 'male' : 'female', father.lastName, y3, 2, father, mother);
      if (rand() > 0.75) continue;
      const [f3, m3] = coupleFor(g3, y3, 2);
      const grandkids = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < grandkids; k++) make(rand() > 0.5 ? 'male' : 'female', f3.lastName, 2008 + j * 2 + k * 3, 3, f3, m3);
    }
  }
  // Fratello del capostipite, defunto senza data nota.
  const brother = make('male', 'Rossi', 1919, 0, greatGrandpa, greatGrandma);
  brother.deceased = true;
  delete brother.deathDate;
  delete brother.deathPlace;
  brother.bio = 'Emigrato in Argentina nel 1947: le sue tracce si perdono a Buenos Aires.';
  return people;
}
