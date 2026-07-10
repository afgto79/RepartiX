import { Releve, AnalyseRemise, OrpecMoisData, GeneriquesData } from '../types/releve';

const SEUIL_GENERIQUES_LABO = 350;

/**
 * Calcule les analyses de remises pour tous les mois disponibles.
 * Groupe les decades par mois et applique la regle metier (3%).
 * Si des donnees ORPEC (PIEVE) sont fournies pour un mois, la remise attendue
 * vient de l'assiette ORPEC ; sinon on garde l'estimation sur assiette TTC Alliance.
 */
export function calculerRemisesMensuelles(
  releves: Releve[],
  orpecData?: Record<string, OrpecMoisData>,
  generiquesData?: GeneriquesData | null
): AnalyseRemise[] {
  const groupes = grouperParMois(releves);

  return Object.entries(groupes)
    .map(([moisKey, decades]) => analyserMois(moisKey, decades, groupes, orpecData, generiquesData))
    .sort((a, b) => a.mois.localeCompare(b.mois));
}

function moisSuivant(moisKey: string): string {
  const [year, month] = moisKey.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function grouperParMois(releves: Releve[]): Record<string, Releve[]> {
  const groupes: Record<string, Releve[]> = {};

  for (const releve of releves) {
    const key = `${releve.annee}-${String(releve.mois).padStart(2, '0')}`;
    if (!groupes[key]) {
      groupes[key] = [];
    }
    groupes[key].push(releve);
  }

  return groupes;
}

function analyserMois(
  moisKey: string,
  decades: Releve[],
  groupes: Record<string, Releve[]>,
  orpecData?: Record<string, OrpecMoisData>,
  generiquesData?: GeneriquesData | null
): AnalyseRemise {
  // Somme des Total TTC des decades presentes (base de calcul TTC)
  const totalTTCMensuel = decades.reduce((sum, d) => sum + (d.totalTTC ?? 0), 0);

  // Decade 3 = recapitulatif mensuel pour frais et remise
  const decade3 = decades.find(d => d.decade === 3);

  // Frais generaux TTC = D3 du mois M (pas de decalage, les frais de M sont dans D3 M)
  // Fallback HT si TTC absent (anciens PDFs avant re-import)
  const fraisGeneraux = Math.abs(
    decade3?.fraisGenerauxTTC ?? decade3?.fraisGenerauxNetHT ?? decade3?.fraisGenerauxBrutHT ?? 0
  );

  // Remise deja deduite dans totalTTC = D3 du mois M (concerne le mois M-1)
  // Le totalTTC contient cette remise en deduction : on la rajoute pour obtenir la base brute marchandises
  const remiseDeduiteDansM = Math.abs(decade3?.remiseAbnMargeTTC ?? decade3?.remiseAbnMargeHT ?? 0);

  // Assiette TTC = Total TTC mensuel - frais TTC + remise deja deduite (M-1)
  // La remise etant deja incluse en negatif dans totalTTC, on l'ajoute pour revenir au brut marchandises
  const assiette = totalTTCMensuel - fraisGeneraux + remiseDeduiteDansM;

  // Remise reelle (annoncee pour mois M) = D3 du mois M+1
  const nextDecade3 = (groupes[moisSuivant(moisKey)] ?? []).find(d => d.decade === 3);
  const remiseReelle = nextDecade3 !== undefined
    ? Math.abs(nextDecade3.remiseAbnMargeTTC ?? nextDecade3.remiseAbnMargeHT ?? 0)
    : 0;

  // Remise attendue : si donnees ORPEC (PIEVE) presentes pour ce mois, on utilise
  // l'assiette contractuelle reelle ; sinon estimation 3% sur assiette TTC Alliance.
  // Un mois ORPEC sans bloc assiette (remiseAnnoncee seule) ne bascule pas en methode ORPEC.
  const orpecMois = orpecData?.[moisKey];
  const orpecDisponible = orpecMois?.remiseDue !== undefined;
  const methodeCalcul: 'ORPEC' | 'ALLIANCE_TTC' = orpecDisponible ? 'ORPEC' : 'ALLIANCE_TTC';
  const remiseAttendue = orpecDisponible ? orpecMois!.remiseDue! : assiette * 0.03;

  // Reversee = annoncee - frais (ce qui est reellement reverse net de frais)
  const reversee = remiseReelle - fraisGeneraux;

  // Delta = reversee - attendue (negatif = manque a gagner)
  const delta = reversee - remiseAttendue;
  const deltaPourcent = remiseAttendue !== 0
    ? (delta / remiseAttendue) * 100
    : 0;

  // Determination du statut
  const decadesPresentes = decades.map(d => d.decade).sort();
  let statut: 'OK' | 'EN_COURS' | 'RETARD';

  if (decadesPresentes.length < 3 || nextDecade3 === undefined) {
    statut = 'EN_COURS';
  } else if (delta >= -0.01) {
    statut = 'OK';
  } else {
    statut = 'RETARD';
  }

  // Triptyque C5.3
  const allianceTTC = arrondir(assiette * 0.03);
  const orpecAssiette = orpecDisponible ? arrondir(orpecMois!.remiseDue!) : undefined;

  // A2 Giropharm proxy : 3% × (debitHT mensuel − CA_generiques(≥350€/labo) − achatsAlvita)
  const debitHTMensuel = decades.reduce((s, d) => s + (d.debitHT ?? 0), 0);
  const alvita = orpecMois?.achatsAlvita ?? 0;
  let girophamProxy: number | undefined;
  let girophamBrut: number | undefined;
  if (debitHTMensuel !== 0) {
    girophamBrut = arrondir((debitHTMensuel - alvita) * 0.03);
  }
  if (generiquesData) {
    const [anneeNum, moisNum] = moisKey.split('-').map(Number);
    const caGeneriques = generiquesData.entrees
      .filter(e => e.annee === anneeNum && e.mois === moisNum && e.netHT >= SEUIL_GENERIQUES_LABO)
      .reduce((s, e) => s + e.netHT, 0);
    girophamProxy = arrondir((debitHTMensuel - caGeneriques - alvita) * 0.03);
  }
  const remiseAnnonceeVal = orpecMois?.remiseAnnoncee?.montantHT !== undefined
    ? arrondir(orpecMois!.remiseAnnoncee!.montantHT)
    : undefined;
  const deltaCalcul = orpecAssiette !== undefined && remiseAnnonceeVal !== undefined
    ? arrondir(orpecAssiette - remiseAnnonceeVal)
    : undefined;
  const deltaPaiement = remiseAnnonceeVal !== undefined && nextDecade3 !== undefined
    ? arrondir(remiseAnnonceeVal - remiseReelle)
    : undefined;

  // C5.4 — cross-check B(annoncé HT) ↔ C(versé HT), tolérance 0,50 €
  // On compare en HT des deux côtés : remiseAnnoncee(B) est HT (facture ORPEC),
  // et on utilise remiseAbnMargeHT (pas TTC) pour C afin de rester sur la même base.
  // remiseReelle (TTC, champ existant pré-C5.3) n'est pas modifié.
  const TOLERANCE = 0.50;
  const remiseReelleHT = nextDecade3 !== undefined
    ? Math.abs(nextDecade3.remiseAbnMargeHT ?? 0)
    : 0;
  let crossCheck: AnalyseRemise['crossCheck'];
  if (remiseAnnonceeVal === undefined) {
    crossCheck = { statut: 'no_announce', tolerance: TOLERANCE };
  } else if (nextDecade3 === undefined) {
    crossCheck = { statut: 'no_payment', tolerance: TOLERANCE };
  } else {
    const ecart = arrondir(remiseAnnonceeVal - remiseReelleHT);
    crossCheck = {
      statut: Math.abs(ecart) <= TOLERANCE ? 'matched' : 'mismatch',
      ecart,
      tolerance: TOLERANCE,
    };
  }

  return {
    mois: moisKey,
    totalHTMensuel: arrondir(totalTTCMensuel),
    remiseAttendue: arrondir(remiseAttendue),
    remiseReelle: arrondir(remiseReelle),
    fraisGeneraux: arrondir(fraisGeneraux),
    reversee: arrondir(reversee),
    delta: arrondir(delta),
    deltaPourcent: arrondir(deltaPourcent),
    statut,
    decadesPresentes,
    methodeCalcul,
    orpecDisponible,
    theoriques: {
      orpecAssiette,
      girophamProxy,
      girophamBrut,
      allianceTTC,
    },
    remiseAnnoncee: remiseAnnonceeVal,
    deltaCalcul,
    deltaPaiement,
    crossCheck,
  };
}

function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}
