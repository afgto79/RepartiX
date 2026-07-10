import { CSSProperties, Fragment, useEffect, useRef, useState } from 'react';
import { api, AnalyseRemise, GeneriquesData, OrpecAnnuelData } from '../services/api';
import { formatEuros } from '../utils/formatters';

const MOIS_COURTS = ['Jan.', 'Fév.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return '—';
  return formatEuros(n);
}

function fmtDelta(n: number | undefined): { text: string; color: string } {
  if (n === undefined || n === null) return { text: '—', color: '#94A3B8' };
  return {
    text: formatEuros(n),
    color: n < -0.01 ? '#991B1B' : n > 0.01 ? '#B45309' : '#1B6B40',
  };
}

function CrossCheckBadge({ cc }: { cc: AnalyseRemise['crossCheck'] }) {
  if (!cc) return <span style={{ color: '#CBD5E1' }}>—</span>;
  const ecart = cc.ecart !== undefined ? ` (${cc.ecart >= 0 ? '+' : ''}${cc.ecart.toFixed(2)} €)` : '';
  switch (cc.statut) {
    case 'matched':
      return (
        <span className="data-val inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded"
          style={{ backgroundColor: '#E8F5EE', color: '#1B6B40' }}>
          ✓{ecart}
        </span>
      );
    case 'mismatch':
      return (
        <span className="data-val inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-800">
          ✗{ecart}
        </span>
      );
    case 'no_announce':
      return (
        <span className="inline-flex px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-400">
          —
        </span>
      );
    case 'no_payment':
      return (
        <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700">
          ⏳
        </span>
      );
    default:
      return <span style={{ color: '#CBD5E1' }}>—</span>;
  }
}

function StatutBadge({ statut }: { statut: string }) {
  if (statut === 'OK') {
    return (
      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded"
        style={{ backgroundColor: '#E8F5EE', color: '#1B6B40' }}>
        OK
      </span>
    );
  }
  if (statut === 'EN_COURS') {
    return (
      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-100 text-amber-700">
        Incomplet
      </span>
    );
  }
  return (
    <span className="inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-800">
      Retard
    </span>
  );
}

const QUARTER_LABELS = ['T1', 'T2', 'T3', 'T4'];

function getQuarter(moisKey: string): number {
  const m = parseInt(moisKey.split('-')[1]);
  return Math.ceil(m / 3) - 1;
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

// ─── Styles partagés ────────────────────────────────────────────────────────

const CARD: CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '4px',
};

const TH_BASE = 'text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap';

// Couleurs de groupe colonnes
const GRP_BASES   = { color: '#64748B' as const };
const GRP_CONSTATE = { color: '#64748B' as const };
const GRP_ECARTS  = { color: '#B45309' as const, backgroundColor: '#FFFBEB' as const };
const GRP_CTRL    = { color: '#64748B' as const };
const SEP_LEFT: React.CSSProperties = { borderLeft: '1px solid #E2E8F0' };
const SEP_LEFT_AMBER: React.CSSProperties = { borderLeft: '1px solid #FDE68A' };

// ─── Composant ─────────────────────────────────────────────────────────────

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
  }, [annee, generiques]);

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

  const quarters: AnalyseRemise[][] = [[], [], [], []];
  for (const m of mois) quarters[getQuarter(m.mois)].push(m);

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

  if (loading) {
    return <div className="p-6 text-sm" style={{ color: '#64748B' }}>Chargement…</div>;
  }

  return (
    <div className="p-5 space-y-4">

      {/* ─── En-tête + contrôles ─── */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#1A2332' }}>
            Triptyque A / B / C — <span className="data-val">{annee}</span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            A1 = ORPEC (HT) · A2 = Giropharm{generiques ? ` (${generiques.entrees.length} entrées)` : ' (N/A)'} · A3 = Alliance TTC · B = Annoncé (HT) · C = Versé (TTC)
          </p>
        </div>

        <div className="no-print flex items-center gap-2">
          <select
            value={annee}
            onChange={e => setAnnee(parseInt(e.target.value))}
            className="text-xs px-2 py-1.5"
            style={{ border: '1px solid #E2E8F0', borderRadius: '3px', backgroundColor: '#fff', color: '#64748B' }}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportGeneriques} />

          {generiques ? (
            <button
              onClick={handleDeleteGeneriques}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                border: '1px solid #C8E8D5',
                borderRadius: '3px',
                color: '#1B6B40',
                backgroundColor: '#E8F5EE',
              }}
              title={`Importé le ${new Date(generiques.dateImport).toLocaleDateString('fr-FR')}`}
            >
              ✓ Génériques
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={generiquesLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                border: '1px solid #FDE68A',
                borderRadius: '3px',
                color: '#B45309',
                backgroundColor: '#FFFBEB',
              }}
            >
              {generiquesLoading ? '…' : '⊕ Importer génériques'}
            </button>
          )}

          {mois.length > 0 && (
            <button
              onClick={() => exportCSV(annee, mois, orpecAnnuel)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors"
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
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* ─── Tableau principal ─── */}
      <div style={{ ...CARD, overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>

            {/* En-tête groupé sur 2 lignes */}
            <thead>
              {/* Ligne 1 : groupes */}
              <tr style={{ backgroundColor: '#F8FAFB' }}>
                <th
                  rowSpan={2}
                  className={`${TH_BASE} text-left px-4 py-2 align-bottom`}
                  style={{ ...GRP_BASES, borderBottom: '2px solid #E2E8F0' }}
                >
                  Mois
                </th>
                <th
                  colSpan={3}
                  className="text-center py-1.5 px-2 text-[9px] font-bold uppercase tracking-widest"
                  style={{ ...GRP_BASES, ...SEP_LEFT, borderBottom: '1px solid #E2E8F0' }}
                >
                  Bases de calcul
                </th>
                <th
                  colSpan={2}
                  className="text-center py-1.5 px-2 text-[9px] font-bold uppercase tracking-widest"
                  style={{ ...GRP_CONSTATE, ...SEP_LEFT, borderBottom: '1px solid #E2E8F0' }}
                >
                  Constaté
                </th>
                <th
                  colSpan={2}
                  className="text-center py-1.5 px-2 text-[9px] font-bold uppercase tracking-widest"
                  style={{ ...GRP_ECARTS, ...SEP_LEFT_AMBER, borderBottom: '1px solid #FDE68A' }}
                >
                  Écarts
                </th>
                <th
                  colSpan={2}
                  className="text-center py-1.5 px-2 text-[9px] font-bold uppercase tracking-widest"
                  style={{ ...GRP_CTRL, ...SEP_LEFT, borderBottom: '1px solid #E2E8F0' }}
                >
                  Contrôle
                </th>
              </tr>

              {/* Ligne 2 : colonnes individuelles */}
              <tr style={{ backgroundColor: '#F8FAFB', borderBottom: '2px solid #E2E8F0' }}>
                {/* A1, A2, A3 */}
                <th className={`${TH_BASE} text-right px-3 py-2`} style={{ ...GRP_BASES, ...SEP_LEFT }}>A1 ORPEC HT</th>
                <th className={`${TH_BASE} text-right px-3 py-2`} style={GRP_BASES}>A2 Giropharm</th>
                <th className={`${TH_BASE} text-right px-3 py-2`} style={GRP_BASES}>A3 Alliance TTC</th>
                {/* B, C */}
                <th className={`${TH_BASE} text-right px-3 py-2`} style={{ ...GRP_CONSTATE, ...SEP_LEFT }}>B Annoncé HT</th>
                <th className={`${TH_BASE} text-right px-3 py-2`} style={GRP_CONSTATE}>C Versé TTC</th>
                {/* A1-B, B-C */}
                <th className={`${TH_BASE} text-right px-3 py-2`} style={{ ...GRP_ECARTS, ...SEP_LEFT_AMBER }}>A1 − B</th>
                <th className={`${TH_BASE} text-right px-3 py-2`} style={GRP_ECARTS}>B − C</th>
                {/* CC, Statut */}
                <th className={`${TH_BASE} px-3 py-2`} style={{ ...GRP_CTRL, ...SEP_LEFT }}>CC</th>
                <th className={`${TH_BASE} px-3 py-2`} style={GRP_CTRL}>Statut</th>
              </tr>
            </thead>

            <tbody>
              {mois.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-sm" style={{ color: '#94A3B8' }}>
                    Aucune donnée pour {annee}
                  </td>
                </tr>
              )}

              {quarters.map((qRows, qi) => {
                if (qRows.length === 0) return null;
                const agg = aggregateQuarter(qRows);
                const alert = hasQuarterAlert(agg);
                const dc = fmtDelta(agg.sumDeltaCalcul);
                const dp = fmtDelta(agg.sumDeltaPaiement);

                return (
                  <Fragment key={qi}>
                    {/* Lignes mensuelles */}
                    {qRows.map((r, rowIdx) => {
                      const [y, m] = r.mois.split('-');
                      const moisLabel = `${MOIS_COURTS[parseInt(m) - 1]} ${y}`;
                      const rdeltaC = fmtDelta(r.deltaCalcul);
                      const rdeltaP = fmtDelta(r.deltaPaiement);
                      const rowBg = r.statut === 'RETARD'
                        ? '#FFF5F5'
                        : r.statut === 'EN_COURS'
                        ? '#FFFBEB'
                        : '#fff';

                      return (
                        <tr
                          key={r.mois}
                          style={{
                            backgroundColor: rowBg,
                            borderBottom: rowIdx < qRows.length - 1
                              ? '1px solid #F1F5F9'
                              : 'none',
                          }}
                        >
                          <td className="px-4 py-2 font-medium whitespace-nowrap" style={{ color: '#1A2332' }}>
                            {moisLabel}
                          </td>
                          <td className="data-val px-3 py-2 text-right" style={{ color: '#64748B', ...SEP_LEFT }}>{fmt(r.theoriques?.orpecAssiette)}</td>
                          <td className="data-val px-3 py-2 text-right" style={{ color: '#64748B' }}>{fmt(r.theoriques?.girophamProxy)}</td>
                          <td className="data-val px-3 py-2 text-right" style={{ color: '#64748B' }}>{fmt(r.theoriques?.allianceTTC)}</td>
                          <td className="data-val px-3 py-2 text-right" style={{ color: '#64748B', ...SEP_LEFT }}>{fmt(r.remiseAnnoncee)}</td>
                          <td className="data-val px-3 py-2 text-right" style={{ color: '#64748B' }}>{formatEuros(r.remiseReelle)}</td>
                          <td className="data-val px-3 py-2 text-right font-semibold" style={{ color: rdeltaC.color, ...SEP_LEFT_AMBER }}>{rdeltaC.text}</td>
                          <td className="data-val px-3 py-2 text-right font-semibold" style={{ color: rdeltaP.color }}>{rdeltaP.text}</td>
                          <td className="px-3 py-2" style={SEP_LEFT}><CrossCheckBadge cc={r.crossCheck} /></td>
                          <td className="px-3 py-2"><StatutBadge statut={r.statut} /></td>
                        </tr>
                      );
                    })}

                    {/* Sous-total trimestriel */}
                    <tr style={{
                      backgroundColor: alert ? '#FFFBEB' : '#F8FAFB',
                      borderTop: '1px solid #E2E8F0',
                      borderBottom: '2px solid #E2E8F0',
                    }}>
                      <td className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>
                        {QUARTER_LABELS[qi]}
                        {alert && (
                          <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ backgroundColor: '#FDE68A', color: '#92400E' }}>
                            ⚠ Écart &gt;3%
                          </span>
                        )}
                      </td>
                      <td className="data-val px-3 py-2 text-right text-[10px] font-semibold" style={{ color: '#1A2332', ...SEP_LEFT }}>{fmt(agg.sumA1)}</td>
                      <td className="data-val px-3 py-2 text-right text-[10px] font-semibold" style={{ color: '#1A2332' }}>{fmt(agg.sumA2)}</td>
                      <td className="data-val px-3 py-2 text-right text-[10px] font-semibold" style={{ color: '#1A2332' }}>{formatEuros(agg.sumA3)}</td>
                      <td className="data-val px-3 py-2 text-right text-[10px] font-semibold" style={{ color: '#1A2332', ...SEP_LEFT }}>{fmt(agg.sumB)}</td>
                      <td className="data-val px-3 py-2 text-right text-[10px] font-semibold" style={{ color: '#1A2332' }}>{formatEuros(agg.sumC)}</td>
                      <td className="data-val px-3 py-2 text-right text-[10px] font-semibold" style={{ color: dc.color, ...SEP_LEFT_AMBER }}>{dc.text}</td>
                      <td className="data-val px-3 py-2 text-right text-[10px] font-semibold" style={{ color: dp.color }}>{dp.text}</td>
                      <td className="px-3 py-2" style={SEP_LEFT} />
                      <td className="px-3 py-2" />
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>

            {/* Total annuel */}
            {mois.length > 0 && (() => {
              const adC = fmtDelta(annualDeltaCalcul);
              const adP = fmtDelta(annualDeltaPaiement);
              return (
                <tfoot>
                  <tr style={{ backgroundColor: '#F1F5F9', borderTop: '2px solid #CBD5E1' }}>
                    <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#1A2332' }}>
                      Total {annee}
                    </td>
                    <td className="data-val px-3 py-3 text-right text-[11px] font-bold" style={{ color: '#1A2332', ...SEP_LEFT }}>{fmt(annualA1)}</td>
                    <td className="data-val px-3 py-3 text-right text-[11px] font-bold" style={{ color: '#1A2332' }}>{fmt(annualA2)}</td>
                    <td className="data-val px-3 py-3 text-right text-[11px] font-bold" style={{ color: '#1A2332' }}>{formatEuros(annualA3)}</td>
                    <td className="data-val px-3 py-3 text-right text-[11px] font-bold" style={{ color: '#1A2332', ...SEP_LEFT }}>{fmt(annualB)}</td>
                    <td className="data-val px-3 py-3 text-right text-[11px] font-bold" style={{ color: '#1A2332' }}>{formatEuros(annualC)}</td>
                    <td className="data-val px-3 py-3 text-right text-[11px] font-bold" style={{ color: adC.color, ...SEP_LEFT_AMBER }}>{adC.text}</td>
                    <td className="data-val px-3 py-3 text-right text-[11px] font-bold" style={{ color: adP.color }}>{adP.text}</td>
                    <td className="px-3 py-3" style={SEP_LEFT} />
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>

      {/* ─── Référence annuelle ORPEC ─── */}
      {orpecAnnuel && (
        <div style={{ ...CARD, borderLeft: '3px solid #1B6B40', padding: '1.25rem' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#1A2332' }}>
            Référence annuelle ORPEC — <span className="data-val">{annee}</span>
            <span className="ml-2 text-[10px] font-normal" style={{ color: '#94A3B8' }}>
              (non mensualisée — source : {orpecAnnuel.source})
            </span>
          </h3>
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: 'Assiette', value: formatEuros(orpecAnnuel.assiette), color: '#1A2332' },
              { label: 'Due (3 %)', value: formatEuros(orpecAnnuel.remiseDue), color: '#1A2332' },
              { label: 'Versée', value: formatEuros(orpecAnnuel.remiseVersee), color: '#1A2332' },
              {
                label: 'Delta',
                value: formatEuros(orpecAnnuel.delta),
                color: orpecAnnuel.delta < -0.01 ? '#991B1B' : '#1B6B40',
              },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>{label}</p>
                <p className="data-val text-lg font-bold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Légende ─── */}
      <div style={{ backgroundColor: '#F8FAFB', border: '1px solid #E2E8F0', borderRadius: '4px', padding: '0.75rem 1.25rem' }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#64748B' }}>
          Légende
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[10px]" style={{ color: '#64748B' }}>
          <span><strong style={{ color: '#1A2332' }}>A1</strong> = 3% × assiette ORPEC Sans RSF (HT, saisie PIEVE)</span>
          <span><strong style={{ color: '#1A2332' }}>A2</strong> = proxy Giropharm : 3% × (debitHT − CA génériques ≥350€/labo − Alvita)</span>
          <span><strong style={{ color: '#1A2332' }}>A3</strong> = 3% × assiette Alliance TTC (estimation)</span>
          <span><strong style={{ color: '#1A2332' }}>B</strong> = remise annoncée sur facture ORPEC / tableau PIEVE (HT)</span>
          <span><strong style={{ color: '#1A2332' }}>C</strong> = remise D3 mois M+1 (TTC — décalage M−1 confirmé)</span>
          <span><strong style={{ color: '#B45309' }}>A1−B</strong> = écart de calcul (positif = ORPEC annonce moins que le dû)</span>
          <span><strong style={{ color: '#B45309' }}>B−C</strong> = écart de paiement (⚠ inclut érosion TVA ~6%, ≠ impayé)</span>
          <span>Alerte trimestrielle si |Σ B−C| &gt; 3% de Σ A1 du trimestre</span>
        </div>
      </div>

    </div>
  );
}
