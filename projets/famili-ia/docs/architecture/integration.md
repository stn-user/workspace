# Intégration & Flux de Stockage Local

Ce document détaille la méthode utilisée par Famili-IA pour accéder aux documents stockés localement sur les appareils Android et iOS, en conformité avec les principes de confidentialité du projet.

## ⚙️ Fonctionnement Technique

### 1. Architecture de Flux
Le flux d'accès local suit ce cycle :
`Demande d'accès` $\rightarrow$ `Validation Permissions` $\rightarrow$ `Scan des Dossiers` $\rightarrow$ `Extraction en Mémoire` $\rightarrow$ `Indexation Session`.

### 2. Détails de l'Implémentation
L'application utilise le plugin **`@capacitor/filesystem`** pour interagir avec le système de fichiers natif.

- **Dossiers Cibles** : L'application tente d'accéder prioritairement aux dossiers `Documents` et `Download` via `Filesystem.Directory.Documents`.
- **Filtrage des Fichiers** : Seuls les fichiers possédant les extensions prises en charge sont traités :
  - `.pdf` (via PDF.js + OCR)
  - `.txt` / `.md` (lecture texte brut)
  - `.docx` / `.xlsx` (parsing spécialisé)
- **Traitement des Données** : 
  - Les fichiers sont lus et convertis en `Blob` via l'API Capacitor.
  - Le contenu textuel est extrait et indexé.
  - **Aucun fichier n'est copié, déplacé ou enregistré de manière persistante non sécurisée.**

### 3. Gestion des Permissions
L'application suit une approche de permission minimale :
- **Android** : Utilisation des permissions de lecture (`READ_EXTERNAL_STORAGE`).
- **iOS** : Utilisation des dossiers partagés et du bac à sable (sandbox) iOS.

### 4. Garantie de Confidentialité
- **Pas de Cloud non consenti** : Aucun contenu local n'est envoyé vers un serveur externe.
- **Purge sécurisée** : Les données de session peuvent être purgées à tout moment.
