import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { api, AnalyseRemise, Reclamation, Payment, CumulResponse } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';
import { exportYearlyPDF } from '../utils/pdfExport';

type Page = 'accueil' | 'reclamations' | 'donnees';

interface PageAccueilProps {
  onNavigate: (page: Page) => void;
}

const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

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
  if (statut === 'OK') {
    return (
      <span style={{ backgroundColor: '#E8F5EE', color: '#1B6B40' }}
        className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded">
        OK
      </span>
    );
  }
  if (statut === 'EN_COURS') {
    return (
      <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700">
        Incomplet
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-800">
      Retard
    </span>
  );
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

  const resteAPercevoir = cumul ? Math.abs(Math.min(0, cumul.resteDu)) : 0;
  const totalDette = cumul ? Math.abs(Math.min(0, cumul.deltaCumulTotal)) : 0;
  const totalRegulaRisations = cumul ? cumul.regulTotal : 0;
  const recouvrementPct = totalDette > 0 ? Math.min(100, Math.round((totalRegulaRisations / totalDette) * 100)) : 0;

  function getReceived(claimId: string) {
    return payments.filter(p => p.claimId === claimId).reduce((s, p) => s + p.amount, 0);
  }

  const openClaims = reclamations.filter(r => r.statut !== 'soldee' && r.statut !== 'cloturee');

  const moisCouverts = new Set<string>();
  for (const r of reclamations) {
    for (const m of getMoisRange(r.moisDebut, r.moisFin)) moisCouverts.add(m);
  }
  const moisRetardNonCouverts = allAnalyses.filter(
    a => a.statut === 'RETARD' && a.decadesPresentes.length === 3 && !moisCouverts.has(a.mois)
  );

  const pretesAClore = reclamations.filter(r => {
    if (r.statut === 'soldee' || r.statut === 'cloturee') return false;
    return getReceived(r.id) >= r.montantReclame && r.montantReclame > 0;
  });

  const chartData = analyses.map(a => ({
    mois: moisCourt(a.mois),
    delta: a.delta,
    complet: a.decadesPresentes.length === 3,
    couvert: moisCouverts.has(a.mois)
  }));

  const incomplets = analyses.filter(a => a.statut === 'EN_COURS');

  if (loading) {
    return (
      <div className="p-6 text-sm" style={{ color: '#64748B' }}>
        Chargement…
      </div>
    );
  }

  const CARD_STYLE = {
    backgroundColor: '#fff',
    border: '1px solid #E2E8F0',
    borderRadius: '4px',
  };

  return (
    <div className="p-5 space-y-4">

      {/* ─── Ligne 1 : Héro + KPIs secondaires ─── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Bloc héro — question principale */}
        <div className="col-span-2 flex flex-col" style={{ ...CARD_STYLE, borderTop: '4px solid #1B6B40' }}>
          <div className="px-6 pt-5 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#94A3B8', letterSpacing: '0.1em' }}>
              Solde non perçu — toutes périodes
            </p>

            <p
              className="data-val font-bold leading-none"
              style={{
                fontSize: '2.75rem',
                color: resteAPercevoir > 0 ? '#991B1B' : '#1B6B40',
              }}
            >
              {resteAPercevoir > 0 ? '− ' : ''}{formatEuros(resteAPercevoir)}
            </p>

            <div className="mt-5 pt-4 grid grid-cols-2 gap-6" style={{ borderTop: '1px solid #E2E8F0' }}>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
                  Déficit calculé
                </p>
                <p className="data-val text-lg font-semibold" style={{ color: '#1A2332' }}>
                  {formatEuros(totalDette)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
                  Régularisé
                </p>
                <p className="data-val text-lg font-semibold" style={{ color: '#1B6B40' }}>
                  {formatEuros(totalRegulaRisations)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs secondaires empilés */}
        <div className="col-span-1 flex flex-col gap-3">

          {/* Réclamations ouvertes */}
          <div className="flex-1 px-4 py-3" style={CARD_STYLE}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
              Réclamations ouvertes
            </p>
            <p className="data-val text-2xl font-bold" style={{ color: '#1A2332' }}>
              {openClaims.length}
            </p>
            {pretesAClore.length > 0 && (
              <p className="text-[10px] mt-1 font-medium" style={{ color: '#1B6B40' }}>
                {pretesAClore.length} prête{pretesAClore.length > 1 ? 's' : ''} à clore
              </p>
            )}
          </div>

          {/* Alertes non traitées */}
          <div className="flex-1 px-4 py-3" style={CARD_STYLE}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
              Alertes non traitées
            </p>
            <p
              className="data-val text-2xl font-bold"
              style={{ color: moisRetardNonCouverts.length > 0 ? '#C05621' : '#1A2332' }}
            >
              {moisRetardNonCouverts.length}
            </p>
            {moisRetardNonCouverts.length > 0 && (
              <p className="text-[10px] mt-1" style={{ color: '#C05621' }}>
                mois en retard sans réclamation
              </p>
            )}
          </div>

          {/* Taux de recouvrement */}
          <div className="flex-1 px-4 py-3" style={CARD_STYLE}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
              Taux de recouvrement
            </p>
            <p
              className="data-val text-2xl font-bold"
              style={{
                color: recouvrementPct >= 80 ? '#1B6B40' : recouvrementPct >= 40 ? '#C05621' : '#991B1B'
              }}
            >
              {recouvrementPct}&nbsp;%
            </p>
            {totalDette > 0 && (
              <div className="mt-2 h-1" style={{ backgroundColor: '#E2E8F0', borderRadius: '1px' }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${recouvrementPct}%`,
                    backgroundColor: recouvrementPct >= 80 ? '#1B6B40' : recouvrementPct >= 40 ? '#C05621' : '#991B1B',
                    borderRadius: '1px',
                  }}
                />
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ─── Ligne 2 : Graphique + Alertes ─── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Graphique delta mensuel */}
        <div className="col-span-2 px-5 py-4" style={CARD_STYLE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: '#1A2332' }}>
              Delta mensuel — <span className="data-val">{annee}</span>
            </h2>
            <select
              value={annee}
              onChange={e => setAnnee(parseInt(e.target.value))}
              className="text-xs px-2 py-1"
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: '3px',
                backgroundColor: '#fff',
                color: '#64748B',
              }}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {chartData.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
              Aucune donnée pour {annee}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="mois"
                  tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'Consolas, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'Consolas, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${Math.abs(v).toFixed(0)}`}
                  width={42}
                />
                <Tooltip
                  formatter={(v: number) => [formatEuros(v), 'Delta']}
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 3,
                    border: '1px solid #E2E8F0',
                    fontFamily: 'Consolas, monospace',
                  }}
                />
                <ReferenceLine y={0} stroke="#CBD5E1" strokeDasharray="4 4" />
                <Bar dataKey="delta" maxBarSize={28} radius={[2, 2, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        !entry.complet ? '#CBD5E1'
                        : entry.couvert ? '#CBD5E1'
                        : entry.delta < 0 ? '#991B1B'
                        : '#1B6B40'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          <div className="flex items-center gap-5 mt-2">
            {[
              { color: '#991B1B', label: 'Retard' },
              { color: '#1B6B40', label: 'OK' },
              { color: '#CBD5E1', label: 'Incomplet / Réclamé' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color: '#94A3B8' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: color, borderRadius: 1 }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Alertes */}
        <div className="col-span-1 px-5 py-4" style={CARD_STYLE}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: '#1A2332' }}>Alertes</h2>

          {moisRetardNonCouverts.length === 0 && incomplets.length === 0 && pretesAClore.length === 0 ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#1B6B40' }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Aucune alerte active
            </div>
          ) : (
            <div className="space-y-2 text-xs">

              {moisRetardNonCouverts.length > 0 && (
                <div className="p-3" style={{ backgroundColor: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '3px' }}>
                  <p className="font-semibold mb-1" style={{ color: '#991B1B' }}>
                    {moisRetardNonCouverts.length} mois en retard non réclamé{moisRetardNonCouverts.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-[10px] mb-2" style={{ color: '#991B1B' }}>
                    {moisRetardNonCouverts.slice(0, 3).map(a => formatMoisLabel(a.mois)).join(', ')}
                    {moisRetardNonCouverts.length > 3 ? ` … +${moisRetardNonCouverts.length - 3}` : ''}
                  </p>
                  <button
                    onClick={() => onNavigate('reclamations')}
                    className="text-[10px] font-semibold underline"
                    style={{ color: '#991B1B' }}
                  >
                    Créer une réclamation →
                  </button>
                </div>
              )}

              {pretesAClore.length > 0 && (
                <div className="p-3" style={{ backgroundColor: '#E8F5EE', border: '1px solid #C8E8D5', borderRadius: '3px' }}>
                  <p className="font-semibold mb-1" style={{ color: '#1B6B40' }}>
                    {pretesAClore.length} réclamation{pretesAClore.length > 1 ? 's' : ''} prête{pretesAClore.length > 1 ? 's' : ''} à clore
                  </p>
                  <p className="text-[10px] mb-2" style={{ color: '#1B6B40' }}>Montant perçu ≥ montant réclamé</p>
                  <button
                    onClick={() => onNavigate('reclamations')}
                    className="text-[10px] font-semibold underline"
                    style={{ color: '#1B6B40' }}
                  >
                    Gérer →
                  </button>
                </div>
              )}

              {incomplets.length > 0 && (
                <div className="p-3" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '3px' }}>
                  <p className="font-semibold mb-1" style={{ color: '#B45309' }}>
                    {incomplets.length} mois incomplet{incomplets.length > 1 ? 's' : ''} ({annee})
                  </p>
                  <p className="text-[10px]" style={{ color: '#B45309' }}>Moins de 3 décades importées</p>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ─── Ligne 3 : Tableau mensuel ─── */}
      <div style={{ ...CARD_STYLE, overflow: 'hidden' }}>
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid #E2E8F0' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: '#1A2332' }}>
            Récapitulatif mensuel — <span className="data-val">{annee}</span>
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: '#94A3B8' }}>{analyses.length} mois</span>
            {analyses.length > 0 && (
              <button
                onClick={() => exportYearlyPDF(annee, analyses, payments, reclamations)}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '3px',
                  color: '#64748B',
                  backgroundColor: '#fff',
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Export PDF
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFB', borderBottom: '1px solid #E2E8F0' }}>
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#94A3B8' }}>
                  Mois
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#94A3B8' }}>
                  Attendue
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#94A3B8' }}>
                  Annoncée
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#94A3B8' }}>
                  Frais
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#94A3B8' }}>
                  Reversée
                </th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: '#94A3B8' }}>
                  Delta
                </th>
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
                  Statut
                </th>
              </tr>
            </thead>
            <tbody>
              {analyses.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm" style={{ color: '#94A3B8' }}>
                    Aucune donnée pour {annee}
                  </td>
                </tr>
              )}
              {analyses.map((a, idx) => (
                <tr
                  key={a.mois}
                  style={{
                    borderBottom: idx < analyses.length - 1 ? '1px solid #F1F5F9' : 'none',
                    backgroundColor: a.statut === 'RETARD' ? '#FFF5F5' : 'transparent',
                  }}
                >
                  <td className="px-5 py-2.5 font-medium whitespace-nowrap" style={{ color: '#1A2332' }}>
                    {formatMoisLabel(a.mois)}
                  </td>
                  <td className="data-val px-4 py-2.5 text-right" style={{ color: '#64748B' }}>
                    {formatEuros(a.remiseAttendue)}
                  </td>
                  <td className="data-val px-4 py-2.5 text-right" style={{ color: '#64748B' }}>
                    {formatEuros(a.remiseReelle)}
                  </td>
                  <td className="data-val px-4 py-2.5 text-right" style={{ color: '#94A3B8' }}>
                    {a.fraisGeneraux > 0 ? formatEuros(a.fraisGeneraux) : '—'}
                  </td>
                  <td className="data-val px-4 py-2.5 text-right" style={{ color: '#64748B' }}>
                    {formatEuros(a.reversee)}
                  </td>
                  <td
                    className="data-val px-4 py-2.5 text-right font-semibold"
                    style={{ color: a.delta < -0.01 ? '#991B1B' : '#1B6B40' }}
                  >
                    {formatEuros(a.delta)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge statut={a.statut} />
                  </td>
                </tr>
              ))}
            </tbody>
            {analyses.length > 0 && (() => {
              const totAttendue   = analyses.reduce((s, a) => s + a.remiseAttendue, 0);
              const totAnnoncee   = analyses.reduce((s, a) => s + a.remiseReelle, 0);
              const totFrais      = analyses.reduce((s, a) => s + a.fraisGeneraux, 0);
              const totReversee   = analyses.reduce((s, a) => s + a.reversee, 0);
              const totDelta      = analyses.reduce((s, a) => s + a.delta, 0);
              return (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #E2E8F0', backgroundColor: '#F8FAFB' }}>
                    <td className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>
                      Total
                    </td>
                    <td className="data-val px-4 py-3 text-right font-semibold" style={{ color: '#1A2332' }}>
                      {formatEuros(totAttendue)}
                    </td>
                    <td className="data-val px-4 py-3 text-right font-semibold" style={{ color: '#1A2332' }}>
                      {formatEuros(totAnnoncee)}
                    </td>
                    <td className="data-val px-4 py-3 text-right" style={{ color: '#64748B' }}>
                      {formatEuros(totFrais)}
                    </td>
                    <td className="data-val px-4 py-3 text-right font-semibold" style={{ color: '#1A2332' }}>
                      {formatEuros(totReversee)}
                    </td>
                    <td
                      className="data-val px-4 py-3 text-right font-bold"
                      style={{ color: totDelta < -0.01 ? '#991B1B' : '#1B6B40' }}
                    >
                      {formatEuros(totDelta)}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>

    </div>
  );
}
