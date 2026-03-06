# RepartiX - Etat du projet

## Objectif de l'application

Outil de pilotage financier pour contrôler que Alliance Healthcare verse bien
les remises contractuelles (3% du NET HT mensuel) sur les achats pharmacie.

Trois besoins fondamentaux :
1. Enregistrer les sommes versées par Alliance quand ils les font
2. Voir rapidement ce qu'ils devaient et ce qu'ils doivent encore
3. Suivre les réclamations : réclamé / versé / reste à verser


## Architecture technique

- **Backend** : Node.js / Express / TypeScript — port 4001 — `backend/`
- **Frontend** : React 18 / Vite / TailwindCSS / Tremor / Recharts — port 4000 — `frontend/`
- **Stockage** : JSON unique — `backend/src/data/releves.json`
- **Launcher** : `launcher/start-web.vbs` — démarre tout + ouvre le navigateur


## Ce qui est implémenté et fonctionnel

### Acquisition des données (solide)
- Import PDF des relevés Alliance Healthcare (décennies 1, 2, 3)
- Parsing : extraction NET HT, remises, avoirs par décennie
- Déduplication par hash (pas de doublon si on réimporte)
- Calcul du delta mensuel : remise réelle vs 3% attendu
- Détection des mois complets (3 décennies présentes)
- Stockage JSON avec migration backward-compatible

### Entités métier
- **Releve** : données brutes d'une décennie PDF
- **Regularisation** : versement ponctuel de rattrapage reçu d'Alliance
  - Champs : date, montant, annee, description, reclamationId (optionnel)
- **Reclamation** : dossier formel de réclamation couvrant une période
  - Champs : reference (#YYYY-NNN auto), moisDebut, moisFin, dateCreation, statut, montantReclame

### API backend (`/api/...`)
- `POST   /upload`                  — import PDF
- `GET    /releves/:annee/:mois`    — détail d'un mois
- `DELETE /releves/:id`             — suppression d'un relevé
- `GET    /stats/dashboard?annee=`  — analyses mensuelles par année
- `GET    /stats/cumul`             — retard cumulé + régularisations toutes années
- `GET    /stats/annees`            — liste des années avec données
- `CRUD   /regularisations`        — GET / POST / PUT /:id / DELETE /:id
- `CRUD   /reclamations`           — GET / POST / PUT /:id / DELETE /:id
- `POST   /scan-folder`            — scan dossier réseau
- `POST   /shutdown`               — arrêt propre du serveur

### Vues frontend (onglets)
- **Dashboard** — graphique delta + tableau mensuel + régularisations
- **Panorama** — 3 KPI cards + graphique coloré + tableau
- **Chronos** — timeline verticale par mois
- **Bilan** — pilotage recouvrement (voir ci-dessous)
- **Import** — upload PDF + scan dossier réseau

### Onglet Bilan (dernier développement)
- KPI principal (carte sombre) : reste à percevoir / total réclamé / déjà perçu / % recouvrement
- Alerte périodes non couvertes (carte orange) : détection auto des mois RETARD sans réclamation active
- Dossiers de réclamation actifs : carte par dossier avec réclamé / perçu / recouvrement + barre progression
- Régularisations liées à chaque dossier (section repliable)
- Historique dossiers soldés (repliable)
- CRUD complet : créer / modifier / supprimer des réclamations
- Boutons Courrier / Relancer / Créer réclamation : **affichés, fonctions à coder**

### Launcher Windows
- `launcher/start-web.vbs` — tue les anciens processus, lance BE + FE invisibles, ouvre Chrome
- `launcher/create-shortcut.vbs` — crée le raccourci bureau
- `launcher/stop-web.bat` — arrêt d'urgence
- Binding sur `127.0.0.1` (IPv4) côté BE et FE pour compatibilité launcher


## Ce qui reste à faire

### Priorité haute
- [ ] Tester le rendu de l'onglet Bilan sur données réelles (BE à redémarrer)
- [ ] Réévaluer les visualisations : l'utilisateur n'est pas satisfait des vues actuelles
      → besoin : voir rapidement ce qu'on lui doit, ce qu'il a reçu, ce qu'il reste
      → question ouverte : conserver Dashboard/Panorama/Chronos ou simplifier ?

### Fonctions "à venir" (boutons déjà affichés dans Bilan)
- [ ] Génération automatique de courrier de réclamation (PDF ou Word)
- [ ] Génération de lettre de relance
- [ ] Création automatique d'une réclamation depuis les périodes non couvertes

### Autres pistes identifiées
- [ ] Lier les régularisations existantes à des réclamations (via reclamationId)
      → actuellement les régularisations anciennes ne sont rattachées à aucune réclamation
- [ ] Vérifier la logique de "perçu" dans le Bilan : n'affiche que les régularisations
      avec reclamationId — les anciennes régularisations sont donc ignorées


## Dernier commit

`42a1f9b` — feat: Onglet Bilan (pilotage reclamations) + fix dropdown annees dynamique
- 11 fichiers modifiés, 785 insertions
- Branche : main, upstream : github.com/afgto79/RepartiX


## Notes techniques

- Mois avec delta négatif = Alliance doit de l'argent (remise insuffisante)
- Seuls les mois avec 3 décennies présentes comptent dans les indicateurs de retard
- Format mois : "YYYY-MM" (ex: "2024-09")
- Format décennie dans les PDFs : relevé de répartiteur Alliance Healthcare
- Données 2023, 2024, 2025, 2026 présentes en base (dropdown annees dynamique depuis /api/stats/annees)
