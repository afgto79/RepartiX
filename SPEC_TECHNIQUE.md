# 📋 SPÉCIFICATION TECHNIQUE DÉTAILLÉE
## Application Contrôle Remises Alliance/Cencora

**Destinataire :** Windsurf IDE + Claude Code  
**Objectif :** Fournir tous les fragments de code critiques pour éviter les dérives d'implémentation

---

## 1. SCHÉMA DE DONNÉES

### 1.1 Type TypeScript — Relevé
```typescript
// backend/src/types/releve.ts

export interface Releve {
  id: string;                    // UUID v4
  fournisseur: 'Alliance Healthcare';
  annee: number;                 // Ex: 2025
  mois: number;                  // 1-12
  decade: 1 | 2 | 3;
  totalNetHT: number;            // Ex: 9850.39
  totalTTC: number;              // Ex: 10102.41
  remiseAbnMargeHT: number | null;      // Ex: -551.99 (négatif)
  remisesPartenariatsHT: number | null; // Ex: -1101.99
  avoirsCommerciauxHT: number | null;   // Ex: -26.66
  importedAt: string;            // ISO 8601
  source: string;                // Nom fichier PDF
  hash: string;                  // SHA256 du fichier
  parsingStatus: 'success' | 'partial' | 'failed';
  parsingErrors?: string[];      // Messages d'erreur éventuels
}

export interface AnalyseRemise {
  mois: string;                  // Format "2025-12"
  totalHTMensuel: number;        // Somme des 3 décades
  remiseAttendue: number;        // 3% du total HT
  remiseReelle: number;          // Valeur décade 3
  delta: number;                 // réel - attendu (négatif = manque)
  deltaPourcent: number;         // (delta / attendu) * 100
  statut: 'OK' | 'EN_COURS' | 'RETARD';
  decadesPresentes: number[];    // Ex: [1, 2, 3]
}
```

### 1.2 Structure JSON de stockage
```json
{
  "releves": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "fournisseur": "Alliance Healthcare",
      "annee": 2025,
      "mois": 12,
      "decade": 3,
      "totalNetHT": 9850.39,
      "totalTTC": 10102.41,
      "remiseAbnMargeHT": -551.99,
      "remisesPartenariatsHT": -1101.99,
      "avoirsCommerciauxHT": -26.66,
      "importedAt": "2025-01-30T15:23:45.123Z",
      "source": "releve_304067289_alliance_healthcare_repartition_6111_31122025.pdf",
      "hash": "a3c5e7b9d1f2e4a6c8b0d2f4e6a8c0b2d4f6e8a0c2b4d6f8e0a2c4b6d8f0e2a4",
      "parsingStatus": "success"
    }
  ],
  "metadata": {
    "lastUpdated": "2025-01-30T15:23:45.123Z",
    "totalReleves": 36
  }
}
```

---

## 2. BACKEND EXPRESS — STRUCTURE SERVEUR

### 2.1 Serveur principal
```typescript
// backend/src/index.ts
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { uploadRouter } from './routes/upload';
import { relevesRouter } from './routes/releves';
import { statsRouter } from './routes/stats';
import { initWatcher } from './services/fileWatcher';

const app = express();
const PORT = 4001;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/upload', uploadRouter);
app.use('/api/releves', relevesRouter);
app.use('/api/stats', statsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Démarrage
app.listen(PORT, () => {
  console.log(`🚀 Backend démarré sur http://127.0.0.1:${PORT}`);
  
  // Optionnel : activer le watcher au démarrage
  // initWatcher();
});
```

### 2.2 Route upload
```typescript
// backend/src/routes/upload.ts
import { Router } from 'express';
import multer from 'multer';
import { parsePDF } from '../services/pdfParser';
import { saveReleve, getFileHash, isDuplicate } from '../services/storage';

const router = Router();

// Configuration multer (stockage temporaire)
const upload = multer({
  dest: 'backend/uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seulement les fichiers PDF sont acceptés'));
    }
  }
});

router.post('/', upload.array('pdfs', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier envoyé' });
    }

    const results = {
      imported: 0,
      duplicates: 0,
      errors: [] as { file: string; error: string }[]
    };

    for (const file of req.files as Express.Multer.File[]) {
      try {
        // 1. Vérifier doublon via hash
        const hash = await getFileHash(file.path);
        if (await isDuplicate(hash)) {
          results.duplicates++;
          continue;
        }

        // 2. Parser le PDF
        const releveData = await parsePDF(file.path);
        
        if (!releveData) {
          results.errors.push({
            file: file.originalname,
            error: 'Parsing échoué - structure PDF non reconnue'
          });
          continue;
        }

        // 3. Sauvegarder
        await saveReleve({
          ...releveData,
          source: file.originalname,
          hash
        });

        results.imported++;

      } catch (err) {
        results.errors.push({
          file: file.originalname,
          error: err instanceof Error ? err.message : 'Erreur inconnue'
        });
      }
    }

    res.json({
      success: true,
      ...results
    });

  } catch (err) {
    console.error('Erreur upload:', err);
    res.status(500).json({
      error: 'Erreur serveur lors de l\'import',
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

export { router as uploadRouter };
```

### 2.3 Route stats dashboard
```typescript
// backend/src/routes/stats.ts
import { Router } from 'express';
import { getReleves } from '../services/storage';
import { calculerRemisesMensuelles } from '../services/remises';

const router = Router();

router.get('/dashboard', async (req, res) => {
  try {
    const annee = req.query.annee ? parseInt(req.query.annee as string) : new Date().getFullYear();
    
    // Récupérer tous les relevés de l'année
    const releves = await getReleves({ annee });
    
    // Calculer les analyses mensuelles
    const analyses = calculerRemisesMensuelles(releves);
    
    res.json({
      annee,
      mois: analyses
    });

  } catch (err) {
    console.error('Erreur stats dashboard:', err);
    res.status(500).json({
      error: 'Erreur lors du calcul des statistiques',
      details: err instanceof Error ? err.message : 'Erreur inconnue'
    });
  }
});

export { router as statsRouter };
```

---

## 3. PARSING PDF — IMPLÉMENTATION CRITIQUE

### 3.1 Parser principal
```typescript
// backend/src/services/pdfParser.ts
import * as pdfjs from 'pdfjs-dist';
import { Releve } from '../types/releve';

/**
 * Parse un PDF de relevé Alliance Healthcare
 * Retourne null si le parsing échoue complètement
 */
export async function parsePDF(filePath: string): Promise<Partial<Releve> | null> {
  try {
    // 1. Charger le PDF
    const loadingTask = pdfjs.getDocument(filePath);
    const pdf = await loadingTask.promise;
    
    // 2. Extraire tout le texte
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    // 3. Extraction des champs critiques
    const extracted = extractFields(fullText);
    
    // 4. Validation minimale
    if (!extracted.annee || !extracted.mois || !extracted.decade || !extracted.totalNetHT) {
      console.error('Champs critiques manquants:', extracted);
      return null;
    }

    return {
      ...extracted,
      fournisseur: 'Alliance Healthcare',
      importedAt: new Date().toISOString(),
      parsingStatus: hasAllFields(extracted) ? 'success' : 'partial'
    };

  } catch (err) {
    console.error('Erreur parsing PDF:', err);
    return null;
  }
}

/**
 * Extrait les champs du texte brut via regex
 */
function extractFields(text: string): Partial<Releve> {
  const fields: Partial<Releve> = {};
  const errors: string[] = [];

  // 1. PÉRIODE ET DATE (pour mois/année/décade)
  // Exemple: "Relevé Factures période du 21/12/2025 au 31/12/2025"
  const periodeRegex = /période du \d{2}\/\d{2}\/(\d{4}) au (\d{2})\/(\d{2})\/(\d{4})/;
  const periodeMatch = text.match(periodeRegex);
  
  if (periodeMatch) {
    fields.annee = parseInt(periodeMatch[4]);
    fields.mois = parseInt(periodeMatch[3]);
    const jourFin = parseInt(periodeMatch[2]);
    
    // Déduction décade basée sur le jour de fin
    if (jourFin <= 10) {
      fields.decade = 1;
    } else if (jourFin <= 20) {
      fields.decade = 2;
    } else {
      fields.decade = 3;
    }
  } else {
    errors.push('Période non trouvée');
  }

  // 2. TOTAL NET HT
  // Chercher dans la section "Total relevé de factures"
  const totalNetHTRegex = /Total relevé de factures.*?Montant\s+net HT\s+([-\d\s]+[,\.]\d{2})/s;
  const totalNetHTMatch = text.match(totalNetHTRegex);
  
  if (totalNetHTMatch) {
    fields.totalNetHT = parseMonetaire(totalNetHTMatch[1]);
  } else {
    errors.push('Total NET HT non trouvé');
  }

  // 3. TOTAL TTC
  const totalTTCRegex = /Total relevé de factures.*?Montant\s+net TTC\s+([-\d\s]+[,\.]\d{2})/s;
  const totalTTCMatch = text.match(totalTTCRegex);
  
  if (totalTTCMatch) {
    fields.totalTTC = parseMonetaire(totalTTCMatch[1]);
  }

  // 4. REMISE COMMERCIALE
  // ⚠️ Variations possibles: "abn marge" ou "abonnement marge"
  const remiseRegex = /Remises Commerciales\s*[\/\\]\s*ab[nm]\s+marge\s+([-\d\s]+[,\.]\d{2})/i;
  const remiseMatch = text.match(remiseRegex);
  
  if (remiseMatch) {
    fields.remiseAbnMargeHT = parseMonetaire(remiseMatch[1]);
  } else if (fields.decade === 3) {
    // Si décade 3 et pas de remise trouvée → ALERTE
    errors.push('⚠️ CRITIQUE: Remise commerciale absente sur décade 3');
  }

  // 5. REMISES PARTENARIATS
  const partenaRegex = /Remises partenariats\s+([-\d\s]+[,\.]\d{2})/i;
  const partenaMatch = text.match(partenaRegex);
  
  if (partenaMatch) {
    fields.remisesPartenariatsHT = parseMonetaire(partenaMatch[1]);
  }

  // 6. AVOIRS COMMERCIAUX
  const avoirsRegex = /Avoirs commerciaux\s+([-\d\s]+[,\.]\d{2})/i;
  const avoirsMatch = text.match(avoirsRegex);
  
  if (avoirsMatch) {
    fields.avoirsCommerciauxHT = parseMonetaire(avoirsMatch[1]);
  }

  if (errors.length > 0) {
    fields.parsingErrors = errors;
  }

  return fields;
}

/**
 * Parse une chaîne monétaire française vers number
 * Ex: "9 850,39" → 9850.39
 * Ex: "-1 101,99" → -1101.99
 */
function parseMonetaire(str: string): number {
  return parseFloat(
    str
      .replace(/\s/g, '')        // Supprimer espaces
      .replace(',', '.')         // Virgule → point
  );
}

/**
 * Vérifie si tous les champs non-null sont présents
 */
function hasAllFields(fields: Partial<Releve>): boolean {
  return !!(
    fields.annee &&
    fields.mois &&
    fields.decade &&
    fields.totalNetHT &&
    fields.totalTTC
  );
}
```

---

## 4. CALCULS MÉTIER — FONCTIONS PURES

### 4.1 Calcul remise mensuelle
```typescript
// backend/src/services/remises.ts
import { Releve, AnalyseRemise } from '../types/releve';

/**
 * Calcule les analyses de remises pour tous les mois disponibles
 * Groupe les décades par mois et applique la règle métier (3%)
 */
export function calculerRemisesMensuelles(releves: Releve[]): AnalyseRemise[] {
  // 1. Grouper par mois
  const groupes = grouperParMois(releves);
  
  // 2. Calculer pour chaque mois
  return Object.entries(groupes).map(([moisKey, decades]) => {
    return analyserMois(moisKey, decades);
  });
}

/**
 * Groupe les relevés par "YYYY-MM"
 */
function grouperParMois(releves: Releve[]): Record<string, Releve[]> {
  const groupes: Record<string, Releve[]> = {};
  
  for (const releve of releves) {
    const key = `${releve.annee}-${String(releve.mois).padStart(2, '0')}`;
    if (!groupes[key]) {
      groupes[key] = [];
    }
    groupes[key].push(releve);
  }
  
  return groupes;
}

/**
 * Analyse un mois complet (1-3 décades)
 * Applique la règle: remise = 3% du total NET HT mensuel
 */
function analyserMois(moisKey: string, decades: Releve[]): AnalyseRemise {
  // Somme des NET HT des décades présentes
  const totalHTMensuel = decades.reduce((sum, d) => sum + d.totalNetHT, 0);
  
  // Remise attendue = 3% du total HT
  const remiseAttendue = totalHTMensuel * 0.03;
  
  // Remise réelle = valeur sur la décade 3
  const decade3 = decades.find(d => d.decade === 3);
  const remiseReelle = decade3?.remiseAbnMargeHT ?? 0;
  
  // Delta (négatif = on nous doit de l'argent)
  const delta = remiseReelle - remiseAttendue;
  const deltaPourcent = remiseAttendue !== 0 
    ? (delta / Math.abs(remiseAttendue)) * 100 
    : 0;
  
  // Détermination du statut
  const decadesPresentes = decades.map(d => d.decade).sort();
  let statut: 'OK' | 'EN_COURS' | 'RETARD';
  
  if (decadesPresentes.length < 3) {
    // Mois incomplet
    statut = 'EN_COURS';
  } else if (Math.abs(delta) < 0.01) {
    // Delta négligeable (< 1 centime)
    statut = 'OK';
  } else if (delta >= 0) {
    // Remise correcte ou excédentaire
    statut = 'OK';
  } else {
    // Remise manquante ou insuffisante
    statut = 'RETARD';
  }
  
  return {
    mois: moisKey,
    totalHTMensuel: arrondir(totalHTMensuel),
    remiseAttendue: arrondir(remiseAttendue),
    remiseReelle: arrondir(remiseReelle),
    delta: arrondir(delta),
    deltaPourcent: arrondir(deltaPourcent),
    statut,
    decadesPresentes
  };
}

/**
 * Arrondit à 2 décimales
 */
function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * TEST UNITAIRE (à mettre dans un fichier séparé en prod)
 */
export function testCalculRemise() {
  const mockReleves: Releve[] = [
    {
      id: '1', fournisseur: 'Alliance Healthcare',
      annee: 2025, mois: 12, decade: 1,
      totalNetHT: 10000, totalTTC: 10200,
      remiseAbnMargeHT: null, remisesPartenariatsHT: null, avoirsCommerciauxHT: null,
      importedAt: '', source: '', hash: '', parsingStatus: 'success'
    },
    {
      id: '2', fournisseur: 'Alliance Healthcare',
      annee: 2025, mois: 12, decade: 2,
      totalNetHT: 9500, totalTTC: 9700,
      remiseAbnMargeHT: null, remisesPartenariatsHT: null, avoirsCommerciauxHT: null,
      importedAt: '', source: '', hash: '', parsingStatus: 'success'
    },
    {
      id: '3', fournisseur: 'Alliance Healthcare',
      annee: 2025, mois: 12, decade: 3,
      totalNetHT: 9850.39, totalTTC: 10102.41,
      remiseAbnMargeHT: -551.99, remisesPartenariatsHT: null, avoirsCommerciauxHT: null,
      importedAt: '', source: '', hash: '', parsingStatus: 'success'
    }
  ];
  
  const analyses = calculerRemisesMensuelles(mockReleves);
  console.log('Test calcul remise:', analyses[0]);
  
  // Assertions
  const analyse = analyses[0];
  console.assert(analyse.totalHTMensuel === 29350.39, 'Total HT incorrect');
  console.assert(Math.abs(analyse.remiseAttendue - 880.51) < 0.01, 'Remise attendue incorrecte');
  console.assert(analyse.remiseReelle === -551.99, 'Remise réelle incorrecte');
  console.assert(analyse.statut === 'RETARD', 'Statut incorrect');
}
```

---

## 5. STOCKAGE JSON — IMPLÉMENTATION

### 5.1 Module storage
```typescript
// backend/src/services/storage.ts
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Releve } from '../types/releve';

const DATA_FILE = path.join(__dirname, '../data/releves.json');

interface DataStore {
  releves: Releve[];
  metadata: {
    lastUpdated: string;
    totalReleves: number;
  };
}

/**
 * Charge les données depuis le fichier JSON
 */
export async function loadData(): Promise<DataStore> {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    // Si fichier n'existe pas, créer structure vide
    const emptyData: DataStore = {
      releves: [],
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalReleves: 0
      }
    };
    await saveData(emptyData);
    return emptyData;
  }
}

/**
 * Sauvegarde les données dans le fichier JSON
 */
export async function saveData(data: DataStore): Promise<void> {
  data.metadata.lastUpdated = new Date().toISOString();
  data.metadata.totalReleves = data.releves.length;
  
  await fs.writeFile(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

/**
 * Sauvegarde un nouveau relevé
 */
export async function saveReleve(releve: Partial<Releve>): Promise<Releve> {
  const data = await loadData();
  
  const newReleve: Releve = {
    id: uuidv4(),
    ...releve as Releve
  };
  
  data.releves.push(newReleve);
  await saveData(data);
  
  return newReleve;
}

/**
 * Récupère les relevés avec filtres optionnels
 */
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

/**
 * Calcule le hash SHA256 d'un fichier
 */
export async function getFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Vérifie si un hash existe déjà (doublon)
 */
export async function isDuplicate(hash: string): Promise<boolean> {
  const data = await loadData();
  return data.releves.some(r => r.hash === hash);
}

/**
 * Supprime un relevé par ID
 */
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
```

---

## 6. FRONTEND — COMPOSANTS REACT

### 6.1 Service API centralisé
```typescript
// frontend/src/services/api.ts

const API_BASE = '/api';

interface UploadResponse {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: { file: string; error: string }[];
}

interface DashboardResponse {
  annee: number;
  mois: AnalyseRemise[];
}

export const api = {
  /**
   * Upload de fichiers PDF en batch
   */
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

  /**
   * Récupère les stats dashboard pour une année
   */
  async getDashboard(annee: number): Promise<DashboardResponse> {
    const res = await fetch(`${API_BASE}/stats/dashboard?annee=${annee}`);
    
    if (!res.ok) {
      throw new Error('Erreur chargement dashboard');
    }
    
    return res.json();
  },

  /**
   * Récupère le détail d'un mois
   */
  async getMoisDetail(annee: number, mois: number) {
    const res = await fetch(`${API_BASE}/releves/${annee}/${mois}`);
    
    if (!res.ok) {
      throw new Error('Erreur chargement détail mois');
    }
    
    return res.json();
  },

  /**
   * Supprime un relevé
   */
  async deleteReleve(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/releves/${id}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) {
      throw new Error('Erreur suppression');
    }
  }
};
```

### 6.2 Composant Dashboard
```typescript
// frontend/src/components/Dashboard.tsx
import { useEffect, useState } from 'react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge } from '@tremor/react';
import { api } from '../services/api';

interface AnalyseRemise {
  mois: string;
  totalHTMensuel: number;
  remiseAttendue: number;
  remiseReelle: number;
  delta: number;
  deltaPourcent: number;
  statut: 'OK' | 'EN_COURS' | 'RETARD';
  decadesPresentes: number[];
}

export function Dashboard() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [data, setData] = useState<AnalyseRemise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [annee]);

  async function loadData() {
    setLoading(true);
    try {
      const result = await api.getDashboard(annee);
      setData(result.mois);
    } catch (err) {
      console.error('Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  }

  function getStatutBadge(statut: string) {
    switch (statut) {
      case 'OK':
        return <Badge color="green">✓ OK</Badge>;
      case 'EN_COURS':
        return <Badge color="yellow">⏳ En cours</Badge>;
      case 'RETARD':
        return <Badge color="red">⚠ Retard</Badge>;
      default:
        return <Badge color="gray">?</Badge>;
    }
  }

  function formatEuros(n: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(n);
  }

  function formatMois(moisKey: string): string {
    const [annee, mois] = moisKey.split('-');
    const date = new Date(parseInt(annee), parseInt(mois) - 1);
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Contrôle Remises Alliance</h1>
        
        <select
          value={annee}
          onChange={e => setAnnee(parseInt(e.target.value))}
          className="px-4 py-2 border rounded-lg"
        >
          <option value={2024}>2024</option>
          <option value={2025}>2025</option>
          <option value={2026}>2026</option>
        </select>
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Mois</TableHeaderCell>
              <TableHeaderCell className="text-right">Total HT Mensuel</TableHeaderCell>
              <TableHeaderCell className="text-right">Remise Attendue</TableHeaderCell>
              <TableHeaderCell className="text-right">Remise Réelle</TableHeaderCell>
              <TableHeaderCell className="text-right">Delta</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
            </TableRow>
          </TableHead>
          
          <TableBody>
            {data.map((analyse) => (
              <TableRow 
                key={analyse.mois}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => {/* Navigation vers détail */}}
              >
                <TableCell>{formatMois(analyse.mois)}</TableCell>
                <TableCell className="text-right">{formatEuros(analyse.totalHTMensuel)}</TableCell>
                <TableCell className="text-right">{formatEuros(analyse.remiseAttendue)}</TableCell>
                <TableCell className="text-right">{formatEuros(analyse.remiseReelle)}</TableCell>
                <TableCell className={`text-right font-bold ${analyse.delta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatEuros(analyse.delta)}
                </TableCell>
                <TableCell>{getStatutBadge(analyse.statut)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
```

### 6.3 Zone d'upload
```typescript
// frontend/src/components/UploadZone.tsx
import { useState, useRef } from 'react';
import { Card } from '@tremor/react';
import { api } from '../services/api';

export function UploadZone() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploading(true);
    setResult(null);

    try {
      const res = await api.uploadPDFs(fileArray);
      setResult(res);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Erreur inconnue'
      });
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Import de relevés</h1>

      <Card
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed p-12 text-center cursor-pointer hover:bg-gray-50"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
        />

        <div className="text-gray-600">
          <p className="text-lg mb-2">Glissez-déposez vos fichiers PDF ici</p>
          <p className="text-sm">ou cliquez pour sélectionner</p>
        </div>
      </Card>

      {uploading && (
        <div className="mt-6 text-center">
          <p>Import en cours...</p>
        </div>
      )}

      {result && (
        <Card className="mt-6">
          <h3 className="font-bold mb-4">Résultats de l'import</h3>
          
          {result.success ? (
            <>
              <p className="text-green-600">✓ {result.imported} fichier(s) importé(s)</p>
              {result.duplicates > 0 && (
                <p className="text-yellow-600">⚠ {result.duplicates} doublon(s) ignoré(s)</p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-4">
                  <p className="font-semibold text-red-600">Erreurs :</p>
                  <ul className="list-disc pl-5">
                    {result.errors.map((err: any, i: number) => (
                      <li key={i} className="text-sm text-red-600">
                        {err.file}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-red-600">✗ Erreur: {result.error}</p>
          )}
        </Card>
      )}
    </div>
  );
}
```

---

## 7. CONFIGURATION VITE

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4001',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
```

---

## 8. PACKAGE.JSON

### Backend
```json
{
  "name": "alliance-remises-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "pdfjs-dist": "^3.11.174",
    "uuid": "^9.0.0",
    "chokidar": "^3.5.3"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.11",
    "@types/cors": "^2.8.17",
    "@types/uuid": "^9.0.7",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

### Frontend
```json
{
  "name": "alliance-remises-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tremor/react": "^3.14.0",
    "recharts": "^2.10.3"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.8",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32"
  }
}
```

---

## 9. TESTS MANUELS OBLIGATOIRES

### Test 1 : Upload 3 décades d'un mois complet
```
1. Uploader decadespouranalyse/releve_XXX_10122025.pdf (décade 1)
2. Uploader decadespouranalyse/releve_XXX_20122025.pdf (décade 2)
3. Uploader decadespouranalyse/releve_XXX_31122025.pdf (décade 3)

Résultat attendu :
- Dashboard affiche ligne "Décembre 2025"
- Total HT = somme des 3 décades
- Remise attendue = 3% du total
- Delta visible (rouge si négatif)
- Statut = OK ou RETARD
```

### Test 2 : Détection doublon
```
1. Uploader le même fichier 2 fois

Résultat attendu :
- Premier import : "1 fichier importé"
- Second import : "1 doublon ignoré"
```

### Test 3 : Mois incomplet
```
1. Uploader seulement décades 1 et 2

Résultat attendu :
- Dashboard affiche "🟧 En cours"
- Remise attendue calculée sur 2 décades
- Remise réelle = 0 (pas de décade 3)
```

---

## 10. CHECKLIST VALIDATION FINALE

Avant de considérer le projet terminé, vérifier :

- [ ] Backend démarre sur port 4001 sans erreur
- [ ] Frontend démarre sur port 4000 sans erreur
- [ ] Upload manuel fonctionne (au moins 1 PDF)
- [ ] Parsing extrait les 8 champs critiques
- [ ] Dashboard affiche au moins 1 mois
- [ ] Delta est calculé correctement (3%)
- [ ] Statut visuel cohérent (OK/EN_COURS/RETARD)
- [ ] Doublons sont détectés via hash
- [ ] Pas de crash si fichier corrompu
- [ ] Code TypeScript compile sans erreur
- [ ] Pas de dépendance non listée dans les package.json
- [ ] Aucune fonctionnalité "bonus" non demandée

---

**FIN DU DOCUMENT TECHNIQUE**

Ce document contient tous les fragments de code critiques nécessaires pour éviter les dérives d'implémentation. Respecter strictement ces patterns.
