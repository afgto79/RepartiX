import { useEffect, useState } from 'react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge } from '@tremor/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api, AnalyseRemise } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';

interface DashboardProps {
  onNavigateToMois: (annee: number, mois: number) => void;
}

export function Dashboard({ onNavigateToMois }: DashboardProps) {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [data, setData] = useState<AnalyseRemise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [annee]);

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

  function getStatutBadge(statut: string) {
    switch (statut) {
      case 'OK':
        return <Badge color="green">OK</Badge>;
      case 'EN_COURS':
        return <Badge color="yellow">En cours</Badge>;
      case 'RETARD':
        return <Badge color="red">Retard</Badge>;
      default:
        return <Badge color="gray">?</Badge>;
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

  // Annees disponibles pour le filtre
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Controle Remises Alliance</h1>
          <p className="text-gray-500 mt-1">Suivi des remises contractuelles (3% NET HT mensuel)</p>
        </div>

        <select
          value={annee}
          onChange={e => setAnnee(parseInt(e.target.value))}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white shadow-sm"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {error && (
        <Card className="mb-6 bg-red-50 border-red-200">
          <p className="text-red-700">Erreur: {error}</p>
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
          {/* Graphique delta */}
          <Card className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Evolution du delta mensuel</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
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
          </Card>

          {/* Tableau mensuel */}
          <Card>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Mois</TableHeaderCell>
                  <TableHeaderCell className="text-right">Total HT Mensuel</TableHeaderCell>
                  <TableHeaderCell className="text-right">Remise Attendue (3%)</TableHeaderCell>
                  <TableHeaderCell className="text-right">Remise Reelle</TableHeaderCell>
                  <TableHeaderCell className="text-right">Delta</TableHeaderCell>
                  <TableHeaderCell>Decades</TableHeaderCell>
                  <TableHeaderCell>Statut</TableHeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {data.map((analyse) => (
                  <TableRow
                    key={analyse.mois}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleRowClick(analyse.mois)}
                  >
                    <TableCell className="font-medium">
                      {formatMoisLabel(analyse.mois)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEuros(analyse.totalHTMensuel)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEuros(analyse.remiseAttendue)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatEuros(analyse.remiseReelle)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${analyse.delta < -0.01 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatEuros(analyse.delta)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-500">
                        {analyse.decadesPresentes.join(', ')}
                      </span>
                    </TableCell>
                    <TableCell>{getStatutBadge(analyse.statut)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
