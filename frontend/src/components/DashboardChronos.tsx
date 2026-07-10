import { useEffect, useState } from 'react';
import { api, AnalyseRemise, CumulResponse, Regularisation } from '../services/api';
import { formatEuros, formatMoisLabel } from '../utils/formatters';

interface DashboardChronosProps {
  onNavigateToMois: (annee: number, mois: number) => void;
}

export function DashboardChronos({ onNavigateToMois }: DashboardChronosProps) {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [data, setData] = useState<AnalyseRemise[]>([]);
  const [cumul, setCumul] = useState<CumulResponse | null>(null);
  const [regularisations, setRegularisations] = useState<Regularisation[]>([]);
  const [years, setYears] = useState<number[]>([new Date().getFullYear()]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [annee]);
  useEffect(() => { loadCumul(); loadRegularisations(); loadAnnees(); }, []);

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

  async function loadAnnees() {
    try { setYears(await api.getAnnees()); } catch (err) { console.error(err); }
  }

  function handleRowClick(moisKey: string) {
    const [a, m] = moisKey.split('-');
    onNavigateToMois(parseInt(a), parseInt(m));
  }

  const deltaAnnuel = data.filter(d => d.decadesPresentes.length === 3).reduce((sum, d) => sum + d.delta, 0);
  const regulAnnuel = regularisations.filter(r => r.annee === annee).reduce((sum, r) => sum + r.montant, 0);
  const resteAnnuel = deltaAnnuel + regulAnnuel;
  const moisComplets = data.filter(d => d.decadesPresentes.length === 3).length;
  const moisOK = data.filter(d => d.statut === 'OK').length;
  const tauxConformite = data.length > 0 ? Math.round((moisOK / data.length) * 100) : 0;

  const regulsAnnee = regularisations.filter(r => r.annee === annee);

  type TimelineItem = { type: 'mois'; data: AnalyseRemise } | { type: 'regul'; data: Regularisation };
  const timeline: TimelineItem[] = [];
  for (const d of data) {
    timeline.push({ type: 'mois', data: d });
  }
  for (const r of regulsAnnee) {
    timeline.push({ type: 'regul', data: r });
  }
  timeline.sort((a, b) => {
    const dateA = a.type === 'mois' ? a.data.mois : (a.data as Regularisation).date;
    const dateB = b.type === 'mois' ? b.data.mois : (b.data as Regularisation).date;
    return dateA.localeCompare(dateB);
  });

  const MOIS_SHORT = ['', 'JAN', 'FEV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOUT', 'SEP', 'OCT', 'NOV', 'DEC'];

  if (loading) {
    return <div className="p-8 max-w-7xl mx-auto"><p className="text-gray-500">Chargement...</p></div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header compact */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">RepartiX</h1>
          <select
            value={annee}
            onChange={e => setAnnee(parseInt(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 bg-white text-sm"
            style={{ borderRadius: '4px' }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Situation globale compacte */}
      <div className="mb-8 bg-white border border-slate-200 p-6" style={{ borderRadius: '4px' }}>
        <div className="grid grid-cols-4 gap-8">
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Retard total</p>
            <div
              className="text-3xl font-bold data-val"
              style={{ color: cumul && cumul.resteDu < -0.01 ? '#991B1B' : '#1B6B40' }}
            >
              {cumul ? formatEuros(cumul.resteDu) : '-'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Toutes annees</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Regularise</p>
            <div className="text-3xl font-bold data-val" style={{ color: '#1B6B40' }}>
              {cumul ? `+${formatEuros(cumul.regulTotal)}` : '-'}
            </div>
            {cumul && cumul.deltaCumulTotal < 0 && (
              <div className="mt-2 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, (cumul.regulTotal / Math.abs(cumul.deltaCumulTotal)) * 100)}%`,
                    backgroundColor: '#1B6B40'
                  }}
                />
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Annee {annee}</p>
            <div
              className="text-3xl font-bold data-val"
              style={{ color: resteAnnuel < -0.01 ? '#C05621' : '#1B6B40' }}
            >
              {formatEuros(resteAnnuel)}
            </div>
            <p className="text-xs text-gray-500 mt-1">{moisComplets} mois comptabilise{moisComplets > 1 ? 's' : ''}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Taux conformite</p>
            <div className="text-3xl font-bold text-gray-900 data-val">{tauxConformite}%</div>
            <p className="text-xs text-gray-500 mt-1">{moisOK}/{data.length} mois OK</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-slate-200" style={{ borderRadius: '4px' }}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Timeline {annee}</h2>
          <div className="flex items-center gap-4">
            <div className="flex gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#1B6B40' }} />
                <span className="text-gray-600">OK</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full" />
                <span className="text-gray-600">En cours</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#991B1B' }} />
                <span className="text-gray-600">Retard</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          {timeline.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Aucune donnee pour {annee}</p>
          ) : (
            <div className="relative">
              {/* Ligne verticale */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

              <div className="space-y-4">
                {timeline.map((item, idx) => {
                  if (item.type === 'regul') {
                    const r = item.data as Regularisation;
                    return (
                      <div key={`regul-${r.id}`} className="relative flex gap-6">
                        <div className="flex-shrink-0 w-12 flex flex-col items-center">
                          <div
                            className="w-3 h-3 rounded-full border-4 border-white shadow-md z-10"
                            style={{ backgroundColor: '#1B6B40' }}
                          />
                          <span className="text-xs font-medium mt-2" style={{ color: '#1B6B40' }}>REGUL</span>
                        </div>
                        <div className="flex-1 pb-2">
                          <div
                            className="p-4 border"
                            style={{ backgroundColor: '#E8F5EE', borderRadius: '4px', borderColor: '#A7D7B8' }}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-gray-900">{r.description || 'Regularisation'}</h3>
                                <p className="text-sm text-gray-600 mt-1 data-val">{new Date(r.date).toLocaleDateString('fr-FR')}</p>
                              </div>
                              <div className="text-lg font-bold data-val" style={{ color: '#1B6B40' }}>
                                +{formatEuros(r.montant)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const d = item.data as AnalyseRemise;
                  const moisNum = parseInt(d.mois.split('-')[1]);
                  const dotStyle = d.statut === 'OK'
                    ? { backgroundColor: '#1B6B40' }
                    : d.statut === 'RETARD'
                    ? { backgroundColor: '#991B1B' }
                    : { backgroundColor: '#D97706' };
                  const cardStyle = d.statut === 'OK'
                    ? { backgroundColor: '#E8F5EE', border: '1px solid #A7D7B8', borderRadius: '4px' }
                    : d.statut === 'RETARD'
                    ? { backgroundColor: '#FFF5F5', border: '1px solid #FECACA', borderRadius: '4px' }
                    : { backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '4px' };

                  return (
                    <div
                      key={`mois-${d.mois}`}
                      className="relative flex gap-6 cursor-pointer"
                      onClick={() => handleRowClick(d.mois)}
                    >
                      <div className="flex-shrink-0 w-12 flex flex-col items-center">
                        <div
                          className="w-3 h-3 rounded-full border-4 border-white shadow-md z-10"
                          style={dotStyle}
                        />
                        <span className="text-xs font-medium text-gray-500 mt-2">{MOIS_SHORT[moisNum]}</span>
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="p-4 hover:shadow-md transition-shadow" style={cardStyle}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-semibold text-gray-900">{formatMoisLabel(d.mois)}</h3>
                              <p className="text-sm text-gray-600 mt-1">
                                Total HT: <span className="data-val">{formatEuros(d.totalHTMensuel)}</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className="text-lg font-bold data-val"
                                style={{ color: d.delta < -0.01 ? '#991B1B' : '#1B6B40' }}
                              >
                                {formatEuros(d.delta)}
                              </div>
                              <p className="text-xs text-gray-500">
                                {d.statut === 'OK' ? 'conforme' : d.statut === 'RETARD' ? 'de retard' : 'en cours'}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <p className="text-gray-500">Attendue</p>
                              <p className="font-medium text-gray-900 data-val">{formatEuros(d.remiseAttendue)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Reelle</p>
                              <p className="font-medium text-gray-900 data-val">{formatEuros(d.remiseReelle)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Decades</p>
                              <p className="font-medium text-gray-900 data-val">{d.decadesPresentes.join(', ')}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
