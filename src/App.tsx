import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import {
  BookUser,
  Database,
  Download,
  FileJson,
  LogIn,
  LogOut,
  Maximize2,
  Minus,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import FamilyTree, { type FamilyTreeHandle } from './components/FamilyTree';
import PersonForm from './components/PersonForm';
import PersonPanel from './components/PersonPanel';
import Directory from './components/Directory';
import { Menu } from './components/Menu';
import { Avatar, Button, IconButton, Kbd, Spinner, isModalOpen } from './components/ui';
import { useFeedback } from './components/feedback';
import { useAuth } from './hooks/useAuth';
import { usePeople } from './hooks/usePeople';
import { useTheme } from './hooks/useTheme';
import { computeLayout } from './lib/layout';
import {
  ancestorsOf,
  computeStats,
  descendantsOf,
  fullName,
  indexPeople,
  matchesQuery,
  spousesOf,
} from './lib/family';
import {
  buildArchive,
  deleteAll,
  deletePerson,
  downloadFile,
  generateDemo,
  importPeople,
  parseArchive,
  savePerson,
  toGedcom,
} from './lib/data';
import { describeFirebaseError } from './firebase';
import { APP_NAME, APP_TAGLINE } from './config';
import type { Person, PersonDraft } from './types';
import { cn } from './utils';

interface EditingState {
  draft: PersonDraft;
  /** Dopo il salvataggio, collega la nuova persona come genitore di questo id. */
  parentOf?: string;
}

const useIsDesktop = () => {
  const q = '(min-width: 1024px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
};

export default function App() {
  const { people, loading, error: loadError } = usePeople();
  const { user, ready, login, logout, refresh, needsVerification } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast, confirm } = useFeedback();
  const isDesktop = useIsDesktop();
  const isAdmin = !!user?.isAdmin;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lineageOn, setLineageOn] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [busy, setBusy] = useState<null | { label: string; progress?: number }>(null);
  const [directoryOpen, setDirectoryOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [zoom, setZoom] = useState(1);

  const sheetDrag = useDragControls();
  const treeRef = useRef<FamilyTreeHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const pendingCenter = useRef<string | null>(null);

  const idx = useMemo(() => indexPeople(people), [people]);
  const layout = useMemo(() => computeLayout(people), [people]);
  const stats = useMemo(() => computeStats(people, layout.generations), [people, layout.generations]);
  const selected = selectedId ? idx.get(selectedId) ?? null : null;

  const matchIds = useMemo(
    () => (query.trim() ? new Set(people.filter((p) => matchesQuery(p, query)).map((p) => p.id)) : null),
    [people, query],
  );

  const focusIds = useMemo(() => {
    if (!lineageOn || !selected) return null;
    const s = new Set<string>([selected.id, ...ancestorsOf(selected.id, idx), ...descendantsOf(selected.id, people)]);
    spousesOf(selected, idx, people).forEach((sp) => s.add(sp.id));
    return s;
  }, [lineageOn, selected, idx, people]);

  // La persona selezionata è stata eliminata (anche da un'altra sessione).
  useEffect(() => {
    if (selectedId && !loading && !idx.has(selectedId)) setSelectedId(null);
  }, [selectedId, idx, loading]);

  useEffect(() => {
    if (pendingCenter.current && layout.nodeById.has(pendingCenter.current)) {
      const id = pendingCenter.current;
      pendingCenter.current = null;
      setTimeout(() => treeRef.current?.centerOn(id), 80);
    }
  }, [layout]);

  const select = useCallback(
    (id: string, center = false) => {
      setSelectedId(id);
      // Su mobile la scheda copre la parte bassa: centra il nodo nella fascia visibile in alto.
      if (center || !isDesktop) setTimeout(() => treeRef.current?.centerOn(id, { yRatio: isDesktop ? 0.5 : 0.14 }), 60);
      if (!isDesktop) setDirectoryOpen(false);
    },
    [isDesktop],
  );

  const closePanel = useCallback(() => {
    setSelectedId(null);
    setLineageOn(false);
  }, []);

  // --- Scorciatoie da tastiera -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (isModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el.closest('input, textarea, select, [contenteditable]')) {
        if (e.key === 'Escape') el.blur();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        setDirectoryOpen(true);
        setTimeout(() => searchRef.current?.focus(), 30);
      } else if (e.key === 'Escape') closePanel();
      else if (e.key === '+' || e.key === '=') treeRef.current?.zoomIn();
      else if (e.key === '-') treeRef.current?.zoomOut();
      else if (e.key === '0') treeRef.current?.fit();
      else if (e.key === 'n' && isAdmin) setEditing({ draft: { gender: 'male' } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePanel, isAdmin]);

  // --- Azioni ------------------------------------------------------------------------------
  const handleLogin = async () => {
    try {
      await login();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') toast(describeFirebaseError(e), 'error');
    }
  };

  const handleSave = async (draft: PersonDraft) => {
    try {
      const isNew = !draft.id;
      const id = await savePerson(draft, peopleRef.current);
      if (editing?.parentOf) {
        const child = peopleRef.current.find((p) => p.id === editing.parentOf);
        if (child) {
          const field =
            draft.gender === 'male' ? 'fatherId' : draft.gender === 'female' ? 'motherId' : !child.fatherId ? 'fatherId' : 'motherId';
          await savePerson({ ...child, [field]: id }, [...peopleRef.current, { ...(draft as Person), id }]);
        }
      }
      toast(isNew ? `${draft.firstName} è stato aggiunto all’archivio.` : 'Modifiche salvate.');
      setEditing(null);
      setSelectedId(id);
      if (isNew) pendingCenter.current = id;
    } catch (e) {
      toast(describeFirebaseError(e), 'error');
    }
  };

  const handleDelete = async (person: Person) => {
    const kids = people.filter((p) => p.fatherId === person.id || p.motherId === person.id).length;
    const ok = await confirm({
      title: `Eliminare ${fullName(person)}?`,
      message: (
        <>
          La scheda verrà rimossa definitivamente.
          {kids > 0 && ` I ${kids} figli resteranno nell’archivio ma senza questo genitore.`}
        </>
      ),
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePerson(person.id, people);
      setEditing(null);
      closePanel();
      toast(`${fullName(person)} è stato rimosso.`);
    } catch (e) {
      toast(describeFirebaseError(e), 'error');
    }
  };

  const addChild = (p: Person) => {
    const spouses = spousesOf(p, idx, people);
    const other = spouses.length === 1 ? spouses[0] : undefined;
    const draft: PersonDraft = { gender: 'male', spouseIds: [] };
    if (p.gender === 'female') {
      draft.motherId = p.id;
      if (other && other.gender !== 'female') draft.fatherId = other.id;
    } else {
      draft.fatherId = p.id;
      if (other && other.gender !== 'male') draft.motherId = other.id;
    }
    draft.lastName = (draft.fatherId ? idx.get(draft.fatherId)?.lastName : p.lastName) ?? '';
    setEditing({ draft });
  };

  const addSpouse = (p: Person) =>
    setEditing({ draft: { gender: p.gender === 'male' ? 'female' : 'male', spouseIds: [p.id] } });

  const addParent = (p: Person) => {
    const hasFather = !!p.fatherId && idx.has(p.fatherId);
    const otherParent = hasFather ? p.fatherId : p.motherId && idx.has(p.motherId) ? p.motherId : undefined;
    setEditing({
      draft: {
        gender: hasFather ? 'female' : 'male',
        lastName: hasFather ? '' : p.lastName,
        spouseIds: otherParent ? [otherParent] : [],
      },
      parentOf: p.id,
    });
  };

  const runBusy = async (label: string, fn: () => Promise<void>) => {
    setBusy({ label });
    try {
      await fn();
    } catch (e) {
      toast(describeFirebaseError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const loadDemo = async () => {
    const ok = await confirm({
      title: 'Caricare la famiglia d’esempio?',
      message: 'Verranno aggiunte circa 50 persone su cinque generazioni, utili per provare l’app. Potrai eliminarle in qualsiasi momento.',
      confirmLabel: 'Carica esempio',
    });
    if (!ok) return;
    await runBusy('Creazione famiglia d’esempio…', async () => {
      const n = await generateDemo((progress) => setBusy({ label: 'Creazione famiglia d’esempio…', progress }));
      toast(`Aggiunte ${n} persone d’esempio.`);
      setTimeout(() => treeRef.current?.fit(), 300);
    });
  };

  const clearAll = async () => {
    const ok = await confirm({
      title: 'Svuotare l’intero archivio?',
      message: (
        <>
          Verranno eliminate <strong>{people.length} persone</strong>. L’operazione è irreversibile: ti consigliamo di
          scaricare prima un backup.
        </>
      ),
      confirmLabel: 'Elimina tutto',
      danger: true,
    });
    if (!ok) return;
    await runBusy('Eliminazione in corso…', async () => {
      await deleteAll(people);
      closePanel();
      toast('Archivio svuotato.');
    });
  };

  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportJson = () => downloadFile(`famtree-${stamp()}.json`, JSON.stringify(buildArchive(people), null, 2), 'application/json');
  const exportGedcom = () => downloadFile(`famtree-${stamp()}.ged`, toGedcom(people), 'text/plain;charset=utf-8');

  const onImportFile = async (file: File) => {
    try {
      const list = parseArchive(await file.text());
      const existing = list.filter((p) => idx.has(p.id)).length;
      const ok = await confirm({
        title: `Importare ${list.length} persone?`,
        message: existing
          ? `${existing} schede con lo stesso identificativo verranno sovrascritte.`
          : 'Le persone verranno aggiunte all’archivio attuale.',
        confirmLabel: 'Importa',
      });
      if (!ok) return;
      await runBusy('Importazione…', async () => {
        await importPeople(list);
        toast(`Importate ${list.length} persone.`);
        setTimeout(() => treeRef.current?.fit(), 300);
      });
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Il file non è un JSON valido.' : describeFirebaseError(e), 'error');
    }
  };

  const onZoomChange = useCallback((k: number) => setZoom(k), []);

  // --- Render -----------------------------------------------------------------------------
  const archiveMenu = [
    [
      { label: 'Scarica backup (JSON)', icon: FileJson, onClick: exportJson, disabled: !people.length },
      { label: 'Esporta GEDCOM', icon: Download, onClick: exportGedcom, disabled: !people.length, hint: '.ged' },
    ],
    isAdmin
      ? [
          { label: 'Importa backup…', icon: Upload, onClick: () => fileRef.current?.click() },
          { label: 'Carica famiglia d’esempio', icon: Database, onClick: loadDemo },
        ]
      : [],
    isAdmin ? [{ label: 'Svuota archivio', icon: Trash2, onClick: clearAll, danger: true, disabled: !people.length }] : [],
  ];

  const panel = selected && (
    <PersonPanel
      key={selected.id}
      person={selected}
      people={people}
      idx={idx}
      isAdmin={isAdmin}
      lineageOn={lineageOn}
      onToggleLineage={() => setLineageOn((v) => !v)}
      onSelect={(id) => select(id, true)}
      onCenter={() => treeRef.current?.centerOn(selected.id, { yRatio: isDesktop ? 0.5 : 0.14 })}
      onClose={closePanel}
      onEdit={() => setEditing({ draft: { ...selected } })}
      onAddChild={() => addChild(selected)}
      onAddSpouse={() => addSpouse(selected)}
      onAddParent={() => addParent(selected)}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      {/* Header */}
      <header className="relative z-40 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur-xl sm:px-4">
        <IconButton
          label={directoryOpen ? 'Nascondi elenco' : 'Mostra elenco'}
          onClick={() => setDirectoryOpen((o) => !o)}
          aria-pressed={directoryOpen}
        >
          {isDesktop ? (
            directoryOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <BookUser className="h-5 w-5" />
          )}
        </IconButton>

        <div className="flex min-w-0 items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9 rounded-xl shadow-card" />
          <div className="min-w-0 leading-tight">
            <h1 className="font-serif text-xl font-semibold tracking-tight">{APP_NAME}</h1>
            <p className="hidden text-[11px] uppercase tracking-[0.18em] text-ink-3 sm:block">{APP_TAGLINE}</p>
          </div>
        </div>

        <div className="flex-1" />

        {busy && (
          <div className="hidden items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand md:flex">
            <Spinner className="h-3.5 w-3.5" />
            {busy.label}
            {busy.progress ? ` ${busy.progress}` : ''}
          </div>
        )}

        <IconButton label={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </IconButton>

        <Menu
          sections={archiveMenu}
          trigger={(t) => (
            <IconButton label="Archivio" {...t}>
              <MoreHorizontal className="h-5 w-5" />
            </IconButton>
          )}
        />

        {isAdmin && (
          <Button variant="primary" onClick={() => setEditing({ draft: { gender: 'male' } })} className="px-3 sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuova persona</span>
          </Button>
        )}

        {!ready ? null : user ? (
          <Menu
            header={
              <div className="flex items-center gap-3 px-3 py-2.5 mb-1.5 border-b border-line">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-brand-soft" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.displayName ?? user.email}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    {isAdmin ? <ShieldCheck className="h-3.5 w-3.5 text-brand" /> : <Users className="h-3.5 w-3.5" />}
                    {isAdmin ? 'Amministratore' : 'Ospite · sola lettura'}
                  </p>
                </div>
              </div>
            }
            sections={[[{ label: 'Esci', icon: LogOut, onClick: () => logout().then(() => toast('Disconnesso.', 'info')) }]]}
            trigger={(t) => (
              <button {...t} aria-label="Account" className="ml-1 rounded-full ring-2 ring-transparent transition hover:ring-line-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                    {(user.displayName ?? user.email)[0]?.toUpperCase()}
                  </span>
                )}
              </button>
            )}
          />
        ) : (
          <Button onClick={handleLogin} className="ml-1">
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Accedi</span>
          </Button>
        )}
      </header>

      {needsVerification && (
        <div className="flex items-center gap-3 border-b border-line bg-brass/10 px-4 py-2 text-sm text-ink">
          <ShieldAlert className="h-4 w-4 shrink-0 text-brass" />
          <span className="flex-1">Verifica l’indirizzo email del tuo account per abilitare le modifiche.</span>
          <Button size="sm" onClick={() => refresh().then(() => toast('Stato aggiornato.', 'info'))}>
            <RefreshCw className="h-3.5 w-3.5" /> Ricontrolla
          </Button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Elenco persone */}
        <AnimatePresence initial={false}>
          {directoryOpen && (
            <>
              {!isDesktop && (
                <motion.div
                  className="fixed inset-0 top-16 z-30 bg-black/30"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setDirectoryOpen(false)}
                />
              )}
              <motion.aside
                key="directory"
                initial={isDesktop ? { width: 0, opacity: 0 } : { x: '-100%' }}
                animate={isDesktop ? { width: 320, opacity: 1 } : { x: 0 }}
                exit={isDesktop ? { width: 0, opacity: 0 } : { x: '-100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                className={cn(
                  'z-30 shrink-0 overflow-hidden border-r border-line bg-paper-2',
                  isDesktop ? 'relative' : 'fixed bottom-0 left-0 top-16 w-[min(88vw,340px)] shadow-float',
                )}
              >
                <div className="h-full w-full lg:w-[320px]">
                  <Directory
                    people={people}
                    query={query}
                    onQuery={setQuery}
                    selectedId={selectedId}
                    onSelect={(id) => select(id, true)}
                    stats={stats}
                    searchRef={searchRef}
                  />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Canvas */}
        <main className="canvas-grid relative min-w-0 flex-1">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-ink-3">
              <Spinner className="h-7 w-7 text-brand" />
              <p className="text-sm">Apertura dell’archivio…</p>
            </div>
          ) : loadError ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md rounded-3xl border border-line bg-surface p-8 text-center shadow-card">
                <ShieldAlert className="mx-auto h-10 w-10 text-danger" />
                <h2 className="mt-4 font-serif text-2xl font-semibold">Archivio non raggiungibile</h2>
                <p className="mt-2 text-sm text-ink-2">{loadError}</p>
                <Button className="mt-6" onClick={() => location.reload()}>
                  <RefreshCw className="h-4 w-4" /> Riprova
                </Button>
              </div>
            </div>
          ) : people.length === 0 ? (
            <EmptyState isAdmin={isAdmin} signedIn={!!user} onAdd={() => setEditing({ draft: { gender: 'male' } })} onDemo={loadDemo} onLogin={handleLogin} />
          ) : (
            <>
              <FamilyTree
                ref={treeRef}
                layout={layout}
                selectedId={selectedId}
                focusIds={focusIds}
                matchIds={matchIds}
                onSelect={(id) => select(id)}
                onBackgroundClick={closePanel}
                onZoomChange={onZoomChange}
              />

              {matchIds && (
                <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-line bg-surface/90 px-4 py-1.5 text-xs font-medium text-ink-2 shadow-card backdrop-blur">
                  {matchIds.size === 0 ? 'Nessuna corrispondenza' : `${matchIds.size} ${matchIds.size === 1 ? 'corrispondenza' : 'corrispondenze'} evidenziate`}
                </div>
              )}

              {/* Controlli zoom */}
              <div
                className={cn(
                  'absolute right-4 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface/90 shadow-card backdrop-blur transition-all',
                  selected && !isDesktop ? 'bottom-[calc(72dvh+1rem)]' : 'bottom-4',
                )}
              >
                <IconButton label="Ingrandisci (+)" onClick={() => treeRef.current?.zoomIn()} className="rounded-none">
                  <Plus className="h-4 w-4" />
                </IconButton>
                <div className="border-y border-line py-1 text-center text-[10px] font-medium tabular-nums text-ink-3">
                  {Math.round(zoom * 100)}%
                </div>
                <IconButton label="Riduci (−)" onClick={() => treeRef.current?.zoomOut()} className="rounded-none">
                  <Minus className="h-4 w-4" />
                </IconButton>
                <IconButton label="Adatta alla finestra (0)" onClick={() => treeRef.current?.fit()} className="rounded-none border-t border-line">
                  <Maximize2 className="h-4 w-4" />
                </IconButton>
              </div>

              {/* Legenda */}
              <div className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-4 rounded-full border border-line bg-surface/90 px-4 py-2 text-[11px] text-ink-2 shadow-card backdrop-blur md:flex">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-male" />Uomo</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-female" />Donna</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-other" />Altro</span>
                <span className="flex items-center gap-1.5 text-brass">♥ Coppia</span>
                <span className="hidden items-center gap-1 xl:flex">
                  <Kbd>/</Kbd> cerca <Kbd>0</Kbd> adatta
                </span>
              </div>
            </>
          )}
        </main>

        {/* Scheda persona */}
        <AnimatePresence>
          {selected &&
            (isDesktop ? (
              <motion.aside
                key="panel"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 400, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 34, stiffness: 340 }}
                className="relative z-20 shrink-0 overflow-hidden border-l border-line bg-surface"
              >
                <div className="h-full w-[400px]">{panel}</div>
              </motion.aside>
            ) : (
              <motion.aside
                key="sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                drag="y"
                dragControls={sheetDrag}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, info) => info.offset.y > 120 && closePanel()}
                className="fixed inset-x-0 bottom-0 z-50 h-[72dvh] overflow-hidden rounded-t-3xl border-t border-line bg-surface shadow-float"
              >
                <div
                  className="flex h-5 cursor-grab touch-none items-center justify-center"
                  onPointerDown={(e) => sheetDrag.start(e)}
                  aria-hidden
                >
                  <div className="h-1.5 w-10 rounded-full bg-line-2" />
                </div>
                <div className="h-[calc(100%-20px)]">{panel}</div>
              </motion.aside>
            ))}
        </AnimatePresence>
      </div>

      <PersonForm
        open={!!editing}
        draft={editing?.draft ?? null}
        people={people}
        onSave={handleSave}
        onCancel={() => setEditing(null)}
        onDelete={isAdmin ? handleDelete : undefined}
      />

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onImportFile(f);
        }}
      />
    </div>
  );
}

function EmptyState({
  isAdmin,
  signedIn,
  onAdd,
  onDemo,
  onLogin,
}: {
  isAdmin: boolean;
  signedIn: boolean;
  onAdd: () => void;
  onDemo: () => void;
  onLogin: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg text-center"
      >
        <svg viewBox="0 0 200 140" className="mx-auto h-36 w-auto" aria-hidden>
          <g fill="none" strokeLinecap="round" style={{ stroke: 'var(--link)' }} strokeWidth="1.5">
            <path d="M100 52v22M60 74h80M60 74v16M140 74v16M100 74v16" />
          </g>
          {[
            [100, 36, 'var(--brand)'],
            [60, 104, 'var(--male)'],
            [100, 104, 'var(--female)'],
            [140, 104, 'var(--other)'],
          ].map(([x, y, c]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x as number} cy={y as number} r="15" style={{ fill: 'var(--surface)', stroke: c as string }} strokeWidth="2" />
              <circle cx={x as number} cy={(y as number) - 3} r="4.5" style={{ fill: c as string, opacity: 0.6 }} />
              <path d={`M${(x as number) - 7} ${(y as number) + 9} q7 -9 14 0`} style={{ stroke: c as string, opacity: 0.6 }} strokeWidth="2" fill="none" />
            </g>
          ))}
        </svg>
        <h2 className="mt-4 font-serif text-3xl font-semibold text-ink">Ogni famiglia ha una storia</h2>
        <p className="mx-auto mt-3 max-w-md text-ink-2">
          {isAdmin
            ? 'Inizia aggiungendo una persona — magari te stesso o il capostipite — oppure carica una famiglia d’esempio per esplorare l’app.'
            : signedIn
              ? 'L’archivio è ancora vuoto. Solo l’amministratore può aggiungere persone.'
              : 'L’archivio è ancora vuoto. Accedi come amministratore per iniziare a costruire l’albero.'}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {isAdmin ? (
            <>
              <Button variant="primary" size="lg" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Aggiungi la prima persona
              </Button>
              <Button size="lg" onClick={onDemo}>
                <Database className="h-4 w-4" /> Famiglia d’esempio
              </Button>
            </>
          ) : (
            !signedIn && (
              <Button variant="primary" size="lg" onClick={onLogin}>
                <LogIn className="h-4 w-4" /> Accedi con Google
              </Button>
            )
          )}
        </div>
      </motion.div>
    </div>
  );
}
