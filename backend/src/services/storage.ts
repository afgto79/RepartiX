import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Releve, Regularisation, DataStore } from '../types/releve';

const DATA_FILE = path.join(__dirname, '../data/releves.json');

export async function loadData(): Promise<DataStore> {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(content);
    // Migration: ajouter regularisations si absent
    if (!data.regularisations) {
      data.regularisations = [];
    }
    return data;
  } catch {
    const emptyData: DataStore = {
      releves: [],
      regularisations: [],
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
    totalNetHT: 0,
    totalTTC: 0,
    remiseAbnMargeHT: null,
    remisesPartenariatsHT: null,
    avoirsCommerciauxHT: null,
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
