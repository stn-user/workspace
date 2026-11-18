# Assistant A2 — protocole d'évaluation

## État livré et limites

Le [corpus indépendant](../../tests/fixtures/assistant-evaluation.json) contient
24 scénarios fictifs annotés manuellement : 18 cas de génération et 6 scénarios
d'intégration à exécuter en A3/A4. Les réponses de référence ne sont pas calculées
par le moteur testé.

L'[évaluateur](../../assistant-evaluation.js) et sa
[CLI](../../scripts/evaluate-assistant.js) préparent les entrées et examinent des
résultats importés. Ils ne téléchargent aucun modèle, ne font aucune inférence,
n'appellent aucune API et ne lisent pas les documents personnels de l'application.
La vue Assistant reste celle d'A1.

**A2.1 : corpus et outillage disponibles. A2.2 : comparaisons réelles non
effectuées. Aucun modèle qualifié, aucune consommation d'inférence mesurée.**
Les réponses fabriquées dans les tests sont uniquement des contrôles unitaires
de l'évaluateur, jamais un résultat de modèle.

Validation A2.1 exécutée : **18 tests Node ciblés réussis** (7 contrôles de
l'évaluateur et 11 tests de qualité documentaire), vérification CLI réussie
avec `modelRuns: 0`, build de production réussi. Aucun parcours UI modifié.

## Commandes

Depuis la racine du projet :

```powershell
npm run benchmark:assistant -- check
node --test tests\assistant-evaluation.test.js tests\search-quality.test.js
```

`check` annonce 24 scénarios, 18 cas de génération, 6 intégrations non exécutées
et `modelRuns: 0`.

Pour exporter les requêtes vers un dossier d'essai existant, puis analyser une
campagne obtenue séparément :

```powershell
npm run benchmark:assistant -- export C:\essais\requetes-assistant.json
npm run benchmark:assistant -- evaluate C:\essais\campagne.json
npm run benchmark:assistant -- evaluate C:\essais\campagne.json C:\essais\relecture.json
```

L'export refuse d'écraser un fichier existant. Les JSON sont en UTF-8 ; le lecteur
accepte aussi un BOM. L'évaluation écrit un rapport JSON sur stdout, sans recopier
les textes des réponses. Utiliser directement `node scripts\evaluate-assistant.js`
à la place de `npm run benchmark:assistant --` si stdout doit contenir seulement
le JSON, sans l'en-tête npm.

## Entrées du modèle

L'export porte version, empreinte du corpus/protocole, contrat de sortie,
réglages et 18 entrées `{caseId, messages}`. Pour chaque inférence, fournir
uniquement ses `messages` et le contrat de sortie, pas l'intégralité du paquet,
les identifiants de scénario ni les annotations du corpus.

Le message utilisateur contient question, historique fictif explicite et pièces
vérifiées `{id, name, text}`. Les réponses de référence, rubriques de relecture,
identités internes source/compte/élément et textes non vérifiés sont exclus.
Ce filtrage d'un corpus fictif n'est pas une fonction d'anonymisation générale.

Chaque cas doit commencer sans mémoire des autres cas. Seul l'historique fourni
est utilisable. Les preuves sont ici préparées pour le test : ces essais de
génération ne valident pas à eux seuls la recherche, la vérification d'empreinte
ou l'isolation des comptes de l'application.

Réglages imposés par la version `1.0.0` :

```json
{"temperature":0.2,"topP":0.9,"maxOutputTokens":1024,"thinking":"disabled"}
```

Ce sont des exigences déclarées, pas des options déjà appliquées à un moteur.
Vérifier leur traduction exacte dans le runtime retenu, notamment la désactivation
du raisonnement de Qwen3. Si un réglage n'est pas pris en charge, ne pas annoncer
une campagne conforme : modifier explicitement le protocole et sa version, ou
différer ce candidat. Conserver les sorties brutes et les erreurs, sans réparation
du JSON, nouvelle tentative cachée ni remplacement par la réponse de référence.

## Contrat de réponse

```json
{
  "status": "answered",
  "answer": "Réponse courte fondée sur les pièces.",
  "claims": [
    {
      "text": "Une affirmation factuelle.",
      "citations": [{"evidenceId": "p1", "quote": "Passage littéral complet"}]
    }
  ]
}
```

Statuts autorisés : `answered`, `abstained`, `clarification`, `conflict`.
Les champs supplémentaires, notamment des actions, sont refusés.
`answered` et `conflict` exigent une affirmation ; chaque affirmation exige une
citation. Une abstention peut citer la pièce expliquant ce qui manque.

Les contrôles automatiques vérifient le statut annoté, la structure, les pièces
autorisées et la présence littérale des citations. Chaque passage annoté requis
doit être intégralement inclus dans une citation de sortie de la même pièce.
Une citation plus longue est admise ; une version tronquée échoue même si elle
paraît suffisante à un lecteur. Ce critère volontairement strict exige de revoir
les annotations et de changer l'empreinte si l'on souhaite l'assouplir.

**Une vraie citation ne prouve pas une affirmation.** Une réponse fausse accolée
à un passage existant peut réussir les seuls contrôles structurels ; elle ne doit
jamais être approuvée sans relecture sémantique.

## Campagne importée

Exemple d'enveloppe, à compléter avec l'empreinte exportée et des mesures réelles :

```json
{
  "protocolVersion": "1.0.0",
  "corpusFingerprint": "empreinte-exportee",
  "candidate": {
    "model": "identifiant-exact-du-modele-et-quantification",
    "revision": "revision-exacte-des-poids",
    "runtime": "moteur-et-version-exacts",
    "environment": "OS, navigateur, appareil et configuration"
  },
  "runId": "campagne-unique",
  "phase": "warm",
  "settings": {
    "temperature": 0.2,
    "topP": 0.9,
    "maxOutputTokens": 1024,
    "thinking": "disabled"
  },
  "observations": []
}
```

Ajouter une observation par cas exécuté :

- `caseId` : identifiant exporté ;
- `output` : objet ou chaîne JSON brute retournée ; **ou** `error` : erreur
  explicite non vide, jamais les deux ;
- `elapsedMs` : durée complète réellement mesurée, nombre fini positif ou nul ;
- `usage`, facultatif : `{inputTokens, outputTokens}`, deux entiers positifs
  ou nuls provenant du runtime/fournisseur, pas d'une estimation en caractères.

Les cas inconnus, doublons, réglages différents et empreintes incompatibles
échouent explicitement. Les cas absents restent manquants.

Séparer les campagnes `cold` et `warm` : première inférence après chargement,
ou moteur déjà utilisé. Pour mesurer tous les cas à froid, réinitialiser le
moteur entre eux. La durée d'inférence inclut la préparation propre au runtime
et la génération complète, sans téléchargement/chargement initial des poids.
Consigner séparément volume téléchargé, temps de chargement, mémoire maximale,
stockage du cache, énergie/batterie et éventuelle facturation. Une information
non mesurée doit être signalée comme telle, pas remplacée par zéro.

Le rapport indique `source: "imported"` : la CLI ne chronomètre pas l'inférence.
Le p95 utilise le rang supérieur `ceil(0,95 × n)` ; avec 18 observations, il
correspond au maximum. Le budget est strictement **inférieur à 15 000 ms**.
Un résultat exactement égal échoue. Si une consommation manque, les totaux de
jetons valent `null`, pas une somme partielle présentée comme complète.

## Relecture indépendante et décisions

Comparer chaque réponse brute à la question, aux passages et aux rubriques
annotées : faits corrects, citations pertinentes, absence d'ajout non étayé,
distinction estimation/date écrite, contradictions et références de conversation.
Vérifier aussi que le texte court n'ajoute pas une affirmation absente de `claims`.
La relecture ne doit pas être produite par le candidat jugeant ses propres sorties.

Le premier rapport fournit `runFingerprint`. La relecture séparée prend la forme :

```json
{
  "runFingerprint": "empreinte-du-rapport",
  "entries": [
    {"caseId": "reading-amount", "verdict": "pass", "notes": "Motivation après lecture des sorties réelles."}
  ]
}
```

Chaque décision exige une motivation ; `fail` rejette le cas. Toute modification
de la campagne invalide l'empreinte. Une relecture positive ne neutralise jamais
une structure ou une preuve invalide.

| Décision | Sens | Code CLI |
| --- | --- | --- |
| `not-evaluated` | Aucune observation | 2 |
| `incomplete` | Cas manquants, sans rejet déjà constaté | 2 |
| `review-required` | Relecture positive incomplète | 2 |
| `rejected` | Erreur de génération, structure, preuve ou relecture négative | 1 |
| `latency-rejected` | Cas relus positivement, mais budget p95 non respecté | 1 |
| `generation-corpus-approved` | 18 cas conformes, relus positivement, budget respecté | 0 |

Une erreur de commande/fichier donne aussi le code 1. `check` et `export`
réussis donnent 0, sans approuver de modèle.

Même après approbation des 18 cas, `productionReady` reste `false` :
les 6 intégrations restent explicitement `executed: 0` et `notRun`. Le retrait
de consentement, les suppressions pendant génération, les annulations et les
écritures confirmées exigent les futurs parcours A3/A4, pas des réponses fictives
affirmant que ces opérations ont réussi.

Avant de recommander un modèle, comparer plusieurs campagnes par candidat
(au moins trois à chaud et une série à froid), garder toutes les erreurs,
documenter les ressources et examiner la variabilité. Ce petit corpus connu
n'est ni un test aveugle ni une garantie universelle ; ne pas adapter les réponses
du candidat aux annotations pour afficher un meilleur score.

## Premier candidat local à examiner, non activé

Les métadonnées publiques officielles de
[Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B) indiquent une licence
Apache-2.0. La variante
[MLC q4f16_1](https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC)
est annoncée compatible WebLLM.

La consultation des seules métadonnées de fichiers a trouvé **30 fichiers de
poids, 968 001 536 octets** à la révision
`80b3abcec6c3b3f5355dc0cc99cc4fb578f192bc`, soit environ **0,97 Go**, hors
tokenizer, configuration, moteur et cache. La
[configuration WebLLM officielle](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
annonce `vram_required_MB: 2036.66` et une fenêtre de 4 096 pour cette entrée.
Ce sont des indications du fournisseur, pas des mesures sur ce poste ni sur
Android ; le budget mémoire total peut être supérieur.

Avant tout téléchargement : accord dédié sur volume et cache, contrôle de
WebGPU dans un contexte isolé, version du runtime et paramètres réellement
appliqués. Aucun poids téléchargé, aucune dépendance ajoutée et aucun essai
d'inférence réalisé à ce stade. Les options distantes restent à étudier
séparément avec autorisation et budget ; aucune clé ni passerelle créée.

**Décision à l'issue d'A2.1 :** l'utilisateur diffère l'essai local, faute de
capacité vidéo disponible pour cet essai. Aucun téléchargement n'est autorisé ;
aucune API distante ne le remplace implicitement. A2.2 reste ouvert. Le chantier
A4 des actions confirmées peut avancer sans modèle selon la conception.

**Mise à jour A4 :** les actions locales sont désormais livrées et leurs parcours
d'annulation, concurrence, abandon transactionnel et reprise sont couverts par
les tests navigateur Assistant/Recherche. La CLI A2 n'exécute pas ces tests :
elle conserve donc ses six scénarios d'intégration dans `notRun`. Ces validations
séparées ne constituent toujours pas une campagne de modèle ni une validation A3.
