# RepartiX — Document technique

## 1. Vue d'ensemble

RepartiX est une application web interne permettant d'analyser les remises commerciales versées par le répartiteur **Alliance Healthcare** (groupe Cencora) à une officine pharmaceutique.

Alliance Healthcare déduit chaque mois une remise commerciale de 3 % sur le chiffre d'affaires réalisé en marchandises. L'application compare la remise théorique (calculée selon la règle contractuelle) à la remise effectivement versée, et mesure l'écart (delta).

**Stack technique :**
- Backend : Node.js / Express / TypeScript — port 4001
- Frontend : React 18 / Vite / TailwindCSS — port 4000
- Stockage : fichier JSON unique (`backend/src/data/releves.json`)

---

## 2. Source des données : les relevés PDF Alliance Healthcare

### 2.1 Structure d'un relevé

Alliance Healthcare émet un **relevé de factures** par décade (période de 10 jours). Chaque mois est donc découpé en **3 décades** :

| Décade | Période couverte |
|--------|-----------------|
| D1 | du 1er au 10 du mois |
| D2 | du 11 au 20 du mois |
| D3 | du 21 au dernier jour du mois |

La **3ème décade (D3)** est la plus importante : elle contient les valeurs **cumulatives mensuelles** pour les lignes commerciales (remises, avoirs, frais généraux).

### 2.2 Règle de décalage de la remise

La remise commerciale ABN/Marge suit un décalage d'un mois :

- La remise visible dans **D3 du mois M** concerne les **achats du mois M-1**
- La remise pour le mois M ne sera connue qu'à la réception de **D3 du mois M+1**

Ce décalage est intentionnel et documenté dans la règle métier Alliance Healthcare.

### 2.3 Lignes extraites du PDF

Le relevé est un document PDF dont le texte est extrait par la bibliothèque **pdfjs-dist** (mode Node.js, sans worker). Les items texte de chaque page sont concaténés avec des espaces.

Les champs suivants sont recherchés par expressions régulières :

#### Période et décade
```
Texte attendu : "période du 21/12/2025 au 31/12/2025"
Regex         : /p[ée]riode\s+du\s+\d{2}\/(\d{2})\/(\d{4})\s+au\s+(\d{2})\/(\d{4})/i
```
Le **jour de fin** de période détermine la décade : ≤ 10 → D1, ≤ 20 → D2, > 20 → D3.

#### Total relevé (Débit HT et Net HT)
```
Texte attendu : "Total relevé de factures ... net TTC 10729,65  -879,26  9850,39 ..."
```
Après le marqueur `net TTC`, les colonnes sont dans l'ordre : Débit HT, Crédit HT, Net HT.
- `debitHT` = 1ère valeur (montant brut d'achats HT)
- `totalNetHT` = 3ème valeur (net après crédits HT)

#### Total TTC (Net à payer)
```
Texte attendu : "Net à payer   10102,41"
```
Correspond au montant total TTC de la décade, tel qu'il figure sur le relevé.
- `totalTTC` = valeur unique suivant "Net à payer"

#### Remise commerciale ABN/Marge
```
Texte attendu : "Remises Commerciales/abn marge  -551,99  -430,14  -25,56  -25,26  -71,03  -27,18  -579,17"
```
Le nombre de colonnes est **variable** selon les taux TVA applicables (2,1 %, 5,5 %, 10 %, 20 %, exonéré). Le parser extrait :
- **1ère valeur** = montant HT → `remiseAbnMargeHT`
- **Dernière valeur** = montant TTC → `remiseAbnMargeTTC`

La valeur est **négative** (avoir en faveur de l'officine).

#### Remises partenariats
```
Texte attendu : "Remises partenariats   -1101,99   ..."
```
Première valeur extraite → `remisesPartenariatsHT` (HT uniquement, valeur négative).

#### Avoirs commerciaux
```
Texte attendu : "Avoirs commerciaux   -26,66   ..."
```
Première valeur extraite → `avoirsCommerciauxHT` (HT uniquement, valeur négative).

#### Frais généraux
```
Texte attendu : "Total frais généraux   62,22   62,22   0,00  ...  1,44   63,53"
```
Comme pour la remise, le nombre de colonnes est variable. Le parser extrait :
- **1ère valeur** = montant brut HT → `fraisGenerauxBrutHT`
- **2ème valeur** = montant net HT → `fraisGenerauxNetHT`
- **Dernière valeur** = montant TTC → `fraisGenerauxTTC`

Les frais généraux sont **positifs** (charge pour l'officine).

### 2.4 Validation et statut de parsing

Un relevé est accepté uniquement s'il contient au minimum :
- `annee`, `mois`, `decade`
- `totalNetHT`

Le champ `parsingStatus` vaut :
- `success` si tous les champs clés sont présents (`annee`, `mois`, `decade`, `totalNetHT`, `totalTTC`)
- `partial` si certains champs secondaires sont absents
- `failed` si le parsing a retourné `null` (structure non reconnue)

Les erreurs de parsing sont listées dans `parsingErrors[]`.

### 2.5 Déduplication

Avant import, un hash SHA-256 du fichier PDF est calculé. Si ce hash existe déjà en base, le fichier est ignoré (doublon).

---

## 3. Modèle de données

### 3.1 Releve

Représente une décade d'un relevé Alliance Healthcare.

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string | UUID généré à l'import |
| `fournisseur` | `'Alliance Healthcare'` | Fixe |
| `annee` | number | Ex : 2025 |
| `mois` | number | 1–12 |
| `decade` | 1 \| 2 \| 3 | Numéro de décade |
| `debitHT` | number \| null | Montant brut d'achats HT |
| `totalNetHT` | number | Net HT après crédits |
| `totalTTC` | number | Net à payer TTC |
| `remiseAbnMargeHT` | number \| null | Remise commerciale HT (valeur signée négative) |
| `remiseAbnMargeTTC` | number \| null | Remise commerciale TTC (valeur signée négative) |
| `remisesPartenariatsHT` | number \| null | Remises partenariats HT |
| `avoirsCommerciauxHT` | number \| null | Avoirs commerciaux HT |
| `fraisGenerauxBrutHT` | number \| null | Frais généraux brut HT |
| `fraisGenerauxNetHT` | number \| null | Frais généraux net HT |
| `fraisGenerauxTTC` | number \| null | Frais généraux TTC |
| `importedAt` | string | ISO 8601 |
| `source` | string | Nom du fichier PDF source |
| `hash` | string | SHA-256 du fichier |
| `parsingStatus` | string | `success` / `partial` / `failed` |
| `parsingErrors` | string[] | Liste des erreurs détectées |

### 3.2 AnalyseRemise

Résultat calculé pour un mois complet (les 3 décades réunies).

| Champ | Type | Description |
|-------|------|-------------|
| `mois` | string | `"YYYY-MM"` |
| `totalHTMensuel` | number | Somme totalTTC D1+D2+D3 (base de calcul) |
| `remiseAttendue` | number | 3 % × assiette TTC |
| `remiseReelle` | number | Remise annoncée TTC (D3 M+1), brute avant frais |
| `fraisGeneraux` | number | Frais TTC lus sur D3 M |
| `reversee` | number | Remise nette effectivement versée = annoncée − frais |
| `delta` | number | Reversée − Attendue (négatif = manque à gagner) |
| `deltaPourcent` | number | Delta en % de la remise attendue |
| `statut` | string | `OK` / `EN_COURS` / `RETARD` |
| `decadesPresentes` | number[] | Ex : [1, 2, 3] |

### 3.3 Autres entités

| Entité | Rôle |
|--------|------|
| `Reclamation` | Réclamation formelle déposée auprès du répartiteur, couvrant une période de mois |
| `Payment` | Paiement reçu en règlement d'une réclamation |
| `Reliquat` | Montant non réclamé issu d'une réclamation partielle, disponible pour une future réclamation |

---

## 4. Calcul des remises (`remises.ts`)

### 4.1 Principe général

Pour chaque mois M, on dispose de 3 décades importées. La D3 contient les valeurs cumulatives du mois pour la remise et les frais.

Le calcul s'effectue en 5 étapes :

### 4.2 Étape 1 — Base TTC mensuelle

```
totalTTCMensuel(M) = D1.totalTTC + D2.totalTTC + D3.totalTTC
```

Ce total inclut déjà, en déduction, la remise commerciale du mois M-1 (qui apparaît comme avoir négatif dans D3 M).

### 4.3 Étape 2 — Assiette TTC

L'assiette représente la valeur nette des marchandises facturées sur le mois M, hors frais et hors remise déjà déduite.

```
remiseDeduiteDansM  = abs(D3[M].remiseAbnMargeTTC)   ← remise de M-1, incluse en négatif dans totalTTC
fraisGeneraux(M)    = abs(D3[M].fraisGenerauxTTC)     ← pas de décalage : les frais de M sont dans D3 M

assiette(M) = totalTTCMensuel(M) − fraisGeneraux(M) + remiseDeduiteDansM
```

**Pourquoi ajouter la remise ?**
Le `totalTTC` contient déjà la remise de M-1 comme crédit (valeur négative). Pour obtenir la base brute des marchandises du mois M, on neutralise cet avoir en le rajoutant.

**Équivalence signée :**
```
assiette(M) = totalTTCMensuel − frais − remise_M-1   [la remise étant négative, soustraire un négatif = ajouter]
```

**Fallback pour anciens PDFs :**
Si `remiseAbnMargeTTC` ou `fraisGenerauxTTC` sont absents (PDFs importés avant le correctif du 16/03/2026), l'application utilise les valeurs HT (`remiseAbnMargeHT`, `fraisGenerauxNetHT`, `fraisGenerauxBrutHT`) comme approximation.

### 4.4 Étape 3 — Remise attendue

```
attendue(M) = assiette(M) × 3 %
```

C'est le montant que le répartiteur aurait dû verser pour le mois M.

### 4.5 Étape 4 — Remise reversée

La remise pour le mois M est annoncée dans **D3 du mois M+1** (décalage d'un mois).

```
remiseReelle(M)  = abs(D3[M+1].remiseAbnMargeTTC)   ← remise annoncée pour M, versée en M+1
fraisGeneraux(M) = abs(D3[M].fraisGenerauxTTC)       ← frais du mois M

reversée(M) = remiseReelle(M) − fraisGeneraux(M)
```

La reversée représente ce que l'officine reçoit effectivement, net des frais de gestion.

### 4.6 Étape 5 — Delta et statut

```
delta(M) = reversée(M) − attendue(M)
```

| Valeur du delta | Interprétation |
|----------------|----------------|
| ≥ −0,01 € | Le répartiteur a versé la bonne somme → statut **OK** |
| < −0,01 € | Le répartiteur a sous-versé → statut **RETARD** |

**Statut EN_COURS** : le mois n'a pas encore ses 3 décades importées, OU la D3 du mois M+1 est absente (la remise réelle n'est pas encore connue).

### 4.7 Cas particulier décembre

Pour calculer le delta de décembre N, il faut la D3 de janvier N+1. L'endpoint `/api/stats/dashboard?annee=N` charge donc les relevés de N **et** de N+1, puis filtre sur `mois.startsWith("N-")`.

---

## 5. API Backend

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/upload` | Import de 1 à 50 PDFs (multipart/form-data, champ `pdfs`) |
| `GET` | `/api/releves` | Toutes les décades, triées |
| `DELETE` | `/api/releves` | Supprime toutes les décades (réclamations conservées) |
| `GET` | `/api/stats/dashboard?annee=N` | Analyses mensuelles pour l'année N |
| `GET` | `/api/stats/cumul` | KPI globaux toutes années confondues |
| `GET` | `/api/stats/annees` | Liste des années disponibles |
| `GET/POST` | `/api/reclamations` | CRUD réclamations |
| `PUT/DELETE` | `/api/reclamations/:id` | Modification / suppression |
| `DELETE` | `/api/reclamations` | Supprime toutes les réclamations + paiements |
| `GET/POST` | `/api/payments` | CRUD paiements |
| `GET/POST/PUT/DELETE` | `/api/reliquats` | CRUD reliquats |

---

## 6. Interface utilisateur — 3 pages

### Page Accueil
- KPIs : reste à percevoir, récupéré via réclamations, delta total, montant reversé
- Graphique en barres : delta mensuel, coloré selon statut (rouge / gris / vert)
- Tableau récapitulatif mensuel : Mois / Attendue / Annoncée / Frais / Reversée / Delta / Statut
- Export PDF annuel

### Page Réclamations
- Liste des réclamations avec statut et montant
- Détail d'une réclamation avec historique des paiements
- Création de réclamation avec gestion des reliquats
- Réclamations multi-années autorisées (répartition pro-rata dans l'export PDF)

### Page Données
- **Onglet Import** : glisser-déposer de PDFs, résultat ligne par ligne
- **Onglet Décades** : tableau de toutes les décades importées
- **Onglet Mois** : tableau récapitulatif mensuel (identique à la page Accueil)
- **Onglet Règles de calcul** : documentation métier intégrée à l'application

---

## 7. Export PDF annuel

L'export (`frontend/src/utils/pdfExport.ts`) produit un rapport annuel en PDF via jsPDF 4.2.0 + jspdf-autotable 5.0.7 :

- En-tête avec nom officine, année, date d'export
- 4 tuiles KPI : Reste à percevoir / Récupéré via réclamations / Delta total / Montant reversé
- Tableau autoTable avec les 12 mois, ligne totale en gras, delta rouge/vert
- Graphique en barres (6 cm) : axe Y gradué 0/25/50/75/100 % du delta max
- Nouvelle page automatique si débordement

**Calcul "Récupéré via réclamations" dans le PDF :**
Pour les réclamations couvrant plusieurs années, les paiements sont répartis au pro-rata du nombre de mois concernés dans chaque année :
```
ratio(N) = mois_dans_année_N / total_mois_réclamation
récupéré(N) = sum(paiements_réclamation) × ratio(N)
```

---

## 8. Points d'attention pour un tiers

### Ré-import des PDFs anciens
Les PDFs importés **avant le 16/03/2026** peuvent avoir des valeurs `remiseAbnMargeTTC` incorrectes : l'ancien regex supposait un nombre fixe de colonnes (7) alors que ce nombre varie selon les taux TVA actifs. Ces PDFs doivent être **ré-importés** pour que les calculs TTC soient exacts.

### Signe des valeurs
Dans les PDFs Alliance Healthcare, les remises et avoirs sont des **valeurs négatives** (crédits). Le code applique systématiquement `Math.abs()` avant tout calcul. Les frais généraux sont positifs.

### totalHTMensuel ≠ Débit HT
Malgré son nom dans le type `AnalyseRemise`, le champ `totalHTMensuel` contient en réalité la **somme des totalTTC** des 3 décades du mois. Cette dénomination est un artefact historique (le calcul était initialement en HT).

---

## 9. Triptyque de réconciliation A / B / C (Chantier C5)

Le triptyque permet de distinguer **trois niveaux d'écart** mensuels entre la pharmacie et ORPEC, au lieu d'un delta global.

### 9.1 Définitions des trois colonnes

| Colonne | Libellé | Base | Source |
|---------|---------|------|--------|
| **A1** | Théorique ORPEC | HT | `orpecMois.remiseDue` = 3 % × assiette « Sans RSF » saisie PIEVE |
| **A2** | Proxy Giropharm | HT | 3 % × (`debitHT` mensuel − CA génériques ≥ 350 €/labo − `achatsAlvita`) |
| **A3** | Estimation Alliance TTC | TTC | 3 % × assiette TTC Alliance (voir §4) — disponible toujours |
| **B** | Annoncé ORPEC | HT | `orpecMois.remiseAnnoncee.montantHT` (facture ORPEC ou tableau PIEVE) |
| **C** | Versé | TTC | `abs(D3[M+1].remiseAbnMargeTTC)` — décalage M+1 confirmé |

### 9.2 Deux deltas

```
deltaCalcul   = A1 − B   (écart de calcul : ORPEC a annoncé moins que le dû PIEVE)
deltaPaiement = B − C    (écart de paiement : ORPEC a versé moins qu'annoncé)
```

Positif = défavorable à la pharmacie.

### 9.3 Bases différentes HT / TTC — ne pas mélanger

- **A1, A2, B** sont en **HT** (PIEVE et factures ORPEC travaillent en HT).
- **A3, C** sont en **TTC** (décades Alliance).
- **deltaPaiement = B − C** compare donc HT vs TTC : l'écart intègre l'érosion TVA.
- **Cross-check B ↔ C** (C5.4) utilise `remiseAbnMargeHT` (pas TTC) pour comparer en HT/HT avec une tolérance de 0,50 €. Ce champ *n'est pas* `remiseAbnMargeTTC`.

### 9.4 Érosion TVA dans B − C

La remise Alliance Healthcare est une remise en nature sur marchandises, à taux de TVA **mixte réel ≈ 6,42 %** (calculé sur l'historique). Lorsque le versement ORPEC est en TTC (C), il inclut cette TVA. L'écart B(HT) − C(TTC) incorpore donc mécaniquement :

```
érosion ≈ C × 6,42 %   (la TVA présente dans C mais absente de B)
```

Pour des montants mensuels de 600–900 € HT, cela représente ≈ 38–58 €.  
**⚠ deltaPaiement est structurellement négatif** même si ORPEC verse exactement B — ne pas confondre cet écart avec un manque de paiement. Le cross-check HT/HT (statut `matched` / `mismatch`) est le vrai indicateur d'un problème de paiement.

### 9.5 A2 — proxy Giropharm (données génériques)

A2 nécessite les données `GENERIQUES_ORPEC_2025_2026` importées via `POST /api/generiques` (JSON).

```
A2 = 3 % × (debitHT_mensuel − Σ netHT_labo[netHT ≥ 350 €] − achatsAlvita)
```

- `debitHT_mensuel` = Σ `Releve.debitHT` des 3 décades du mois.
- Seuls les labs génériqueurs avec **Net HT ≥ 350 €** ce mois-là sont exclus (seuil ORPEC — même règle que le `CLAWBACK_GENERIQUES`).
- `achatsAlvita` est lu depuis `OrpecMoisData.achatsAlvita` si disponible ; sinon la déduction Alvita est absente (A2 reste une approximation).
- Sans données importées → `girophamProxy` = `undefined`, colonne affichée "—".

### 9.6 État d'implémentation

| Étape | Commit | Contenu |
|-------|--------|---------|
| C5.1 | `b1f3c1b` | Modèle `OrpecMoisData` étendu (`remiseAnnoncee`, `saisieMode`) ; routes `/api/orpec` |
| C5.3 | `0ec53cb` | Moteur multi-méthodes — champs additifs dans `AnalyseRemise` (A1, A2 stub, A3, B, deltaCalcul, deltaPaiement) |
| C5.4 | `aa29f83` | Cross-check B(HT) ↔ C(HT), tolérance 0,50 €, champ `crossCheck` |
| C5.5 | `d1a4d33` | `DashboardConfrontation` — tableau triptyque, sous-totaux trimestriels, export CSV |
| C5.3-bis | `9ae2664` | A2 Giropharm calculé — route `/api/generiques` (GET/POST/DELETE), seuil 350 €/labo, bouton import JSON |

### Décade 3 indispensable
L'assiette, les frais et la remise déduite sont lus sur **D3 du mois M**. Sans D3, le statut reste `EN_COURS` et aucun delta n'est calculé.

### Stockage fichier
Toutes les données sont stockées dans un seul fichier JSON. Il n'y a pas de base de données. Une sauvegarde régulière de `backend/src/data/releves.json` est recommandée.
