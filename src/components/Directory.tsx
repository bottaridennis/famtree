import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Person } from '../types';
import { Avatar, IconButton } from './ui';
import { cn } from '../utils';
import { fullName, isDeceased, lifespan, matchesQuery, type FamilyStats } from '../lib/family';

type Filter = 'all' | 'living' | 'deceased';
type Sort = 'surname' | 'name' | 'birth';

interface Props {
  people: Person[];
  query: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  stats: FamilyStats;
  searchRef?: React.Ref<HTMLInputElement>;
}

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'living', label: 'Viventi' },
  { id: 'deceased', label: 'Defunti' },
];

export default function Directory({ people, query, onQuery, selectedId, onSelect, stats, searchRef }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('surname');

  const list = useMemo(() => {
    const out = people
      .filter((p) => matchesQuery(p, query))
      .filter((p) => (filter === 'all' ? true : filter === 'living' ? !isDeceased(p) : isDeceased(p)));
    const cmp: Record<Sort, (a: Person, b: Person) => number> = {
      surname: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      name: (a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName),
      birth: (a, b) => (a.birthDate || '9999').localeCompare(b.birthDate || '9999'),
    };
    return out.sort(cmp[sort]);
  }, [people, query, filter, sort]);

  // Raggruppa per iniziale del cognome quando ordinato per cognome.
  let lastGroup = '';

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Cerca nome, luogo, anno…"
            aria-label="Cerca nell’archivio"
            className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-9 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:bg-surface focus:ring-4 focus:ring-brand/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <IconButton label="Cancella ricerca" size="sm" onClick={() => onQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4" />
            </IconButton>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-lg bg-surface-2 border border-line p-0.5">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-all',
                  filter === f.id ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Ordina"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-ink-2 outline-none focus:border-brand"
          >
            <option value="surname">Cognome</option>
            <option value="name">Nome</option>
            <option value="birth">Nascita</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-3">
            {people.length ? 'Nessun risultato.' : 'L’archivio è ancora vuoto.'}
          </p>
        ) : (
          <ul>
            {list.map((p) => {
              const group = sort === 'surname' ? (p.lastName[0] ?? '#').toUpperCase() : '';
              const header = group && group !== lastGroup;
              lastGroup = group || lastGroup;
              return (
                <li key={p.id}>
                  {header && (
                    <div className="sticky top-0 z-10 bg-paper-2/95 backdrop-blur px-3 py-1 font-serif text-sm font-semibold text-brass">
                      {group}
                    </div>
                  )}
                  <button
                    onClick={() => onSelect(p.id)}
                    aria-current={selectedId === p.id}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                      selectedId === p.id ? 'bg-brand-soft' : 'hover:bg-ink/5',
                    )}
                  >
                    <Avatar person={p} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', selectedId === p.id ? 'text-brand' : 'text-ink')}>
                        {sort === 'name' ? fullName(p) : `${p.lastName} ${p.firstName}`}
                      </span>
                      <span className="block truncate text-xs text-ink-3 tabular-nums">
                        {[lifespan(p), p.birthPlace].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-4 gap-px border-t border-line bg-line">
        {[
          ['Persone', stats.total],
          ['Gen.', stats.generations],
          ['Cognomi', stats.surnames],
          ['Dal', stats.oldestYear || '—'],
        ].map(([label, value]) => (
          <div key={label} className="bg-paper-2 px-2 py-3 text-center">
            <div className="font-serif text-lg font-semibold text-ink tabular-nums">{value}</div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
