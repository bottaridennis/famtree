import React, { Component, useState, useEffect } from 'react';
import { 
  db, 
  auth, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  signInWithPopup, 
  googleProvider, 
  signOut,
  onAuthStateChanged,
  getDoc,
  handleFirestoreError,
  OperationType,
  writeBatch
} from './firebase';
import { Person, UserProfile } from './types';
import FamilyTree from './components/FamilyTree';
import PersonForm from './components/PersonForm';
import { 
  Users, 
  Settings, 
  LogOut, 
  LogIn, 
  Plus, 
  ChevronRight, 
  Info,
  ShieldCheck,
  TreePine,
  X,
  Baby,
  Heart,
  Calendar,
  BookOpen,
  Database,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const App: React.FC = () => {
  const [people, setPeople] = useState<Person[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<'public' | 'admin'>('public');
  const [editingPerson, setEditingPerson] = useState<Partial<Person> | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkAdminStatus = async (firebaseUser: any) => {
    if (!firebaseUser) return false;
    // Force reload to get latest emailVerified status
    try {
      await firebaseUser.reload();
    } catch (e) {
      console.error("Error reloading user:", e);
    }
    return firebaseUser.email === 'dennisbottari@gmail.com' && firebaseUser.emailVerified;
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const isAdminUser = await checkAdminStatus(firebaseUser);
        setIsAdmin(isAdminUser);
        
        if (firebaseUser.email === 'dennisbottari@gmail.com' && !firebaseUser.emailVerified) {
          setError('Il tuo account admin richiede la verifica dell\'email per operare. Controlla la tua posta e ricarica la pagina.');
        }

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          role: isAdminUser ? 'admin' : 'user'
        });
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    const unsubscribePeople = onSnapshot(collection(db, 'people'), (snapshot) => {
      const peopleData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Person[];
      setPeople(peopleData);

      // Add template data if empty
      if (peopleData.length === 0 && isAdmin) {
        addTemplateData();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'people');
    });

    return () => {
      unsubscribeAuth();
      unsubscribePeople();
    };
  }, [isAdmin]);

  const handleClearAll = async () => {
    if (isClearing) return;
    if (!window.confirm('Sei sicuro di voler eliminare TUTTI i membri? Questa azione è irreversibile.')) return;

    setIsClearing(true);
    setError(null);
    try {
      const batchSize = 500;
      let count = 0;
      
      // We process in chunks to stay within Firestore limits
      const chunks = [];
      for (let i = 0; i < people.length; i += batchSize) {
        chunks.push(people.slice(i, i + batchSize));
      }

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(p => {
          batch.delete(doc(db, 'people', p.id));
          count++;
        });
        await batch.commit();
      }
      
      console.log(`Eliminati ${count} membri.`);
      setSelectedPerson(null);
      setEditingPerson(null);
    } catch (err: any) {
      console.error('Clear error:', err);
      setError(err.message || 'Errore durante l\'eliminazione dei dati.');
      handleFirestoreError(err, OperationType.DELETE, 'people');
    } finally {
      setIsClearing(false);
    }
  };

  const addTemplateData = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenerationProgress(0);
    setError(null);
    try {
      const firstNames = [
        'Giovanni', 'Maria', 'Luca', 'Elena', 'Giulia', 'Marco', 'Sofia', 'Matteo', 'Alessandro', 'Beatrice',
        'Francesco', 'Chiara', 'Lorenzo', 'Alice', 'Riccardo', 'Emma', 'Gabriele', 'Vittoria', 'Leonardo', 'Sara',
        'Tommaso', 'Martina', 'Edoardo', 'Giorgia', 'Federico', 'Anna', 'Mattia', 'Francesca', 'Pietro', 'Elisa',
        'Filippo', 'Ludovica', 'Samuele', 'Aurora', 'Davide', 'Ginevra', 'Simone', 'Greta', 'Andrea', 'Noemi',
        'Christian', 'Matilde', 'Michele', 'Viola', 'Antonio', 'Gaia', 'Giuseppe', 'Bianca', 'Domenico', 'Adele',
        'Salvatore', 'Elena', 'Vincenzo', 'Arianna', 'Pasquale', 'Irene', 'Raffaele', 'Rebecca', 'Carmine', 'Marta',
        'Stefano', 'Paola', 'Roberto', 'Silvia', 'Claudio', 'Simona', 'Enrico', 'Laura', 'Massimo', 'Daniela',
        'Fabio', 'Monica', 'Valeria', 'Paolo', 'Roberta', 'Giorgio', 'Patrizia', 'Gianluca', 'Cristina', 'Mauro'
      ];
      const lastNames = ['Rossi', 'Bianchi', 'Verdi', 'Neri', 'Romano', 'Gallo', 'Costa', 'Fontana', 'Ricci', 'Bruno'];
      
      let personCount = 0;

      const createPerson = async (firstName: string, lastName: string, gender: 'male' | 'female', birthYear: number, fatherId?: string, motherId?: string) => {
        if (!firstName) firstName = 'Membro'; // Fallback per sicurezza
        personCount++;
        setGenerationProgress(personCount);
        const birthDate = `${birthYear}-01-01`;
        
        const personData: any = {
          firstName,
          lastName,
          gender,
          birthDate,
          bio: `Membro della stirpe ${lastName}, generazione ${Math.floor((2026 - birthYear) / 25)}.`,
          photoUrl: `https://picsum.photos/seed/${firstName}${lastName}${personCount}/400/400`
        };

        if (fatherId) personData.fatherId = fatherId;
        if (motherId) personData.motherId = motherId;

        return await addDoc(collection(db, 'people'), personData);
      };

      // Generation 1 (2 people)
      const gen1Father = await createPerson('Giovanni', 'Rossi', 'male', 1930);
      const gen1Mother = await createPerson('Maria', 'Bianchi', 'female', 1935);
      await updateDoc(doc(db, 'people', gen1Father.id), { spouseIds: [gen1Mother.id] });
      await updateDoc(doc(db, 'people', gen1Mother.id), { spouseIds: [gen1Father.id] });

      // Generation 2 (4 children + 4 spouses = 8 people)
      for (let i = 0; i < 4; i++) {
        const gender: 'male' | 'female' = i % 2 === 0 ? 'male' : 'female';
        const child = await createPerson(firstNames[i + 2], 'Rossi', gender, 1960, gen1Father.id, gen1Mother.id);
        const spouseGender = gender === 'male' ? 'female' : 'male';
        const spouse = await createPerson(firstNames[i + 6], lastNames[i % lastNames.length], spouseGender, 1965);
        
        await updateDoc(doc(db, 'people', child.id), { spouseIds: [spouse.id] });
        await updateDoc(doc(db, 'people', spouse.id), { spouseIds: [child.id] });

        // Generation 3 (4 children per Gen 2 couple = 16 children)
        for (let j = 0; j < 4; j++) {
          const g3Gender: 'male' | 'female' = j % 2 === 0 ? 'male' : 'female';
          const g3Child = await createPerson(firstNames[10 + i * 4 + j], 'Rossi', g3Gender, 1985, 
            gender === 'male' ? child.id : spouse.id,
            gender === 'female' ? child.id : spouse.id
          );

          // Generation 3 spouses (16 people)
          const g3SpouseGender = g3Gender === 'male' ? 'female' : 'male';
          const g3Spouse = await createPerson(firstNames[26 + i * 4 + j], lastNames[(i + j) % lastNames.length], g3SpouseGender, 1988);
          await updateDoc(doc(db, 'people', g3Child.id), { spouseIds: [g3Spouse.id] });
          await updateDoc(doc(db, 'people', g3Spouse.id), { spouseIds: [g3Child.id] });

          // Generation 4 (2 children per Gen 3 couple = 32 children)
          for (let k = 0; k < 2; k++) {
            const g4Gender: 'male' | 'female' = k % 2 === 0 ? 'male' : 'female';
            await createPerson(firstNames[42 + (i * 4 + j) * 2 + k], 'Rossi', g4Gender, 2015,
              g3Gender === 'male' ? g3Child.id : g3Spouse.id,
              g3Gender === 'female' ? g3Child.id : g3Spouse.id
            );
          }
        }
      }

      console.log(`Generati ${personCount} membri della stirpe.`);
      setGenerationProgress(personCount);
      // Wait a bit to show completion
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || 'Errore durante la generazione dei dati.');
      handleFirestoreError(err, OperationType.CREATE, 'people');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('public');
  };

  const handleSavePerson = async (personData: Partial<Person>) => {
    try {
      if (personData.id) {
        const { id, ...data } = personData;
        await updateDoc(doc(db, 'people', id), data);
      } else {
        await addDoc(collection(db, 'people'), personData);
      }
      setEditingPerson(null);
    } catch (error) {
      handleFirestoreError(error, personData.id ? OperationType.UPDATE : OperationType.CREATE, 'people');
    }
  };

  const handleQuickAddChild = (parent: Person) => {
    setEditingPerson({
      lastName: parent.lastName,
      fatherId: parent.gender === 'male' ? parent.id : undefined,
      motherId: parent.gender === 'female' ? parent.id : undefined,
    });
  };

  const handleQuickAddSpouse = (person: Person) => {
    setEditingPerson({
      lastName: person.lastName,
      spouseIds: [person.id],
    });
  };

  const handleDeletePerson = async (id: string) => {
    if (window.confirm('Sei sicuro di voler eliminare questa persona?')) {
      try {
        await deleteDoc(doc(db, 'people', id));
        setEditingPerson(null);
        setSelectedPerson(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `people/${id}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fdfcf9] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5a5a40]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdfcf9] text-slate-900 font-sans selection:bg-[#5a5a40]/10">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#5a5a40] p-2.5 rounded-xl shadow-lg shadow-[#5a5a40]/20">
              <TreePine className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 serif">
                Archivio Genealogico
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">Storia di Famiglia</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                <div className="px-3 py-2 flex items-center gap-2 text-slate-400 border-r border-slate-200 mr-1">
                  {isAdmin ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Users className="w-4 h-4" />
                  )}
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">
                    {isAdmin ? 'Admin' : 'Ospite'}
                  </span>
                </div>
                <button
                  onClick={() => setView('public')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    view === 'public' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Esplora
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setView('admin')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      view === 'admin' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Gestisci
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 bg-[#5a5a40] hover:bg-[#4a4a30] text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-[#5a5a40]/20 active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                Accedi
              </button>
            )}

            {user && (
              <button
                onClick={handleLogout}
                className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                title="Esci"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Main Content Area */}
          <div className={`${(view === 'admin' || selectedPerson) ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-8`}>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h2 className="text-4xl font-bold text-slate-900 serif">
                  {view === 'admin' ? 'Pannello di Controllo' : 'L\'Albero della Vita'}
                </h2>
                <p className="text-slate-500 mt-2 max-w-xl">
                  {view === 'admin' 
                    ? 'Organizza la struttura famigliare, aggiungi nuovi rami e documenta le generazioni.' 
                    : 'Naviga tra le generazioni per scoprire le radici della nostra famiglia.'}
                </p>
              </div>
              {view === 'admin' && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleClearAll}
                    disabled={isClearing || isGenerating}
                    className={`bg-rose-50 hover:bg-rose-100 text-rose-600 px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap ${(isClearing || isGenerating) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isClearing ? (
                      <div className="w-5 h-5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                    {isClearing ? 'Eliminazione...' : 'Svuota Stirpe'}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Vuoi caricare i dati demo? Questo aggiungerà circa 60 nuovi membri alla stirpe.')) {
                        addTemplateData();
                      }
                    }}
                    disabled={isGenerating || isClearing}
                    className={`bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all active:scale-95 whitespace-nowrap ${(isGenerating || isClearing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isGenerating ? (
                      <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Database className="w-5 h-5" />
                    )}
                    {isGenerating 
                      ? `Generazione (${generationProgress}/74)...` 
                      : people.length > 0 
                        ? 'Aggiungi altri 70' 
                        : 'Carica Stirpe Massiva (70)'}
                  </button>
                  <button
                    onClick={() => setEditingPerson({})}
                    className="bg-[#5a5a40] hover:bg-[#4a4a30] text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-xl shadow-[#5a5a40]/20 transition-all active:scale-95 whitespace-nowrap"
                  >
                    <Plus className="w-5 h-5" />
                    Nuovo Membro
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <Info className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                  {error.includes('verifica') && (
                    <button 
                      onClick={async () => {
                        if (auth.currentUser) {
                          await auth.currentUser.reload();
                          const isAdminUser = auth.currentUser.email === 'dennisbottari@gmail.com' && auth.currentUser.emailVerified;
                          setIsAdmin(isAdminUser);
                          if (isAdminUser) setError(null);
                        }
                      }}
                      className="text-xs bg-rose-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-rose-700 transition-all active:scale-95"
                    >
                      Riprova Verifica
                    </button>
                  )}
                </div>
                <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg transition-all ml-4">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="h-[750px] relative group">
              <div className="absolute inset-0 bg-white/40 rounded-3xl border border-slate-200 -z-10 blur-xl group-hover:blur-2xl transition-all duration-500" />
              <FamilyTree 
                people={people} 
                onSelectPerson={(p) => view === 'admin' ? setEditingPerson(p) : setSelectedPerson(p)} 
              />
              
              {/* Floating Controls Hint */}
              <div className="absolute top-6 left-6 bg-white/90 backdrop-blur px-4 py-2 rounded-full border border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-400 shadow-sm pointer-events-none">
                Usa il mouse per zoom e trascinamento
              </div>
            </div>
          </div>

          {/* Sidebar Area */}
          <AnimatePresence mode="wait">
            {(view === 'admin' || selectedPerson) && (
              <motion.div 
                key={selectedPerson?.id || 'admin-sidebar'}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="lg:col-span-4 space-y-8"
              >
                {selectedPerson ? (
                  <div className="bg-white p-0 rounded-[2.5rem] border border-slate-200 shadow-sm sticky top-28 overflow-hidden flex flex-col">
                    {/* Profile Header with Photo */}
                    <div className="relative h-64 bg-slate-100 overflow-hidden">
                      {selectedPerson.photoUrl ? (
                        <img 
                          src={selectedPerson.photoUrl} 
                          alt={`${selectedPerson.firstName} ${selectedPerson.lastName}`} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${
                          selectedPerson.gender === 'male' ? 'bg-blue-50 text-blue-200' : 'bg-rose-50 text-rose-200'
                        }`}>
                          <Users className="w-24 h-24" />
                        </div>
                      )}
                      
                      {/* Close Button */}
                      <button 
                        onClick={() => setSelectedPerson(null)}
                        className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur hover:bg-white rounded-full transition-all shadow-sm group"
                      >
                        <X className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
                      </button>

                      {/* Status Badge */}
                      <div className="absolute bottom-4 left-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm ${
                          selectedPerson.deathDate 
                            ? 'bg-rose-500 text-white' 
                            : 'bg-emerald-500 text-white'
                        }`}>
                          {selectedPerson.deathDate ? 'In Memoria' : 'Vivente'}
                        </span>
                      </div>
                    </div>

                    <div className="p-8 space-y-8">
                      <div>
                        <h3 className="text-4xl font-bold text-slate-900 serif mb-1 leading-tight">
                          {selectedPerson.firstName} {selectedPerson.lastName}
                        </h3>
                        <p className="text-[#5a5a40] text-sm font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {selectedPerson.birthDate ? new Date(selectedPerson.birthDate).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Data ignota'} 
                          {selectedPerson.deathDate ? ` — ${new Date(selectedPerson.deathDate).toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}
                        </p>
                      </div>

                      <div className="space-y-8">
                        <section>
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Users className="w-3 h-3" /> Legami Familiari
                          </h4>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 flex items-center gap-4">
                              <div className="bg-white p-2.5 rounded-xl shadow-sm">
                                <Users className="w-5 h-5 text-slate-400" />
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Genitori</p>
                                <div className="flex flex-col">
                                  <span className="text-sm font-semibold text-slate-700">
                                    {people.find(p => p.id === selectedPerson.fatherId)?.firstName || '—'} (P)
                                  </span>
                                  <span className="text-sm font-semibold text-slate-700">
                                    {people.find(p => p.id === selectedPerson.motherId)?.firstName || '—'} (M)
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {selectedPerson.spouseIds && selectedPerson.spouseIds.length > 0 && (
                              <div className="p-5 bg-rose-50/50 rounded-[1.5rem] border border-rose-100 flex items-center gap-4">
                                <div className="bg-white p-2.5 rounded-xl shadow-sm">
                                  <Heart className="w-5 h-5 text-rose-400" />
                                </div>
                                <div>
                                  <p className="text-[10px] text-rose-400 uppercase font-bold mb-0.5">Coniuge</p>
                                  <span className="text-sm font-bold text-rose-900">
                                    {people.find(p => p.id === selectedPerson.spouseIds?.[0])?.firstName} {people.find(p => p.id === selectedPerson.spouseIds?.[0])?.lastName}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </section>

                        {selectedPerson.bio && (
                          <section className="bg-[#5a5a40]/5 p-6 rounded-[2rem] border border-[#5a5a40]/10">
                            <h4 className="text-[10px] font-bold text-[#5a5a40] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                              <BookOpen className="w-3 h-3" /> Frammenti di Storia
                            </h4>
                            <p className="text-slate-700 leading-relaxed serif text-xl italic opacity-90">
                              "{selectedPerson.bio}"
                            </p>
                          </section>
                        )}

                        {isAdmin && view === 'admin' && (
                          <div className="pt-6 border-t border-slate-100 flex flex-wrap gap-3">
                            <button 
                              onClick={() => handleQuickAddChild(selectedPerson)}
                              className="flex-1 bg-slate-900 text-white text-xs py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/10"
                            >
                              <Baby className="w-4 h-4" />
                              Aggiungi Figlio
                            </button>
                            <button 
                              onClick={() => handleQuickAddSpouse(selectedPerson)}
                              className="flex-1 bg-rose-600 text-white text-xs py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-rose-700 transition-all active:scale-95 shadow-lg shadow-rose-600/10"
                            >
                              <Heart className="w-4 h-4" />
                              Aggiungi Coniuge
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 sticky top-28">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-900 mb-6 flex items-center gap-2 serif text-xl">
                        <Users className="w-6 h-6 text-[#5a5a40]" />
                        Membri Famiglia
                      </h3>
                      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {people.sort((a, b) => a.firstName.localeCompare(b.firstName)).map(p => (
                          <button
                            key={p.id}
                            onClick={() => setEditingPerson(p)}
                            className="w-full text-left p-3 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group flex items-center gap-4"
                          >
                            <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
                              {p.photoUrl ? (
                                <img src={p.photoUrl} alt={p.firstName} className="w-full h-full object-cover" />
                              ) : (
                                <div className={`w-full h-full flex items-center justify-center ${
                                  p.gender === 'male' ? 'bg-blue-50 text-blue-200' : 'bg-rose-50 text-rose-200'
                                }`}>
                                  <Users className="w-6 h-6" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-bold text-slate-800 group-hover:text-[#5a5a40] serif">{p.firstName} {p.lastName}</p>
                              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                {p.gender === 'male' ? 'Uomo' : 'Donna'}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#5a5a40] p-8 rounded-3xl text-white shadow-xl shadow-[#5a5a40]/20">
                      <h4 className="font-bold serif text-lg mb-2">Suggerimento Admin</h4>
                      <p className="text-white/70 text-sm leading-relaxed">
                        Puoi cliccare direttamente sui nomi nell'albero per modificarli velocemente o aggiungere relazioni.
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {editingPerson && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <PersonForm
                person={editingPerson}
                people={people}
                onSave={handleSavePerson}
                onCancel={() => setEditingPerson(null)}
                onDelete={handleDeletePerson}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">
            © 2026 Archivio Storico Famigliare. Tutti i diritti riservati.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
