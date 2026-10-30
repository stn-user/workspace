# Background Sync & Indexation Proactive

## 🎯 Concept
Le système d'indexation proactive (Background Sync) permet à Famili-IA d'explorer automatiquement les répertoires locaux configurés par l'utilisateur pour découvrir et indexer de nouveaux documents en arrière-plan, sans bloquer l'interface utilisateur.

## ⚙️ Cycle de Vie du Worker
Le `BackgroundSyncWorker` suit un cycle de vie contrôlé :
1. **Initialisation** : Récupération des répertoires cibles et vérification des permissions.
2. **Exploration (Scan)** : Parcours récursif des répertoires pour identifier les fichiers éligibles (TXT, MD, PDF, DOCX, XLSX).
3. **Traitement par Lots (Batching)** :
   - Partitionnement de la liste de fichiers en lots (ex: 5 fichiers).
   - Traitement asynchrone (lecture, parsing, classification automatique).
   - Utilisation de `yield` (temporisation entre les lots) pour préserver la réactivité de l'UI.
4. **Persistance** : Chaque document traité est ajouté à IndexedDB via `addDocument`.
5. **Feedback UI** : Rapport de progression en temps réel envoyé au callback `onProgress` pour mettre à jour la barre de progression.

## 🛡️ Gestion de la Sécurité & Mémoire
- **Filtrage** : Ignorer les fichiers cachés et système.
- **Dédoublonnage** : Vérification de l'existence avant indexation pour éviter les doublons.
- **Gestion d'erreurs** : Les fichiers verrouillés ou inaccessibles sont ignorés avec journalisation pour éviter le blocage du cycle.

## 📊 État de progression
L'UI consomme les événements suivants :
- `scanning` : Exploration des répertoires.
- `indexing` : Traitement en cours (avec pourcentage).
- `completed` : Fin du scan.
