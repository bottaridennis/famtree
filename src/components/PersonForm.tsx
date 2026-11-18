import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Plus, Trash2, X } from 'lucide-react';
import type { Gender, Person, PersonDraft } from '../types';
import { Avatar, Button, Field, IconButton, inputClass, Modal, ModalHeader, Spinner } from './ui';
import { cn } from '../utils';
import { descendantsOf, fullName, indexPeople, isDeceased, yearOf } from '../lib/family';
import { useFeedback } from './feedback';

interface Props {
  open: boolean;
  draft: PersonDraft | null;
  people: Person[];
  onSave: (draft: PersonDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: (person: Person) => void;
}

/** Converte "1950", "03/1950", "12/03/1950" o ISO in ISO (YYYY, YYYY-MM, YYYY-MM-DD). */
export function parseFlexibleDate(input: string): string | null {
  const s = input.trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  let y: number, mo: number | undefined, d: number | undefined;
  if (m) [y, mo, d] = [+m[1], m[2] ? +m[2] : undefined, m[3] ? +m[3] : undefined];
  else if ((m = s.match(/^(\d{1,2})[/.\-](\d{4})$/))) [y, mo] = [+m[2], +m[1]];
  else if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/))) [y, mo, d] = [+m[3], +m[2], +m[1]];
  else return null;
  if (y < 1000 || y > 2100) return null;
  if (mo !== undefined && (mo < 1 || mo > 12)) return null;
  if (d !== undefined) {
    const max = new Date(y, mo!, 0).getDate();
    if (d < 1 || d > max) return null;
  }
  return [String(y), mo && String(mo).padStart(2, '0'), d && String(d).padStart(2, '0')].filter(Boolean).join('-');
}

const isoToDisplay = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return [d, m, y].filter(Boolean).join('/');
};

function DateInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value?: string;
  onChange: (iso: string | null) => void;
  invalid?: boolean;
}) {
  const [text, setText] = useState(isoToDisplay(value));
  useEffect(() => setText(isoToDisplay(value)), [value]);
  return (
    <input
      id={id}
      inputMode="numeric"
      placeholder="gg/mm/aaaa o solo anno"
      value={text}
      aria-invalid={invalid}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseFlexibleDate(e.target.value));
      }}
      onBlur={() => {
        const iso = parseFlexibleDate(text);
        if (iso !== null) setText(isoToDisplay(iso));
      }}
      className={inputClass}
    />
  );
}

const genders: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Uomo' },
  { value: 'female', label: 'Donna' },
  { value: 'other', label: 'Altro' },
];

type DateErrors = Partial<Record<'birthDate' | 'deathDate', boolean>>;

export default function PersonForm({ open, draft, people, onSave, onCancel, onDelete }: Props) {
  const [form, setForm] = useState<PersonDraft>({});
  const [dateErrors, setDateErrors] = useState<DateErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [spouseToAdd, setSpouseToAdd] = useState('');
  const { confirm } = useFeedback();

  useEffect(() => {
    if (!draft) return;
    setForm({ gender: 'male', spouseIds: [], ...draft });
    setDateErrors({});
    setSubmitted(false);
    setSaving(false);
    setSpouseToAdd('');
  }, [draft]);

  const idx = useMemo(() => indexPeople(people), [people]);
  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => setForm((f) => ({ ...f, [key]: value }));
  const deceased = isDeceased(form);
  const existing = form.id ? idx.get(form.id) : undefined;

  // Non si può scegliere come genitore se stessi o un proprio discendente (eviterebbe cicli).
  const forbiddenParents = useMemo(() => {
    if (!form.id) return new Set<string>();
    const s = descendantsOf(form.id, people);
    s.add(form.id);
    return s;
  }, [form.id, people]);

  const sorted = useMemo(
    () => [...people].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [people],
  );
  const optionLabel = (p: Person) => `${p.lastName} ${p.firstName}${p.birthDate ? ` (${yearOf(p.birthDate)})` : ''}`;
  const parentOptions = (g: Gender) =>
    sorted.filter((p) => !forbiddenParents.has(p.id) && (p.gender === g || p.gender === 'other'));
  const spouseOptions = sorted.filter((p) => p.id !== form.id && !form.spouseIds?.includes(p.id));

  const errors: Record<string, string | undefined> = {
    firstName: !form.firstName?.trim() ? 'Il nome è obbligatorio.' : form.firstName.length > 100 ? 'Massimo 100 caratteri.' : undefined,
    lastName: !form.lastName?.trim() ? 'Il cognome è obbligatorio.' : form.lastName.length > 100 ? 'Massimo 100 caratteri.' : undefined,
    birthDate: dateErrors.birthDate ? 'Data non valida.' : undefined,
    deathDate: dateErrors.deathDate
      ? 'Data non valida.'
      : deceased && form.birthDate && form.deathDate && form.deathDate < form.birthDate
        ? 'La morte non può precedere la nascita.'
        : undefined,
    photoUrl:
      form.photoUrl && !/^https?:\/\/\S+$/i.test(form.photoUrl.trim())
        ? 'Inserisci un indirizzo che inizi con https://'
        : (form.photoUrl?.length ?? 0) > 500
          ? 'Indirizzo troppo lungo (max 500).'
          : undefined,
    bio: (form.bio?.length ?? 0) > 2000 ? 'Massimo 2000 caratteri.' : undefined,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (k: string) => (submitted ? errors[k] : k === 'firstName' || k === 'lastName' ? undefined : errors[k]);

  const warnings: string[] = [];
  const father = form.fatherId ? idx.get(form.fatherId) : undefined;
  const mother = form.motherId ? idx.get(form.motherId) : undefined;
  [father, mother].forEach((par) => {
    if (par?.birthDate && form.birthDate && par.birthDate >= form.birthDate)
      warnings.push(`${fullName(par)} risulta nato/a dopo questa persona.`);
  });

  const isDirty = useMemo(
    () => Object.values(dateErrors).some(Boolean) || JSON.stringify({ gender: 'male', spouseIds: [], ...draft }) !== JSON.stringify(form),
    [draft, form, dateErrors],
  );

  const requestClose = async () => {
    if (saving) return;
    if (isDirty && !(await confirm({ title: 'Scartare le modifiche?', message: 'Le modifiche non salvate andranno perse.', confirmLabel: 'Scarta', danger: true })))
      return;
    onCancel();
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const title = form.id ? `Modifica ${existing ? existing.firstName : 'persona'}` : 'Nuova persona';

  return (
    <Modal open={open} onClose={requestClose} className="sm:max-w-2xl" labelledBy="person-form-title">
      <ModalHeader
        id="person-form-title"
        title={title}
        subtitle={form.id ? 'Aggiorna dati, legami e ricordi.' : 'Aggiungi un nuovo ramo all’archivio.'}
        onClose={requestClose}
      />
      <form id="person-form" onSubmit={submit} className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6 space-y-8" noValidate>
        {/* Identità */}
        <section className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <div className="flex sm:flex-col items-center gap-3">
            <Avatar
              person={{
                firstName: form.firstName || '?',
                lastName: form.lastName || '',
                gender: form.gender ?? 'other',
                photoUrl: errors.photoUrl ? undefined : form.photoUrl,
                deathDate: form.deathDate,
                deceased: form.deceased,
              }}
              size={96}
              rounded="xl"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome *" htmlFor="f-first" error={show('firstName')}>
              <input id="f-first" autoFocus className={inputClass} value={form.firstName ?? ''} aria-invalid={!!show('firstName')} onChange={(e) => set('firstName', e.target.value)} placeholder="es. Giovanni" autoComplete="off" />
            </Field>
            <Field label="Cognome *" htmlFor="f-last" error={show('lastName')}>
              <input id="f-last" className={inputClass} value={form.lastName ?? ''} aria-invalid={!!show('lastName')} onChange={(e) => set('lastName', e.target.value)} placeholder="es. Rossi" autoComplete="off" />
            </Field>
            <Field label="Soprannome" htmlFor="f-nick">
              <input id="f-nick" className={inputClass} value={form.nickname ?? ''} onChange={(e) => set('nickname', e.target.value)} placeholder="es. Nonno Nino" maxLength={100} />
            </Field>
            <Field label="Genere">
              <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 border border-line p-1 h-11">
                {genders.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    role="radio"
                    aria-checked={form.gender === g.value}
                    onClick={() => set('gender', g.value)}
                    className={cn(
                      'rounded-lg text-sm font-medium transition-all',
                      form.gender === g.value ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink',
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Foto (URL)" htmlFor="f-photo" error={show('photoUrl')} className="sm:col-span-2" hint="Link diretto a un’immagine (es. da Google Foto, Imgur…).">
              <input id="f-photo" type="url" className={inputClass} value={form.photoUrl ?? ''} aria-invalid={!!show('photoUrl')} onChange={(e) => set('photoUrl', e.target.value)} placeholder="https://…" />
            </Field>
          </div>
        </section>

        {/* Vita */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-semibold text-ink">Vita</h3>
            <label className="flex items-center gap-2.5 cursor-pointer text-sm text-ink-2">
              Defunto/a
              <button
                type="button"
                role="switch"
                aria-checked={deceased}
                onClick={() => setForm((f) => (isDeceased(f) ? { ...f, deceased: false, deathDate: '', deathPlace: '' } : { ...f, deceased: true }))}
                className={cn('relative h-6 w-11 rounded-full transition-colors', deceased ? 'bg-brand' : 'bg-line-2')}
              >
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', deceased ? 'left-[22px]' : 'left-0.5')} />
              </button>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data di nascita" htmlFor="f-bd" error={show('birthDate')}>
              <DateInput id="f-bd" value={form.birthDate} invalid={!!show('birthDate')} onChange={(iso) => {
                setDateErrors((d) => ({ ...d, birthDate: iso === null }));
                if (iso !== null) set('birthDate', iso);
              }} />
            </Field>
            <Field label="Luogo di nascita" htmlFor="f-bp">
              <input id="f-bp" className={inputClass} value={form.birthPlace ?? ''} onChange={(e) => set('birthPlace', e.target.value)} placeholder="es. Verona" maxLength={200} />
            </Field>
            {deceased && (
              <>
                <Field label="Data di morte" htmlFor="f-dd" error={show('deathDate')} hint="Lascia vuoto se non è nota.">
                  <DateInput id="f-dd" value={form.deathDate} invalid={!!show('deathDate')} onChange={(iso) => {
                    setDateErrors((d) => ({ ...d, deathDate: iso === null }));
                    if (iso !== null) set('deathDate', iso);
                  }} />
                </Field>
                <Field label="Luogo di morte" htmlFor="f-dp">
                  <input id="f-dp" className={inputClass} value={form.deathPlace ?? ''} onChange={(e) => set('deathPlace', e.target.value)} maxLength={200} />
                </Field>
              </>
            )}
            <Field label="Professione" htmlFor="f-job" className="sm:col-span-2">
              <input id="f-job" className={inputClass} value={form.occupation ?? ''} onChange={(e) => set('occupation', e.target.value)} placeholder="es. Falegname" maxLength={200} />
            </Field>
          </div>
        </section>

        {/* Legami */}
        <section className="space-y-4">
          <h3 className="font-serif text-lg font-semibold text-ink">Legami</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Padre" htmlFor="f-father">
              <select id="f-father" className={inputClass} value={form.fatherId ?? ''} onChange={(e) => set('fatherId', e.target.value)}>
                <option value="">— Non indicato —</option>
                {parentOptions('male').map((p) => (
                  <option key={p.id} value={p.id}>{optionLabel(p)}</option>
                ))}
              </select>
            </Field>
            <Field label="Madre" htmlFor="f-mother">
              <select id="f-mother" className={inputClass} value={form.motherId ?? ''} onChange={(e) => set('motherId', e.target.value)}>
                <option value="">— Non indicata —</option>
                {parentOptions('female').map((p) => (
                  <option key={p.id} value={p.id}>{optionLabel(p)}</option>
                ))}
              </select>
            </Field>
          </div>
          {warnings.length > 0 && (
            <p className="rounded-xl bg-brass/10 text-brass px-3.5 py-2.5 text-xs">{warnings.join(' ')}</p>
          )}

          <Field label="Coniugi / partner">
            <div className="space-y-2">
              {(form.spouseIds ?? []).map((sid) => {
                const sp = idx.get(sid);
                if (!sp) return null;
                return (
                  <div key={sid} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 pl-2 pr-1 py-1.5">
                    <Avatar person={sp} size={30} />
                    <span className="flex-1 text-sm font-medium text-ink truncate">{fullName(sp)}</span>
                    <Heart className="h-4 w-4 text-brass" />
                    <IconButton label={`Rimuovi ${fullName(sp)}`} size="sm" type="button" onClick={() => set('spouseIds', form.spouseIds!.filter((x) => x !== sid))}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <select aria-label="Scegli un coniuge" className={inputClass} value={spouseToAdd} onChange={(e) => setSpouseToAdd(e.target.value)}>
                  <option value="">Aggiungi coniuge…</option>
                  {spouseOptions.map((p) => (
                    <option key={p.id} value={p.id}>{optionLabel(p)}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="soft"
                  className="h-11"
                  disabled={!spouseToAdd}
                  onClick={() => {
                    set('spouseIds', [...(form.spouseIds ?? []), spouseToAdd]);
                    setSpouseToAdd('');
                  }}
                >
                  <Plus className="h-4 w-4" /> Aggiungi
                </Button>
              </div>
            </div>
          </Field>
        </section>

        {/* Biografia */}
        <section className="space-y-3">
          <h3 className="font-serif text-lg font-semibold text-ink">Storia e ricordi</h3>
          <Field label="" error={show('bio')} hint={<span className="tabular-nums">{form.bio?.length ?? 0}/2000</span>}>
            <textarea
              aria-label="Biografia"
              rows={5}
              className={cn(inputClass, 'h-auto py-3 leading-relaxed resize-y min-h-28')}
              value={form.bio ?? ''}
              onChange={(e) => set('bio', e.target.value)}
              placeholder="Aneddoti, mestieri, viaggi, ricette… la storia che vuoi tramandare."
            />
          </Field>
        </section>
      </form>

      <div className="flex items-center gap-3 border-t border-line px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface">
        {existing && onDelete && (
          <Button type="button" variant="danger" onClick={() => onDelete(existing)} disabled={saving}>
            <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Elimina</span>
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={requestClose} disabled={saving}>
          Annulla
        </Button>
        <Button type="submit" form="person-form" variant="primary" disabled={saving}>
          {saving && <Spinner />} {form.id ? 'Salva modifiche' : 'Aggiungi'}
        </Button>
      </div>
    </Modal>
  );
}
