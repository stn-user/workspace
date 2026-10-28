# Assistant Proactif & Moteur d'Alertes

## 🎯 Concept
L'assistant proactif de Famili-IA analyse automatiquement les documents importés pour anticiper les échéances importantes (fin de garantie, renouvellement d'assurance, échéance de facture) sans intervention manuelle.

## ⚙️ Fonctionnement Hybride
Le moteur repose sur une double approche pour garantir la fiabilité des alertes :
1. **À l'importation (Trigger)** : Lorsqu'un document est ajouté via `addDocument`, le parser extrait sa date d'expiration (`expiryDate`). Si un seuil est franchi, une alerte est immédiatement créée et persistée dans IndexedDB.
2. **Au démarrage (Batch / Synchronisation)** : Lors de l'initialisation de l'application (`initState`), le moteur balaie l'ensemble des documents enregistrés pour recalculer et synchroniser les alertes en fonction de la date du jour.

## 📊 Seuils d'Alerte Métier
Les seuils suivants déclenchent automatiquement les niveaux d'urgence :
- **Garantie** (`garantie`) :
  - **Avertissement (Ambre)** : $\le$ 60 jours avant expiration.
  - **Urgent (Rouge)** : $\le$ 15 jours avant expiration.
- **Assurance** (`assurance`) :
  - **Avertissement (Ambre)** : $\le$ 30 jours avant échéance.
- **Facture** (`facture`) :
  - **Avertissement (Ambre)** : $\le$ 30 jours avant échéance.
  - **Urgent (Rouge)** : $\le$ 7 jours avant échéance.

## 🔗 Intégration UI & State
Les alertes générées sont injectées directement dans le store global (`state.alerts`). Les vues **Accueil** (`renderAccueilDashboard`) et **Alertes** (`renderAlerts`) les consomment de manière transparente via le sélecteur `getAlerts()`.
