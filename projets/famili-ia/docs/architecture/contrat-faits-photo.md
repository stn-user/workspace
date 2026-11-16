# Contrat versionné des faits photo

## Objectif et périmètre

Le contrat P1 unifie les faits nécessaires à la recherche photo sans remplacer les formats historiques (`photoMetadata` et `photoAnnotations`). Il est défini dans [`photo-facts.js`](../../photo-facts.js), versionné indépendamment et validé par des tests fictifs. Depuis la tranche locale P2, `photoFacts` est persisté de façon additive dans chaque document photo ; les formats historiques restent la source de reconstruction et ne sont pas supprimés.

`photoFactSetFromDocument` reste un adaptateur pur. La persistance et la réconciliation sont orchestrées par `state.js` après vérification du consentement GPS. L'index commun, la recherche de moments de vie et la timeline lisent les faits persistés, sans substituer la date d'import à la date de prise de vue. Avec le consentement dédié, les coordonnées sont indexées et une recherche explicite par paire latitude/longitude les compare exactement ; aucun rayon, rapprochement géographique, géocodage inverse ou recherche par adresse n'est raccordé.

## Forme du contrat

Chaque fiche porte une version, un document parent, une empreinte exacte facultative et les copies connues :

```js
{
  schemaVersion: 1,
  documentId: "photo-locale-123",
  contentHash: "sha256:<64 caractères hexadécimaux>",
  sourceCopies: [{
    providerId: "dropbox",
    accountRef: "<empreinte SHA-256 opaque ou null>",
    itemId: "identifiant-stable-de-la-copie",
    path: "/Photos/Vacances",
    lastCheckedAt: "2026-11-15T10:19:00.000Z"
  }],
  dates: {
    fileCreatedAt: null,
    fileModifiedAt: "2026-11-14T09:00:00.000Z",
    importedAt: "2026-11-15T10:20:30.000Z",
    analyzedAt: null,
    lastSourceCheckAt: "2026-11-15T10:19:00.000Z"
  },
  facts: []
}
```

Les dates de fichier, de prise de vue, d'import, d'analyse et de dernier contrôle restent distinctes. Une date seule reste une date seule ; une date EXIF sans fuseau conserve `offsetMinutes: null`. Aucune date d'import ou de modification n'est substituée à une date de prise de vue.

Chaque fait contient son type, sa valeur typée, sa provenance, son statut, son indice justificatif, sa date d'analyse éventuelle et ses dépendances. Les faits pris en charge sont `captureDate`, `location`, `place`, `person` et `event`. Les coordonnées peuvent inclure altitude et précision si la source les fournit.

```js
{
  id: "suggestion-evenement-1",
  kind: "event",
  value: { eventId: null, label: "mariage" },
  status: "suggested",
  provenance: { kind: "model", field: "eventClassifier", providerId: null, accountRef: null, itemId: null },
  evidence: {
    kind: "model-output",
    method: "local-event-classifier",
    modelVersion: "1.2.0",
    calibratedScore: 0.87
  },
  analyzedAt: "2026-11-15T10:00:00Z",
  review: null,
  dependsOnFactIds: []
}
```

Un résultat de modèle n'accepte aucun extrait textuel : seule la méthode, la version et une confiance calibrée entre 0 et 1 peuvent le justifier. Les annotations explicites de la personne utilisent `user` et `confirmed`; une correction crée un fait distinct au lieu d'écraser l'extraction. Les suggestions restent séparées des faits confirmés. Une correction ou un rejet conserve une trace de revue utilisateur, sans date inventée si l'ancien format n'en avait pas.

## Identité, conflits et doublons

- Une copie est identifiée par `(providerId, accountRef, itemId)`. `accountRef` est une empreinte opaque SHA-256 ; une adresse de compte, un jeton et une URL temporaire sont refusés. Un chemin fournisseur connu peut être conservé, mais jamais une URL de téléchargement.
- `mergePhotoFactSets` n'écrase pas un fait de même ID avec une valeur différente : il exige un nouvel ID, conserve les faits de l'utilisateur et laisse les faits automatiques distincts. `resolvePhotoFact` donne priorité à une valeur confirmée par l'utilisateur ; à défaut, il ne choisit une valeur extraite/suggérée que si elle n'a pas de contradicteur. Même lorsqu'une correction confirmée est prioritaire, `findPhotoFactConflicts` expose les valeurs incompatibles de date, lieu et coordonnées.
- Les événements et personnes sont multivalués ; ils ne sont pas déclarés contradictoires simplement parce qu'ils diffèrent. Aucune identité n'est propagée entre comptes ou foyers.
- `contentHash` est un SHA-256 des octets exacts. `findExactPhotoFactDuplicates` ne présente des candidats qu'en cas d'empreinte identique ; il ne fusionne ni documents ni copies. Nom, date, chemin ou ressemblance ne suffisent pas à établir un doublon.

## Faits dérivés et cycle de vie

`dependsOnFactIds` référence les faits sources et le validateur rejette les références manquantes ainsi que les cycles. `getDependentPhotoFactIds` identifie les dépendances transitives (par exemple GPS → lieu dérivé → regroupement) lors d'un retrait de source.

Règles de cycle de vie appliquées pour les photos locales :

1. N'enregistrer une localisation qu'après vérification du consentement dédié. Son retrait efface le GPS historique et les faits qui en dépendent ; un lieu saisi directement par la personne reste distinct.
2. À l'export, masquer les coordonnées et les valeurs dérivées uniquement du GPS. Les autres annotations restent distinctes.
3. La suppression d'une fiche Famili-IA ne supprime pas l'original chez le fournisseur sans action distincte et autorisée.
4. Les faits dérivés ne survivent pas à la suppression de leur source. Les URL temporaires et jetons n'appartiennent jamais à ce contrat.

La règle de consentement et l'export sont raccordés aux données photo locales ; la recherche de coordonnées n'est disponible que lorsque la paire exacte est présente dans l'index. Les comportements des adaptateurs cloud, des fichiers annexes et des nouveaux formats restent hors de cette tranche.

## Compatibilité et stratégie de migration

`photoFactSetFromDocument` est une conversion pure et rejouable des formes `photoMetadata`/`photoAnnotations` existantes. Des identifiants locaux déterministes rendent la conversion répétable ; ils ne sont pas des empreintes de contenu. Les faits existants sont fusionnés sans écrasement ; les faits d'annotations historiques sont remplacés à partir de leur source de vérité lors d'une modification. Les métadonnées GPS sont exclues par défaut.

La migration actuelle est additive et rejouable : au chargement, les fiches photo sans faits sont reconstruites depuis les champs historiques ; les faits incohérents sont journalisés et reconstruits lorsque les sources le permettent. L'index est recalculé après réconciliation. Aucun magasin ni version IndexedDB supplémentaire n'est requis. Les anciens champs sont conservés pour retour arrière ; aucun changement au chiffrement n'est apporté.

## Vérification

Les tests utilisent uniquement des identifiants, dates et coordonnées synthétiques. Ils couvrent la conversion, la migration additive, la recherche date après rechargement, les conflits, la révocation GPS et ses dépendances, ainsi que l'export expurgé. Aucun compte réel, photo personnelle, service de géocodage ou modèle de vision n'est utilisé. XMP/IPTC, les adaptateurs cloud et la géolocalisation inverse ne sont pas couverts par cette tranche.
