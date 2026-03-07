import { useEffect, useRef, useState } from 'react';
import { api, ReleveRaw, AnalyseRemise, Reclamation } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';

type Tab = 'decades' | 'mois';

function getMoisRange(debut: string, fin: string): string[] {
  const result: string[] = [];
  let cur = debut;
  while (cur <= fin) {
    result.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return result;
}

function ParsingBadge({ status }: { status: string }) {
  if (status === 'success') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700">OK</span>;
  if (status === 'partial') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">Partiel</span>;
  return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">Erreur</span>;
}

function StatusBadge({ statut }: { statut: string }) {
  if (statut === 'OK') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700">OK</span>;
  if (statut === 'EN_COURS') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">Incomplet</span>;
  return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">Retard</span>;
}

export function PageDonnees() {
  const [tab, setTab] = useState<Tab>('decades');
  const [releves, setReleves] = useState<ReleveRaw[]>([]);
  const [analyses, setAnalyses] = useState<AnalyseRemise[]>([]);
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [years, setYears] = useState<number[]>([new Date().getFullYear()]);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadAnalyses(); }, [annee]);

  async function loadAll() {
    setLoading(true);
    try {
      const [r, c, yearsList] = await Promise.all([
        api.getAllReleves(),
        api.getReclamations(),
        api.getAnnees()
      ]);
      setReleves(r);
      setReclamations(c);
      setYears(yearsList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadAnalyses() {
    try {
      const d = await api.getDashboard(annee);
      setAnalyses(d.mois);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMessage(null);
    try {
      const res = await api.uploadPDFs(Array.from(files));
      setMessage({ type: 'ok', text: `${res.imported} importé(s), ${res.duplicates} doublon(s)${res.errors.length ? `, ${res.errors.length} erreur(s)` : ''}` });
      await loadAll();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleScan() {
    setScanning(true);
    setMessage(null);
    try {
      const res = await api.scanFolder();
      setMessage({ type: 'ok', text: `${res.scanned} scanné(s), ${res.new} nouveau(x)` });
      await loadAll();
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setScanning(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette décade ?')) return;
    try {
      await api.deleteReleve(id);
      await loadAll();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleClearAll() {
    if (!confirm(`Supprimer toutes les décades importées (${releves.length}) ? Les réclamations ne seront pas affectées.`)) return;
    try {
      const count = await api.clearAllReleves();
      setMessage({ type: 'ok', text: `${count} décade(s) supprimée(s)` });
      await loadAll();
    } catch (err) {
      setMessage({ type: 'err', text: 'Erreur lors de la suppression' });
    }
  }

  // Mois couverts par une réclamation
  const moisCouverts = new Map<string, string>(); // moisKey → reference
  for (const r of reclamations) {
    for (const m of getMoisRange(r.moisDebut, r.moisFin)) {
      moisCouverts.set(m, r.reference);
    }
  }

  // Filtrer les releves par année sélectionnée (pour tab decades)
  const [filterAnneeDecades, setFilterAnneeDecades] = useState<number | 'toutes'>('toutes');
  const relevesFiltres = filterAnneeDecades === 'toutes'
    ? releves
    : releves.filter(r => r.annee === filterAnneeDecades);

  if (loading) return <div className="p-6 text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="p-6">
      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {(['decades', 'mois'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'decades' ? 'Décades' : 'Mois'}
          </button>
        ))}
      </div>

      {/* Tab Décades */}
      {tab === 'decades' && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <input ref={fileInputRef} type="file" multiple accept=".pdf" onChange={e => handleFiles(e.target.files)} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {uploading ? 'Import...' : 'Importer des décades'}
            </button>
            <button
              onClick={handleScan}
              disabled={scanning}
              className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:bg-slate-100 transition-colors"
            >
              {scanning ? 'Scan...' : 'Scanner le dossier réseau'}
            </button>
            <select
              value={filterAnneeDecades}
              onChange={e => setFilterAnneeDecades(e.target.value === 'toutes' ? 'toutes' : parseInt(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white"
            >
              <option value="toutes">Toutes les années</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs text-slate-400">{relevesFiltres.length} décade(s)</span>
            {releves.length > 0 && (
              <button
                onClick={handleClearAll}
                className="ml-auto px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Tout supprimer
              </button>
            )}

            {message && (
              <span className={`text-xs font-medium px-3 py-1.5 rounded-lg ${message.type === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {message.text}
              </span>
            )}
          </div>

          {/* Table décades */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Année</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mois</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Déc.</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">NET HT</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Remise abn</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Parsing</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {relevesFiltres.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-slate-400 text-sm">Aucune décade importée</td></tr>
                  )}
                  {relevesFiltres.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium">{r.annee}</td>
                      <td className="px-4 py-3 text-slate-600">{formatMoisLabel(`${r.annee}-${String(r.mois).padStart(2, '0')}`)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex w-6 h-6 items-center justify-center text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full">D{r.decade}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{formatEuros(r.totalNetHT)}</td>
                      <td className="px-4 py-3 text-right text-red-600">
                        {r.remiseAbnMargeHT !== null ? formatEuros(r.remiseAbnMargeHT) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3"><ParsingBadge status={r.parsingStatus} /></td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-slate-400 truncate block max-w-[160px]" title={r.source}>
                          {r.source.split('/').pop() ?? r.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(r.id)} className="text-[10px] text-red-400 hover:text-red-700 transition-colors">
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Mois */}
      {tab === 'mois' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={annee}
              onChange={e => setAnnee(parseInt(e.target.value))}
              className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs text-slate-400">{analyses.length} mois chargés</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mois</th>
                  <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Décades</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Attendue</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reçue</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Delta</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Réclamation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {analyses.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400 text-sm">Aucune donnée pour {annee}</td></tr>
                )}
                {analyses.map(a => {
                  const claimRef = moisCouverts.get(a.mois);
                  return (
                    <tr key={a.mois} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-800">{formatMoisLabel(a.mois)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {[1, 2, 3].map(d => (
                            <span
                              key={d}
                              className={`w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-bold ${
                                a.decadesPresentes.includes(d)
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatEuros(a.remiseAttendue)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatEuros(Math.abs(a.remiseReelle))}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${a.delta < -0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatEuros(a.delta)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge statut={a.statut} /></td>
                      <td className="px-4 py-3">
                        {claimRef
                          ? <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">{claimRef}</span>
                          : a.statut === 'RETARD'
                            ? <span className="text-[10px] text-amber-600">Non réclamé</span>
                            : <span className="text-slate-300 text-[10px]">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
