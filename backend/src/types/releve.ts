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

export interface DataStore {
  releves: Releve[];
  metadata: {
    lastUpdated: string;
    totalReleves: number;
  };
}
