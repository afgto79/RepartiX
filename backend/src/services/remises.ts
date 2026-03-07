import { Releve, AnalyseRemise } from '../types/releve';

/**
 * Calcule les analyses de remises pour tous les mois disponibles.
 * Groupe les decades par mois et applique la regle metier (3%).
 */
export function calculerRemisesMensuelles(releves: Releve[]): AnalyseRemise[] {
  const groupes = grouperParMois(releves);

  return Object.entries(groupes)
    .map(([moisKey, decades]) => analyserMois(moisKey, decades))
    .sort((a, b) => a.mois.localeCompare(b.mois));
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

function analyserMois(moisKey: string, decades: Releve[]): AnalyseRemise {
  // Somme des Débit HT des decades presentes
  const totalHTMensuel = decades.reduce((sum, d) => sum + (d.debitHT ?? d.totalNetHT), 0);

  // Decade 3 = recapitulatif mensuel pour RP, AC et remise contractuelle
  const decade3 = decades.find(d => d.decade === 3);

  // Assiette = Débit HT mensuel - Remises partenariats (D3, cumulatif) - Avoirs commerciaux (D3, cumulatif)
  const rpMensuel = Math.abs(decade3?.remisesPartenariatsHT ?? 0);
  const acMensuel = Math.abs(decade3?.avoirsCommerciauxHT ?? 0);
  const assiette = totalHTMensuel - rpMensuel - acMensuel;

  // Remise attendue = 3% de l'assiette
  const remiseAttendue = assiette * 0.03;

  // Remise reelle = valeur absolue de la remise contractuelle cumulative mensuelle (D3)
  // (stockee en negatif dans le PDF, ex: -551.99 signifie 551.99 de remise)
  const remiseReelleBrute = decade3?.remiseAbnMargeHT ?? 0;
  const remiseReelle = Math.abs(remiseReelleBrute);

  // Delta = remise recue - remise attendue
  // Negatif = manque a gagner, Positif = bonus
  const delta = remiseReelle - remiseAttendue;
  const deltaPourcent = remiseAttendue !== 0
    ? (delta / remiseAttendue) * 100
    : 0;

  // Determination du statut
  const decadesPresentes = decades.map(d => d.decade).sort();
  let statut: 'OK' | 'EN_COURS' | 'RETARD';

  if (decadesPresentes.length < 3) {
    statut = 'EN_COURS';
  } else if (Math.abs(delta) < 0.01) {
    statut = 'OK';
  } else if (delta >= 0) {
    statut = 'OK';
  } else {
    statut = 'RETARD';
  }

  return {
    mois: moisKey,
    totalHTMensuel: arrondir(totalHTMensuel),
    remiseAttendue: arrondir(remiseAttendue),
    remiseReelle: arrondir(remiseReelle),
    delta: arrondir(delta),
    deltaPourcent: arrondir(deltaPourcent),
    statut,
    decadesPresentes
  };
}

function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}
