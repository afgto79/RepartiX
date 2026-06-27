export interface Releve {
  id: string;
  fournisseur: 'Alliance Healthcare';
  annee: number;
  mois: number;
  decade: 1 | 2 | 3;
  debitHT: number | null;
  totalNetHT: number;
  totalTTC: number;
  remiseAbnMargeHT: number | null;
  remisesPartenariatsHT: number | null;
  avoirsCommerciauxHT: number | null;
  fraisGenerauxBrutHT: number | null;
  fraisGenerauxNetHT: number | null;
  fraisGenerauxTTC: number | null;
  remiseAbnMargeTTC: number | null;
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
  remiseReelle: number;    // = annoncée (brute, avant frais)
  fraisGeneraux: number;   // frais généraux net HT déduits par le répartiteur
  reversee: number;        // = annoncée - frais (net reversé)
  delta: number;           // = reversée - attendue (négatif = manque à gagner)
  deltaPourcent: number;
  statut: 'OK' | 'EN_COURS' | 'RETARD';
  decadesPresentes: number[];
  methodeCalcul: 'ORPEC' | 'ALLIANCE_TTC';
  orpecDisponible: boolean;
}

export type RegularisationType =
  | 'VERSEMENT_RECU'        // paiement recu d'ORPEC (positif)
  | 'CLAWBACK_GENERIQUES'   // recuperation palier - legitime, non contestable (negatif)
  | 'FRAIS_INDU'            // frais non justifie - reclamable (negatif)
  | 'FRAIS_AUTRE';          // autre deduction a qualifier manuellement

export interface Regularisation {
  id: string;
  date: string;       // YYYY-MM-DD
  montant: number;     // positif = versement recu
  annee: number;       // annee concernee
  description: string; // ex: "Avoir n°12345"
  reclamationId?: string; // lien optionnel vers une reclamation
  type?: RegularisationType; // optionnel pour retrocompatibilite
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
  sourceReliquatId?: string;
  dateEngagementFournisseur?: string; // YYYY-MM-DD - date promise par ORPEC (optionnel)
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

export interface Reliquat {
  id: string;
  originReclamationId: string;
  periodStart: string;   // YYYY-MM
  periodEnd: string;     // YYYY-MM
  initialAmount: number;
  remainingAmount: number;
  status: 'active' | 'closed' | 'abandoned';
  createdAt: string;
}

// Donnees mensuelles ORPEC (saisie manuelle depuis les documents PIEVE)
export interface OrpecMoisData {
  source: 'PIEVE';
  dateImport: string;          // ISO 8601
  caHTorpec: number;
  achatsGeneriques: number;
  achatsAlvita: number;
  assiette: number;            // calcule = caHTorpec - achatsGeneriques - achatsAlvita
  remiseDue: number;           // calcule = assiette x 0.03
}

export interface DataStore {
  releves: Releve[];
  regularisations: Regularisation[];
  reclamations: Reclamation[];
  payments: Payment[];
  reliquats: Reliquat[];
  orpecData?: Record<string, OrpecMoisData>;  // cle = "YYYY-MM"
  metadata: {
    lastUpdated: string;
    totalReleves: number;
  };
}
