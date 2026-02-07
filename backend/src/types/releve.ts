export interface Releve {
  id: string;
  fournisseur: 'Alliance Healthcare';
  annee: number;
  mois: number;
  decade: 1 | 2 | 3;
  totalNetHT: number;
  totalTTC: number;
  remiseAbnMargeHT: number | null;
  remisesPartenariatsHT: number | null;
  avoirsCommerciauxHT: number | null;
  importedAt: string;
  source: string;
  hash: string;
  parsingStatus: 'success' | 'partial' | 'failed';
  parsingErrors?: string[];
}

export interface AnalyseRemise {
  mois: string;
  totalHTMensuel: number;
  remiseAttendue: number;
  remiseReelle: number;
  delta: number;
  deltaPourcent: number;
  statut: 'OK' | 'EN_COURS' | 'RETARD';
  decadesPresentes: number[];
}

export interface Regularisation {
  id: string;
  date: string;       // YYYY-MM-DD
  montant: number;     // positif = versement recu
  annee: number;       // annee concernee
  description: string; // ex: "Avoir n°12345"
  createdAt: string;
}

export interface DataStore {
  releves: Releve[];
  regularisations: Regularisation[];
  metadata: {
    lastUpdated: string;
    totalReleves: number;
  };
}
