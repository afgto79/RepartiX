import { useEffect, useState } from 'react';
import { api, Reclamation, Regularisation, AnalyseRemise, CumulResponse } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';

const MOIS_COURTS = ['Jan.', 'Fev.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Aout', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

function formatMoisCourt(moisKey: string): string {
  const [annee, mois] = moisKey.split('-');
  return `${MOIS_COURTS[parseInt(mois) - 1]} ${annee}`;
}

function joursSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function getMoisRange(debut: string, fin: string): string[] {
  const result: string[] = [];
  let current = debut;
  while (current <= fin) {
    result.push(current);
    const [y, m] = current.split('-').map(Number);
    current = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return result;
}

function countMois(debut: string, fin: string): number {
  return getMoisRange(debut, fin).length;
}

export function DashboardBilan() {
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [regularisations, setRegularisations] = useState<Regularisation[]>([]);
  const [analyses, setAnalyses] = useState<AnalyseRemise[]>([]);
  const [cumul, setCumul] = useState<CumulResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    moisDebut: '', moisFin: '', dateCreation: new Date().toISOString().slice(0, 10),
    statut: 'en_attente' as Reclamation['statut'], montantReclame: '', description: ''
  });

  useEffect(() => { loadAllData(); }, []);

  async function loadAllData() {
    setLoading(true);
    try {
      const [reclams, reguls, cumulData, years] = await Promise.all([
        api.getReclamations(),
        api.getRegularisations(),
        api.getCumul(),
        api.getAnnees()
      ]);
      setReclamations(reclams);
      setRegularisations(reguls);
      setCumul(cumulData);

      const allAnalyses: AnalyseRemise[] = [];
      for (const year of years) {
        const dashboard = await api.getDashboard(year);
        allAnalyses.push(...dashboard.mois);
      }
      setAnalyses(allAnalyses);
    } catch (err) {
      console.error('Erreur chargement bilan:', err);
    } finally {
      setLoading(false);
    }
  }

  // --- Calculs KPI ---
  const totalReclame = reclamations.reduce((sum, r) => sum + r.montantReclame, 0);

  function getPercuForReclamation(reclamId: string): number {
    return regularisations
      .filter(r => r.reclamationId === reclamId)
      .reduce((sum, r) => sum + r.montant, 0);
  }

  const totalPercu = reclamations.reduce((sum, r) => sum + getPercuForReclamation(r.id), 0);
  const resteAPercevoir = totalReclame - totalPercu;
  const recouvrementPct = totalReclame > 0 ? Math.round((totalPercu / totalReclame) * 100) : 0;

  // --- Periodes non couvertes ---
  const moisRetard = analyses
    .filter(a => a.statut === 'RETARD')
    .map(a => a.mois);

  const moisCouverts = new Set<string>();
  for (const reclam of reclamations) {
    if (reclam.statut === 'soldee') continue;
    for (const m of getMoisRange(reclam.moisDebut, reclam.moisFin)) {
      moisCouverts.add(m);
    }
  }

  const moisNonCouverts = moisRetard.filter(m => !moisCouverts.has(m)).sort();
  const periodeNonCouverte = moisNonCouverts.length > 0
    ? { debut: moisNonCouverts[0], fin: moisNonCouverts[moisNonCouverts.length - 1], count: moisNonCouverts.length }
    : null;
  const montantNonCouvert = analyses
    .filter(a => moisNonCouverts.includes(a.mois))
    .reduce((sum, a) => sum + Math.abs(a.delta), 0);

  // --- Partition reclamations actives / soldees ---
  const reclamActives = reclamations
    .filter(r => r.statut !== 'soldee')
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));
  const reclamSoldees = reclamations
    .filter(r => r.statut === 'soldee')
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));

  // --- CRUD ---
  function resetForm() {
    setForm({ moisDebut: '', moisFin: '', dateCreation: new Date().toISOString().slice(0, 10), statut: 'en_attente', montantReclame: '', description: '' });
    setEditId(null);
    setShowForm(false);
  }

  function startEdit(r: Reclamation) {
    setForm({
      moisDebut: r.moisDebut,
      moisFin: r.moisFin,
      dateCreation: r.dateCreation,
      statut: r.statut,
      montantReclame: r.montantReclame.toString(),
      description: r.description
    });
    setEditId(r.id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = {
        moisDebut: form.moisDebut,
        moisFin: form.moisFin,
        dateCreation: form.dateCreation,
        statut: form.statut,
        montantReclame: parseFloat(form.montantReclame),
        description: form.description
      };
      if (editId) {
        await api.updateReclamation(editId, data);
      } else {
        await api.addReclamation(data);
      }
      resetForm();
      loadAllData();
    } catch (err) {
      console.error('Erreur sauvegarde reclamation:', err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette reclamation ?')) return;
    try {
      await api.deleteReclamation(id);
      loadAllData();
    } catch (err) {
      console.error('Erreur suppression:', err);
    }
  }

  if (loading) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-blue-200">R</div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              RepartiX
              <span className="text-slate-400 font-medium text-base ml-1">| Alliance Healthcare</span>
            </h1>
          </div>
          <p className="text-slate-500 text-xs">Pilotage des reclamations remises repartiteurs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Fonctionnalite a venir')}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            Analyse detaillee
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
          >
            + Nouvelle reclamation
          </button>
        </div>
      </header>

      {/* Formulaire CRUD */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-3">{editId ? 'Modifier la reclamation' : 'Nouvelle reclamation'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Mois debut</label>
              <input type="month" value={form.moisDebut} onChange={e => setForm({ ...form, moisDebut: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Mois fin</label>
              <input type="month" value={form.moisFin} onChange={e => setForm({ ...form, moisFin: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date creation</label>
              <input type="date" value={form.dateCreation} onChange={e => setForm({ ...form, dateCreation: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Statut</label>
              <select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value as Reclamation['statut'] })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg">
                <option value="en_attente">En attente</option>
                <option value="en_cours">En cours</option>
                <option value="soldee">Soldee</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Montant reclame</label>
              <input type="number" step="0.01" value={form.montantReclame} onChange={e => setForm({ ...form, montantReclame: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Description</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg" placeholder="Optionnel" />
            </div>
            <div className="col-span-full flex gap-2 mt-1">
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                {editId ? 'Modifier' : 'Creer'}
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Principal + Alerte */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Creance principale */}
        <div className="lg:col-span-2 bg-slate-900 rounded-2xl p-6 text-white relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <p className="text-slate-400 text-xs font-medium mb-1">Reste a percevoir total</p>
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="text-5xl font-bold tracking-tighter">{formatEuros(resteAPercevoir)}</h2>
              {totalReclame > 0 && (
                <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/30">
                  Recouvrement {recouvrementPct}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Total reclame</p>
                <p className="text-xl font-bold text-slate-200">{formatEuros(totalReclame)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Deja percu</p>
                <p className="text-xl font-bold text-emerald-400">{formatEuros(totalPercu)}</p>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl"></div>
        </div>

        {/* Alerte periodes non couvertes */}
        {periodeNonCouverte ? (
          <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-2 text-orange-700 mb-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-bold text-xs tracking-wide uppercase">Periodes non couvertes</span>
              </div>
              <p className="text-slate-700 font-bold text-base mb-1">
                {formatMoisCourt(periodeNonCouverte.debut)} &rarr; {formatMoisCourt(periodeNonCouverte.fin)}
              </p>
              <p className="text-slate-600 text-xs mb-3">
                {periodeNonCouverte.count} mois d'ecarts detectes sans reclamation active
              </p>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600 mb-3">&asymp; {formatEuros(montantNonCouvert)}</div>
              <button
                onClick={() => alert('Fonctionnalite a venir')}
                className="w-full py-2.5 bg-orange-600 text-white rounded-xl font-bold text-xs hover:bg-orange-700 transition-colors shadow-lg shadow-orange-200"
              >
                Creer reclamation
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-2xl p-5 flex flex-col justify-center items-center shadow-sm">
            <div className="text-emerald-600 mb-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-bold text-sm text-emerald-700">Toutes les periodes sont couvertes</p>
            <p className="text-xs text-slate-500 mt-1">Aucun ecart non reclame</p>
          </div>
        )}
      </div>

      {/* Dossiers de reclamation */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          Dossiers de reclamation
          {reclamActives.length > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-lg">
              {reclamActives.length} actif{reclamActives.length > 1 ? 's' : ''}
            </span>
          )}
        </h3>

        {reclamActives.length === 0 && reclamSoldees.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-slate-500 text-sm">Aucune reclamation enregistree.</p>
            <p className="text-slate-400 text-xs mt-1">Cliquez sur "+ Nouvelle reclamation" pour creer un dossier.</p>
          </div>
        )}

        {/* Cartes reclamations actives */}
        {reclamActives.map(reclam => {
          const percu = getPercuForReclamation(reclam.id);
          const reste = reclam.montantReclame - percu;
          const pct = reclam.montantReclame > 0 ? Math.round((percu / reclam.montantReclame) * 100) : 0;
          const regulsLiees = regularisations.filter(r => r.reclamationId === reclam.id);
          const jours = joursSince(reclam.dateCreation);
          const isStale = reclam.statut === 'en_attente' && jours > 30;
          const borderColor = reclam.statut === 'en_cours' ? 'border-blue-200' : 'border-red-200';
          const yearShort = reclam.reference.match(/#(\d{4})/)?.[1]?.slice(2) || '??';
          const statusColor = reclam.statut === 'en_cours'
            ? { bg: 'bg-blue-50', text: 'text-blue-700', numColor: 'text-blue-600', gradFrom: 'from-blue-500', gradTo: 'to-blue-600', barBg: 'bg-gradient-to-r from-blue-500 to-blue-600', btnBg: 'bg-slate-900 hover:bg-slate-800' }
            : { bg: 'bg-red-50', text: 'text-red-700', numColor: 'text-red-600', gradFrom: 'from-red-500', gradTo: 'to-red-600', barBg: 'bg-red-500', btnBg: 'bg-red-600 hover:bg-red-700 shadow-md shadow-red-200' };

          return (
            <div key={reclam.id} className={`bg-white border-2 ${borderColor} rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow`}>
              <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex gap-3">
                    <div className={`w-10 h-10 bg-gradient-to-br ${statusColor.gradFrom} ${statusColor.gradTo} rounded-lg flex items-center justify-center text-white font-bold shadow-md`}>
                      {yearShort}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base mb-0.5">Reclamation {reclam.reference}</h4>
                      <p className="text-xs text-slate-600">
                        {formatMoisCourt(reclam.moisDebut)} &rarr; {formatMoisCourt(reclam.moisFin)}
                        <span className="text-slate-400 ml-1">({countMois(reclam.moisDebut, reclam.moisFin)} mois)</span>
                        <span className="text-slate-400 ml-1">&bull; {new Date(reclam.dateCreation).toLocaleDateString('fr-FR')}</span>
                      </p>
                      {isStale && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded w-fit">
                          <span className="animate-pulse">&#9679;</span> Relance necessaire ({jours}j)
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-1 ${statusColor.bg} ${statusColor.text} text-[10px] font-bold rounded-md mb-1 uppercase`}>
                      {reclam.statut === 'en_cours' ? 'En cours' : 'En attente'}
                    </span>
                    <div className={`text-2xl font-bold ${statusColor.numColor}`}>{formatEuros(reste)}</div>
                  </div>
                </div>

                {/* Infos financieres */}
                <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
                  <div className="bg-slate-50 rounded-lg p-2">
                    <p className="text-slate-500 mb-0.5">Reclame</p>
                    <p className="font-bold text-slate-900">{formatEuros(reclam.montantReclame)}</p>
                  </div>
                  <div className={percu > 0 ? 'bg-emerald-50 rounded-lg p-2' : 'bg-slate-100 rounded-lg p-2'}>
                    <p className="text-slate-500 mb-0.5">Percu</p>
                    <p className={`font-bold ${percu > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{formatEuros(percu)}</p>
                  </div>
                  <div className={`${pct > 0 ? 'bg-blue-50' : 'bg-red-50'} rounded-lg p-2`}>
                    <p className="text-slate-500 mb-0.5">Recouvrement</p>
                    <p className={`font-bold ${pct > 0 ? 'text-blue-700' : 'text-red-700'}`}>{pct}%</p>
                  </div>
                </div>

                {/* Barre progression */}
                <div className="mb-3">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${statusColor.barBg}`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>

                {/* Regularisations liees */}
                {regulsLiees.length > 0 ? (
                  <details className="mb-3">
                    <summary className="text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-900 mb-2">
                      {regulsLiees.length} regularisation{regulsLiees.length > 1 ? 's' : ''} recue{regulsLiees.length > 1 ? 's' : ''} (cliquer pour details)
                    </summary>
                    <div className="space-y-1">
                      {regulsLiees.map(reg => (
                        <div key={reg.id} className="bg-emerald-50 rounded-lg p-2 text-xs border border-emerald-100">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-emerald-700">{reg.description || 'Regularisation'}</p>
                              <p className="text-slate-500">{new Date(reg.date).toLocaleDateString('fr-FR')}</p>
                            </div>
                            <p className="font-bold text-emerald-600">+{formatEuros(reg.montant)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="text-xs text-slate-500 italic mb-3 text-center py-2">Aucune regularisation recue</p>
                )}

                {/* Actions */}
                <div className="grid grid-cols-5 gap-2">
                  <button
                    onClick={() => alert('Fonctionnalite a venir')}
                    className="py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Courrier
                  </button>
                  <button
                    onClick={() => alert('Fonctionnalite a venir')}
                    className={`py-1.5 text-xs font-semibold text-white rounded-lg transition-colors ${statusColor.btnBg}`}
                  >
                    Relancer
                  </button>
                  <button
                    onClick={() => alert('Fonctionnalite a venir')}
                    className="py-1.5 text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    + Regul.
                  </button>
                  <button
                    onClick={() => startEdit(reclam)}
                    className="py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(reclam.id)}
                    className="py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Historique (soldees) */}
        {reclamSoldees.length > 0 && (
          <details className="group border-t border-slate-200 pt-3">
            <summary className="flex items-center justify-between cursor-pointer list-none text-slate-500 hover:text-slate-800 transition-colors">
              <span className="text-xs font-bold uppercase tracking-wider">Historique ({reclamSoldees.length} dossier{reclamSoldees.length > 1 ? 's' : ''} solde{reclamSoldees.length > 1 ? 's' : ''})</span>
              <svg className="w-4 h-4 transform group-open:rotate-180 transition-transform text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-3 space-y-3">
              {reclamSoldees.map(reclam => {
                const yearShort = reclam.reference.match(/#(\d{4})/)?.[1]?.slice(2) || '??';
                return (
                  <div key={reclam.id} className="bg-white border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                          {yearShort}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">Reclamation {reclam.reference}</h4>
                          <p className="text-xs text-slate-600">
                            {formatMoisCourt(reclam.moisDebut)} &rarr; {formatMoisCourt(reclam.moisFin)}
                            <span className="text-slate-400 ml-1">({countMois(reclam.moisDebut, reclam.moisFin)} mois)</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="text-lg font-bold text-emerald-600">{formatEuros(reclam.montantReclame)}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Soldee</p>
                        </div>
                        <button
                          onClick={() => handleDelete(reclam.id)}
                          className="p-1.5 text-xs text-red-400 hover:text-red-600 border border-transparent hover:border-red-200 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
