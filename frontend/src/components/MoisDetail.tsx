import { useEffect, useState } from 'react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge } from '@tremor/react';
import { api, MoisDetailResponse } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';

interface MoisDetailProps {
  annee: number;
  mois: number;
  onBack: () => void;
}

export function MoisDetail({ annee, mois, onBack }: MoisDetailProps) {
  const [data, setData] = useState<MoisDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [annee, mois]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMoisDetail(annee, mois);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce releve ?')) return;
    try {
      await api.deleteReleve(id);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur suppression');
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <button onClick={onBack} className="text-blue-600 hover:text-blue-800 mb-4">
          &larr; Retour au dashboard
        </button>
        <Card className="bg-red-50">
          <p className="text-red-700">Erreur: {error || 'Donnees non disponibles'}</p>
        </Card>
      </div>
    );
  }

  const moisKey = `${annee}-${String(mois).padStart(2, '0')}`;
  const analyse = data.analyse;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button
        onClick={onBack}
        className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-1"
      >
        &larr; Retour au dashboard
      </button>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        {formatMoisLabel(moisKey)}
      </h1>

      {/* Recap */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card decoration="top" decorationColor="blue">
          <p className="text-sm text-gray-500">Total HT cumule</p>
          <p className="text-2xl font-bold">{formatEuros(analyse.totalHTMensuel)}</p>
        </Card>
        <Card decoration="top" decorationColor="blue">
          <p className="text-sm text-gray-500">Remise attendue (3%)</p>
          <p className="text-2xl font-bold">{formatEuros(analyse.remiseAttendue)}</p>
        </Card>
        <Card decoration="top" decorationColor={analyse.remiseReelle < 0 ? 'green' : 'gray'}>
          <p className="text-sm text-gray-500">Remise reelle</p>
          <p className="text-2xl font-bold">{formatEuros(analyse.remiseReelle)}</p>
        </Card>
        <Card decoration="top" decorationColor={analyse.delta < -0.01 ? 'red' : 'green'}>
          <p className="text-sm text-gray-500">Delta</p>
          <p className={`text-2xl font-bold ${analyse.delta < -0.01 ? 'text-red-600' : 'text-green-600'}`}>
            {formatEuros(analyse.delta)}
          </p>
          <p className="text-sm text-gray-400">
            {analyse.deltaPourcent >= 0 ? '+' : ''}{analyse.deltaPourcent.toFixed(1)}%
          </p>
        </Card>
      </div>

      {/* Statut */}
      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <span className="font-medium">Statut :</span>
          {analyse.statut === 'OK' && <Badge color="green" size="lg">OK - Remise conforme</Badge>}
          {analyse.statut === 'EN_COURS' && <Badge color="yellow" size="lg">En cours - Mois incomplet ({analyse.decadesPresentes.length}/3 decades)</Badge>}
          {analyse.statut === 'RETARD' && <Badge color="red" size="lg">Retard - Remise insuffisante</Badge>}
        </div>
      </Card>

      {/* Tableau decades */}
      <Card>
        <h2 className="text-lg font-semibold mb-4">Detail des decades</h2>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Decade</TableHeaderCell>
              <TableHeaderCell className="text-right">Total NET HT</TableHeaderCell>
              <TableHeaderCell className="text-right">Total TTC</TableHeaderCell>
              <TableHeaderCell className="text-right">Remise abn marge</TableHeaderCell>
              <TableHeaderCell className="text-right">Remises partenariats</TableHeaderCell>
              <TableHeaderCell className="text-right">Avoirs commerciaux</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.decades.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500">
                  Aucune decade importee
                </TableCell>
              </TableRow>
            ) : (
              data.decades.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Badge color="blue">D{d.decade}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatEuros(d.totalNetHT)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatEuros(d.totalTTC)}
                  </TableCell>
                  <TableCell className="text-right">
                    {d.remiseAbnMargeHT !== null
                      ? <span className="text-red-600 font-medium">{formatEuros(d.remiseAbnMargeHT)}</span>
                      : <span className="text-gray-400">-</span>
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    {d.remisesPartenariatsHT !== null
                      ? formatEuros(d.remisesPartenariatsHT)
                      : <span className="text-gray-400">-</span>
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    {d.avoirsCommerciauxHT !== null
                      ? formatEuros(d.avoirsCommerciauxHT)
                      : <span className="text-gray-400">-</span>
                    }
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-gray-500 truncate max-w-[200px] block" title={d.source}>
                      {d.source}
                    </span>
                    {d.parsingErrors && d.parsingErrors.length > 0 && (
                      <span className="text-xs text-orange-500 block mt-1">
                        {d.parsingErrors.join(', ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Supprimer
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
