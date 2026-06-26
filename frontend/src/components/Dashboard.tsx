import { useEffect, useState } from 'react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge } from '@tremor/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api, AnalyseRemise, CumulResponse, Regularisation } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';
import { Regularisations } from './Regularisations';
import { OrpecDataForm } from './OrpecDataForm';

interface DashboardProps {
  onNavigateToMois: (annee: number, mois: number) => void;
}

export function Dashboard({ onNavigateToMois }: DashboardProps) {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [data, setData] = useState<AnalyseRemise[]>([]);
  const [cumul, setCumul] = useState<CumulResponse | null>(null);
  const [regularisations, setRegularisations] = useState<Regularisation[]>([]);
  const [years, setYears] = useState<number[]>([new Date().getFullYear()]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOrpecForm, setShowOrpecForm] = useState(false);

  useEffect(() => {
    loadData();
  }, [annee]);

  useEffect(() => {
    loadCumul();
    loadRegularisations();
    loadAnnees();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDashboard(annee);
      setData(result.mois);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      console.error('Erreur chargement dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCumul() {
    try {
      const result = await api.getCumul();
      setCumul(result);
    } catch (err) {
      console.error('Erreur chargement cumul:', err);
    }
  }

  async function loadRegularisations() {
    try {
      const result = await api.getRegularisations();
      setRegularisations(result);
    } catch (err) {
      console.error('Erreur chargement regularisations:', err);
    }
  }

  async function loadAnnees() {
    try { setYears(await api.getAnnees()); } catch (err) { console.error(err); }
  }

  function handleRegulUpdate() {
    loadCumul();
    loadRegularisations();
  }

  // Delta annuel (somme des mois complets)
  const deltaAnnuel = data
    .filter(d => d.decadesPresentes.length === 3)
    .reduce((sum, d) => sum + d.delta, 0);

  // Regularisations de l'annee selectionnee
  const regulAnnuel = regularisations
    .filter(r => r.annee === annee)
    .reduce((sum, r) => sum + r.montant, 0);
  const resteAnnuel = deltaAnnuel + regulAnnuel;

  function getStatutBadge(statut: string) {
    switch (statut) {
      case 'OK':
        return <Badge size="xs" color="green">OK</Badge>;
      case 'EN_COURS':
        return <Badge size="xs" color="yellow">En cours</Badge>;
      case 'RETARD':
        return <Badge size="xs" color="red">Retard</Badge>;
      default:
        return <Badge size="xs" color="gray">?</Badge>;
    }
  }

  function handleRowClick(moisKey: string) {
    const [a, m] = moisKey.split('-');
    onNavigateToMois(parseInt(a), parseInt(m));
  }

  const chartData = data.map(d => ({
    mois: formatMoisLabel(d.mois).split(' ')[0].substring(0, 3),
    delta: d.delta,
    remiseAttendue: d.remiseAttendue,
    remiseReelle: Math.abs(d.remiseReelle)
  }));

  // Annees disponibles pour le filtre (chargees depuis le backend)

  if (loading) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Controle Remises Alliance</h1>
          <p className="text-sm text-gray-500">Suivi des remises contractuelles (3% assiette contractuelle)</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOrpecForm(true)}
            className="px-3 py-1.5 text-sm font-medium text-white rounded-lg shadow-sm hover:opacity-90"
            style={{ backgroundColor: '#6B2D8B' }}
          >
            Saisir donnees ORPEC
          </button>
          <select
            value={annee}
            onChange={e => setAnnee(parseInt(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white shadow-sm"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {showOrpecForm && (
        <OrpecDataForm
          initialMois={`${annee}-12`}
          onClose={() => setShowOrpecForm(false)}
          onSaved={() => { loadData(); loadCumul(); }}
        />
      )}

      {error && (
        <Card className="mb-4 bg-red-50 border-red-200">
          <p className="text-red-700 text-sm">Erreur: {error}</p>
        </Card>
      )}

      {/* Bandeau retard cumule toutes annees */}
      {cumul && (
        <Card className="mb-4 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Retard cumule (toutes annees)</p>
              <p className={`text-2xl font-bold ${cumul.resteDu < -0.01 ? 'text-red-600' : 'text-green-600'}`}>
                {formatEuros(cumul.resteDu)}
              </p>
              <div className="flex gap-3 mt-1 text-xs">
                <span className="text-gray-500">Brut: <span className="text-red-600">{formatEuros(cumul.deltaCumulTotal)}</span></span>
                {cumul.regulTotal > 0 && (
                  <span className="text-gray-500">Regul: <span className="text-green-600">+{formatEuros(cumul.regulTotal)}</span></span>
                )}
              </div>
            </div>
            <div className="flex-1 mx-6">
              {cumul.deltaCumulTotal < 0 && (
                <div>
                  <div className="h-3 bg-red-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${Math.min(100, (cumul.regulTotal / Math.abs(cumul.deltaCumulTotal)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    {Math.round((cumul.regulTotal / Math.abs(cumul.deltaCumulTotal)) * 100)}% rattrape
                  </p>
                </div>
              )}
            </div>
            <div className="text-right text-xs text-gray-500">
              {cumul.parAnnee.map(a => (
                <div key={a.annee} className="mb-0.5">
                  {a.annee}: <span className={a.resteDu < -0.01 ? 'text-red-600' : 'text-green-600'}>{formatEuros(a.resteDu)}</span>
                  {a.regul > 0 && <span className="text-green-600 ml-1">(+{formatEuros(a.regul)})</span>}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {data.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center py-8">
            Aucun releve importe pour {annee}. Importez des PDFs via la page Import.
          </p>
        </Card>
      ) : (
        <>
          {/* Zone graphique + retard annuel */}
          <div className="flex gap-4 mb-4">
            {/* Graphique delta (75%) */}
            <Card className="flex-1">
              <h2 className="text-sm font-semibold mb-2">Evolution du delta mensuel</h2>
              {chartData.length <= 12 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mois" />
                    <YAxis tickFormatter={(v: number) => `${v.toFixed(0)} EUR`} />
                    <Tooltip
                      formatter={(value: number) => formatEuros(value)}
                      labelFormatter={(label: string) => `Mois: ${label}`}
                    />
                    <ReferenceLine y={0} stroke="#666" />
                    <Bar
                      dataKey="delta"
                      fill="#ef4444"
                      name="Delta"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ width: `${chartData.length * 60}px`, minWidth: '100%' }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mois" />
                        <YAxis tickFormatter={(v: number) => `${v.toFixed(0)} EUR`} />
                        <Tooltip
                          formatter={(value: number) => formatEuros(value)}
                          labelFormatter={(label: string) => `Mois: ${label}`}
                        />
                        <ReferenceLine y={0} stroke="#666" />
                        <Bar
                          dataKey="delta"
                          fill="#ef4444"
                          name="Delta"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </Card>

            {/* Retard annuel (25%) */}
            <Card className="w-52 flex flex-col justify-center items-center text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Retard {annee}</p>
              <p className={`text-2xl font-bold ${resteAnnuel < -0.01 ? 'text-red-600' : 'text-green-600'}`}>
                {formatEuros(resteAnnuel)}
              </p>
              <div className="text-xs mt-1 space-y-0.5">
                <p className="text-gray-500">Brut: <span className="text-red-600">{formatEuros(deltaAnnuel)}</span></p>
                {regulAnnuel > 0 && (
                  <p className="text-gray-500">Regul: <span className="text-green-600">+{formatEuros(regulAnnuel)}</span></p>
                )}
              </div>
              {deltaAnnuel < 0 && (
                <div className="w-full mt-2">
                  <div className="h-2 bg-red-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${Math.min(100, (regulAnnuel / Math.abs(deltaAnnuel)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {Math.round((regulAnnuel / Math.abs(deltaAnnuel)) * 100)}% rattrape
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {data.filter(d => d.decadesPresentes.length === 3).length} mois complets
              </p>
            </Card>
          </div>

          {/* Regularisations */}
          <Regularisations regularisations={regularisations} onUpdate={handleRegulUpdate} />

          {/* Tableau mensuel */}
          <Card className="p-0 overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHead>
                  <TableRow className="bg-gray-50 sticky top-0 z-10">
                    <TableHeaderCell className="py-2 text-xs">Mois</TableHeaderCell>
                    <TableHeaderCell className="py-2 text-xs text-right">Total HT</TableHeaderCell>
                    <TableHeaderCell className="py-2 text-xs text-right">Attendue (3%)</TableHeaderCell>
                    <TableHeaderCell className="py-2 text-xs text-right">Reelle</TableHeaderCell>
                    <TableHeaderCell className="py-2 text-xs text-right">Delta</TableHeaderCell>
                    <TableHeaderCell className="py-2 text-xs">Dec.</TableHeaderCell>
                    <TableHeaderCell className="py-2 text-xs">Statut</TableHeaderCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {data.map((analyse) => (
                    <TableRow
                      key={analyse.mois}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleRowClick(analyse.mois)}
                    >
                      <TableCell className="py-1.5 text-sm font-medium">
                        {formatMoisLabel(analyse.mois)}
                      </TableCell>
                      <TableCell className="py-1.5 text-sm text-right">
                        {formatEuros(analyse.totalHTMensuel)}
                      </TableCell>
                      <TableCell className="py-1.5 text-sm text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {analyse.methodeCalcul === 'ORPEC' ? (
                            <Badge size="xs" color="green">ORPEC ✓</Badge>
                          ) : (
                            <Badge size="xs" color="gray">Estimation</Badge>
                          )}
                          <span>{formatEuros(analyse.remiseAttendue)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-sm text-right">
                        {formatEuros(analyse.remiseReelle)}
                      </TableCell>
                      <TableCell className={`py-1.5 text-sm text-right font-bold ${analyse.delta < -0.01 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatEuros(analyse.delta)}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <span className="text-xs text-gray-500">
                          {analyse.decadesPresentes.join(', ')}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5">{getStatutBadge(analyse.statut)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
