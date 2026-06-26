import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Releve, Regularisation, Reclamation, Payment, Reliquat, OrpecMoisData, DataStore } from '../types/releve';

const DATA_FILE = path.join(__dirname, '../data/releves.json');

export async function loadData(): Promise<DataStore> {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(content);
    // Migration: ajouter regularisations si absent
    if (!data.regularisations) {
      data.regularisations = [];
    }
    // Migration: ajouter reclamations si absent
    if (!data.reclamations) {
      data.reclamations = [];
    }
    // Migration: ajouter payments si absent
    if (!data.payments) {
      data.payments = [];
    }
    // Migration: ajouter reliquats si absent
    if (!data.reliquats) {
      data.reliquats = [];
    }
    // Migration: ajouter orpecData si absent
    if (!data.orpecData) {
      data.orpecData = {};
    }
    // Migration: qualifier les regularisations sans type
    // (montant > 0 -> versement recu ; sinon -> frais a qualifier manuellement)
    for (const r of data.regularisations) {
      if (!r.type) {
        r.type = r.montant > 0 ? 'VERSEMENT_RECU' : 'FRAIS_AUTRE';
      }
    }
    return data;
  } catch {
    const emptyData: DataStore = {
      releves: [],
      regularisations: [],
      reclamations: [],
      payments: [],
      reliquats: [],
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalReleves: 0
      }
    };
    await saveData(emptyData);
    return emptyData;
  }
}

export async function saveData(data: DataStore): Promise<void> {
  data.metadata.lastUpdated = new Date().toISOString();
  data.metadata.totalReleves = data.releves.length;

  await fs.writeFile(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

export async function saveReleve(releve: Partial<Releve>): Promise<Releve> {
  const data = await loadData();

  const newReleve: Releve = {
    id: uuidv4(),
    fournisseur: 'Alliance Healthcare',
    annee: 0,
    mois: 0,
    decade: 1,
    debitHT: null,
    totalNetHT: 0,
    totalTTC: 0,
    remiseAbnMargeHT: null,
    remisesPartenariatsHT: null,
    avoirsCommerciauxHT: null,
    fraisGenerauxBrutHT: null,
    fraisGenerauxNetHT: null,
    fraisGenerauxTTC: null,
    remiseAbnMargeTTC: null,
    importedAt: new Date().toISOString(),
    source: '',
    hash: '',
    parsingStatus: 'success',
    ...releve
  };

  data.releves.push(newReleve);
  await saveData(data);

  return newReleve;
}

export async function getReleves(filters?: {
  annee?: number;
  mois?: number;
  decade?: number;
}): Promise<Releve[]> {
  const data = await loadData();
  let results = data.releves;

  if (filters?.annee) {
    results = results.filter(r => r.annee === filters.annee);
  }
  if (filters?.mois) {
    results = results.filter(r => r.mois === filters.mois);
  }
  if (filters?.decade) {
    results = results.filter(r => r.decade === filters.decade);
  }

  return results;
}

export async function getFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function isDuplicate(hash: string): Promise<boolean> {
  const data = await loadData();
  return data.releves.some(r => r.hash === hash);
}

// --- Regularisations CRUD ---

export async function getRegularisations(annee?: number): Promise<Regularisation[]> {
  const data = await loadData();
  if (annee) {
    return data.regularisations.filter(r => r.annee === annee);
  }
  return data.regularisations;
}

export async function addRegularisation(regul: Omit<Regularisation, 'id' | 'createdAt'>): Promise<Regularisation> {
  const data = await loadData();
  const newRegul: Regularisation = {
    id: uuidv4(),
    ...regul,
    createdAt: new Date().toISOString()
  };
  data.regularisations.push(newRegul);
  await saveData(data);
  return newRegul;
}

export async function updateRegularisation(id: string, updates: Partial<Omit<Regularisation, 'id' | 'createdAt'>>): Promise<Regularisation | null> {
  const data = await loadData();
  const index = data.regularisations.findIndex(r => r.id === id);
  if (index === -1) return null;
  data.regularisations[index] = { ...data.regularisations[index], ...updates };
  await saveData(data);
  return data.regularisations[index];
}

export async function deleteRegularisation(id: string): Promise<boolean> {
  const data = await loadData();
  const initialLength = data.regularisations.length;
  data.regularisations = data.regularisations.filter(r => r.id !== id);
  if (data.regularisations.length < initialLength) {
    await saveData(data);
    return true;
  }
  return false;
}

export async function deleteReleve(id: string): Promise<boolean> {
  const data = await loadData();
  const initialLength = data.releves.length;
  data.releves = data.releves.filter(r => r.id !== id);

  if (data.releves.length < initialLength) {
    await saveData(data);
    return true;
  }
  return false;
}

export async function clearReleves(): Promise<number> {
  const data = await loadData();
  const count = data.releves.length;
  data.releves = [];
  await saveData(data);
  return count;
}

// --- Reclamations CRUD ---

function generateReference(reclamations: Reclamation[], dateCreation: string): string {
  const year = new Date(dateCreation).getFullYear();
  const sameYear = reclamations.filter(r => r.reference.startsWith(`#${year}-`));
  const nextNum = sameYear.length + 1;
  return `#${year}-${String(nextNum).padStart(3, '0')}`;
}

export async function getReclamations(statut?: string): Promise<Reclamation[]> {
  const data = await loadData();
  if (statut) {
    return data.reclamations.filter(r => r.statut === statut);
  }
  return data.reclamations;
}

export async function addReclamation(reclam: Omit<Reclamation, 'id' | 'reference' | 'createdAt'>): Promise<Reclamation> {
  const data = await loadData();
  const newReclam: Reclamation = {
    id: uuidv4(),
    reference: generateReference(data.reclamations, reclam.dateCreation),
    ...reclam,
    createdAt: new Date().toISOString()
  };
  data.reclamations.push(newReclam);
  await saveData(data);
  return newReclam;
}

export async function updateReclamation(id: string, updates: Partial<Omit<Reclamation, 'id' | 'reference' | 'createdAt'>>): Promise<Reclamation | null> {
  const data = await loadData();
  const index = data.reclamations.findIndex(r => r.id === id);
  if (index === -1) return null;
  data.reclamations[index] = { ...data.reclamations[index], ...updates };
  await saveData(data);
  return data.reclamations[index];
}

export async function deleteReclamation(id: string): Promise<boolean> {
  const data = await loadData();
  const initialLength = data.reclamations.length;
  data.reclamations = data.reclamations.filter(r => r.id !== id);
  if (data.reclamations.length < initialLength) {
    // Delier les regularisations associees
    for (const reg of data.regularisations) {
      if (reg.reclamationId === id) {
        delete reg.reclamationId;
      }
    }
    // Supprimer les paiements associes
    data.payments = data.payments.filter(p => p.claimId !== id);
    await saveData(data);
    return true;
  }
  return false;
}

export async function clearReclamations(): Promise<number> {
  const data = await loadData();
  const count = data.reclamations.length;
  data.reclamations = [];
  data.payments = [];
  await saveData(data);
  return count;
}

// --- Payments CRUD ---

export async function getPayments(claimId?: string): Promise<Payment[]> {
  const data = await loadData();
  if (claimId) {
    return data.payments.filter(p => p.claimId === claimId);
  }
  return data.payments;
}

export async function addPayment(payment: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
  const data = await loadData();
  const newPayment: Payment = {
    id: uuidv4(),
    ...payment,
    createdAt: new Date().toISOString()
  };
  data.payments.push(newPayment);
  await saveData(data);
  return newPayment;
}

export async function updatePayment(id: string, updates: Partial<Omit<Payment, 'id' | 'createdAt'>>): Promise<Payment | null> {
  const data = await loadData();
  const index = data.payments.findIndex(p => p.id === id);
  if (index === -1) return null;
  data.payments[index] = { ...data.payments[index], ...updates };
  await saveData(data);
  return data.payments[index];
}

export async function deletePayment(id: string): Promise<boolean> {
  const data = await loadData();
  const initialLength = data.payments.length;
  data.payments = data.payments.filter(p => p.id !== id);
  if (data.payments.length < initialLength) {
    await saveData(data);
    return true;
  }
  return false;
}

// --- Reliquats CRUD ---

export async function getReliquats(status?: string): Promise<Reliquat[]> {
  const data = await loadData();
  if (status) return data.reliquats.filter(r => r.status === status);
  return data.reliquats;
}

export async function addReliquat(fields: Omit<Reliquat, 'id' | 'createdAt'>): Promise<Reliquat> {
  const data = await loadData();
  const newReliquat: Reliquat = {
    id: uuidv4(),
    ...fields,
    createdAt: new Date().toISOString()
  };
  data.reliquats.push(newReliquat);
  await saveData(data);
  return newReliquat;
}

export async function updateReliquat(id: string, updates: Partial<Omit<Reliquat, 'id' | 'createdAt'>>): Promise<Reliquat | null> {
  const data = await loadData();
  const index = data.reliquats.findIndex(r => r.id === id);
  if (index === -1) return null;
  data.reliquats[index] = { ...data.reliquats[index], ...updates };
  await saveData(data);
  return data.reliquats[index];
}

export async function deleteReliquat(id: string): Promise<boolean> {
  const data = await loadData();
  const initialLength = data.reliquats.length;
  data.reliquats = data.reliquats.filter(r => r.id !== id);
  if (data.reliquats.length < initialLength) {
    await saveData(data);
    return true;
  }
  return false;
}

// --- Donnees ORPEC (PIEVE) CRUD ---

export async function getOrpecData(mois: string): Promise<OrpecMoisData | null> {
  const data = await loadData();
  return data.orpecData?.[mois] ?? null;
}

export async function setOrpecData(
  mois: string,
  fields: { caHTorpec: number; achatsGeneriques: number; achatsAlvita: number }
): Promise<OrpecMoisData> {
  const data = await loadData();
  if (!data.orpecData) data.orpecData = {};

  const caHTorpec = fields.caHTorpec;
  const achatsGeneriques = fields.achatsGeneriques;
  const achatsAlvita = fields.achatsAlvita;
  const assiette = caHTorpec - achatsGeneriques - achatsAlvita;
  const remiseDue = Math.round(assiette * 0.03 * 100) / 100;

  const entry: OrpecMoisData = {
    source: 'PIEVE',
    dateImport: new Date().toISOString(),
    caHTorpec,
    achatsGeneriques,
    achatsAlvita,
    assiette: Math.round(assiette * 100) / 100,
    remiseDue
  };

  data.orpecData[mois] = entry;
  await saveData(data);
  return entry;
}

export async function deleteOrpecData(mois: string): Promise<boolean> {
  const data = await loadData();
  if (!data.orpecData || !(mois in data.orpecData)) return false;
  delete data.orpecData[mois];
  await saveData(data);
  return true;
}
