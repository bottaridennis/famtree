import React, { useState } from 'react';
import { Person, Gender } from '../types';
import { X, Save, Trash2, UserPlus, Calendar, BookOpen, Heart, Users, Camera, Info } from 'lucide-react';

interface PersonFormProps {
  person?: Partial<Person>;
  people: Person[];
  onSave: (person: Partial<Person>) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

const PersonForm: React.FC<PersonFormProps> = ({ person, people, onSave, onCancel, onDelete }) => {
  const [formData, setFormData] = useState<Partial<Person>>({
    firstName: '',
    lastName: '',
    gender: 'male',
    spouseIds: [],
    birthDate: '',
    deathDate: '',
    bio: '',
    photoUrl: '',
    ...person
  });

  const [isDeceased, setIsDeceased] = useState(!!formData.deathDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    if (!isDeceased) {
      delete dataToSave.deathDate;
    }
    onSave(dataToSave);
  };

  const otherPeople = people.filter(p => p.id !== formData.id);

  return (
    <div className="bg-[#fdfcf9] p-0 rounded-[2.5rem] border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-[#5a5a40] p-3 rounded-2xl shadow-lg shadow-[#5a5a40]/20">
            <UserPlus className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-slate-900 serif leading-tight">
              {formData.id ? 'Modifica Membro' : 'Aggiungi alla Stirpe'}
            </h3>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-0.5">
              {formData.id ? 'Aggiorna i dettagli della persona' : 'Inserisci un nuovo ramo familiare'}
            </p>
          </div>
        </div>
        <button 
          onClick={onCancel} 
          className="p-2.5 hover:bg-slate-100 rounded-full transition-all active:scale-90 group"
        >
          <X className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        {/* Profile & Identity Section */}
        <section className="space-y-6">
          <div className="flex items-start gap-8">
            {/* Avatar Placeholder */}
            <div className="relative group">
              <div className="w-32 h-32 rounded-[2rem] bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 overflow-hidden transition-all group-hover:border-[#5a5a40]/40 group-hover:bg-slate-50">
                {formData.photoUrl ? (
                  <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Camera className="w-8 h-8 text-slate-300" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Foto URL</span>
                  </>
                )}
              </div>
              <input 
                type="text"
                placeholder="https://..."
                value={formData.photoUrl || ''}
                onChange={e => setFormData({ ...formData, photoUrl: e.target.value })}
                className="absolute -bottom-2 -right-2 w-40 p-2 text-[10px] bg-white border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-[#5a5a40]/20 outline-none opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>

            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                  <input
                    required
                    type="text"
                    placeholder="es. Giovanni"
                    value={formData.firstName}
                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#5a5a40]/5 focus:border-[#5a5a40] outline-none transition-all text-slate-900 font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cognome</label>
                  <input
                    required
                    type="text"
                    placeholder="es. Rossi"
                    value={formData.lastName}
                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#5a5a40]/5 focus:border-[#5a5a40] outline-none transition-all text-slate-900 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Genere</label>
                <div className="flex gap-2 p-1.5 bg-slate-100/50 rounded-2xl">
                  {(['male', 'female', 'other'] as Gender[]).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData({ ...formData, gender: g })}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold capitalize transition-all flex items-center justify-center gap-2 ${
                        formData.gender === g 
                          ? 'bg-white shadow-md text-[#5a5a40]' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {g === 'male' ? 'Uomo' : g === 'female' ? 'Donna' : 'Altro'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline Section */}
        <section className="space-y-6 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100">
          <div className="flex justify-between items-center">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#5a5a40]" /> Cronologia di Vita
            </h4>
            <label className="flex items-center gap-2 cursor-pointer group">
              <span className="text-[10px] font-bold text-slate-400 uppercase group-hover:text-slate-600 transition-colors">Defunto</span>
              <div 
                onClick={() => setIsDeceased(!isDeceased)}
                className={`w-10 h-5 rounded-full transition-all relative ${isDeceased ? 'bg-rose-400' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isDeceased ? 'left-6' : 'left-1'}`} />
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 ml-1">Data di Nascita</label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.birthDate || ''}
                  onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#5a5a40]/5 focus:border-[#5a5a40] outline-none transition-all text-slate-900"
                />
              </div>
            </div>
            {isDeceased && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-xs font-bold text-slate-500 ml-1">Data di Decesso</label>
                <input
                  type="date"
                  value={formData.deathDate || ''}
                  onChange={e => setFormData({ ...formData, deathDate: e.target.value })}
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-rose-500/5 focus:border-rose-400 outline-none transition-all text-slate-900"
                />
              </div>
            )}
          </div>
        </section>

        {/* Lineage Section */}
        <section className="space-y-6">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Users className="w-4 h-4 text-[#5a5a40]" /> Legami e Discendenza
          </h4>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 ml-1">Padre</label>
              <select
                value={formData.fatherId || ''}
                onChange={e => setFormData({ ...formData, fatherId: e.target.value || undefined })}
                className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#5a5a40]/5 focus:border-[#5a5a40] outline-none transition-all text-slate-900 appearance-none cursor-pointer"
              >
                <option value="">Nessuno</option>
                {otherPeople.filter(p => p.gender === 'male').map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 ml-1">Madre</label>
              <select
                value={formData.motherId || ''}
                onChange={e => setFormData({ ...formData, motherId: e.target.value || undefined })}
                className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#5a5a40]/5 focus:border-[#5a5a40] outline-none transition-all text-slate-900 appearance-none cursor-pointer"
              >
                <option value="">Nessuno</option>
                {otherPeople.filter(p => p.gender === 'female').map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-2">
              <Heart className="w-3 h-3 text-rose-400" /> Coniuge / Partner
            </label>
            <select
              value={formData.spouseIds?.[0] || ''}
              onChange={e => setFormData({ ...formData, spouseIds: e.target.value ? [e.target.value] : [] })}
              className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-[#5a5a40]/5 focus:border-[#5a5a40] outline-none transition-all text-slate-900 appearance-none cursor-pointer"
            >
              <option value="">Nessuno</option>
              {otherPeople.map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Biography Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#5a5a40]" /> Memorie e Note
            </h4>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 italic">
              <Info className="w-3 h-3" />
              <span>La storia di una vita</span>
            </div>
          </div>
          <textarea
            rows={4}
            placeholder="Racconta brevemente la storia di questa persona, i suoi successi, le sue passioni..."
            value={formData.bio || ''}
            onChange={e => setFormData({ ...formData, bio: e.target.value })}
            className="w-full p-5 bg-white border border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-[#5a5a40]/5 focus:border-[#5a5a40] outline-none transition-all serif italic text-lg text-slate-700 leading-relaxed"
          />
        </section>
      </form>

      {/* Footer Actions */}
      <div className="px-8 py-6 border-t border-slate-100 bg-white/50 backdrop-blur-sm flex gap-4">
        {formData.id && onDelete && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Sei sicuro di voler eliminare questo membro?')) {
                onDelete(formData.id!);
              }
            }}
            className="p-4 text-rose-500 hover:bg-rose-50 rounded-[1.5rem] transition-all border border-rose-100 active:scale-95 group"
            title="Elimina"
          >
            <Trash2 className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
        )}
        <button
          onClick={handleSubmit}
          className="flex-1 bg-[#5a5a40] hover:bg-[#4a4a30] text-white py-4 rounded-[1.5rem] font-bold flex items-center justify-center gap-3 shadow-xl shadow-[#5a5a40]/20 transition-all active:scale-[0.98] group"
        >
          <Save className="w-5 h-5 group-hover:rotate-12 transition-transform" />
          <span className="text-lg">Salva nella Storia</span>
        </button>
      </div>
    </div>
  );
};

export default PersonForm;
