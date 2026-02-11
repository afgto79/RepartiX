const API_BASE = '/api';

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
  parAnnee: { annee: number; delta: number; regul: number; resteDu: number }[];
}

export interface Regularisation {
  id: string;
  date: string;
  montant: number;
  annee: number;
  description: string;
  reclamationId?: string;
  createdAt: string;
}

export interface Reclamation {
  id: string;
  reference: string;
  moisDebut: string;
  moisFin: string;
  dateCreation: string;
  statut: 'en_cours' | 'en_attente' | 'soldee';
  montantReclame: number;
  description: string;
  createdAt: string;
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

  async addRegularisation(data: { date: string; montant: number; annee: number; description: string }): Promise<Regularisation> {
    const res = await fetch(`${API_BASE}/regularisations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Erreur creation regularisation');
    return res.json();
  },

  async updateRegularisation(id: string, data: { date?: string; montant?: number; annee?: number; description?: string }): Promise<Regularisation> {
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
    statut: string; montantReclame: number; description: string;
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
  }
};
