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
    statut: 'en_attente' as Reclamation['statut'], montantReclame: '', description: '',
    dateEngagementFournisseur: ''
  });
  const [regulFormId, setRegulFormId] = useState<string | null>(null);
  const [regulForm, setRegulForm] = useState({ montant: '', date: new Date().toISOString().slice(0, 10), description: '' });

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
    setForm({ moisDebut: '', moisFin: '', dateCreation: new Date().toISOString().slice(0, 10), statut: 'en_attente', montantReclame: '', description: '', dateEngagementFournisseur: '' });
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
      description: r.description,
      dateEngagementFournisseur: r.dateEngagementFournisseur ?? ''
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
        description: form.description,
        dateEngagementFournisseur: form.dateEngagementFournisseur || undefined
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

  function handleExportCSV() {
    const STATUT_LABELS: Record<string, string> = {
      en_cours: 'En cours', en_attente: 'En attente', soldee: 'Soldee'
    };
    const fmtEur = (n: number) => n.toFixed(2).replace('.', ',');
    const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const esc = (v: string) => /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

    const header = ['Reference', 'Periode debut', 'Periode fin', 'Reclame', 'Percu', 'Reste', 'Statut', 'Engagement ORPEC', 'Jours retard'];
    const rows = [...reclamations]
      .sort((a, b) => a.reference.localeCompare(b.reference))
      .map(r => {
        const percu = getPercuForReclamation(r.id);
        const reste = r.montantReclame - percu;
        const retard = r.dateEngagementFournisseur && r.statut !== 'soldee'
          ? joursSince(r.dateEngagementFournisseur) : 0;
        return [
          r.reference,
          r.moisDebut,
          r.moisFin,
          fmtEur(r.montantReclame),
          fmtEur(percu),
          fmtEur(reste),
          STATUT_LABELS[r.statut] ?? r.statut,
          fmtDate(r.dateEngagementFournisseur),
          retard > 0 ? String(retard) : ''
        ].map(c => esc(String(c))).join(';');
      });

    const BOM = String.fromCharCode(0xFEFF);
    const csv = BOM + [header.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reclamations_repartix_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function startRegul(reclamId: string) {
    setRegulForm({ montant: '', date: new Date().toISOString().slice(0, 10), description: '' });
    setRegulFormId(reclamId);
  }

  async function handleRegulSubmit(e: React.FormEvent, reclamId: string) {
    e.preventDefault();
    const montant = parseFloat(regulForm.montant);
    if (isNaN(montant)) return;
    try {
      await api.addRegularisation({
        date: regulForm.date,
        montant,
        annee: parseInt(regulForm.date.slice(0, 4), 10),
        description: regulForm.description || 'Versement recu',
        reclamationId: reclamId,
        type: 'VERSEMENT_RECU'
      });
      setRegulFormId(null);
      loadAllData();
    } catch (err) {
      console.error('Erreur ajout regularisation:', err);
    }
  }

  if (loading) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <p className="text-slate-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: '#1B6B40', borderRadius: '4px' }}>R</div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              RepartiX
              <span className="text-slate-400 font-medium text-base ml-1">| Alliance Healthcare</span>
            </h1>
          </div>
          <p className="text-slate-500 text-xs">Pilotage des reclamations remises repartiteurs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={reclamations.length === 0}
            className="no-print px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Exporter CSV
          </button>
          <button
            onClick={() => alert('Fonctionnalite a venir')}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 transition-all shadow-sm"
          >
            Analyse detaillee
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="px-3 py-2 text-xs font-semibold text-white rounded transition-all"
            style={{ backgroundColor: '#1B6B40' }}
          >
            + Nouvelle reclamation
          </button>
        </div>
      </header>

      {/* Formulaire CRUD */}
      {showForm && (
        <div className="bg-white border border-slate-200 p-5 mb-6" style={{ borderRadius: '4px' }}>
          <h3 className="text-sm font-bold text-slate-800 mb-3">{editId ? 'Modifier la reclamation' : 'Nouvelle reclamation'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Mois debut</label>
              <input type="month" value={form.moisDebut} onChange={e => setForm({ ...form, moisDebut: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Mois fin</label>
              <input type="month" value={form.moisFin} onChange={e => setForm({ ...form, moisFin: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date creation</label>
              <input type="date" value={form.dateCreation} onChange={e => setForm({ ...form, dateCreation: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Statut</label>
              <select value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value as Reclamation['statut'] })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded">
                <option value="en_attente">En attente</option>
                <option value="en_cours">En cours</option>
                <option value="soldee">Soldee</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Montant reclame</label>
              <input type="number" step="0.01" value={form.montantReclame} onChange={e => setForm({ ...form, montantReclame: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" required />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Description</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" placeholder="Optionnel" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Engagement ORPEC</label>
              <input type="date" value={form.dateEngagementFournisseur} onChange={e => setForm({ ...form, dateEngagementFournisseur: e.target.value })}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" placeholder="Optionnel" />
            </div>
            <div className="col-span-full flex gap-2 mt-1">
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white rounded" style={{ backgroundColor: '#1B6B40' }}>
                {editId ? 'Modifier' : 'Creer'}
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded hover:bg-slate-50">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Principal + Alerte */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Creance principale */}
        <div className="lg:col-span-2 bg-slate-900 p-6 text-white relative overflow-hidden" style={{ borderRadius: '4px' }}>
          <div className="relative z-10">
            <p className="text-slate-400 text-xs font-medium mb-1">Reste a percevoir total</p>
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="text-5xl font-bold tracking-tighter data-val">{formatEuros(resteAPercevoir)}</h2>
              {totalReclame > 0 && (
                <span className="px-2 py-1 text-[10px] font-bold rounded-full border data-val"
                  style={{ backgroundColor: 'rgba(27,107,64,0.3)', color: '#6EE7B7', borderColor: 'rgba(27,107,64,0.5)' }}>
                  Recouvrement {recouvrementPct}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-slate-800 pt-4">
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Total reclame</p>
                <p className="text-xl font-bold text-slate-200 data-val">{formatEuros(totalReclame)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Deja percu</p>
                <p className="text-xl font-bold data-val" style={{ color: '#6EE7B7' }}>{formatEuros(totalPercu)}</p>
              </div>
              <div title="Non contestable (palier generiques)">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Ecart structurel</p>
                <p className="text-xl font-bold text-slate-400 data-val">{formatEuros(cumul?.ecartStructurel ?? 0)}</p>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(27,107,64,0.08)' }}></div>
        </div>

        {/* Alerte periodes non couvertes */}
        {periodeNonCouverte ? (
          <div className="border p-5 flex flex-col justify-between" style={{ backgroundColor: '#FFF5F5', borderColor: '#FECACA', borderRadius: '4px' }}>
            <div>
              <div className="flex items-center gap-2 mb-3" style={{ color: '#991B1B' }}>
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
              <div className="text-2xl font-bold mb-3 data-val" style={{ color: '#991B1B' }}>&asymp; {formatEuros(montantNonCouvert)}</div>
              <button
                onClick={() => alert('Fonctionnalite a venir')}
                className="w-full py-2.5 text-white font-bold text-xs transition-colors"
                style={{ backgroundColor: '#991B1B', borderRadius: '4px' }}
              >
                Creer reclamation
              </button>
            </div>
          </div>
        ) : (
          <div className="border p-5 flex flex-col justify-center items-center" style={{ backgroundColor: '#E8F5EE', borderColor: '#C8E8D5', borderRadius: '4px' }}>
            <div className="mb-2" style={{ color: '#1B6B40' }}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-bold text-sm" style={{ color: '#1B6B40' }}>Toutes les periodes sont couvertes</p>
            <p className="text-xs text-slate-500 mt-1">Aucun ecart non reclame</p>
          </div>
        )}
      </div>

      {/* Dossiers de reclamation */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
          Dossiers de reclamation
          {reclamActives.length > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded"
              style={{ backgroundColor: '#E8F5EE', color: '#1B6B40' }}>
              {reclamActives.length} actif{reclamActives.length > 1 ? 's' : ''}
            </span>
          )}
        </h3>

        {reclamActives.length === 0 && reclamSoldees.length === 0 && (
          <div className="bg-white border border-slate-200 p-8 text-center" style={{ borderRadius: '4px' }}>
            <p className="text-slate-500 text-sm">Aucune reclamation enregistree.</p>
            <p className="text-slate-400 text-xs mt-1">Cliquez sur "+ Nouvelle reclamation" pour creer un dossier.</p>
          </div>
        )}

        {reclamActives.map(reclam => {
          const percu = getPercuForReclamation(reclam.id);
          const reste = reclam.montantReclame - percu;
          const pct = reclam.montantReclame > 0 ? Math.round((percu / reclam.montantReclame) * 100) : 0;
          const regulsLiees = regularisations.filter(r => r.reclamationId === reclam.id);
          const jours = joursSince(reclam.dateCreation);
          const isStale = reclam.statut === 'en_attente' && jours > 30;
          const joursRetardEngagement = reclam.dateEngagementFournisseur && reclam.statut !== 'soldee'
            ? joursSince(reclam.dateEngagementFournisseur)
            : null;
          const enRetardEngagement = joursRetardEngagement !== null && joursRetardEngagement > 0;
          const isEnCours = reclam.statut === 'en_cours';
          const yearShort = reclam.reference.match(/#(\d{4})/)?.[1]?.slice(2) || '??';

          return (
            <div key={reclam.id} className="bg-white border-2 overflow-hidden"
              style={{ borderColor: isEnCours ? '#C8E8D5' : '#FECACA', borderRadius: '4px' }}>
              <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 flex items-center justify-center text-white font-bold"
                      style={{ backgroundColor: isEnCours ? '#1B6B40' : '#991B1B', borderRadius: '4px' }}>
                      {yearShort}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base mb-0.5">Reclamation {reclam.reference}</h4>
                      <p className="text-xs text-slate-600">
                        {formatMoisCourt(reclam.moisDebut)} &rarr; {formatMoisCourt(reclam.moisFin)}
                        <span className="text-slate-400 ml-1">(<span className="data-val">{countMois(reclam.moisDebut, reclam.moisFin)}</span> mois)</span>
                        <span className="text-slate-400 ml-1">&bull; <span className="data-val">{new Date(reclam.dateCreation).toLocaleDateString('fr-FR')}</span></span>
                      </p>
                      {isStale && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded w-fit">
                          <span className="animate-pulse">&#9679;</span> Relance necessaire (<span className="data-val">{jours}</span>j)
                        </div>
                      )}
                      {enRetardEngagement && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded w-fit"
                          title={`Engagement ORPEC du ${new Date(reclam.dateEngagementFournisseur!).toLocaleDateString('fr-FR')} depasse`}>
                          &#9888; Retard <span className="data-val">{joursRetardEngagement}</span> jour{joursRetardEngagement! > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2 py-1 text-[10px] font-bold rounded mb-1 uppercase"
                      style={isEnCours
                        ? { backgroundColor: '#E8F5EE', color: '#1B6B40' }
                        : { backgroundColor: '#FEF2F2', color: '#B91C1C' }}>
                      {isEnCours ? 'En cours' : 'En attente'}
                    </span>
                    <div className="text-2xl font-bold data-val" style={{ color: isEnCours ? '#1B6B40' : '#991B1B' }}>{formatEuros(reste)}</div>
                  </div>
                </div>

                {/* Infos financieres */}
                <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
                  <div className="bg-slate-50 p-2" style={{ borderRadius: '4px' }}>
                    <p className="text-slate-500 mb-0.5">Reclame</p>
                    <p className="font-bold text-slate-900 data-val">{formatEuros(reclam.montantReclame)}</p>
                  </div>
                  <div className="p-2" style={{ backgroundColor: percu > 0 ? '#E8F5EE' : '#F1F5F9', borderRadius: '4px' }}>
                    <p className="text-slate-500 mb-0.5">Percu</p>
                    <p className="font-bold data-val" style={{ color: percu > 0 ? '#1B6B40' : '#94A3B8' }}>{formatEuros(percu)}</p>
                  </div>
                  <div className="p-2" style={{ backgroundColor: pct > 0 ? '#E8F5EE' : '#FEF2F2', borderRadius: '4px' }}>
                    <p className="text-slate-500 mb-0.5">Recouvrement</p>
                    <p className="font-bold data-val" style={{ color: pct > 0 ? '#1B6B40' : '#991B1B' }}>{pct}%</p>
                  </div>
                </div>

                {/* Barre progression */}
                <div className="mb-3">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: isEnCours ? '#1B6B40' : '#991B1B' }}></div>
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
                        <div key={reg.id} className="p-2 text-xs border" style={{ backgroundColor: '#E8F5EE', borderColor: '#C8E8D5', borderRadius: '4px' }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold" style={{ color: '#1B6B40' }}>{reg.description || 'Regularisation'}</p>
                              <p className="text-slate-500 data-val">{new Date(reg.date).toLocaleDateString('fr-FR')}</p>
                            </div>
                            <p className="font-bold data-val" style={{ color: '#1B6B40' }}>+{formatEuros(reg.montant)}</p>
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
                    className="py-1.5 text-xs font-semibold border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                  >
                    Courrier
                  </button>
                  <button
                    onClick={() => alert('Fonctionnalite a venir')}
                    className="py-1.5 text-xs font-semibold text-white rounded transition-colors"
                    style={{ backgroundColor: isEnCours ? '#1A2332' : '#991B1B' }}
                  >
                    Relancer
                  </button>
                  <button
                    onClick={() => regulFormId === reclam.id ? setRegulFormId(null) : startRegul(reclam.id)}
                    className="py-1.5 text-xs font-semibold border rounded transition-colors"
                    style={{ color: '#1B6B40', backgroundColor: '#E8F5EE', borderColor: '#C8E8D5' }}
                  >
                    + Regul.
                  </button>
                  <button
                    onClick={() => startEdit(reclam)}
                    className="py-1.5 text-xs font-semibold border border-slate-200 rounded hover:bg-slate-50 transition-colors"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(reclam.id)}
                    className="py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors"
                  >
                    Supprimer
                  </button>
                </div>

                {/* Mini-formulaire + Regul. */}
                {regulFormId === reclam.id && (
                  <form onSubmit={e => handleRegulSubmit(e, reclam.id)} className="mt-3 border p-3" style={{ backgroundColor: '#E8F5EE', borderColor: '#C8E8D5', borderRadius: '4px' }}>
                    <p className="text-xs font-bold text-slate-700 mb-2">Enregistrer une regularisation recue</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Montant (EUR)</label>
                        <input type="number" step="0.01" value={regulForm.montant} autoFocus
                          onChange={e => setRegulForm({ ...regulForm, montant: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" required />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Date</label>
                        <input type="date" value={regulForm.date}
                          onChange={e => setRegulForm({ ...regulForm, date: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" required />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Description</label>
                        <input type="text" value={regulForm.description}
                          onChange={e => setRegulForm({ ...regulForm, description: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" placeholder="Optionnel" />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button type="submit" className="px-3 py-1.5 text-xs font-semibold text-white rounded" style={{ backgroundColor: '#1B6B40' }}>
                        Ajouter
                      </button>
                      <button type="button" onClick={() => setRegulFormId(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded hover:bg-white">
                        Annuler
                      </button>
                    </div>
                  </form>
                )}
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
                  <div key={reclam.id} className="bg-white border p-3" style={{ borderColor: '#C8E8D5', borderRadius: '4px' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3">
                        <div className="w-8 h-8 flex items-center justify-center text-white font-bold text-sm"
                          style={{ backgroundColor: '#1B6B40', borderRadius: '4px' }}>
                          {yearShort}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">Reclamation {reclam.reference}</h4>
                          <p className="text-xs text-slate-600">
                            {formatMoisCourt(reclam.moisDebut)} &rarr; {formatMoisCourt(reclam.moisFin)}
                            <span className="text-slate-400 ml-1">(<span className="data-val">{countMois(reclam.moisDebut, reclam.moisFin)}</span> mois)</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className="text-lg font-bold data-val" style={{ color: '#1B6B40' }}>{formatEuros(reclam.montantReclame)}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Soldee</p>
                        </div>
                        <button
                          onClick={() => handleDelete(reclam.id)}
                          className="p-1.5 text-xs text-red-400 hover:text-red-600 border border-transparent hover:border-red-200 rounded transition-colors"
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
