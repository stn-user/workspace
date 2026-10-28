# Famili-IA — Maquette UI Mobile

> **MàJ octobre 2026 — Tâche 9.16 : Refonte Navigation Mobile**
> La barre de navigation passe de 9 éléments à 5 éléments prioritaires. Les vues secondaires sont regroupées dans un écran «Plus».

---

## 🧭 Parcours Utilisateur (parcours cible)

Parcours principal d'un utilisateur au démarrage de l'application :

1. **Démarrage → Accueil (Dashboard contextuel)**
   - Bienvenue personnalisée + ce qui mérite attention :
     - Bannière «À surveiller» si alertes actives (échéance garantie/contrat < 30j) → raccourci vers **Alertes**
     - Documents importés récemment
     - Équipements sans document critique (facture/garantie manquante)
   - **Action rapide** : ajouter un document (cœur de valeur de l'app)
2. **Recherche → Recherche**
   - Barre toujours accessible (barre basse). Question en langage naturel.
   - Résultats avec provenance (☁️ Drive / 💾 local) et extraits.
   - Depuis un résultat : ouvrir le document, ou **lier le document à un équipement** (transversalité).
   - Recherche vide ou peu de résultats → appel à l'action «Importer un document».
3. **Ajout rapide → Importer**
   - Accès direct au **centre de la barre basse** (position héroïque) ou via la bannière d'accueil.
   - Choix : fichiers locaux / Google Drive.
   - Après lecture : classification automatique (OCR, `document-parser.js`), affichage des fichiers importés.
   - Fin de flux : «Voir le document» ou retour **Accueil**.
4. **Organisation → Maison**
   - Liste des équipements par catégorie, filtre.
   - Tap sur un équipement → **Détail équipement** (documents associés, garantie, alertes de l'équipement).
   - Bouton «+» : ajouter un équipement.
5. **Administration → Menu «Plus»**
   - Tout ce qui n'est pas quotidien : **Alertes** (détail), **Famille** (membres/rôles), **Assistant** (conversation), **Profil** (identification/paramètres), **Vos données** (inventaire, export, purge).

**Principe directeur :** la barre basse ne porte que les *actions* (consulter, rechercher, ajouter, organiser, admin). Tout le reste vit dans «Plus». Chaque écran n'offre qu'une seule action principale évidente.

---

## 📱 Structure de Navigation Cible

### Barre inférieure — 5 items

| # | Vue | Icône (Feather/Lucide) | Rôle |
|---|-----|------------------------|------|
| 1 | **Accueil** | `home` | Dashboard contextuel |
| 2 | **Recherche** | `search` | Recherche IA globale |
| 3 | **Importer** | `upload` | **Position centrale, mise en avant** (style FAB intégré, icône dans un disque teinté primaire) |
| 4 | **Maison** | `home` (variant bâtiment/boîte) | Équipements & documents |
| 5 | **Plus** | `more-horizontal` / `grid` | Regroupement des vues secondaires |

### Écran «Plus» (vue dédiée, `#/plus`)

Liste verticale de destinations, chacune avec icône, libellé, sous-titre et badge de compteur :

| Destination | Badge | Raccourci d'écran |
|-------------|-------|-------------------|
| **Alertes** | nombre d'alertes actives (ambre) | Bannière d'accueil, alertes d'un équipement |
| **Famille** | nombre de membres | Card «Famille» de l'accueil |
| **Assistant** | — | Suggestion de question (poste plus tard sur l'accueil — tâche 10.7.d) |
| **Profil** | prénom du connecteur | Menu du profil |
| **Vos données** | volume/count documents | Boutons d'accueil liant aux données |

Retour : bouton retour natif/hash (`#/plus` pousse l'historique, bouton retour rend vers la vue d'origine).

### Sous-vues (jamais dans la barre basse)

- **Détail équipement** : `#/detail?id=<id>`, ouvert depuis Maison (tap) ou depuis un résultat de recherche lié. Bouton retour → Maison (ou vue d'origine).
- **Vues transitoires** : modales (confirmation suppression, ajout membre) ne sont pas des vues du routeur.

---

## 📺 Vues détaillées et interactions

### 1. Accueil (Dashboard contextuel)
- **Contenu** : bienvenue, bannière «À surveiller» (si alertes), stats clés (documents, équipements, alertes actives), documents récents.
- **Interactions** :
  - Tap bannière «À surveiller» → **Alertes**
  - Tap card stat :
    - Documents → **Vos données**
    - Équipements → **Maison**
    - Alertes → **Alertes**
    - Famille → **Famille**
  - Tap document récent → détail du document (aperçu + actions : lier à équipement, ouverture)
  - **Action rapide «+» / FAB** → **Importer**

### 2. Recherche IA
- **Contenu** : barre de question, suggestions, résultats (source, extrait, note de similarité).
- **Interactions** :
  - Soumission → résultats inline (pas de navigation)
  - Tap résultat → aperçu document + actions («Lier à un équipement» → modale de choix équipement, «Ouvrir le document»)
  - 0/peu de résultats → call-to-action «**Importer un document**» → **Importer**
  - Chip filtre (type, source) : filtrage inline

### 3. Importer
- **Contenu** : zone de drop / bouton parcourir, sélecteur Google Drive, liste des fichiers importés avec statut (extraction OK / OCR / erreurs).
- **Interactions** :
  - Sélection fichiers → lecture + classification auto → update liste
  - Tap fichier importé → aperçu + «Assigner à un équipement» (option)
  - Bouton fin de flux : «Retour à l'accueil»
  - État d'erreur explicit par fichier (pas d'échec silencieux)

### 4. Maison
- **Contenu** : liste des équipements, chips de catégories, recherche inline.
- **Interactions** :
  - Tap équipement → **Détail équipement**
  - Tap «+ Ajouter» → modale formulaire équipement
  - État vide → CTA «Ajouter votre premier équipement»

### 5. Détail équipement (sous-vue)
- **Contenu** : nom, catégorie, documents associés (facture, garantie, notice), état de garantie, alertes de l'équipement.
- **Interactions** :
  - Retour → **Maison**
  - Tap document → aperçu
  - «Ajouter un document» → **Importer** (filtre pré-rempli sur l'équipement)
  - Alertes listées → tap → **Alertes**

### 6. Alertes (issue du menu «Plus»)
- **Contenu** : liste des échéances (garanties, contrats), statuts (à venir / bientôt / expiré / traité).
- **Interactions** :
  - Tap alerte → détail + équipement lié
  - «Marquer traité» → update inline (pas de navigation)
  - Filtrage par statut (chips)

### 7. Famille (issue du menu «Plus»)
- **Contenu** : membres, rôles (admin/membre).
- **Interactions** :
  - «Inviter / Ajouter un membre» → modale
  - Tap membre → détails + changement de rôle (si admin)

### 8. Assistant (issue du menu «Plus»)
- **Contenu** : conversation + suggestions de questions types.
- **Interactions** :
  - Soumission de question → réponse inline (réponses issues de la recherche locale)
  - Tap suggestion → envoi immédiat
  - Note : la brique proactive de l'assistant sera ensuite présentée sur l'**Accueil** (tâche 10.7.d) — l'écran conversation reste accessible ici.

### 9. Profil (issue du menu «Plus»)
- **Contenu** : identité utilisateur, rôle, préférences.
- **Interactions** :
  - Édition identité → modale/inline
  - Lien vers «Vos données»

### 10. Vos données (issue du menu «Plus»)
- **Contenu** : inventaire (documents, stockage), historique des recherches, export.
- **Interactions** :
  - «Exporter (JSON)» / «Tout effacer» → modale de **confirmation explicite** (destruction irréversible)
  - Tap document → aperçu

### 11. Écran «Plus» *(nouveauté 9.16)*
- **Contenu** : liste des 5 destinations (voir ci-dessus) avec badges.
- **Interactions** :
  - Tap destination → navigation correspondante (le menu «Plus» perd son état actif, la vue d'origine reprend l'état actif au retour)
  - Bouton retour → vue d'origine

---

## 🗺️ Graphe de Navigation

```mermaid
graph TD
    BB["Barre basse<br/>(Accueil · Recherche · Importer · Maison · Plus)"]

    ACC["Accueil"]
    REC["Recherche"]
    IMP["Importer"]
    MAI["Maison"]
    PLUS["Menu Plus"]

    DET["Détail équipement"]
    AL["Alertes"]
    FAM["Famille"]
    AS["Assistant"]
    PRO["Profil"]
    VD["Vos données"]

    BB --> ACC
    BB --> REC
    BB --> IMP
    BB --> MAI
    BB --> PLUS

    ACC -->|bannière alertes| AL
    ACC -->|FAB / "+"| IMP
    ACC -->|cards stats| MAI
    ACC -->|card stat| VD
    ACC -->|card stat| FAM

    REC -->|0 résultat CTA| IMP
    REC -->|lier doc à équipement| MODAL["Modale choix équipement"]
    MODAL -.-> DET

    IMP -->|fin de flux| ACC

    MAI -->|tap équipement| DET
    DET -->|"Ajouter un doc"| IMP
    DET -->|alerte équipement| AL

    PLUS --> AL
    PLUS --> FAM
    PLUS --> AS
    PLUS --> PRO
    PLUS --> VD
    PRO -->|lien| VD

    classDef bottomfill:#e6f4f4,stroke:#0f7173,stroke-width:2px;
    classDef sub fill:#fff3e0,stroke:#d97706,stroke-width:2px;
    class ACC,REC,IMP,MAI,PLUS bottom;
    class DET,AL,FAM,AS,PRO,VD sub;
```

---

## 📊 Priorités d'implémentation (Mise à jour 9.16)

1. **Accueil** — rendu contextuel (bannière alertes, stats, récents) : déjà implémenté à adapter aux nouveaux raccourcis
2. **Importer** — repositionné au centre de la barre basse (structure + style)
3. **Menu «Plus»** — à créer (vue `#/plus`, rendu, badges, routing retour)
4. **Recherche** — CTA «Importer» en cas de résultat vide
5. **Maison / Détail** — fil «+ Ajout d'un document» pré-rempli sur l'équipement (à reprendre avec la tâche 10.7.c déjà existante)