# Famili-IA — Maquette UI Mobile

## 📱 Écrans identifiés dans la maquette

### 1. **Accueil** (Home Dashboard)
- Vue d'ensemble familiale
- Bienvenue personnalisée
- Statistiques principales
- Bouton d'ajout rapide

### 2. **Recherche IA** (AI Search)
- Barre de recherche par question naturelle
- Filtres par type de document
- Résultats avec provenance
- Affichage des extraits

### 3. **Mon foyer** (My Home)
- Équipements domestiques listés
- Catégories de filtering
- Action rapide : ajouter équipement

### 4. **Détail équipement** (Equipment Detail)
- Description / nom de l'équipement
- Type d'équipement
- Lien vers documents associés (facture, garantie, notice)

### 5. **Alertes** (Alerts)
- Suivi des échéances (garanties, contrats)
- Notifications importantes
- Statut d'alerte (active, terminée)

### 6. **Famille** (Family)
- Gestion des membres
- Niveau d'accès par membre
- Ajout de proches

### 7. **Assistant IA** (example)
- Assistant conversationnel
- Questions types / suggestions

### 8. **Importer un document** (Upload document)
- Sélection fichier local ou cloud
- Drag & drop ou bouton parcourir
- Types supportés : PDF, TXT, MD

### 9. **Profil / Paramètres** (Profile/Settings)
- Informations utilisateur
- Paramètres de confidentialité
- Export/ suppression de données

### 10. **Vos données** (Your Data)
- Inventaire des fichiers stockés
- Historique des recherches
- Export des données

## 📦 Fonctionnalités à implémenter

### Gestion familiale
- [ ] Modèle de données utilisateur
- [ ] Gestion des rôles et permissions
- [ ] Famille multi-utilisateurs

### Équipements maison
- [ ] Modèle d'équipement
- [ ] Catégorisation (piscine, chauffage, etc.)
- [ ] Affichage des documents associés

### Alertes & rappel
- [ ] Système de notifications
- [ ] Dates d'échéance
- [ ] Notifications push (optionnel)

### Recherche avancée
- [ ] Indexation multi-fichiers
- [ ] Recherche par sources
- [ ] Filtrage par type

### Sécurité & confidentialité
- [ ] Contrôle des données
- [ ] Export/Suppression
- [ ] Chiffrement optionnel

## 📊 Dépendances entre écrans

```
Accueil ←→ Recherche (navigation)
Accueil ←→ Maison (navigation)
Accueil ←→ Alertes (navigation)
Accueil ←→ Famille (navigation)

Recherche ←→ Importer (ouvrir pour ajouter docs)

Maison ←→ Détail équipement (click sur équipement)

Famille ←→ Profil (navigation)
Famille ←→ Gestion des accès

Alertes ←→ Vos données (export des alertes)

Importer ←→ Recherche (résultat)
Importer ←→ Google Drive (intégration)
Importer ←→ Stockage local (intégration)
```

## 🗺️ Priorité MVP

1. **Écran Accueil** avec recherche rapide
2. **Recherche IA** fonctionnelle (déjà implémentée pour PDF/TXT)
3. **Importer un document** pour tester l'import local/cloud
4. **Détail équipement** pour afficher les résultats
5. **Famille** pour le multi-utilisateur (phase suivante)