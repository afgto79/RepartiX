import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { api, AnalyseRemise, CumulResponse, Regularisation } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';
import { Regularisations } from './Regularisations';

interface DashboardPanoramaProps {
  onNavigateToMois: (annee: number, mois: number) => void;
}

export function DashboardPanorama({ onNavigateToMois }: DashboardPanoramaProps) {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [data, setData] = useState<AnalyseRemise[]>([]);
  const [cumul, setCumul] = useState<CumulResponse | null>(null);
  const [regularisations, setRegularisations] = useState<Regularisation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [annee]);
  useEffect(() => { loadCumul(); loadRegularisations(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const result = await api.getDashboard(annee);
      setData(result.mois);
    } catch (err) {
      console.error('Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCumul() {
    try { setCumul(await api.getCumul()); } catch (err) { console.error(err); }
  }

  async function loadRegularisations() {
    try { setRegularisations(await api.getRegularisations()); } catch (err) { console.error(err); }
  }

  function handleRegulUpdate() { loadCumul(); loadRegularisations(); }

  function handleRowClick(moisKey: string) {
    const [a, m] = moisKey.split('-');
    onNavigateToMois(parseInt(a), parseInt(m));
  }

  const deltaAnnuel = data.filter(d => d.decadesPresentes.length === 3).reduce((sum, d) => sum + d.delta, 0);
  const regulAnnuel = regularisations.filter(r => r.annee === annee).reduce((sum, r) => sum + r.montant, 0);
  const resteAnnuel = deltaAnnuel + regulAnnuel;
  const moisComplets = data.filter(d => d.decadesPresentes.length === 3).length;
  const moisRetard = data.filter(d => d.statut === 'RETARD').length;

  const chartData = data.map(d => ({
    mois: formatMoisLabel(d.mois).split(' ')[0].substring(0, 3),
    delta: d.delta,
    moisKey: d.mois
  }));

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  if (loading) {
    return <div className="p-8 max-w-7xl mx-auto"><p className="text-gray-500">Chargement...</p></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">RepartiX</h1>
          <p className="text-gray-500 text-sm mt-1">Controle Remises Alliance Healthcare</p>
        </div>
        <select
          value={annee}
          onChange={e => setAnnee(parseInt(e.target.value))}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* 3 KPI Cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Retard Global */}
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 border border-red-200">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-red-700 text-sm font-medium uppercase tracking-wide">Retard Global</p>
              <p className="text-xs text-red-600 mt-1">Toutes annees confondues</p>
            </div>
            <div className="bg-red-200 rounded-full p-2">
              <svg className="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className={`text-4xl font-bold mb-3 ${cumul && cumul.resteDu < -0.01 ? 'text-red-900' : 'text-green-700'}`}>
            {cumul ? formatEuros(cumul.resteDu) : '-'}
          </div>
          {cumul && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-700">Brut: {formatEuros(cumul.deltaCumulTotal)}</span>
                <span className="text-red-500">&bull;</span>
                <span className="text-green-700">Regul: +{formatEuros(cumul.regulTotal)}</span>
              </div>
              {cumul.deltaCumulTotal < 0 && (
                <>
                  <div className="mt-4 bg-white/50 rounded-full h-2 overflow-hidden">
                    <div className="bg-green-500 h-full" style={{ width: `${Math.min(100, (cumul.regulTotal / Math.abs(cumul.deltaCumulTotal)) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-red-700 mt-2">{Math.round((cumul.regulTotal / Math.abs(cumul.deltaCumulTotal)) * 100)}% rattrape</p>
                </>
              )}
            </>
          )}
        </div>

        {/* Retard Annee */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-700 text-sm font-medium uppercase tracking-wide">Retard {annee}</p>
              <p className="text-xs text-gray-500 mt-1">Annee en cours</p>
            </div>
            <div className="bg-orange-100 rounded-full p-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className={`text-4xl font-bold mb-3 ${resteAnnuel < -0.01 ? 'text-gray-900' : 'text-green-700'}`}>
            {formatEuros(resteAnnuel)}
          </div>
          <div className="text-sm text-gray-600">{moisComplets} mois comptabilise{moisComplets > 1 ? 's' : ''}</div>
          {deltaAnnuel < 0 && (
            <>
              <div className="mt-4 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-green-400 h-full" style={{ width: `${Math.min(100, (regulAnnuel / Math.abs(deltaAnnuel)) * 100)}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-2">{Math.round((regulAnnuel / Math.abs(deltaAnnuel)) * 100)}% rattrape</p>
            </>
          )}
        </div>

        {/* Conformite */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-gray-700 text-sm font-medium uppercase tracking-wide">Conformite</p>
              <p className="text-xs text-gray-500 mt-1">Derniers 12 mois</p>
            </div>
            <div className="bg-yellow-100 rounded-full p-2">
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-3">
            <div className="text-4xl font-bold text-gray-900">{moisRetard}/{data.length}</div>
            <div className="text-lg text-gray-500">mois</div>
          </div>
          <div className="text-sm text-gray-600">en retard de paiement</div>
          <div className="mt-4 flex gap-1">
            {data.map((d, i) => (
              <div
                key={i}
                className={`flex-1 h-2 rounded ${d.statut === 'OK' ? 'bg-green-300' : d.statut === 'RETARD' ? 'bg-red-300' : 'bg-yellow-300'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Graphique + Regularisations */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="col-span-2 bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Evolution du delta mensuel</h2>
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-400 rounded" />
                <span className="text-gray-600">Retard</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-400 rounded" />
                <span className="text-gray-600">OK</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mois" />
              <YAxis tickFormatter={(v: number) => `${v.toFixed(0)} EUR`} />
              <Tooltip formatter={(value: number) => formatEuros(value)} />
              <ReferenceLine y={0} stroke="#666" />
              <Bar dataKey="delta" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.delta >= 0 ? '#4ade80' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <Regularisations regularisations={regularisations} onUpdate={handleRegulUpdate} />
        </div>
      </div>

      {/* Tableau */}
      {data.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Detail mensuel {annee}</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Mois</th>
                <th className="px-6 py-3 text-right">Total HT</th>
                <th className="px-6 py-3 text-right">Attendue (3%)</th>
                <th className="px-6 py-3 text-right">Reelle</th>
                <th className="px-6 py-3 text-right">Delta</th>
                <th className="px-6 py-3">Statut</th>
                <th className="px-6 py-3">Decades</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.map(d => (
                <tr
                  key={d.mois}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleRowClick(d.mois)}
                >
                  <td className="px-6 py-4 font-medium text-gray-900">{formatMoisLabel(d.mois)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatEuros(d.totalHTMensuel)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatEuros(d.remiseAttendue)}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{formatEuros(d.remiseReelle)}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${d.delta < -0.01 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatEuros(d.delta)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      d.statut === 'OK' ? 'bg-green-100 text-green-800' :
                      d.statut === 'RETARD' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {d.statut === 'OK' ? 'OK' : d.statut === 'RETARD' ? 'Retard' : 'En cours'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{d.decadesPresentes.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
