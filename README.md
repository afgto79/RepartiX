# RepartiX

RepartiX - Application de Contrôle des Remises Alliance Healthcare
Contexte
RepartiX est une application web locale destinée à une pharmacie pour contrôler les remises contractuelles accordées par le grossiste Alliance Healthcare / Cencora.

Le contrat prévoit une remise de 3% du total NET HT mensuel, appliquée sur la 3ème décade (dernier tiers) de chaque mois. Alliance Healthcare envoie 3 relevés de facturation par mois (décades 1, 2 et 3) sous forme de PDF. L'objectif est de vérifier automatiquement que la remise réellement appliquée correspond bien aux 3% contractuels.

Fonctionnalités
Import et parsing automatique des PDF :

Upload par glisser-déposer ou scan d'un dossier réseau
Extraction automatique de 8 champs critiques (total NET HT, TTC, remises, période, décade...)
Détection des doublons par empreinte SHA256
Dashboard de suivi :

Tableau mensuel : total HT, remise attendue (3%), remise réelle, delta, statut (OK / En cours / Retard)
Graphique d'évolution du delta mensuel (scrollable au-delà de 12 mois)
Indicateur de retard cumulé toutes années avec barre de progression
Indicateur de retard annuel pour l'année sélectionnée
Gestion des régularisations :

Quand le fournisseur rattrape un écart par un versement ponctuel, on l'enregistre comme régularisation
CRUD complet (ajout, modification, suppression)
Les indicateurs de retard montrent : retard brut, montant régularisé, reste dû, et le % rattrapé
Détail par mois :

Vue des 3 décades avec le détail de chaque relevé
Possibilité de supprimer un relevé erroné
Architecture technique

Raccourci bureau (.lnk)
  └─ wscript.exe start-web.vbs   (invisible, aucune console)
       ├─ Backend Express/TypeScript  (port 4001)
       │    └─ Stockage JSON local (releves.json)
       ├─ Frontend React/Vite/TailwindCSS/Tremor  (port 4000)
       └─ Ouvre http://127.0.0.1:4000 dans le navigateur
L'application se lance en un clic depuis le bureau et s'utilise dans le navigateur comme une application desktop. Un bouton "Quitter" arrête les deux serveurs.Projet RepartiX - Description à ajouter
