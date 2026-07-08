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
  // Triptyque C5.3 — A=théorique, B=annoncé, C=versé
  theoriques: {
    orpecAssiette?: number;   // A1 : 3% × assiette Sans RSF saisie
    girophamProxy?: number;   // A2 : non implémenté (REMISE_GENERIQUE non dispo dans décades)
    allianceTTC: number;      // A3 : 3% × assiette TTC Alliance (estimation actuelle)
  };
  remiseAnnoncee?: number;    // B : montantHT depuis orpecMois.remiseAnnoncee
  deltaCalcul?: number;       // A1 − B (positif = ORPEC a annoncé moins que le dû)
  deltaPaiement?: number;     // B − C (positif = ORPEC a versé moins qu'annoncé)
  // C5.4 — rapprochement automatique B(HT) ↔ C(HT) — utilise remiseAbnMargeHT (pas TTC)
  crossCheck?: {
    statut: 'matched' | 'mismatch' | 'no_announce' | 'no_payment';
    ecart?: number;       // remiseAnnoncee(B,HT) − remiseAbnMargeHT(C,HT)
    tolerance: number;    // seuil utilisé (0,50 €)
  };
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

// Remise annoncee par ORPEC pour un mois (facture ORPEC ou tableau PIEVE)
export interface OrpecRemiseAnnoncee {
  montantHT: number;
  source: 'FACTURE_ORPEC' | 'TABLEAU_PIEVE';
  reference?: string;          // ex: numero de facture
}

// Donnees mensuelles ORPEC (saisie manuelle depuis les documents PIEVE / factures ORPEC)
// Deux blocs independants, chacun optionnel (un mois peut n'avoir que l'annonce) :
// - bloc assiette (saisieMode + champs associes + assiette/remiseDue calculees)
// - bloc annonce (remiseAnnoncee)
export interface OrpecMoisData {
  source: 'PIEVE';
  dateImport: string;          // ISO 8601 (derniere modification)
  saisieMode?: 'DETAIL' | 'ASSIETTE_DIRECTE';
  caHTorpec?: number;          // mode DETAIL
  achatsGeneriques?: number;   // mode DETAIL
  achatsAlvita?: number;       // mode DETAIL
  ventesHT?: number;           // mode ASSIETTE_DIRECTE - colonne "Ventes" PIEVE (informatif)
  assiette?: number;           // DETAIL: caHTorpec - generiques - Alvita ; ASSIETTE_DIRECTE: colonne "Sans RSF" saisie
  remiseDue?: number;          // calcule = assiette x 0.03
  remiseAnnoncee?: OrpecRemiseAnnoncee;
}

// Donnees generiques par labo et par mois (source : GENERIQUES_ORPEC_2025_2026)
export interface GeneriquesLaboMois {
  annee: number;
  mois: number;       // 1-12
  laboratoire: string;
  netHT: number;
}

export interface GeneriquesData {
  source: string;
  dateImport: string;
  entrees: GeneriquesLaboMois[];
}

// Reference annuelle ORPEC (ex: 2025, non mensualisee - chiffres confirmes PIEVE)
export interface OrpecAnnuelData {
  source: string;              // ex: 'PIEVE'
  dateImport: string;          // ISO 8601 (derniere modification)
  assiette: number;
  remiseDue: number;
  remiseVersee: number;
  delta: number;               // calcule = remiseVersee - remiseDue
}

export interface DataStore {
  releves: Releve[];
  regularisations: Regularisation[];
  reclamations: Reclamation[];
  payments: Payment[];
  reliquats: Reliquat[];
  orpecData?: Record<string, OrpecMoisData>;  // cle = "YYYY-MM"
  orpecAnnuel?: Record<string, OrpecAnnuelData>;  // cle = "YYYY"
  generiques?: GeneriquesData;
  metadata: {
    lastUpdated: string;
    totalReleves: number;
  };
}
