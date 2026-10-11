# Documentation : Accès au Stockage Local (Native)

## 📄 Présentation
Ce document décrit la méthode utilisée par Famili-IA pour accéder aux documents stockés localement sur les appareils Android et iOS, en conformité avec les principes de confidentialité du projet.

## ⚙️ Fonctionnement Technique

### 1. Architecture de Flux
Le flux d'accès local suit ce cycle :
`Demande d'accès` $\rightarrow$ `Validation Permissions` $\rightarrow$ `Scan des Dossiers` $\rightarrow$ `Extraction en Mémoire` $\rightarrow$ `Indexation Session`.

### 2. Détails de l'Implémentation
L'application utilise le plugin **`@capacitor/filesystem`** pour interagir avec le système de fichiers natif.

- **Dossiers Cibles** : L'application tente d'accéder prioritairement aux dossiers `Documents` et `Download` via `Filesystem.Directory.Documents`.
- **Filtrage des Fichiers** : Seuls les fichiers possédant les extensions suivantes sont traités :
  - `.pdf` (via PDF.js + OCR expérimental)
  - `.txt` (lecture texte brut)
  - `.md` (lecture texte brut)
- **Traitement des Données** : 
  - Les fichiers sont lus et convertis en `Blob` via l'API Capacitor.
  - Le contenu textuel est extrait et stocké dans un tableau JavaScript (`uploadedDocuments`).
  - **Aucun fichier n'est copié, déplacé ou enregistré ailleurs sur l'appareil.**

### 3. Gestion des Permissions
L'application suit une approche de permission minimale :
- **Android** : Utilisation des permissions de lecture (`READ_EXTERNAL_STORAGE` ou `MANAGE_EXTERNAL_STORAGE` selon la version d'Android).
- **iOS** : Utilisation des dossiers partagés et du bac à sable (sandbox) iOS.

### 4. Garantie de Confidentialité
L'accès local est conçu pour être "éphémère" :
- **Zéro Persistance** : L'index des fichiers locaux est conservé uniquement dans la mémoire vive (RAM).
- **Suppression Immédiate** : À la fermeture de l'application ou via le bouton "Retirer mes fichiers", toutes les références et contenus en mémoire sont supprimés.
- **Pas de Cloud** : Aucun contenu local n'est jamais synchronisé ou envoyé vers un serveur externe.

## ⚠️ Limites et Contraintes
- **Limites de taille** : Pour préserver la performance, les fichiers sont limités à 1 Mo (texte) et 10 Mo / 20 pages (PDF).
- **OCR** : L'OCR des PDF scannés est une fonctionnalité native qui dépend des capacités du matériel (Vision sur iOS, ML Kit sur Android).
