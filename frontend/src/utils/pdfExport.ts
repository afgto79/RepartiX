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
    { label: `Delta total`, value: fmt(totDelta), accent: false },
    { label: `Montant reversé`, value: fmt(totReversee), accent: false },
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
    // Taille de police adaptée à la longueur du label pour éviter le débordement
    const labelText = (kpi.label + ` — ${annee}`).toUpperCase();
    const labelFontSize = labelText.length > 28 ? 5.5 : 6.5;
    doc.setFontSize(labelFontSize);
    doc.setFont('helvetica', 'normal');
    doc.text(labelText, x + 3, y + 6);
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
  if (analyses.length > 0) {
    // Nouvelle page si pas assez de place (besoin d'environ 85mm)
    if (y > 205) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Delta mensuel', marginL, y);
    y += 5;

    // Dimensions
    const yAxisW = 20;          // largeur réservée aux labels de l'axe Y
    const barAreaH = 60;        // 6 cm pour les barres
    const padTop = 5;           // espace au-dessus de la ligne 0
    const padBottom = 10;       // espace sous les barres pour les labels de mois
    const chartH = padTop + barAreaH + padBottom;

    const chartX = marginL;
    const chartY = y;
    const barZoneX = chartX + yAxisW;
    const barZoneW = contentW - yAxisW;
    const zeroLineY = chartY + padTop;         // ligne "0" en haut
    const bottomBarY = zeroLineY + barAreaH;   // bas des barres

    // Fond
    doc.setFillColor(248, 250, 252);
    doc.rect(chartX, chartY, contentW, chartH, 'F');

    // Échelle
    const deltas = analyses.map(a => a.delta);
    const maxAbs = Math.max(...deltas.map(d => Math.abs(d)), 1);

    function fmtAxis(v: number): string {
      if (v >= 1000) return (v / 1000).toFixed(1).replace('.', ',') + 'k';
      return Math.round(v) + '';
    }

    // Lignes de grille et labels axe Y : 0%, 25%, 50%, 75%, 100%
    [0, 0.25, 0.5, 0.75, 1.0].forEach((t) => {
      const gy = zeroLineY + t * barAreaH;
      const isZero = t === 0;
      doc.setDrawColor(isZero ? 100 : 203, isZero ? 116 : 213, isZero ? 139 : 225);
      doc.setLineWidth(0.2);
      doc.line(barZoneX, gy, chartX + contentW - 1, gy);
      doc.setFontSize(5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const label = isZero ? '0 €' : fmtAxis(t * maxAbs) + ' €';
      doc.text(label, barZoneX - 2, gy + 1.5, { align: 'right' });
    });

    // Barres
    const slotW = barZoneW / analyses.length;
    const barW = Math.min(Math.max(slotW * 0.65, 2.5), 12);

    analyses.forEach((a, i) => {
      const barH = Math.max((Math.abs(a.delta) / maxAbs) * barAreaH, 0.8);
      const bx = barZoneX + i * slotW + (slotW - barW) / 2;

      // Toutes les barres descendent depuis la ligne 0 ; la couleur indique le signe
      if (a.delta >= -0.01) {
        doc.setFillColor(16, 185, 129); // vert — OK
      } else {
        doc.setFillColor(239, 68, 68);  // rouge — manque à gagner
      }
      doc.rect(bx, zeroLineY, barW, barH, 'F');

      // Label mois
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(moisCourt(a.mois), bx + barW / 2, bottomBarY + 6, { align: 'center' });
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
