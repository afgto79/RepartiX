import * as pdfjs from 'pdfjs-dist';
import { Releve } from '../types/releve';

// Desactiver le worker pour usage Node.js
const pdfjsLib = pdfjs as typeof pdfjs & { GlobalWorkerOptions: { workerSrc: string } };
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
}

interface PdfTextItem {
  str: string;
  transform: number[];
}

/**
 * Parse un PDF de releve Alliance Healthcare.
 * Retourne null si le parsing echoue completement.
 */
export async function parsePDF(filePath: string): Promise<Partial<Releve> | null> {
  try {
    const loadingTask = pdfjs.getDocument({
      url: filePath,
      useSystemFonts: true,
      disableFontFace: true
    });
    const pdf = await loadingTask.promise;

    // Extraire tout le texte
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = (content.items as unknown as PdfTextItem[])
        .filter(item => typeof item.str === 'string')
        .map(item => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    console.info('[PDF Parser] Texte extrait, longueur:', fullText.length);

    // Extraction des champs
    const extracted = extractFields(fullText);

    // Validation minimale
    if (!extracted.annee || !extracted.mois || !extracted.decade || !extracted.totalNetHT) {
      console.error('[PDF Parser] Champs critiques manquants:', {
        annee: extracted.annee,
        mois: extracted.mois,
        decade: extracted.decade,
        totalNetHT: extracted.totalNetHT
      });
      return null;
    }

    return {
      ...extracted,
      fournisseur: 'Alliance Healthcare',
      importedAt: new Date().toISOString(),
      parsingStatus: hasAllFields(extracted) ? 'success' : 'partial'
    };
  } catch (err) {
    console.error('[PDF Parser] Erreur parsing PDF:', err);
    return null;
  }
}

function extractFields(text: string): Partial<Releve> {
  const fields: Partial<Releve> = {};
  const errors: string[] = [];

  // === 1. PERIODE ET DATE ===
  // Texte extrait: "période du   21/12/2025   au   31/12/2025"
  const periodeRegex = /p[ée]riode\s+du\s+\d{2}\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{2})\/(\d{4})/i;
  const periodeMatch = text.match(periodeRegex);

  if (periodeMatch) {
    fields.annee = parseInt(periodeMatch[5]);
    fields.mois = parseInt(periodeMatch[4]);
    const jourFin = parseInt(periodeMatch[3]);

    if (jourFin <= 10) {
      fields.decade = 1;
    } else if (jourFin <= 20) {
      fields.decade = 2;
    } else {
      fields.decade = 3;
    }
    console.info(`[PDF Parser] Periode: jour fin=${jourFin}, mois=${fields.mois}, annee=${fields.annee} -> decade ${fields.decade}`);
  } else {
    errors.push('Periode non trouvee dans le texte');
  }

  // === 2. TOTAL NET HT ===
  // Structure du texte extrait par pdfjs:
  // "Total relevé de factures   Débit HT   Crédit HT   net HT   Exonéré   Tx 2,10 ... TVA   net TTC 10729,65   -879,26   9850,39   0,00   ..."
  // Les valeurs suivent directement les headers. Ordre: Débit HT, Crédit HT, net HT
  // Apres "net TTC" viennent les valeurs: 1er=Débit HT, 2eme=Crédit HT, 3eme=net HT
  const totalRegex = /Total\s+relev[ée]\s+de\s+factures\s+.*?net\s+TTC\s+([\d][\d\s]*[,\.]\d{2})\s+([-]?[\d][\d\s]*[,\.]\d{2})\s+([-]?[\d][\d\s]*[,\.]\d{2})/is;
  const totalMatch = text.match(totalRegex);

  if (totalMatch) {
    // Group 1 = Débit HT, Group 3 = Net HT
    fields.debitHT = parseMonetaire(totalMatch[1]);
    fields.totalNetHT = parseMonetaire(totalMatch[3]);
    console.info(`[PDF Parser] Débit HT: ${fields.debitHT}, Total NET HT: ${fields.totalNetHT}`);
  } else {
    errors.push('Total NET HT non trouve');
  }

  // === 3. TOTAL TTC ===
  // "Net à payer   10102,41" ou "Net a payer   10102,41"
  const ttcPatterns = [
    /Net\s+[àa]\s+payer\s+([\d][\d\s]*[,\.]\d{2})/i,
    /net\s+TTC\s+[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+[-]?[\d][\d\s]*[,\.]\d{2}\s+([\d][\d\s]*[,\.]\d{2})/is
  ];

  for (const regex of ttcPatterns) {
    const match = text.match(regex);
    if (match) {
      fields.totalTTC = parseMonetaire(match[1]);
      console.info(`[PDF Parser] Total TTC: ${fields.totalTTC}`);
      break;
    }
  }

  // === 4. REMISE COMMERCIALE / ABN MARGE ===
  // Colonnes variables selon les taux TVA applicables → on prend la 1ère (HT) et la dernière (TTC)
  const remisePatterns = [
    /Remises\s+Commerciales\s*\/\s*ab[nm]\s+marge\s+((?:[-]?\d+[,\.]\d{2}\s*)+)/i,
    /Remises\s+Commerciales\s*\/\s*abonnement\s+marge\s+((?:[-]?\d+[,\.]\d{2}\s*)+)/i
  ];

  for (const regex of remisePatterns) {
    const match = text.match(regex);
    if (match) {
      const nums = (match[1].match(/[-]?\d+[,\.]\d{2}/g) || []).map(parseMonetaire);
      if (nums.length >= 1) {
        fields.remiseAbnMargeHT = nums[0];
        fields.remiseAbnMargeTTC = nums.length >= 2 ? nums[nums.length - 1] : null;
        console.info(`[PDF Parser] Remise abn marge HT: ${fields.remiseAbnMargeHT}, TTC: ${fields.remiseAbnMargeTTC} (${nums.length} colonnes)`);
      }
      break;
    }
  }

  if (fields.remiseAbnMargeHT === undefined && fields.decade === 3) {
    errors.push('CRITIQUE: Remise commerciale absente sur decade 3');
  }

  // === 5. REMISES PARTENARIATS ===
  // Texte: "Remises partenariats   -1101,99   -968,46   ..."
  const partenaRegex = /Remises\s+partenariats\s+([-]?[\d][\d\s]*[,\.]\d{2})/i;
  const partenaMatch = text.match(partenaRegex);
  if (partenaMatch) {
    fields.remisesPartenariatsHT = parseMonetaire(partenaMatch[1]);
    console.info(`[PDF Parser] Remises partenariats: ${fields.remisesPartenariatsHT}`);
  }

  // === 6. AVOIRS COMMERCIAUX ===
  // Texte: "Avoirs commerciaux   -26,66   -19,21   ..."
  const avoirsRegex = /Avoirs\s+commerciaux\s+([-]?[\d][\d\s]*[,\.]\d{2})/i;
  const avoirsMatch = text.match(avoirsRegex);
  if (avoirsMatch) {
    fields.avoirsCommerciauxHT = parseMonetaire(avoirsMatch[1]);
    console.info(`[PDF Parser] Avoirs commerciaux: ${fields.avoirsCommerciauxHT}`);
  }

  // === 7. FRAIS GENERAUX ===
  // Colonnes variables selon les taux TVA applicables → brut HT (1ère), net HT (2ème), TTC (dernière)
  const fraisRegex = /Total\s+frais\s+g[eé]n[eé]raux\s+((?:\d+[,\.]\d{2}\s*)+)/i;
  const fraisMatch = text.match(fraisRegex);
  if (fraisMatch) {
    const nums = (fraisMatch[1].match(/\d+[,\.]\d{2}/g) || []).map(parseMonetaire);
    fields.fraisGenerauxBrutHT = nums.length >= 1 ? nums[0] : null;
    fields.fraisGenerauxNetHT = nums.length >= 2 ? nums[1] : null;
    fields.fraisGenerauxTTC = nums.length >= 1 ? nums[nums.length - 1] : null;
    console.info(`[PDF Parser] Frais brut HT: ${fields.fraisGenerauxBrutHT}, net HT: ${fields.fraisGenerauxNetHT}, TTC: ${fields.fraisGenerauxTTC} (${nums.length} colonnes)`);
  } else {
    fields.fraisGenerauxBrutHT = null;
    fields.fraisGenerauxNetHT = null;
    fields.fraisGenerauxTTC = null;
  }

  if (errors.length > 0) {
    fields.parsingErrors = errors;
    console.warn('[PDF Parser] Erreurs parsing:', errors);
  }

  return fields;
}

/**
 * Parse une chaine monetaire francaise vers number.
 * Ex: "9 850,39" -> 9850.39
 * Ex: "-551,99" -> -551.99
 */
function parseMonetaire(str: string): number {
  return parseFloat(
    str
      .replace(/\s/g, '')
      .replace(',', '.')
  );
}

function hasAllFields(fields: Partial<Releve>): boolean {
  return !!(
    fields.annee &&
    fields.mois &&
    fields.decade &&
    fields.totalNetHT &&
    fields.totalTTC
  );
}
