# CLAUDE.md - Guide du projet Famili-IA

## 🚀 Présentation du projet
Famili-IA est une application de gestion de documents familiaux et d'équipements domestiques. Elle se concentre sur une recherche locale respectueuse de la vie privée à travers plusieurs sources (fichiers locaux, Google Drive, et données de démonstration).

**Tech Stack :**
- **Frontend :** Vanilla JavaScript, CSS3, HTML5.
- **Wrapper Mobile :** Capacitor (Android/iOS).
- **Gestion d'état :** Centralisée dans `state.js`.
- **Navigation :** Routage basé sur le hash (`#/view?params`).

## 🛠 Workflow de développement
- **Lancer l'App :** Ouvrez `index.html` dans un navigateur ou utilisez le flow dev Capacitor.
- **Navigation :** Utilisez toujours `showView(name, options)` pour les transitions de vue afin de gérer l'historique et les paramètres.
- **État :** Lecture/Écriture des données familiales via les fonctions de `state.js`.
- **Documentation :** Toute modification majeure (architecture, interactions entre composants, changements critiques dans `styles.css`) **DOIT** s'accompagner d'une mise à jour de la documentation correspondante dans le dossier `/docs/`.

## 🎨 Charte Graphique & UI/UX (Anti-Régression)
Pour maintenir la cohérence visuelle, suivez ces règles basées sur les maquettes officielles :

### Couleurs & Thèmes
**Prisme (adoption par vue) :** la [galerie locale](docs/guide/prisme.html) présente les compositions validées graphiquement. Suivre le [guide d’intégration](docs/guide/prisme.md) pour les appliquer à un conteneur explicite ; la galerie ne change ni le thème par défaut ni les destinations de production. Lot 1 du [chantier 2](docs/guide/chantier-2-inventaire.md) : l'Accueil utilise la tuile Prisme sur `.home-actions-panel` ; lots 2 à 7 : Recherche, Assistant, Maison, Famille, Alertes (tuile date corail), Importer, Vos données, Profil, Plus et la fiche de détail sont dans une portée `ui-prisme ui-prisme--inline`. Le parcours mobile accepté utilise quatre destinations principales — Accueil, Recherche, Foyer/Maison et Rappels/Alertes — sans supprimer les routes métier ; Plus conserve les accès aux autres vues, et la navigation desktop reste inchangée. Les autres vues restent sur le thème chaleureux jusqu'à validation.

**Migration progressive du lot E :** l'onboarding, l'Accueil, la Recherche, l'Assistant, les Alertes, Vos données, Famille, Maison, les fiches équipement, Importer, Profil et Plus utilisent désormais l'identité bleu/marine du logo officiel : `--ui-brand` (`#245be8`), `--ui-brand-hover` (`#1948bd`), `--ui-ink` (`#12285c`), `--ui-muted` (`#40547b`), `--ui-border` (`#d7e2f6`), `--ui-tint` (`#eaf1ff`) et `--ui-page` (`#f5f8ff`). Réutiliser les composants `ui-*` dans ces parcours ; `--ui-danger` et `ui-button--danger` signalent une action destructive. Le thème `body.ui-theme` est activé pour `accueil`, `recherche`, `assistant`, `alertes`, `vos-donnees`, `famille`, `maison`, `detail`, `importer`, `profil` et `plus` ; la palette historique ci-dessous demeure pour les vues non migrées. Ne pas recolorer globalement les autres vues.

**Harmonisation chaleureuse du lot D :** `showView()` active `body.ui-warm` sur Accueil, Recherche, Maison, détail équipement, Importer, Alertes, Famille, Vos données, Profil, Plus et Assistant et la retire ailleurs. En complément de `ui-theme`, ce thème utilise un fond ivoire, des surfaces crème, des titres foncés et des accents ambrés, en conservant le bleu des actions principales et les couleurs d'état. Réutiliser `--ui-surface`, `--ui-card-radius` et `--ui-focus` dans les composants partagés ; leurs valeurs par défaut préservent les autres vues. Étendre cette palette progressivement selon le plan, jamais par recoloration globale. Personnaliser uniquement depuis les données utilisateur ; les illustrations décoratives ne sont pas ses souvenirs.

Dans Recherche, distinguer la preuve surlignée (texte extrait ou indice explicitement nommé) des détails techniques dépliables. Insérer les valeurs par `textContent`, sans interpréter le HTML ni réécrire la preuve pour corriger une faute. Conserver source, couverture, incertitudes et accès à l'original non garanti près du résultat ; l'ouverture ponctuelle d'un original ne garantit pas les accès futurs. Les grandes vignettes réutilisent les copies locales existantes, jamais un téléchargement implicite.

La dictée de Recherche passe par `search-dictation.js` et le service vocal du navigateur, uniquement sur action explicite après information sur le traitement possible à distance. L'accord reste en mémoire pour la page courante ; aucune capture au chargement, aucun enregistrement audio applicatif, ni nouvelle dépendance. Ajouter le texte sans lancer la recherche ; interrompre la capture et invalider les résultats tardifs en cas de saisie, soumission, navigation ou passage en arrière-plan. Ne pas promettre un fonctionnement local, hors ligne, dans tous les navigateurs ou dans l'aperçu VS Code.

Limiter les vérifications courantes aux tests directement concernés par le changement ; ne pas relancer systématiquement la suite exhaustive. Les tests utilisant une reconnaissance vocale simulée ne valident pas le microphone ni le service réel.

Dans Maison, réutiliser `getEquipmentIllustration()` et signaler les images de catégorie comme illustrations. Le statut d'un équipement est une saisie, pas un diagnostic ni une garantie. Les rappels d'une fiche sont uniquement les alertes actives de ses documents référencés ; conserver reports, sources à vérifier et incertitudes. Ne pas fabriquer de référence fabricant depuis l'identifiant interne. Recherche documentaire, associations enregistrées et ajout de nouvelles associations sont des capacités distinctes ; cette dernière reste indisponible.

Les couvertures personnelles des équipements sont facultatives ; la maison n'a plus de photo personnalisable (illustration IA standard, voir chantier 2). Conserver les illustrations IA par défaut et après retrait, ou l'icône de catégorie lorsqu'aucune illustration n'existe. Réutiliser `prepareCoverPhoto()` dans `cover-photo.js` pour la copie JPEG locale bornée (1 280 px, 256 Kio), sans métadonnées d'origine. Le dialogue partagé `initCoverPhotoDialog()` (identifiants historiques `house-photo-*`) ne sert plus qu'aux équipements : il garde le brouillon et le cadrage jusqu'à confirmation ; invalider les traitements tardifs. `updateEquipmentPhoto(photo, expectedEquipment, expectedUser)` persiste avant publication et refuse les brouillons périmés. Les mutations d'équipements partagent la file photo/purge ; modifier leurs informations conserve la couverture courante. Les copies vivent dans `equipment.coverPhoto`, suivent export JSON/purge et ne rejoignent jamais l'index ; un éventuel `currentUser.housePhoto` déjà enregistré est conservé (export/purge) mais n'est plus affiché ni modifiable. Choisir une couverture n'autorise aucune analyse.

Dans Importer, le suivi local reflète les événements réels du worker ; les fichiers traités incluent les échecs, pas seulement les copies indexées. Conserver les erreurs, interruptions et avertissements, sans progression simulée. Le bilan de session n'est ni un historique persistant ni un cumul des ajouts simultanés ; le suivi cloud reste dans les options du fournisseur. Préserver l'ouverture de Recherche après sélection locale et sa question courante.

Dans Alertes, trier la liste dérivée par échéance, ou par reprise pour les reports, sans modifier les alertes stockées ni les seuils. Réutiliser les helpers de date ; une date inconnue reste explicitement inconnue, jamais remplacée par aujourd'hui. Conserver les preuves littérales échappées, les sources à vérifier et la suspension des notifications. La lecture reste temporaire ; les états vides ne garantissent pas une couverture complète des échéances.

Dans Famille, présenter uniquement les noms choisis, avatars texte ou initiales des membres enregistrés, sans badges ni éditeur de permissions. Conserver les champs internes `role`/`access` et les métadonnées existantes à l'édition ; actualiser une initiale automatique sans écraser un avatar personnalisé. Réutiliser le nettoyage sérialisé des associations photo lors d'une suppression confirmée. Aucun compte, invitation, partage ou reconnaissance faciale n'est créé par une fiche locale.

Dans Vos données, distinguer fichiers enregistrés et exemples de repli. Réutiliser `getSourceStatuses()` et `describeSources()` pour les parcours et limites ; ni import ni modification ne prouvent un contrôle, et un parcours ne garantit pas accès actuel ou exhaustivité. Préserver les erreurs explicites, la consultation sans écriture et les confirmations de suppression locale. Le PDF chargé à la demande est un bilan chiffré sans noms ni GPS, pas le JSON détaillé ; valider son contenu avec le lecteur PDF existant, pas seulement son extension.

Dans Profil, ne garder que les réglages reliés : identité, adresse facultative et GPS. Retirer un contrôle illustratif ne doit pas effacer ses anciennes valeurs, le rôle ni les métadonnées. Passer par `updateUserProfile()` sans muter préalablement `getCurrentUser()` ; publier l'identité après persistance et préserver l'avatar personnalisé. Conserver la purge GPS sérialisée et ses erreurs explicites : des coordonnées déjà effacées ne sont pas restaurées après un échec ultérieur. Plus conserve les cinq destinations et les accès aux données, sans suggérer un partage effectif.

Dans Recherche, le contrôle Qwen reste opt-in et ne s'exécute qu'à la soumission explicite. L'index local et les filtres choisis déterminent les résultats ; Qwen peut formuler une réponse à partir des extraits vérifiés de ces seuls résultats, sans modifier l'ordre ni étendre le corpus. Dans l'Assistant, les réponses documentaires passent par `prepareAssistantContext()` avec l'instance `IndexSession` commune et l'instantané complet des documents, jamais une collection préfiltrée. Réutiliser intentions et synonymes partagés sans second classement ; les segments vérifiés seuls servent de preuve, jamais le texte historique brut. Qwen local reste désactivé par défaut, opt-in, limité au navigateur sur PC et expérimental : n'envoyer à `127.0.0.1:11434` que la question (500 caractères au plus) et jusqu'à huit extraits vérifiés (1 024 caractères par extrait, 8 192 au total), jamais un document complet, un nom de fichier ou l'historique. Ne pas appeler Qwen sans extrait textuel vérifié admissible ou en cas d'ambiguïté/conflit ; les réponses ne s'appuient pas sur les connaissances générales du modèle. Exclure les lignes visiblement adressées à un assistant/modèle avec une consigne, les amorces explicites « pour le modèle » et les demandes d'ignorer les éléments précédents. Écarter aussi une ligne où le libellé du fait indique explicitement que la valeur manque. Ces filtres restent heuristiques, peuvent écarter des éléments légitimes et ne prouvent pas une défense générale contre les injections. Valider les citations comme littérales dans les seuls extraits transmis, afficher les preuves et leurs sources, signaler toute erreur sans repli silencieux. Le modèle ne déclenche aucune action ; les actions restent fondées sur leurs validations déterministes et confirmations. Si Qwen s'abstient ou demande une précision, afficher un message local fixe plutôt que son texte libre. Conserver la question indépendante, vérifier le triplet source/compte/élément et invalider les réponses lors des changements de révision, contenu ou provenance. Les filtres de Recherche ne sont ni hérités implicitement ni modifiés dans l'Assistant. La saisie et le défilement principal restent accessibles sur mobile. Ne pas suggérer de mémoire contextuelle, de recherche sémantique ou d'automatisation comme capacité livrée.

Privilégier des écrans intuitifs et compacts, surtout sur smartphone : pas de bloc d'aide systématique, ni remplacement permanent par des icônes ou infobulles. Accompagner au point utile seulement : état vide avec action directe, erreur explicite, confirmation après sauvegarde. Conserver permissions avant connexion, provenance près du résultat et portée avant suppression. Découverte et visite restent accessibles sur demande depuis Profil, sans mémoriser une visite de chaque vue. Les raccourcis d'ajout réutilisent `openImportFrom()` pour préserver le retour ; `showView()` respecte aussi le mouvement réduit pour son défilement JavaScript.

Tous les dialogues HTML déclarés et les dialogues dynamiques de gestion familiale/saisie manuelle utilisent `ui-dialog`. L'ancien dialogue de scan reste un aperçu sans point d'entrée, désactivé et non opérationnel. Ne pas le relier à une permission ou à un scan dans une simple tâche graphique. Les confirmations natives du navigateur restent natives. Dans l'Assistant, seul le repli sans fichier utilise encore `rankDocuments()` sur les exemples, isolés de l'index personnel ; une suggestion prépare la question sans l'envoyer.

**Cohérence des parcours E5 :** Accueil est un tableau de bord avec raccourci Recherche, pas un deuxième formulaire. Les ajouts depuis Accueil, Recherche et Vos données utilisent `data-open-import` vers Importer ; pas de bouton flottant concurrent. Importer expose appareil/Google Drive/OneDrive/Dropbox et ouvre les options existantes du fournisseur sans connexion automatique. Réutiliser leurs états de disponibilité, ne pas annoncer un connecteur indisponible comme opérationnel. Les images par défaut de Maison sont des illustrations IA locales explicitement identifiées ; seule une couverture choisie et enregistrée par l'utilisateur constitue une personnalisation photo persistante.

**Couleurs de marque principales (tokens CSS dans `styles.css`) :**
- **Primaire (Noir) :** `#171717` - Logo, liens, éléments interactifs
- **Primaire Sombre :** `#000000` - États hover et contraste fort
- **Primaire Clair :** `#f1f1f1` - Fonds légers
- **Fond général :** `#f6f6f6`, avec un dégradé blanc subtil dans la zone de contenu
- **Surface :** `#ffffff`
- **Texte principal :** `#171717`
- **Texte secondaire :** `#525252`
- **Bordure :** `#e5e5e5`

Les surfaces utilisent des dégradés discrets de blanc vers gris clair ; réserver le dégradé noir/gris aux actions principales et aux mises en avant. Les couleurs sémantiques restent réservées aux états (succès, alerte, erreur) et aux catégories qui en ont besoin.

**Palette de couleurs sémantiques (Cartes stats & Icônes) :**
- **Bleu :** `#2563eb` - Documents, infos générales
- **Vert :** `#059669` - Maison, équipements, succès, garanties
- **Violet :** `#7c3aed` - Véhicules, catégories spéciales
- **Pourpre :** `#9333ea` - Photos, médias
- **Ambre :** `#d97706` - Alertes, avertissements
- **Rouge :** `#dc2626` - Alertes critiques, urgences
- **Cyan :** `#0891b2` - Technique, imprimantes

**Couleurs neutres :**
- **Texte Muted :** `#737373`
- **Surface teintée :** `#f5f5f5`
- **Surface de succès :** `#ecfdf5`
- **Surface d'action destructive :** `#fff7f7`

### Typographie
- **Police :** Fontes système (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`)
- **Poids :** Regular (400), Medium (500), Semibold (600), Bold (700)

### Espacement & Layout
- **Unité de base :** `1rem` = 16px
- **Rayon de bordure (Border Radius) :** `8px` (petits), `12px` (cartes standard), `16px` (panneaux), `24px` (modales).
- **Surfaces :** cartes blanches avec bordure neutre et ombre discrète ; réserver les fonds teintés aux accents, états ou groupes d'information.
- **Badges d'inventaire :** afficher séparément le type, la provenance et l'état de couverture d'indexation ; distinguer « Texte indexé » de « Métadonnées seules » et permettre le retour à la ligne sur mobile.
- **Hiérarchie :** privilégier une page à largeur de lecture maîtrisée, une synthèse chiffrée lisible, puis le contenu principal et ses actions secondaires.
- **Mobile :** conserver des cibles tactiles d'au moins `44px`, autoriser le défilement horizontal des filtres lorsque nécessaire et empiler les colonnes sous `900px`.

### Icônes & Visuels
**Style des Icônes :**
- **Format :** SVG inline.
- **Cartes Stats :** 
  - Style : Fond coloré transparent (`rgba(color, 0.1)`) avec icône de même couleur, contour défini par `stroke` et `fill: none`.
  - Taille : `24px` dans un conteneur `48px` circulaire.
- **Navigation (barre basse) :** 
  - Style : Icônes outline (style Feather/Lucide).
  - Taille : `20px`.
  - État actif : Couleur primaire.

## 🏗 Patterns d'Architecture
- **Logique de recherche :**
    - Utilisez `search-utils.js` pour la normalisation du texte.
    - Recherche "No-AI" (extraction de mots-clés/faits) pour garantir la confidentialité.
    - Pour l'index unifié, réutiliser `getIndexSearchTerms` et `matchIndexTerm` dans noms/champs et segments vérifiés. Les filtres restent exacts ; une raison approchée expose `approximateMatches` et conserve la preuve littérale, sans corriger la saisie ni le document. Ne pas appliquer ces règles aux identités ou permissions.
- **Initialisation des vues :** Chaque vue doit avoir une fonction `init[ViewName]View()` appelée lors de `showView`.
- **Flux de données :** `state.js` $\rightarrow$ `app.js` $\rightarrow$ DOM.
- **Alertes documentaires :** la réconciliation locale ne remplace ni date ni choix utilisateur lorsque la copie change ou manque ; `sourceReview` expose la raison (`source-changed`, `source-missing`, `source-ambiguous`, `proof-unavailable`) et bloque les nouvelles notifications. Réutiliser la provenance et les empreintes existantes ; ne pas assimiler copie vérifiée et accès à l'original. Les parcours explicites de confirmation/correction appellent `confirmDocumentAlert` après l'enregistrement du document et préservent statut/report. Ne pas modifier les suppressions volontaires ou la purge dans une réévaluation automatique.

**Actions confirmées A4 :** Recherche et Assistant partagent `prepareDocumentAlertAction()` et `confirmDocumentDeadline()`. Une proposition conserve son triplet source/compte/élément et ses instantanés ; revalider provenance, preuve, catégorie et seuil avant écriture. Le document et l'alerte sont enregistrés ensemble par `putConfirmedDocumentAlert()` ; ne pas remplacer ce parcours par `addDocument()` puis `confirmDocumentAlert()`. Publier l'état seulement après commit, préserver statut/report/notifications et vérifier la présence persistante même lors d'une confirmation répétée. Les exemples n'offrent aucune action, l'annulation n'écrit rien, et une erreur d'affichage après commit ne doit pas être présentée comme un échec de sauvegarde.

## ⚠️ Contraintes & Points de vigilance
- **Capacitor Native :** Vérifiez toujours `Capacitor.isNativePlatform()` avant les appels aux APIs natives.
- **Google Drive :** OAuth restreint à la version Web (prototype).
- **Dropbox :** première tranche Web uniquement, Full Dropbox en lecture seule explicitement choisi ; `files.metadata.read` et `files.content.read`, OAuth PKCE sans secret, session courte en mémoire. La connexion n'indexe rien ; parcours volontaire interrompu à la fermeture des options. Copies séparées par compte, conservées sans remplacement ni suppression déduite ; photos en métadonnées seules, sans EXIF/GPS ou reconnaissance. Un test simulé ne valide pas un compte réel. Voir [configuration et limites](ETUDE_FAISABILITE_CLOUDS.md#première-tranche-dropbox-web--lot-f).
- **Pas de serveur :** Prototype client-side uniquement.
- **Hash de compatibilité :** Supportez `#/view` et `#view` dans `parseHash()`.
- **Documentation :** Toute modification majeure de l'architecture, de l'interaction entre composants, ou de la charte de style (`styles.css`) **doit** impérativement s'accompagner d'une mise à jour de la documentation technique (schémas Mermaid, fichiers Markdown dans `/docs/`).

## ✅ Checklist Anti-Régression (avant commit)
- [ ] **Structure des modules** : `state.js`, `app.js`, `search-utils.js`, `local-files.js` sont présents et exportent les fonctions attendues.
- [ ] **Documentation à jour** : Les schémas Mermaid ([overview.mmd](docs/architecture/mermaid/overview.mmd)) et fichiers techniques ([integration.md](docs/architecture/integration.md)) reflètent les changements récents.
- [ ] **Pas de fichiers orphelins** : Aucun fichier `.bak`, `.tmp`, ou backup à la racine du projet ou dans `projets/famili-ia/`.
- [ ] **Respect des tokens CSS** : Utiliser les tokens `--ui-*` pour l'onboarding, l'Accueil, la Recherche, l'Assistant, les Alertes, Vos données, le foyer, Importer, Profil et Plus ; préserver la palette historique des vues non migrées. Les couleurs sémantiques sont définies dans les variables CSS.
- [ ] **Navigation hash** : `parseHash()` gère correctement `#/view` et `#view` sans régression.
- [ ] **Capacitor safety** : `Capacitor.isNativePlatform()` vérifié avant tout appel API native.
- [ ] **Interface de recherche** : La barre de recherche et les résultats s'affichent correctement sur desktop et mobile.
- [ ] **États d'erreur** : Les composants affichent un état vide/erreur significatif si les données manquent.
- [ ] **Accessibilité** : Les contrastes respectent les ratios minimaux (texte: 4.5:1, UI components: 3:1).
- [ ] **Cibles et clavier** : Tout contrôle interactif fait au moins 48 × 48 px (case à cocher : zone de 48 px, carré visible de 24 px), expose un nom accessible, a un focus visible et respecte `prefers-reduced-motion`. `tests/accessibility-audit.spec.js` le vérifie sur chaque écran.
