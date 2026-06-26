const API_BASE = '/api';

export interface AnalyseRemise {
  mois: string;
  totalHTMensuel: number;
  remiseAttendue: number;
  remiseReelle: number;    // annoncée brute
  fraisGeneraux: number;   // frais généraux déduits
  reversee: number;        // annoncée - frais
  delta: number;           // reversée - attendue (négatif = manque à gagner)
  deltaPourcent: number;
  statut: 'OK' | 'EN_COURS' | 'RETARD';
  decadesPresentes: number[];
  methodeCalcul: 'ORPEC' | 'ALLIANCE_TTC';
  orpecDisponible: boolean;
}

export interface UploadResponse {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: { file: string; error: string }[];
}

export interface DashboardResponse {
  annee: number;
  mois: AnalyseRemise[];
}

export interface DecadeDetail {
  decade: number;
  totalNetHT: number;
  totalTTC: number;
  remiseAbnMargeHT: number | null;
  remisesPartenariatsHT: number | null;
  avoirsCommerciauxHT: number | null;
  source: string;
  id: string;
  parsingStatus: string;
  parsingErrors?: string[];
}

export interface MoisDetailResponse {
  mois: string;
  decades: DecadeDetail[];
  analyse: {
    mois: string;
    totalHTMensuel: number;
    remiseAttendue: number;
    remiseReelle: number;
    delta: number;
    deltaPourcent: number;
    statut: string;
    decadesPresentes: number[];
  };
}

export interface ScanResponse {
  scanned: number;
  new: number;
  duplicates: number;
  errors: { file: string; error: string }[];
}

export interface CumulResponse {
  deltaCumulTotal: number;
  regulTotal: number;
  resteDu: number;
  soldeReclamable: number;
  ecartStructurel: number;
  parAnnee: { annee: number; delta: number; regul: number; resteDu: number }[];
}

export type RegularisationType =
  | 'VERSEMENT_RECU'
  | 'CLAWBACK_GENERIQUES'
  | 'FRAIS_INDU'
  | 'FRAIS_AUTRE';

export interface Regularisation {
  id: string;
  date: string;
  montant: number;
  annee: number;
  description: string;
  reclamationId?: string;
  type?: RegularisationType;
  createdAt: string;
}

export interface Reclamation {
  id: string;
  reference: string;
  moisDebut: string;
  moisFin: string;
  dateCreation: string;
  statut: 'en_cours' | 'en_attente' | 'soldee' | 'ouverte' | 'cloturee';
  montantReclame: number;
  description: string;
  sourceReliquatId?: string;
  createdAt: string;
}

export interface Reliquat {
  id: string;
  originReclamationId: string;
  periodStart: string;
  periodEnd: string;
  initialAmount: number;
  remainingAmount: number;
  status: 'active' | 'closed' | 'abandoned';
  createdAt: string;
}

export interface Payment {
  id: string;
  claimId: string;
  date: string;
  amount: number;
  comment: string;
  createdAt: string;
}

export interface OrpecMoisData {
  source: 'PIEVE';
  dateImport: string;
  caHTorpec: number;
  achatsGeneriques: number;
  achatsAlvita: number;
  assiette: number;
  remiseDue: number;
}

export interface ReleveRaw {
  id: string;
  annee: number;
  mois: number;
  decade: 1 | 2 | 3;
  totalNetHT: number;
  totalTTC: number;
  remiseAbnMargeHT: number | null;
  remisesPartenariatsHT: number | null;
  avoirsCommerciauxHT: number | null;
  source: string;
  parsingStatus: 'success' | 'partial' | 'failed';
  parsingErrors?: string[];
  importedAt: string;
}

export const api = {
  async uploadPDFs(files: File[]): Promise<UploadResponse> {
    const formData = new FormData();
    files.forEach(file => formData.append('pdfs', file));

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Erreur upload');
    }

    return res.json();
  },

  async getDashboard(annee: number): Promise<DashboardResponse> {
    const res = await fetch(`${API_BASE}/stats/dashboard?annee=${annee}`);

    if (!res.ok) {
      throw new Error('Erreur chargement dashboard');
    }

    return res.json();
  },

  async getMoisDetail(annee: number, mois: number): Promise<MoisDetailResponse> {
    const res = await fetch(`${API_BASE}/releves/${annee}/${mois}`);

    if (!res.ok) {
      throw new Error('Erreur chargement detail mois');
    }

    return res.json();
  },

  async deleteReleve(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/releves/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      throw new Error('Erreur suppression');
    }
  },

  async clearAllReleves(): Promise<number> {
    const res = await fetch(`${API_BASE}/releves`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression totale');
    const data = await res.json();
    return data.deleted;
  },

  async scanFolder(force: boolean = false): Promise<ScanResponse> {
    const res = await fetch(`${API_BASE}/scan-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Erreur scan dossier');
    }

    return res.json();
  },

  async shutdown(): Promise<void> {
    await fetch(`${API_BASE}/shutdown`, {
      method: 'POST'
    });
  },

  async getAnnees(): Promise<number[]> {
    const res = await fetch(`${API_BASE}/stats/annees`);
    if (!res.ok) throw new Error('Erreur chargement annees');
    const data = await res.json();
    return data.annees;
  },

  async getCumul(): Promise<CumulResponse> {
    const res = await fetch(`${API_BASE}/stats/cumul`);

    if (!res.ok) {
      throw new Error('Erreur chargement cumul');
    }

    return res.json();
  },

  async getRegularisations(annee?: number): Promise<Regularisation[]> {
    const url = annee ? `${API_BASE}/regularisations?annee=${annee}` : `${API_BASE}/regularisations`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erreur chargement regularisations');
    return res.json();
  },

  async addRegularisation(data: { date: string; montant: number; annee: number; description: string; type?: RegularisationType; reclamationId?: string }): Promise<Regularisation> {
    const res = await fetch(`${API_BASE}/regularisations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur creation regularisation');
    return res.json();
  },

  async updateRegularisation(id: string, data: { date?: string; montant?: number; annee?: number; description?: string; type?: RegularisationType; reclamationId?: string }): Promise<Regularisation> {
    const res = await fetch(`${API_BASE}/regularisations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur modification regularisation');
    return res.json();
  },

  async deleteRegularisation(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/regularisations/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Erreur suppression regularisation');
  },

  // --- Reclamations ---

  async getReclamations(statut?: string): Promise<Reclamation[]> {
    const url = statut ? `${API_BASE}/reclamations?statut=${statut}` : `${API_BASE}/reclamations`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erreur chargement reclamations');
    return res.json();
  },

  async addReclamation(data: {
    moisDebut: string; moisFin: string; dateCreation: string;
    statut: string; montantReclame: number; description: string; sourceReliquatId?: string;
  }): Promise<Reclamation> {
    const res = await fetch(`${API_BASE}/reclamations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur creation reclamation');
    return res.json();
  },

  async updateReclamation(id: string, data: Partial<{
    moisDebut: string; moisFin: string; dateCreation: string;
    statut: string; montantReclame: number; description: string;
  }>): Promise<Reclamation> {
    const res = await fetch(`${API_BASE}/reclamations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur modification reclamation');
    return res.json();
  },

  async deleteReclamation(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/reclamations/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Erreur suppression reclamation');
  },

  async clearAllReclamations(): Promise<number> {
    const res = await fetch(`${API_BASE}/reclamations`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression totale');
    const data = await res.json();
    return data.deleted;
  },

  // --- Payments ---

  async getPayments(claimId?: string): Promise<Payment[]> {
    const url = claimId ? `${API_BASE}/payments?claimId=${claimId}` : `${API_BASE}/payments`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erreur chargement paiements');
    return res.json();
  },

  async addPayment(data: { claimId: string; date: string; amount: number; comment: string }): Promise<Payment> {
    const res = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur creation paiement');
    return res.json();
  },

  async updatePayment(id: string, data: Partial<{ date: string; amount: number; comment: string }>): Promise<Payment> {
    const res = await fetch(`${API_BASE}/payments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur modification paiement');
    return res.json();
  },

  async deletePayment(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/payments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression paiement');
  },

  // --- Releves bruts ---

  async getAllReleves(): Promise<ReleveRaw[]> {
    const res = await fetch(`${API_BASE}/releves`);
    if (!res.ok) throw new Error('Erreur chargement releves');
    return res.json();
  },

  // --- Reliquats ---

  async getReliquats(): Promise<Reliquat[]> {
    const res = await fetch(`${API_BASE}/reliquats`);
    if (!res.ok) throw new Error('Erreur chargement reliquats');
    return res.json();
  },

  async addReliquat(data: Omit<Reliquat, 'id' | 'createdAt'>): Promise<Reliquat> {
    const res = await fetch(`${API_BASE}/reliquats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur création reliquat');
    return res.json();
  },

  async updateReliquat(id: string, data: Partial<Omit<Reliquat, 'id' | 'createdAt'>>): Promise<Reliquat> {
    const res = await fetch(`${API_BASE}/reliquats/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur modification reliquat');
    return res.json();
  },

  async deleteReliquat(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/reliquats/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression reliquat');
  },

  // --- Donnees ORPEC (PIEVE) ---

  async getOrpec(mois: string): Promise<OrpecMoisData | null> {
    const res = await fetch(`${API_BASE}/orpec/${mois}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Erreur chargement donnees ORPEC');
    return res.json();
  },

  async putOrpec(
    mois: string,
    data: { caHTorpec: number; achatsGeneriques: number; achatsAlvita: number }
  ): Promise<OrpecMoisData> {
    const res = await fetch(`${API_BASE}/orpec/${mois}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur sauvegarde donnees ORPEC');
    return res.json();
  },

  async deleteOrpec(mois: string): Promise<void> {
    const res = await fetch(`${API_BASE}/orpec/${mois}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression donnees ORPEC');
  }
};
