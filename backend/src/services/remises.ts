import { Releve, AnalyseRemise } from '../types/releve';

/**
 * Calcule les analyses de remises pour tous les mois disponibles.
 * Groupe les decades par mois et applique la regle metier (3%).
 */
export function calculerRemisesMensuelles(releves: Releve[]): AnalyseRemise[] {
  const groupes = grouperParMois(releves);

  return Object.entries(groupes)
    .map(([moisKey, decades]) => analyserMois(moisKey, decades, groupes))
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

function analyserMois(moisKey: string, decades: Releve[], groupes: Record<string, Releve[]>): AnalyseRemise {
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

  // Remise attendue = 3% de l'assiette TTC
  const remiseAttendue = assiette * 0.03;

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
    decadesPresentes
  };
}

function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}
