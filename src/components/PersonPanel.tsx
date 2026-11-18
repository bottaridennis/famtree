import React, { useMemo } from 'react';
import { Baby, Briefcase, Crosshair, GitBranch, Heart, MapPin, Pencil, Sparkles, UserPlus, X } from 'lucide-react';
import type { Person } from '../types';
import { Avatar, Button, IconButton } from './ui';
import { cn } from '../utils';
import {
  ageOf,
  childrenOf,
  formatDate,
  fullName,
  genderLabel,
  isDeceased,
  lifespan,
  parentsOf,
  siblingsOf,
  spousesOf,
  type PeopleIndex,
} from '../lib/family';

interface Props {
  person: Person;
  people: Person[];
  idx: PeopleIndex;
  isAdmin: boolean;
  lineageOn: boolean;
  onToggleLineage: () => void;
  onSelect: (id: string) => void;
  onCenter: () => void;
  onClose: () => void;
  onEdit: () => void;
  onAddChild: () => void;
  onAddSpouse: () => void;
  onAddParent: () => void;
}

function RelationList({ title, people, onSelect, empty }: { title: string; people: Person[]; onSelect: (id: string) => void; empty?: string }) {
  if (!people.length && !empty) return null;
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        {title} {people.length > 0 && <span className="text-ink-3/70">· {people.length}</span>}
      </h4>
      {people.length ? (
        <ul className="space-y-1">
          {people.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-ink/5"
              >
                <Avatar person={p} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink group-hover:text-brand">{fullName(p)}</span>
                  <span className="block text-xs text-ink-3 tabular-nums">{lifespan(p) || '—'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 text-sm text-ink-3 italic">{empty}</p>
      )}
    </section>
  );
}

function Fact({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3 border border-line">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{label}</p>
        <p className="text-sm text-ink">{children}</p>
      </div>
    </div>
  );
}

export default function PersonPanel(props: Props) {
  const { person: p, people, idx, isAdmin, lineageOn, onToggleLineage, onSelect, onCenter, onClose, onEdit, onAddChild, onAddSpouse, onAddParent } = props;

  const rel = useMemo(
    () => ({
      parents: parentsOf(p, idx),
      spouses: spousesOf(p, idx, people),
      children: childrenOf(p.id, people),
      siblings: siblingsOf(p, people),
    }),
    [p, idx, people],
  );

  const dead = isDeceased(p);
  const age = ageOf(p);
  const canAddParent = !p.fatherId || !p.motherId || !idx.has(p.fatherId) || !idx.has(p.motherId);
  const accent = p.gender === 'male' ? 'from-male-soft' : p.gender === 'female' ? 'from-female-soft' : 'from-other-soft';

  return (
    <div className="flex h-full flex-col">
      <div className={cn('relative shrink-0 bg-gradient-to-b to-transparent px-6 pt-6 pb-5', accent)}>
        <div className="absolute right-3 top-3 flex gap-1">
          <IconButton label="Centra nell’albero" size="sm" onClick={onCenter}>
            <Crosshair className="h-4 w-4" />
          </IconButton>
          <IconButton label="Chiudi scheda" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <Avatar person={p} size={88} rounded="xl" className="shadow-card" />
        <h2 className="mt-4 font-serif text-[28px] font-semibold leading-tight text-ink">
          {p.firstName} <span className="italic font-medium">{p.lastName}</span>
        </h2>
        {p.nickname && <p className="mt-0.5 text-sm text-ink-2 italic">“{p.nickname}”</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', dead ? 'bg-ink/8 text-ink-2' : 'bg-brand-soft text-brand')}>
            {dead ? 'In memoria' : 'Vivente'}
          </span>
          <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink-2">{genderLabel[p.gender]}</span>
          {age !== null && (
            <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink-2 tabular-nums">
              {dead ? `Visse ${age} anni` : `${age} anni`}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-7 overflow-y-auto scrollbar-thin px-6 pb-6 pt-2">
        <div className="flex gap-2">
          <Button size="sm" variant={lineageOn ? 'primary' : 'secondary'} onClick={onToggleLineage} aria-pressed={lineageOn}>
            <GitBranch className="h-3.5 w-3.5" /> {lineageOn ? 'Linea evidenziata' : 'Evidenzia linea di sangue'}
          </Button>
        </div>

        <div className="space-y-4">
          <Fact icon={Sparkles} label="Nascita">
            {p.birthDate ? formatDate(p.birthDate) : <span className="text-ink-3">Data non nota</span>}
            {p.birthPlace && <span className="text-ink-2"> · {p.birthPlace}</span>}
          </Fact>
          {dead && (
            <Fact icon={MapPin} label="Morte">
              {p.deathDate ? formatDate(p.deathDate) : <span className="text-ink-3">Data non nota</span>}
              {p.deathPlace && <span className="text-ink-2"> · {p.deathPlace}</span>}
            </Fact>
          )}
          {p.occupation && (
            <Fact icon={Briefcase} label="Professione">
              {p.occupation}
            </Fact>
          )}
        </div>

        {p.bio && (
          <blockquote className="relative rounded-2xl border border-line bg-surface-2 px-5 py-4">
            <span className="absolute -top-3 left-4 font-serif text-4xl leading-none text-brass">“</span>
            <p className="font-serif text-[17px] leading-relaxed text-ink-2 whitespace-pre-line">{p.bio}</p>
          </blockquote>
        )}

        <RelationList title="Genitori" people={rel.parents} onSelect={onSelect} empty="Non indicati" />
        <RelationList title="Coniugi" people={rel.spouses} onSelect={onSelect} />
        <RelationList title="Figli" people={rel.children} onSelect={onSelect} />
        <RelationList title="Fratelli e sorelle" people={rel.siblings} onSelect={onSelect} />
      </div>

      {isAdmin && (
        <div className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={onEdit} className="col-span-2">
              <Pencil className="h-4 w-4" /> Modifica scheda
            </Button>
            <Button size="sm" variant="soft" onClick={onAddChild}>
              <Baby className="h-4 w-4" /> Figlio/a
            </Button>
            <Button size="sm" variant="soft" onClick={onAddSpouse}>
              <Heart className="h-4 w-4" /> Coniuge
            </Button>
            {canAddParent && (
              <Button size="sm" variant="soft" onClick={onAddParent} className="col-span-2">
                <UserPlus className="h-4 w-4" /> Genitore
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
