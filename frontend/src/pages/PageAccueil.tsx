import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { api, AnalyseRemise, Reclamation, Payment, CumulResponse } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';

type Page = 'accueil' | 'reclamations' | 'donnees';

interface PageAccueilProps {
  onNavigate: (page: Page) => void;
}

const MOIS_COURTS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

function moisCourt(moisKey: string): string {
  const m = parseInt(moisKey.split('-')[1]) - 1;
  return MOIS_COURTS[m];
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

function StatusBadge({ statut }: { statut: string }) {
  if (statut === 'OK') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700">OK</span>;
  if (statut === 'EN_COURS') return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">Incomplet</span>;
  return <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">Retard</span>;
}

export function PageAccueil({ onNavigate }: PageAccueilProps) {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [years, setYears] = useState<number[]>([new Date().getFullYear()]);
  const [analyses, setAnalyses] = useState<AnalyseRemise[]>([]);
  const [allAnalyses, setAllAnalyses] = useState<AnalyseRemise[]>([]);
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cumul, setCumul] = useState<CumulResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadYear(); }, [annee]);

  async function loadAll() {
    setLoading(true);
    try {
      const [reclams, pays, yearsList, cumulData] = await Promise.all([
        api.getReclamations(),
        api.getPayments(),
        api.getAnnees(),
        api.getCumul()
      ]);
      setReclamations(reclams);
      setPayments(pays);
      setYears(yearsList);
      setCumul(cumulData);

      // Charger toutes les analyses (pour calcul global)
      const all: AnalyseRemise[] = [];
      for (const y of yearsList) {
        const d = await api.getDashboard(y);
        all.push(...d.mois);
      }
      setAllAnalyses(all);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadYear() {
    try {
      const d = await api.getDashboard(annee);
      setAnalyses(d.mois);
    } catch (err) {
      console.error(err);
    }
  }

  // --- KPI globaux ---
  // Reste à percevoir = déficit cumulé calculé depuis les PDFs (cumul endpoint)
  const resteAPercevoir = cumul ? Math.abs(Math.min(0, cumul.resteDu)) : 0;
  const totalDette = cumul ? Math.abs(Math.min(0, cumul.deltaCumulTotal)) : 0;
  const totalRegulaRisations = cumul ? cumul.regulTotal : 0;
  const recouvrementPct = totalDette > 0 ? Math.min(100, Math.round((totalRegulaRisations / totalDette) * 100)) : 0;

  function getReceived(claimId: string) {
    return payments.filter(p => p.claimId === claimId).reduce((s, p) => s + p.amount, 0);
  }

  const openClaims = reclamations.filter(r => r.statut !== 'soldee' && r.statut !== 'cloturee');

  // Mois RETARD complets non couverts par une réclamation
  const moisCouverts = new Set<string>();
  for (const r of reclamations) {
    for (const m of getMoisRange(r.moisDebut, r.moisFin)) moisCouverts.add(m);
  }
  const moisRetardNonCouverts = allAnalyses.filter(
    a => a.statut === 'RETARD' && a.decadesPresentes.length === 3 && !moisCouverts.has(a.mois)
  );

  // Réclamations prêtes à clore
  const pretesAClore = reclamations.filter(r => {
    if (r.statut === 'soldee' || r.statut === 'cloturee') return false;
    return getReceived(r.id) >= r.montantReclame && r.montantReclame > 0;
  });

  // --- Données chart ---
  const chartData = analyses.map(a => ({
    mois: moisCourt(a.mois),
    delta: a.delta,
    complet: a.decadesPresentes.length === 3,
    couvert: moisCouverts.has(a.mois)
  }));

  // --- Alertes ---
  const incomplets = analyses.filter(a => a.statut === 'EN_COURS');

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Chargement...</div>;
  }

  return (
    <div className="p-6 space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {/* Reste à percevoir - carte principale */}
        <div className="col-span-1 bg-slate-900 rounded-xl p-5 text-white relative overflow-hidden">
          <p className="text-slate-400 text-[10px] uppercase tracking-widest mb-1">Reste à percevoir</p>
          <p className="text-3xl font-bold tracking-tight">{formatEuros(resteAPercevoir)}</p>
          <div className="mt-3 text-xs text-slate-400 space-y-0.5">
            <p>Déficit brut : <span className="text-slate-200">{formatEuros(totalDette)}</span></p>
            <p>Régularisé : <span className="text-emerald-400">{formatEuros(totalRegulaRisations)}</span></p>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-blue-600/10 rounded-full blur-2xl" />
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Réclamations ouvertes</p>
          <p className="text-3xl font-bold text-slate-800">{openClaims.length}</p>
          {pretesAClore.length > 0 && (
            <p className="text-xs text-emerald-600 mt-2 font-medium">{pretesAClore.length} prête{pretesAClore.length > 1 ? 's' : ''} à clore</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Alertes non traitées</p>
          <p className={`text-3xl font-bold ${moisRetardNonCouverts.length > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {moisRetardNonCouverts.length}
          </p>
          {moisRetardNonCouverts.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              mois en retard sans réclamation
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Taux de recouvrement</p>
          <p className={`text-3xl font-bold ${recouvrementPct >= 80 ? 'text-emerald-600' : recouvrementPct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
            {recouvrementPct}%
          </p>
          {totalDette > 0 && (
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${recouvrementPct}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Chart + alertes */}
      <div className="grid grid-cols-3 gap-4">
        {/* Chart delta mensuel */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Delta mensuel</h2>
            <select
              value={annee}
              onChange={e => setAnnee(parseInt(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Aucune donnée pour {annee}</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.abs(v).toFixed(0)}`} width={45} />
                <Tooltip
                  formatter={(v: number) => [formatEuros(v), 'Delta']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
                <Bar dataKey="delta" radius={[3, 3, 0, 0]} maxBarSize={32}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={!entry.complet ? '#94a3b8' : entry.couvert ? '#94a3b8' : entry.delta < 0 ? '#ef4444' : '#10b981'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-slate-400 mt-2">
            <span className="inline-block w-2 h-2 bg-red-400 rounded-sm mr-1" />Retard
            <span className="inline-block w-2 h-2 bg-emerald-400 rounded-sm mx-1 ml-3" />OK
            <span className="inline-block w-2 h-2 bg-slate-300 rounded-sm mx-1 ml-3" />Incomplet / Réclamé
          </p>
        </div>

        {/* Alertes */}
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Alertes</h2>
          <div className="space-y-2 text-xs">
            {moisRetardNonCouverts.length === 0 && incomplets.length === 0 && pretesAClore.length === 0 && (
              <div className="flex items-center gap-2 text-emerald-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Aucune alerte active</span>
              </div>
            )}

            {moisRetardNonCouverts.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-3">
                <p className="font-semibold text-red-700 mb-1">
                  {moisRetardNonCouverts.length} mois en retard non réclamés
                </p>
                <p className="text-red-600 text-[10px]">
                  {moisRetardNonCouverts.slice(0, 3).map(a => formatMoisLabel(a.mois)).join(', ')}
                  {moisRetardNonCouverts.length > 3 ? `... +${moisRetardNonCouverts.length - 3}` : ''}
                </p>
                <button
                  onClick={() => onNavigate('reclamations')}
                  className="mt-2 text-[10px] font-semibold text-red-700 underline"
                >
                  Créer une réclamation →
                </button>
              </div>
            )}

            {pretesAClore.length > 0 && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                <p className="font-semibold text-emerald-700 mb-1">
                  {pretesAClore.length} réclamation{pretesAClore.length > 1 ? 's' : ''} prête{pretesAClore.length > 1 ? 's' : ''} à clore
                </p>
                <p className="text-emerald-600 text-[10px]">Montant perçu ≥ montant réclamé</p>
                <button
                  onClick={() => onNavigate('reclamations')}
                  className="mt-2 text-[10px] font-semibold text-emerald-700 underline"
                >
                  Gérer →
                </button>
              </div>
            )}

            {incomplets.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 p-3">
                <p className="font-semibold text-amber-700 mb-1">
                  {incomplets.length} mois incomplet{incomplets.length > 1 ? 's' : ''} ({annee})
                </p>
                <p className="text-amber-600 text-[10px]">Moins de 3 décades importées</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tableau mensuel */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Récapitulatif mensuel — {annee}</h2>
          <span className="text-xs text-slate-400">{analyses.length} mois</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mois</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Attendue</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reçue</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Delta</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {analyses.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                    Aucune donnée pour {annee}
                  </td>
                </tr>
              )}
              {analyses.map(a => (
                <tr key={a.mois} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 text-slate-800 font-medium">{formatMoisLabel(a.mois)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatEuros(a.remiseAttendue)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatEuros(Math.abs(a.remiseReelle))}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${a.delta < -0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatEuros(a.delta)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge statut={a.statut} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
