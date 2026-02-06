# 🎯 PROMPT WINDSURF — Application Contrôle Remises Alliance/Cencora

## CONTEXTE MÉTIER

Tu dois générer une application de contrôle des **remises contractuelles** pour les relevés de décades **Alliance Healthcare / Cencora**.

**Règle contractuelle :**
- Remise = **3% du total NET HT mensuel** (cumul des 3 décades)
- Appliquée **uniquement sur la dernière décade du mois** (décade 3)
- Ligne cible dans le PDF : **"Remises Commerciales/abn marge"**

**Objectif :** Détecter les écarts entre remise attendue et remise réelle, en un coup d'œil.

---

## ARCHITECTURE IMPOSÉE

### Backend (Node.js pur - Port 4001)
- **Express.js** + TypeScript (exécution via `tsx watch`)
- **pdfjs-dist** pour extraction texte PDF
- **fs/fs-extra** pour accès réseau UNC `\\SERVEUR\...\decadespouranalyse`
- **chokidar** pour watch optionnel du dossier
- **Stockage** : JSON local (`backend/src/data/releves.json`)
- **API REST** exposée sur `http://127.0.0.1:4001`

### Frontend (React SPA - Port 4000)
- **React 18** + **Vite**
- **TailwindCSS** (design system)
- **@tremor/react** (KPI cards, statuts visuels)
- **recharts** (graphiques mensuels)
- Communication via `fetch('/api/...')` proxifié par Vite
- **Aucun accès filesystem direct**

### Communication
```
Frontend (Chrome) → Vite proxy (/api/*) → Backend Express (4001)
```

---

## DONNÉES À EXTRAIRE DES PDF

Pour chaque relevé de décade, extraire **UNIQUEMENT** :

| Champ | Description | Exemple |
|-------|-------------|---------|
| `totalNetHT` | Total relevé de factures - Montant net HT | 9850.39 |
| `totalTTC` | Total relevé de factures - Montant net TTC | 10102.41 |
| `remiseAbnMargeHT` | Ligne "Remises Commerciales/abn marge" - Montant net HT | -551.99 |
| `remisesPartenariatsHT` | Ligne "Remises partenariats" - Montant net HT | -1101.99 |
| `avoirsCommerciauxHT` | Ligne "Avoirs commerciaux" - Montant net HT | -26.66 |
| `mois` | Extrait de "Relevé Factures période du XX/XX/XXXX au XX/XX/XXXX" | 12 |
| `annee` | Idem | 2025 |
| `decade` | Déduit de la date de fin (10, 20, ou 31) | 3 |

**⚠️ PARSING CRITIQUE :**
- Ne pas dépendre de la position des lignes
- Chercher les labels textuels exacts
- Gérer les variations typographiques ("abn" vs "abonnement")
- Si un champ manque → marquer comme `null` et logger

---

## ENDPOINTS API BACKEND

### 1. Upload manuel batch
```
POST /api/upload
Content-Type: multipart/form-data
Body: pdfs[] (array de fichiers)

Response 200:
{
  "success": true,
  "imported": 3,
  "duplicates": 1,
  "errors": []
}
```

### 2. Scan dossier réseau
```
POST /api/scan-folder
Body: { "force": false }

Response 200:
{
  "scanned": 15,
  "new": 3,
  "duplicates": 12
}
```

### 3. Dashboard stats
```
GET /api/stats/dashboard?annee=2025

Response 200:
{
  "mois": [
    {
      "mois": "2025-12",
      "totalHTMensuel": 29550.00,
      "remiseAttendue": 886.50,  // 3% de 29550
      "remiseReelle": 551.99,
      "delta": -334.51,           // réel - attendu
      "statut": "RETARD",         // OK | EN_COURS | RETARD
      "decadesPresentes": [1, 2, 3]
    }
  ]
}
```

### 4. Détail d'un mois
```
GET /api/releves/:annee/:mois

Response 200:
{
  "mois": "2025-12",
  "decades": [
    { "decade": 1, "totalNetHT": 10200, "date": "2025-12-10", ... },
    { "decade": 2, "totalNetHT": 9500, "date": "2025-12-20", ... },
    { "decade": 3, "totalNetHT": 9850, "remiseAbnMargeHT": -551.99, ... }
  ],
  "analyse": {
    "totalHTCumule": 29550,
    "remiseAttendue": 886.50,
    "remiseReelle": 551.99,
    "deltaEuros": -334.51,
    "deltaPourcent": -37.7
  }
}
```

### 5. Suppression
```
DELETE /api/releves/:id
Response 200: { "deleted": true }
```

---

## CALCULS MÉTIER (BACKEND)

**Fonction obligatoire :**
```typescript
// backend/src/services/remises.ts

export function calculerRemiseMensuelle(releves: Releve[]): AnalyseRemise {
  // 1. Grouper les 3 décades du même mois
  const decadesGroupees = groupByMois(releves);
  
  // 2. Pour chaque mois
  return decadesGroupees.map(groupe => {
    // Somme des totalNetHT des 3 décades
    const totalHTMensuel = groupe.reduce((sum, r) => sum + r.totalNetHT, 0);
    
    // Remise attendue = 3%
    const remiseAttendue = totalHTMensuel * 0.03;
    
    // Remise réelle = valeur de la décade 3 (si présente)
    const decade3 = groupe.find(r => r.decade === 3);
    const remiseReelle = decade3?.remiseAbnMargeHT ?? 0;
    
    // Delta (négatif = manque à gagner)
    const delta = remiseReelle - remiseAttendue;
    
    // Statut
    let statut: 'OK' | 'EN_COURS' | 'RETARD';
    if (groupe.length < 3) {
      statut = 'EN_COURS';
    } else if (delta >= 0) {
      statut = 'OK';
    } else {
      statut = 'RETARD';
    }
    
    return { mois, totalHTMensuel, remiseAttendue, remiseReelle, delta, statut };
  });
}
```

**⚠️ RÈGLE ABSOLUE : Les calculs doivent être dans des fonctions pures, isolées, testables.**

---

## STOCKAGE JSON (Backend)

```json
// backend/src/data/releves.json
{
  "releves": [
    {
      "id": "uuid-v4",
      "fournisseur": "Alliance Healthcare",
      "annee": 2025,
      "mois": 12,
      "decade": 3,
      "totalNetHT": 9850.39,
      "totalTTC": 10102.41,
      "remiseAbnMargeHT": -551.99,
      "remisesPartenariatsHT": -1101.99,
      "avoirsCommerciauxHT": -26.66,
      "importedAt": "2025-01-30T10:00:00Z",
      "source": "releve_304067289_alliance_healthcare_repartition_6111_31122025.pdf",
      "hash": "sha256-abc123..."
    }
  ]
}
```

**Gestion doublons :**
```typescript
import crypto from 'crypto';

function getFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Avant import, vérifier si hash existe déjà
const existingHashes = releves.map(r => r.hash);
if (existingHashes.includes(newHash)) {
  return { duplicate: true };
}
```

---

## INTERFACE UTILISATEUR (Frontend)

### Page 1 — Dashboard
**Composant :** `Dashboard.tsx`

**Affichage :**
- Tableau mensuel avec colonnes :
  - Mois (format "Décembre 2025")
  - Total HT mensuel (€)
  - Remise attendue (€)
  - Remise réelle (€)
  - **Delta (€)** — en gras, rouge si négatif
  - Statut visuel (badge Tremor : 🟩 OK / 🟧 En cours / 🟥 Retard)

**Interactions :**
- Clic sur ligne → navigation vers détail du mois
- Filtres : année (dropdown)
- Graphique recharts : évolution delta sur 12 mois

### Page 2 — Détail mois
**Composant :** `MoisDetail.tsx`

**Affichage :**
- Récapitulatif : Total HT cumulé, remise attendue, réelle, delta
- Tableau des 3 décades :
  - Numéro décade
  - Date
  - Total NET HT
  - Remise (si décade 3)
- Lien vers le PDF source (si stocké)

### Page 3 — Import
**Composant :** `UploadZone.tsx`

**Fonctionnalités :**
- Zone drag & drop (plusieurs fichiers)
- Bouton "Scan dossier réseau"
- Logs d'import en temps réel :
  - Fichier traité
  - Statut (✓ importé / ⚠ doublon / ✗ erreur)
  - Erreurs parsing détaillées

---

## PARSING PDF (Backend)

**Bibliothèque :** `pdfjs-dist`

**Stratégie d'extraction :**
```typescript
// backend/src/services/pdfParser.ts
import * as pdfjs from 'pdfjs-dist';

export async function parsePDF(filePath: string): Promise<ReleveData | null> {
  const loadingTask = pdfjs.getDocument(filePath);
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ');
  }
  
  // Extraction par regex
  const moisMatch = fullText.match(/période du \d{2}\/\d{2}\/(\d{4}) au (\d{2})\/(\d{2})\/(\d{4})/);
  const annee = moisMatch ? parseInt(moisMatch[4]) : null;
  const mois = moisMatch ? parseInt(moisMatch[3]) : null;
  const jourFin = moisMatch ? parseInt(moisMatch[2]) : null;
  
  // Déduction décade
  const decade = jourFin <= 10 ? 1 : jourFin <= 20 ? 2 : 3;
  
  // Total NET HT (ligne "Total relevé de factures")
  const totalNetHTMatch = fullText.match(/Total relevé de factures.*?Montant net HT\s+([\d\s]+[,\.]\d{2})/);
  const totalNetHT = totalNetHTMatch ? parseFloat(totalNetHTMatch[1].replace(/\s/g, '').replace(',', '.')) : null;
  
  // Remise commerciale
  const remiseMatch = fullText.match(/Remises Commerciales\/ab[nm] marge\s+([-\d\s]+[,\.]\d{2})/);
  const remiseAbnMargeHT = remiseMatch ? parseFloat(remiseMatch[1].replace(/\s/g, '').replace(',', '.')) : null;
  
  // ... autres champs
  
  return {
    annee,
    mois,
    decade,
    totalNetHT,
    remiseAbnMargeHT,
    // ...
  };
}
```

**⚠️ Gestion erreurs parsing :**
- Si un champ critique manque → logger erreur + afficher dans UI
- Permettre correction manuelle via endpoint PATCH

---

## CONFIGURATION VITE (Frontend)

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
      },
    },
  },
});
```

---

## ARBORESCENCE PROJET

```
alliance-remises/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Serveur Express principal
│   │   ├── routes/
│   │   │   ├── upload.ts         # POST /api/upload
│   │   │   ├── releves.ts        # GET/DELETE /api/releves
│   │   │   └── stats.ts          # GET /api/stats/dashboard
│   │   ├── services/
│   │   │   ├── pdfParser.ts      # Extraction pdfjs-dist
│   │   │   ├── fileWatcher.ts    # Watch dossier chokidar
│   │   │   └── remises.ts        # Calculs métier (fonctions pures)
│   │   └── data/
│   │       └── releves.json      # Stockage
│   ├── uploads/                  # Dossier temporaire uploads
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Router principal
│   │   ├── services/
│   │   │   └── api.ts            # Wrapper fetch()
│   │   ├── components/
│   │   │   ├── Dashboard.tsx     # Vue tableau mensuel
│   │   │   ├── MoisDetail.tsx    # Détail décades
│   │   │   └── UploadZone.tsx    # Import fichiers
│   │   └── utils/
│   │       └── formatters.ts     # Formattage dates/montants
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
│
└── README.md
```

---

## CONTRAINTES DE QUALITÉ

1. **Code modulaire**
   - Séparer parsing / calculs / routes / UI
   - Fonctions métier **pures** et testables
   - Pas de logique métier dans les composants React

2. **Gestion erreurs robuste**
   - Try/catch sur tous les appels API
   - Logs serveur détaillés (niveau info/warn/error)
   - Messages d'erreur clairs dans l'UI

3. **Performance**
   - Parsing PDF asynchrone (ne pas bloquer serveur)
   - Limiter imports batch à 50 fichiers max par requête
   - Indexer JSON par mois/année pour accès rapide

4. **Lisibilité**
   - Types TypeScript stricts (pas de `any`)
   - Commentaires uniquement pour logique complexe
   - Nommage explicite (pas de `data1`, `temp`, etc.)

---

## RÈGLES ABSOLUES (GARDE-FOUS)

### ❌ NE PAS FAIRE :
1. **Anticiper des fonctionnalités non demandées**
   - Pas de gestion multi-fournisseurs
   - Pas d'export Excel
   - Pas d'authentification
   - Pas de notifications email

2. **Complexifier inutilement**
   - Pas de Redux/MobX (état local React suffit)
   - Pas de GraphQL
   - Pas de microservices
   - Pas de Docker (dev local)

3. **Dépendre de services externes**
   - Pas de cloud storage
   - Pas d'API tierces
   - Pas de base de données distante

### ✅ FAIRE :
1. Respecter strictement l'architecture client-serveur décrite
2. Implémenter UNIQUEMENT les endpoints listés
3. Extraire UNIQUEMENT les champs spécifiés
4. Utiliser le calcul métier exact (3% mensuel)

---

## LIVRABLE ATTENDU

**MVP fonctionnel avec :**
- Serveur Express démarrable (`npm run dev` backend)
- Frontend Vite démarrable (`npm run dev` frontend)
- Upload manuel de PDFs opérationnel
- Parsing des 8 champs critiques
- Tableau dashboard avec delta visible
- Calcul remise attendue vs réelle correct

**Tests manuels à passer :**
1. Uploader 3 PDFs d'un même mois → voir analyse complète
2. Uploader décade 3 seule → statut "EN_COURS"
3. Uploader doublon → message "déjà importé"
4. Dashboard affiche delta négatif en rouge

---

## DÉMARRAGE DU PROJET

**Backend :**
```bash
cd backend
npm install express pdfjs-dist chokidar uuid
npm install -D typescript tsx @types/node @types/express
npm run dev  # Lance tsx watch src/index.ts
```

**Frontend :**
```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install @tremor/react recharts
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm run dev  # Lance Vite sur port 4000
```

---

## ⚠️ DERNIÈRE INSTRUCTION CRITIQUE

Si tu (Windsurf/Claude Code) n'es pas certain de comment implémenter un élément :
1. **Ne pas improviser**
2. **Demander clarification avant de coder**
3. **Ne pas ajouter de librairies non listées sans accord**

Ce projet doit rester **simple, direct, sans sur-ingénierie**.

EOF
