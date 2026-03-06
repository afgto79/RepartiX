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
  reclamationId?: string; // lien optionnel vers une reclamation
  createdAt: string;
}

export interface Reclamation {
  id: string;
  reference: string;      // auto-genere "#YYYY-NNN"
  moisDebut: string;      // "YYYY-MM"
  moisFin: string;        // "YYYY-MM"
  dateCreation: string;   // YYYY-MM-DD
  statut: 'en_cours' | 'en_attente' | 'soldee';
  montantReclame: number;
  description: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  claimId: string;   // reclamation.id
  date: string;      // YYYY-MM-DD
  amount: number;
  comment: string;
  createdAt: string;
}

export interface DataStore {
  releves: Releve[];
  regularisations: Regularisation[];
  reclamations: Reclamation[];
  payments: Payment[];
  metadata: {
    lastUpdated: string;
    totalReleves: number;
  };
}
