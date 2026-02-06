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
  // Somme des NET HT des decades presentes
  const totalHTMensuel = decades.reduce((sum, d) => sum + d.totalNetHT, 0);

  // Remise attendue = 3% du total HT
  const remiseAttendue = totalHTMensuel * 0.03;

  // Remise reelle = valeur sur la decade 3
  const decade3 = decades.find(d => d.decade === 3);
  const remiseReelle = decade3?.remiseAbnMargeHT ?? 0;

  // Delta (negatif = on nous doit de l'argent)
  const delta = remiseReelle - remiseAttendue;
  const deltaPourcent = remiseAttendue !== 0
    ? (delta / Math.abs(remiseAttendue)) * 100
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
