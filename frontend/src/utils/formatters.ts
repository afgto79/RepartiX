const MOIS_NOMS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'
];

export function formatEuros(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(n);
}

export function formatMoisLabel(moisKey: string): string {
  const [annee, mois] = moisKey.split('-');
  const moisIndex = parseInt(mois) - 1;
  return `${MOIS_NOMS[moisIndex]} ${annee}`;
}

export function formatPourcent(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
