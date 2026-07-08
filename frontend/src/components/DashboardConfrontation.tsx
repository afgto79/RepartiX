import { useEffect, useRef, useState } from 'react';
import { api, AnalyseRemise, GeneriquesData, OrpecAnnuelData } from '../services/api';
import { formatEuros } from '../utils/formatters';

const MOIS_COURTS = ['Jan.', 'Fev.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Aout', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return formatEuros(n);
}

function fmtDelta(n: number | undefined): { text: string; cls: string } {
  if (n === undefined || n === null) return { text: '—', cls: 'text-slate-400' };
  return {
    text: formatEuros(n),
    cls: n < -0.01 ? 'text-red-600 font-semibold' : n > 0.01 ? 'text-amber-600 font-semibold' : 'text-emerald-600'
  };
}

function CrossCheckBadge({ cc }: { cc: AnalyseRemise['crossCheck'] }) {
  if (!cc) return <span className="text-slate-300">—</span>;
  const ecartTxt = cc.ecart !== undefined ? ` (${cc.ecart >= 0 ? '+' : ''}${cc.ecart.toFixed(2)} €)` : '';
  switch (cc.statut) {
    case 'matched':
      return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-700">✓{ecartTxt}</span>;
    case 'mismatch':
      return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-700">✗{ecartTxt}</span>;
    case 'no_announce':
      return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-500">—</span>;
    case 'no_payment':
      return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700">⏳</span>;
    default:
      return <span className="text-slate-300">—</span>;
  }
}

function StatutBadge({ statut }: { statut: string }) {
  if (statut === 'OK') return <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-700">OK</span>;
  if (statut === 'EN_COURS') return <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700">Incomplet</span>;
  return <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-700">Retard</span>;
}

const QUARTER_LABELS = ['T1', 'T2', 'T3', 'T4'];

function getQuarter(moisKey: string): number {
  const m = parseInt(moisKey.split('-')[1]);
  return Math.ceil(m / 3) - 1; // 0-indexed
}

interface QuarterAgg {
  sumA1: number | undefined;
  sumA2: number | undefined;
  sumA3: number;
  sumB: number | undefined;
  sumC: number;
  sumDeltaCalcul: number | undefined;
  sumDeltaPaiement: number | undefined;
  hasA1: boolean;
  hasDeltaPaiement: boolean;
}

function aggregateQuarter(rows: AnalyseRemise[]): QuarterAgg {
  let sumA1: number | undefined;
  let sumA2: number | undefined;
  let sumA3 = 0;
  let sumB: number | undefined;
  let sumC = 0;
  let sumDeltaCalcul: number | undefined;
  let sumDeltaPaiement: number | undefined;
  let hasA1 = false;
  let hasDeltaPaiement = false;

  for (const r of rows) {
    sumA3 += r.theoriques?.allianceTTC ?? 0;
    sumC += r.remiseReelle;

    if (r.theoriques?.orpecAssiette !== undefined) {
      sumA1 = (sumA1 ?? 0) + r.theoriques.orpecAssiette;
      hasA1 = true;
    }
    if (r.theoriques?.girophamProxy !== undefined) {
      sumA2 = (sumA2 ?? 0) + r.theoriques.girophamProxy;
    }
    if (r.remiseAnnoncee !== undefined) {
      sumB = (sumB ?? 0) + r.remiseAnnoncee;
    }
    if (r.deltaCalcul !== undefined) {
      sumDeltaCalcul = (sumDeltaCalcul ?? 0) + r.deltaCalcul;
    }
    if (r.deltaPaiement !== undefined) {
      sumDeltaPaiement = (sumDeltaPaiement ?? 0) + r.deltaPaiement;
      hasDeltaPaiement = true;
    }
  }

  return { sumA1, sumA2, sumA3, sumB, sumC, sumDeltaCalcul, sumDeltaPaiement, hasA1, hasDeltaPaiement };
}

function hasQuarterAlert(agg: QuarterAgg): boolean {
  if (!agg.hasDeltaPaiement || agg.sumDeltaPaiement === undefined) return false;
  if (!agg.hasA1 || !agg.sumA1) return false;
  return Math.abs(agg.sumDeltaPaiement) > 0.03 * agg.sumA1;
}

function exportCSV(annee: number, mois: AnalyseRemise[], orpecAnnuel: OrpecAnnuelData | null) {
  const BOM = '﻿';
  const SEP = ';';
  const CRLF = '\r\n';

  const headers = [
    'MOIS', 'A1_ORPEC_HT', 'A2_GIROPHARM', 'A3_ALLIANCE_TTC',
    'B_ANNONCE_HT', 'C_VERSE_TTC', 'A1_MOINS_B', 'B_MOINS_C',
    'CROSSCHECK', 'STATUT'
  ].join(SEP);

  function numFR(n: number | undefined): string {
    if (n === undefined || n === null) return '';
    return n.toFixed(2).replace('.', ',');
  }

  const rows = mois.map(r => {
    const [y, m] = r.mois.split('-');
    const moisLabel = `${MOIS_COURTS[parseInt(m) - 1]} ${y}`;
    const cc = r.crossCheck;
    let ccTxt = '';
    if (cc) {
      if (cc.statut === 'matched') ccTxt = `OK (${cc.ecart !== undefined ? cc.ecart.toFixed(2).replace('.', ',') : '0,00'})`;
      else if (cc.statut === 'mismatch') ccTxt = `ECART (${cc.ecart !== undefined ? cc.ecart.toFixed(2).replace('.', ',') : ''})`;
      else if (cc.statut === 'no_announce') ccTxt = 'PAS_ANNONCE';
      else if (cc.statut === 'no_payment') ccTxt = 'PAS_PAIEMENT';
    }
    return [
      moisLabel,
      numFR(r.theoriques?.orpecAssiette),
      numFR(r.theoriques?.girophamProxy),
      numFR(r.theoriques?.allianceTTC),
      numFR(r.remiseAnnoncee),
      numFR(r.remiseReelle),
      numFR(r.deltaCalcul),
      numFR(r.deltaPaiement),
      ccTxt,
      r.statut
    ].join(SEP);
  });

  let content = BOM + headers + CRLF + rows.join(CRLF);

  if (orpecAnnuel) {
    content += CRLF + CRLF;
    content += `REF_ANNUELLE_${annee}${SEP}${numFR(orpecAnnuel.assiette)}${SEP}${SEP}${SEP}${SEP}${numFR(orpecAnnuel.remiseVersee)}${SEP}${SEP}${numFR(orpecAnnuel.delta)}` + CRLF;
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `confrontation_${annee}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DashboardConfrontation() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [years, setYears] = useState<number[]>([new Date().getFullYear()]);
  const [mois, setMois] = useState<AnalyseRemise[]>([]);
  const [orpecAnnuel, setOrpecAnnuel] = useState<OrpecAnnuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generiques, setGeneriques] = useState<GeneriquesData | null>(null);
  const [generiquesLoading, setGeneriquesLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getAnnees().then(setYears).catch(console.error);
    api.getGeneriques().then(setGeneriques).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getDashboard(annee)
      .then(d => {
        setMois(d.mois);
        setOrpecAnnuel(d.orpecAnnuel ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [annee, generiques]);  // re-fetch quand generiques change

  function handleImportGeneriques(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setGeneriquesLoading(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const result = await api.importGeneriques(json);
        setGeneriques(result);
      } catch (err) {
        alert('Erreur import JSON : ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setGeneriquesLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  async function handleDeleteGeneriques() {
    if (!confirm('Supprimer les données génériques ? A2 sera recalculé sans ces données.')) return;
    await api.deleteGeneriques();
    setGeneriques(null);
  }

  // Group months by quarter
  const quarters: AnalyseRemise[][] = [[], [], [], []];
  for (const m of mois) quarters[getQuarter(m.mois)].push(m);

  // Annual totals
  const annualA1 = mois.some(m => m.theoriques?.orpecAssiette !== undefined)
    ? mois.reduce((s, m) => s + (m.theoriques?.orpecAssiette ?? 0), 0)
    : undefined;
  const annualA2 = mois.some(m => m.theoriques?.girophamProxy !== undefined)
    ? mois.reduce((s, m) => s + (m.theoriques?.girophamProxy ?? 0), 0)
    : undefined;
  const annualA3 = mois.reduce((s, m) => s + (m.theoriques?.allianceTTC ?? 0), 0);
  const annualB = mois.some(m => m.remiseAnnoncee !== undefined)
    ? mois.reduce((s, m) => s + (m.remiseAnnoncee ?? 0), 0)
    : undefined;
  const annualC = mois.reduce((s, m) => s + m.remiseReelle, 0);
  const annualDeltaCalcul = mois.some(m => m.deltaCalcul !== undefined)
    ? mois.reduce((s, m) => s + (m.deltaCalcul ?? 0), 0)
    : undefined;
  const annualDeltaPaiement = mois.some(m => m.deltaPaiement !== undefined)
    ? mois.reduce((s, m) => s + (m.deltaPaiement ?? 0), 0)
    : undefined;

  if (loading) return <div className="p-6 text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="p-6 space-y-5">
      {/* Header + controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Triptyque A / B / C — {annee}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            A1 = ORPEC (HT) · A2 = Giropharm{generiques ? ` (${generiques.entrees.length} entrées)` : ' (N/A)'} · A3 = Alliance TTC · B = Annoncé (HT) · C = Versé (TTC)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={annee}
            onChange={e => setAnnee(parseInt(e.target.value))}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {/* Import génériques */}
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportGeneriques} />
          {generiques ? (
            <button
              onClick={handleDeleteGeneriques}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              title={`Importé le ${new Date(generiques.dateImport).toLocaleDateString('fr-FR')}`}
            >
              ✓ Génériques
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={generiquesLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {generiquesLoading ? '…' : '⊕ Importer génériques'}
            </button>
          )}
          {mois.length > 0 && (
            <button
              onClick={() => exportCSV(annee, mois, orpecAnnuel)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Main table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Mois</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">A1 ORPEC (HT)</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">A2 Giropharm</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">A3 Alliance (TTC)</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">B Annoncé (HT)</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">C Versé (TTC)</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">A1 − B</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">B − C</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">CrossCheck</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mois.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-slate-400">
                    Aucune donnée pour {annee}
                  </td>
                </tr>
              )}
              {quarters.map((qRows, qi) => {
                if (qRows.length === 0) return null;
                const agg = aggregateQuarter(qRows);
                const alert = hasQuarterAlert(agg);
                const deltaC = fmtDelta(agg.sumDeltaCalcul);
                const deltaP = fmtDelta(agg.sumDeltaPaiement);
                return (
                  <>
                    {qRows.map(r => {
                      const [y, m] = r.mois.split('-');
                      const moisLabel = `${MOIS_COURTS[parseInt(m) - 1]} ${y}`;
                      const dc = fmtDelta(r.deltaCalcul);
                      const dp = fmtDelta(r.deltaPaiement);
                      return (
                        <tr key={r.mois} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 text-slate-800 font-medium whitespace-nowrap">{moisLabel}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{fmt(r.theoriques?.orpecAssiette)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{fmt(r.theoriques?.girophamProxy)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{fmt(r.theoriques?.allianceTTC)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{fmt(r.remiseAnnoncee)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{formatEuros(r.remiseReelle)}</td>
                          <td className={`px-3 py-2 text-right ${dc.cls}`}>{dc.text}</td>
                          <td className={`px-3 py-2 text-right ${dp.cls}`}>{dp.text}</td>
                          <td className="px-3 py-2"><CrossCheckBadge cc={r.crossCheck} /></td>
                          <td className="px-3 py-2"><StatutBadge statut={r.statut} /></td>
                        </tr>
                      );
                    })}
                    {/* Quarter subtotal */}
                    <tr className={`border-t border-slate-200 ${alert ? 'bg-amber-50' : 'bg-slate-50'}`}>
                      <td className="px-4 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        {QUARTER_LABELS[qi]}
                        {alert && (
                          <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 text-[9px] font-bold">
                            ⚠ Écart &gt;3%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-[10px] font-semibold text-slate-700">{fmt(agg.sumA1)}</td>
                      <td className="px-3 py-2 text-right text-[10px] font-semibold text-slate-700">{fmt(agg.sumA2)}</td>
                      <td className="px-3 py-2 text-right text-[10px] font-semibold text-slate-700">{formatEuros(agg.sumA3)}</td>
                      <td className="px-3 py-2 text-right text-[10px] font-semibold text-slate-700">{fmt(agg.sumB)}</td>
                      <td className="px-3 py-2 text-right text-[10px] font-semibold text-slate-700">{formatEuros(agg.sumC)}</td>
                      <td className={`px-3 py-2 text-right text-[10px] ${deltaC.cls}`}>{deltaC.text}</td>
                      <td className={`px-3 py-2 text-right text-[10px] ${deltaP.cls}`}>{deltaP.text}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2" />
                    </tr>
                  </>
                );
              })}
            </tbody>
            {mois.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100">
                  <td className="px-4 py-3 text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total {annee}</td>
                  <td className="px-3 py-3 text-right text-[11px] font-bold text-slate-800">{fmt(annualA1)}</td>
                  <td className="px-3 py-3 text-right text-[11px] font-bold text-slate-800">{fmt(annualA2)}</td>
                  <td className="px-3 py-3 text-right text-[11px] font-bold text-slate-800">{formatEuros(annualA3)}</td>
                  <td className="px-3 py-3 text-right text-[11px] font-bold text-slate-800">{fmt(annualB)}</td>
                  <td className="px-3 py-3 text-right text-[11px] font-bold text-slate-800">{formatEuros(annualC)}</td>
                  <td className={`px-3 py-3 text-right text-[11px] ${fmtDelta(annualDeltaCalcul).cls}`}>{fmtDelta(annualDeltaCalcul).text}</td>
                  <td className={`px-3 py-3 text-right text-[11px] ${fmtDelta(annualDeltaPaiement).cls}`}>{fmtDelta(annualDeltaPaiement).text}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Référence annuelle ORPEC (bloc séparé, non mensualisée) */}
      {orpecAnnuel && (
        <div className="bg-white rounded-xl border border-purple-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            Référence annuelle ORPEC — {annee}
            <span className="ml-2 text-[10px] font-normal text-slate-400">(non mensualisée — source : {orpecAnnuel.source})</span>
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Assiette</p>
              <p className="text-lg font-bold text-slate-800">{formatEuros(orpecAnnuel.assiette)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Due (3%)</p>
              <p className="text-lg font-bold text-slate-800">{formatEuros(orpecAnnuel.remiseDue)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Versée</p>
              <p className="text-lg font-bold text-slate-800">{formatEuros(orpecAnnuel.remiseVersee)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Delta</p>
              <p className={`text-lg font-bold ${orpecAnnuel.delta < -0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatEuros(orpecAnnuel.delta)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Légende */}
      <div className="bg-slate-50 rounded-xl border border-slate-100 px-5 py-3">
        <p className="text-[10px] text-slate-500 font-semibold mb-1.5">Légende</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-slate-500">
          <span><strong>A1</strong> = 3% × assiette ORPEC Sans RSF (HT, saisie PIEVE)</span>
          <span><strong>A2</strong> = proxy Giropharm : 3% × (debitHT − CA génériques ≥350€/labo − Alvita)</span>
          <span><strong>A3</strong> = 3% × assiette Alliance TTC (estimation)</span>
          <span><strong>B</strong> = remise annoncée sur facture ORPEC / tableau PIEVE (HT)</span>
          <span><strong>C</strong> = remise D3 mois M+1 (TTC — décalage M−1 confirmé)</span>
          <span><strong>A1−B</strong> = écart de calcul (positif = ORPEC annonce moins que le dû)</span>
          <span><strong>B−C</strong> = écart de paiement (positif = versé moins qu'annoncé)</span>
          <span>⚠ Alerte trimestrielle si |Σ B−C| &gt; 3% de Σ A1 du trimestre</span>
        </div>
      </div>
    </div>
  );
}
