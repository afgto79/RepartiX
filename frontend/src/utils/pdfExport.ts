import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnalyseRemise, Payment } from '../services/api';

const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function moisCourt(moisKey: string): string {
  const m = parseInt(moisKey.split('-')[1]) - 1;
  return MOIS_COURTS[m] ?? '';
}

function fmt(n: number): string {
  // toLocaleString fr-FR uses U+202F (narrow no-break space) as thousands separator,
  // absent from jsPDF Helvetica Latin-1 → replace with regular space
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ') + ' \u20ac';
}

export function exportYearlyPDF(annee: number, analyses: AnalyseRemise[], payments: Payment[] = []): void {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageW = 210;
  const marginL = 20;
  const marginR = 20;
  const contentW = pageW - marginL - marginR;
  let y = 20;

  // === HEADER ===
  doc.setFillColor(107, 45, 139); // #6B2D8B
  doc.rect(marginL, y, contentW, 20, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Pharmacie de Premont', marginL + 5, y + 9);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Rapport annuel de remises Alliance Healthcare', marginL + 5, y + 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Année ${annee}`, pageW - marginR - 4, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(`Exporté le ${today}`, pageW - marginR - 4, y + 15, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  y += 26;

  // === KPI — yearly data only (from analyses, NOT global cumul) ===
  const totAttendue = analyses.reduce((s, a) => s + a.remiseAttendue, 0);
  const totReversee = analyses.reduce((s, a) => s + a.reversee, 0);
  const totFrais = analyses.reduce((s, a) => s + a.fraisGeneraux, 0);
  const totDelta = analyses.reduce((s, a) => s + a.delta, 0);
  const totalRecupere = payments
    .filter(p => p.date.startsWith(String(annee)))
    .reduce((s, p) => s + p.amount, 0);
  const deficitBrut = totDelta < 0 ? Math.abs(totDelta) : 0;
  const resteAPercevoir = Math.max(0, deficitBrut - totalRecupere);

  const kpis = [
    { label: `Reste à percevoir`, value: fmt(resteAPercevoir), accent: true },
    { label: `Récupéré via réclamations`, value: fmt(totalRecupere), accent: false },
    { label: `Montant reversé`, value: fmt(totReversee), accent: false },
    { label: `Delta total`, value: fmt(totDelta), accent: false },
  ];

  const kpiW = (contentW - 9) / 4;
  kpis.forEach((kpi, i) => {
    const x = marginL + i * (kpiW + 3);
    if (kpi.accent) {
      doc.setFillColor(107, 45, 139);
      doc.rect(x, y, kpiW, 22, 'F');
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(x, y, kpiW, 22, 'FD');
      doc.setTextColor(100, 116, 139);
    }
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text((kpi.label + ` — ${annee}`).toUpperCase(), x + 3, y + 6);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + 3, y + 16);
    doc.setTextColor(0, 0, 0);
  });

  y += 28;

  // === MONTHLY TABLE ===
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(`Récapitulatif mensuel — ${annee}`, marginL, y);
  y += 4;

  const tableRows: (string | { content: string; styles: object })[][] = analyses.map(a => [
    moisCourt(a.mois) + ' ' + annee,
    fmt(a.remiseAttendue),
    fmt(a.remiseReelle),
    a.fraisGeneraux > 0 ? fmt(a.fraisGeneraux) : '—',
    fmt(a.reversee),
    fmt(a.delta),
  ]);

  tableRows.push([
    'Total',
    fmt(totAttendue),
    fmt(analyses.reduce((s, a) => s + a.remiseReelle, 0)),
    fmt(totFrais),
    fmt(totReversee),
    fmt(totDelta),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Mois', 'Attendue', 'Annoncée', 'Frais', 'Reversée', 'Delta']],
    body: tableRows,
    margin: { left: marginL, right: marginR },
    styles: { fontSize: 7.5, cellPadding: 1.8 },
    headStyles: {
      fillColor: [107, 45, 139],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 26 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didParseCell: (data) => {
      const isTotal = data.row.index === tableRows.length - 1;
      if (isTotal && data.section === 'body') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
      // Delta column color
      if (data.column.index === 5 && data.section === 'body' && !isTotal) {
        const a = analyses[data.row.index];
        if (a) {
          data.cell.styles.textColor = a.delta < -0.01 ? [220, 38, 38] : [16, 185, 129];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y + 90) + 8;

  // === BAR CHART ===
  if (y < 248 && analyses.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Delta mensuel', marginL, y);
    y += 4;

    const chartH = 42;
    const chartW = contentW;
    const chartX = marginL;
    const chartY = y;

    doc.setFillColor(248, 250, 252);
    doc.rect(chartX, chartY, chartW, chartH, 'F');

    const deltas = analyses.map(a => a.delta);
    const maxAbs = Math.max(...deltas.map(d => Math.abs(d)), 0.01);
    const barAreaH = chartH - 10;
    const baseline = chartY + barAreaH / 2 + 3;

    // Baseline
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(chartX + 3, baseline, chartX + chartW - 3, baseline);

    const slotW = (chartW - 6) / analyses.length;
    const barW = Math.max(slotW * 0.6, 3);
    const barMaxH = (barAreaH / 2) - 2;

    analyses.forEach((a, i) => {
      const barH = Math.max((Math.abs(a.delta) / maxAbs) * barMaxH, 0.5);
      const bx = chartX + 3 + i * slotW + (slotW - barW) / 2;

      if (a.delta >= -0.01) {
        doc.setFillColor(16, 185, 129); // green — OK
        doc.rect(bx, baseline - barH, barW, barH, 'F');
      } else {
        doc.setFillColor(239, 68, 68); // red — shortfall
        doc.rect(bx, baseline, barW, barH, 'F');
      }

      doc.setFontSize(5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(moisCourt(a.mois), bx + barW / 2, chartY + chartH - 2, { align: 'center' });
    });

    y += chartH;
  }

  // === FOOTER ===
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('RepartiX \u00a9 2026 \u2014 analyse de remise grossiste', pageW / 2, 285, { align: 'center' });

  doc.save(`RepartiX_${annee}.pdf`);
}
