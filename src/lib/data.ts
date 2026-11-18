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

/** Scrive su Firestore la famiglia d'esempio (12 generazioni, dal 1690 a oggi). */
export async function generateDemo(onProgress?: (n: number) => void): Promise<number> {
  const people = buildDemoPeople(() => doc(collection(db, COLLECTION)).id);
  let done = 0;
  await commitInChunks(people, (batch, { id, ...data }) => {
    batch.set(personRef(id), data);
    onProgress?.(++done);
  });
  return people.length;
}

const DEMO_MALE = ['Giovanni', 'Antonio', 'Giuseppe', 'Francesco', 'Pietro', 'Angelo', 'Luigi', 'Domenico', 'Bortolo', 'Girolamo', 'Battista', 'Valentino', 'Lorenzo', 'Carlo', 'Agostino', 'Sante', 'Eugenio', 'Umberto', 'Vittorio', 'Guido', 'Renato', 'Bruno', 'Sergio', 'Franco', 'Gianni', 'Paolo', 'Marco', 'Stefano', 'Andrea', 'Luca', 'Matteo', 'Davide', 'Alessandro', 'Tommaso', 'Leonardo', 'Edoardo', 'Riccardo', 'Filippo', 'Gabriele', 'Federico'];
const DEMO_FEMALE = ['Maria', 'Anna', 'Caterina', 'Teresa', 'Lucia', 'Angela', 'Margherita', 'Domenica', 'Elisabetta', 'Giovanna', 'Rosa', 'Antonia', 'Luigia', 'Giuseppina', 'Amalia', 'Elvira', 'Ines', 'Iolanda', 'Gemma', 'Bruna', 'Graziella', 'Luciana', 'Franca', 'Paola', 'Laura', 'Silvia', 'Monica', 'Chiara', 'Elena', 'Francesca', 'Giulia', 'Sara', 'Sofia', 'Aurora', 'Ginevra', 'Matilde', 'Beatrice', 'Alice', 'Emma', 'Vittoria'];
const DEMO_SURNAMES = ['Bianchi', 'Zanella', 'Bertoldi', 'Furlan', 'Pavan', 'Zanon', 'Benetti', 'Marchesini', 'Tosi', 'Campagnari', 'Righetti', 'Girelli', 'Brunelli', 'Bonomi', 'Vantini', 'Dal Bosco', 'Zamboni', 'Ferrari', 'Bellini', 'Carletti', 'Tomasi', 'Lonardi', 'Scala', 'Perbellini', 'Turrini', 'Gaspari', 'Melotti', 'Cordioli', 'Rigo', 'Fasoli', 'Guarienti', 'Signorini', 'Avesani', 'Bertagnoli', 'Castellani', 'Dalla Riva', 'Fiorini', 'Lugoboni', 'Manzati', 'Olivieri'];
const DEMO_PLACES_OLD = ['Legnago', 'Cerea', 'Isola della Scala', 'Bovolone', 'Nogara', 'Sanguinetto', 'Zevio', 'Villafranca', 'Soave', 'Ronco all’Adige'];
const DEMO_PLACES_NEW = ['Verona', 'Legnago', 'Padova', 'Vicenza', 'Milano', 'Bologna', 'Trento', 'Venezia', 'Mantova', 'Torino'];

/** Mestieri per epoca: [maschile, femminile]. */
const DEMO_JOBS: { until: number; jobs: [string, string][] }[] = [
  { until: 1800, jobs: [['Contadino', 'Contadina'], ['Mezzadro', 'Filatrice'], ['Fabbro', 'Lavandaia'], ['Mugnaio', 'Tessitrice'], ['Bottaio', 'Levatrice'], ['Carrettiere', 'Sarta']] },
  { until: 1880, jobs: [['Contadino', 'Contadina'], ['Calzolaio', 'Sarta'], ['Falegname', 'Filandaia'], ['Oste', 'Ostessa'], ['Muratore', 'Merlettaia'], ['Sellaio', 'Bracciante']] },
  { until: 1940, jobs: [['Operaio', 'Operaia'], ['Ferroviere', 'Maestra elementare'], ['Fornaio', 'Sarta'], ['Meccanico', 'Mondina'], ['Carabiniere', 'Infermiera'], ['Falegname', 'Casalinga']] },
  { until: 1995, jobs: [['Ingegnere', 'Insegnante'], ['Ragioniere', 'Infermiera'], ['Medico', 'Farmacista'], ['Elettricista', 'Commessa'], ['Architetto', 'Avvocata'], ['Agronomo', 'Impiegata']] },
  { until: 2003, jobs: [['Sviluppatore software', 'Designer'], ['Ricercatore', 'Biologa'], ['Chef', 'Fisioterapista'], ['Data analyst', 'Architetta']] },
  { until: 9999, jobs: [['Studente', 'Studentessa']] },
];

/**
 * Costruisce una famiglia d'esempio realistica su 12 generazioni (circa 170 persone):
 * rami che si estinguono, mortalità infantile d'epoca, un vedovo risposato, un emigrante.
 */
export function buildDemoPeople(newId: () => string): Person[] {
  let seed = 20240;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const NOW = 2025;
  const people: Person[] = [];

  const date = (year: number) => `${year}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
  const job = (gender: Gender, year: number) => pick(DEMO_JOBS.find((j) => year < j.until)!.jobs)[gender === 'female' ? 1 : 0];
  const place = (year: number) => pick(year < 1930 ? DEMO_PLACES_OLD : DEMO_PLACES_NEW);

  const make = (opts: { gender: Gender; firstName: string; lastName: string; year: number; father?: Person; mother?: Person; dieYoung?: boolean }) => {
    const { gender, firstName, lastName, year, father, mother } = opts;
    const p: Person = {
      id: newId(),
      firstName,
      lastName,
      gender,
      birthDate: date(year),
      birthPlace: father ? father.birthPlace && rand() < 0.6 ? father.birthPlace : place(year) : place(year),
      spouseIds: [],
    };
    if (father) p.fatherId = father.id;
    if (mother) p.motherId = mother.id;
    const lifespanYears = opts.dieYoung ? int(0, 9) : year < 1850 ? int(42, 84) : year < 1930 ? int(58, 92) : int(70, 98);
    if (year + lifespanYears < NOW) {
      p.deathDate = date(year + lifespanYears);
      p.deathPlace = rand() < 0.75 ? p.birthPlace : place(year + lifespanYears);
    }
    if (!opts.dieYoung && year + 16 < NOW) p.occupation = job(gender, year);
    people.push(p);
    return p;
  };
  const marry = (a: Person, b: Person) => {
    a.spouseIds!.push(b.id);
    b.spouseIds!.push(a.id);
  };
  const year = (p: Person) => parseInt(p.birthDate!.slice(0, 4), 10);
  const spouseFor = (blood: Person) => {
    const gender: Gender = blood.gender === 'male' ? 'female' : 'male';
    const s = make({
      gender,
      firstName: pick(gender === 'male' ? DEMO_MALE : DEMO_FEMALE),
      lastName: pick(DEMO_SURNAMES),
      year: year(blood) + int(-4, 3) + (gender === 'male' ? 2 : -1),
    });
    marry(blood, s);
    return s;
  };

  interface Couple {
    father: Person;
    mother: Person;
  }
  const famiglia = (father: Person, mother: Person): Couple => ({ father, mother });

  // Capostipiti
  const founder = make({ gender: 'male', firstName: 'Bortolo', lastName: 'Rossi', year: 1690 });
  founder.birthPlace = 'Legnago';
  founder.bio = 'Capostipite della famiglia: mezzadro sulle terre dei conti Pompei, lungo l’Adige. Il suo nome compare nel registro dei battesimi di Legnago del 1690.';
  const founderWife = make({ gender: 'female', firstName: 'Domenica', lastName: 'Zanella', year: 1694 });
  marry(founder, founderWife);

  const GENERATIONS = 12;
  // Quante coppie portano avanti la discendenza a ogni generazione (la chioma si allarga e poi si stabilizza).
  const CAP = [1, 2, 3, 3, 4, 4, 4, 4, 4, 4, 3, 0];
  let couples: Couple[] = [famiglia(founder, founderWife)];

  for (let g = 0; g < GENERATIONS - 1; g++) {
    const next: Couple[] = [];
    const candidates: { child: Person; family: number }[] = [];

    couples.forEach((c, fi) => {
      const base = Math.max(year(c.father), year(c.mother));
      const old = base < 1900;
      let kids = old ? int(3, 5) : base < 1960 ? int(2, 3) : int(1, 3);
      let mother = c.mother;
      let y = base + int(22, 28);
      const used = new Set<string>();
      for (let k = 0; k < kids; k++) {
        // Vedovanza e seconde nozze, una volta nella storia della famiglia.
        if (g === 4 && fi === 0 && k === 2 && mother === c.mother) {
          mother.deathDate = date(y);
          mother.deathPlace = mother.birthPlace;
          mother.bio = 'Morì giovane di febbre puerperale; il marito si risposò l’anno seguente.';
          const second = make({ gender: 'female', firstName: pick(DEMO_FEMALE), lastName: pick(DEMO_SURNAMES), year: base + int(4, 8) });
          marry(c.father, second);
          mother = second;
          y += 2;
          kids += 1;
        }
        const gender: Gender = rand() < 0.5 ? 'male' : 'female';
        const names = (gender === 'male' ? DEMO_MALE : DEMO_FEMALE).filter((n) => !used.has(n));
        // I primi figli spesso portano il nome dei nonni.
        const grand = gender === 'male' ? people.find((p) => p.id === c.father.fatherId) : people.find((p) => p.id === c.mother.motherId);
        const firstName = k < 2 && grand && !used.has(grand.firstName) && rand() < 0.6 ? grand.firstName : pick(names);
        used.add(firstName);
        const dieYoung = old && rand() < 0.18;
        const child = make({ gender, firstName, lastName: c.father.lastName, year: y, father: c.father, mother, dieYoung });
        if (!dieYoung && year(child) + 20 < NOW) candidates.push({ child, family: fi });
        y += int(2, 4);
      }
    });

    // Sceglie chi prosegue la discendenza: almeno un figlio per famiglia finché c'è posto.
    const chosen: Person[] = [];
    const byFamily = new Map<number, Person[]>();
    candidates.forEach(({ child, family }) => byFamily.set(family, [...(byFamily.get(family) ?? []), child]));
    const shuffle = <T,>(list: T[]) => {
      const a = [...list];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const pools = [...byFamily.values()].map(shuffle);
    while (chosen.length < CAP[g + 1] && pools.some((l) => l.length)) {
      for (const pool of pools) {
        if (chosen.length >= CAP[g + 1]) break;
        const c = pool.shift();
        if (c) chosen.push(c);
      }
    }
    candidates.forEach(({ child }) => {
      if (chosen.includes(child)) {
        const spouse = spouseFor(child);
        next.push(child.gender === 'male' ? famiglia(child, spouse) : famiglia(spouse, child));
      } else if (rand() < 0.3 && year(child) < 2000) {
        spouseFor(child); // sposato/a, senza figli
      }
    });
    couples = next;
  }

  // Qualche storia di famiglia.
  const story = (filter: (p: Person) => boolean, bio: string) => {
    const p = people.find((x) => filter(x) && !x.bio);
    if (p) p.bio = bio;
  };
  story((p) => p.gender === 'male' && year(p) > 1860 && year(p) < 1885 && p.lastName === 'Rossi', 'Nel 1888 partì da Genova per Buenos Aires con il fratello minore. Scrisse a casa per trent’anni; le sue lettere sono conservate in soffitta.');
  story((p) => p.gender === 'male' && year(p) >= 1890 && year(p) < 1900, 'Classe del ’99: combatté sul Piave e tornò a casa con una medaglia al valore che non mostrava mai a nessuno.');
  story((p) => p.gender === 'female' && year(p) >= 1915 && year(p) < 1930, 'Mondina in Lomellina da ragazza, poi sarta in paese. Cuciva gli abiti da sposa di mezza provincia.');
  story((p) => p.gender === 'male' && year(p) >= 1945 && year(p) < 1960, 'Primo della famiglia a laurearsi: ingegnere idraulico, progettò gli argini nuovi dell’Adige.');
  story((p) => year(p) >= 2010, 'L’ultima foglia dell’albero: ha disegnato la prima versione di questo archivio di famiglia per un compito di scuola.');
  return people;
}
