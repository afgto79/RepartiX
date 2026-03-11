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
  // Somme des Débit HT des decades presentes
  const totalHTMensuel = decades.reduce((sum, d) => sum + (d.debitHT ?? d.totalNetHT), 0);

  // Decade 3 = recapitulatif mensuel pour RP, AC et remise contractuelle
  const decade3 = decades.find(d => d.decade === 3);

  // Frais generaux = D3 du mois M (pas de decalage, les frais de M sont dans D3 M)
  const fraisGeneraux = Math.abs(decade3?.fraisGenerauxBrutHT ?? 0);

  // Assiette = Débit HT mensuel - Remises partenariats (D3, cumulatif) - Avoirs commerciaux (D3, cumulatif) - Frais généraux
  // (la remise de 3% s'applique uniquement sur les marchandises, pas sur les frais)
  const rpMensuel = Math.abs(decade3?.remisesPartenariatsHT ?? 0);
  const acMensuel = Math.abs(decade3?.avoirsCommerciauxHT ?? 0);
  const assiette = totalHTMensuel - rpMensuel - acMensuel - fraisGeneraux;

  // Remise annoncee = D3 du mois M+1
  // (regle metier specifique : remiseAbnMargeHT de D3 mois M concerne le mois M-1)
  const nextDecade3 = (groupes[moisSuivant(moisKey)] ?? []).find(d => d.decade === 3);
  const remiseReelle = nextDecade3 !== undefined ? Math.abs(nextDecade3.remiseAbnMargeHT ?? 0) : 0;

  // Remise attendue = 3% de l'assiette
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
    totalHTMensuel: arrondir(totalHTMensuel),
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
