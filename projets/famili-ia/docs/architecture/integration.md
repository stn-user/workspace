# Intégration et accès aux fichiers locaux

Cette page distingue les capacités réellement présentes des choix à mettre en œuvre. Famili-IA ne doit demander accès qu'aux fichiers explicitement sélectionnés par l'utilisateur ; la sélection d'un fichier ne vaut pas autorisation de parcourir toute sa photothèque.

## Capacités actuelles

### Web

- Les contrôles HTML `input type="file"` permettent une sélection explicite d'un ou plusieurs fichiers. `accept` est une indication pour le sélecteur, pas une validation ; l'application doit toujours contrôler type et taille après sélection.
- Le flux d'import manuel accepte actuellement JPG/JPEG et PNG pour les images, jusqu'à 20 Mio par fichier, et jusqu'à cinq fichiers par sélection/session. Les documents texte sont limités à 1 Mio et les PDF à 10 Mio. HEIC/HEIF et WebP apparaissent dans le scanner de dossiers, mais ne font pas partie des formats de l'import manuel ni d'un engagement de prise en charge photo.
- Un contrôle `capture="environment"` propose une capture caméra au navigateur compatible ; il ne garantit ni l'ouverture d'une caméra ni un sélecteur de photothèque uniforme.
- Le scanner de dossiers Web dépend de `showDirectoryPicker` ou d'une sélection `webkitdirectory`, dont la disponibilité et le comportement dépendent du navigateur. Il ne constitue pas le parcours photo de référence.
- Le traitement du contenu importé est exécuté côté client. Aucun service worker n'a été trouvé : l'accès hors ligne complet de la version Web n'est donc pas garanti. Après chargement de l'application, une sélection locale peut être lue sans envoyer le fichier à un service Famili-IA, mais cela ne garantit pas que l'application puisse être ouverte hors ligne.

### Android / Capacitor

- Le projet comprend une cible Android et les plugins `@capacitor/filesystem` et `@capacitor/camera`. Le sélecteur photo système est raccordé au parcours d'import : jusqu'à cinq photos JPEG/PNG choisies explicitement sont lues localement puis soumises aux contrôles de taille et au traitement existants. Le bouton n'est visible que sur Android ; aucune permission générale de photothèque n'est demandée par ce parcours.
- Le code utilise `Filesystem.Directory.Documents` pour explorer des chemins supposés publics. La documentation Capacitor précise que sur Android 11 et ultérieur, ce répertoire ne donne accès qu'aux fichiers créés par l'application. Le manifeste Android actuel ne déclare pas de permission de lecture des médias ou du stockage. Le parcours de scan actuel ne constitue donc pas un accès fiable aux photos de l'utilisateur.
- Le lecteur importe les plugins Capacitor Filesystem et OCR natifs ; l'OCR de PDF scannés et d'images peut fournir des segments locaux indexables. Ce raccordement n'a pas encore été validé sur appareil et ne change ni les limites d'accès aux fichiers ni la sélection explicite.
- La sélection photo est couverte par des tests unitaires pour l'annulation, la limite, les formats et les erreurs de lecture. La synchronisation Capacitor et une compilation Gradle Debug ont réussi sous Windows avec la chaîne locale Java/SDK ; la signature et l'identifiant de l'APK ont été vérifiés. Aucune validation sur appareil n'a encore été effectuée.
- Les fichiers locaux de l'application peuvent être traités sans serveur, mais l'absence de test hors ligne sur appareil et le cas de fournisseurs médias cloud empêchent de promettre une disponibilité hors ligne universelle.

#### Construire un APK Debug sous Windows

Prérequis : dépendances du projet installées avec `npm ci`, Node.js 22.12 ou ultérieur,
JDK 21, Android SDK Platform 36 et Build Tools 35.0.0. Les Platform Tools
fournissent `adb` pour les futurs essais sur appareil ; aucun émulateur n'est requis.
Les outils et leurs licences doivent être installés séparément ; le script ne les
installe pas et ne modifie pas le PATH global.

Depuis la racine du dépôt :

```powershell
npm run android:check
npm run android:debug
```

Le script [build-android-debug.ps1](../../scripts/build-android-debug.ps1)
utilise `JAVA_HOME` et `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`) s'ils sont définis.
Sinon, il cherche respectivement `%LOCALAPPDATA%\FamiliIA\toolchains\jdk-21` et
`%LOCALAPPDATA%\FamiliIA\toolchains\android-sdk`. Un chemin explicite invalide ou
deux chemins SDK contradictoires provoquent une erreur, sans remplacement silencieux.
`android:check` contrôle les prérequis sans compiler.

`android:debug` construit le Web, synchronise **Android uniquement**, puis exécute
`gradlew.bat --no-daemon --max-workers=2 :app:assembleDebug`. Le wrapper utilise
Gradle 8.14.3, avec vérification SHA-256 de sa distribution ; AGP est en version
8.13.0. Le premier lancement nécessite Internet pour Gradle et ses dépendances.
Les ressources Web sont embarquées : un `server.url` de développement est refusé.
La commande contrôle la signature, l'identifiant du paquet, le caractère Debug et
la présence de la page Web dans l'APK ; elle affiche son chemin, sa taille et son SHA-256.
Elle n'exécute aucune suite de tests et n'installe rien sur un appareil.

Artefact attendu :
[`android/app/build/outputs/apk/debug/app-debug.apk`](../../android/app/build/outputs/apk/debug/app-debug.apk).
La signature Debug locale n'est pas une signature de distribution. Conserver la
même clé Debug hors dépôt pour mettre à jour une installation d'essai sans devoir
la désinstaller ; une désinstallation peut effacer ses données locales.
« Reproductible » désigne ici une procédure réexécutable, pas une identité binaire
garantie entre machines ou clés de signature différentes.

Deux constructions successives ont réussi avec le même SHA-256 sur cette machine
(APK de 56 386 030 octets). Le préflight a également refusé un JDK absent, un SDK
absent et des variables SDK contradictoires. Aucune campagne exhaustive n'a été lancée.

Ce build ne valide ni le démarrage ni les parcours natifs sur appareil.
Le manifeste **fusionné de l'APK** contient `INTERNET` et `ACCESS_NETWORK_STATE`,
ajoutées par la dépendance transitive Google DataTransport, même si le manifeste
source de l'application ne les déclare pas directement. Aucune permission de
lecture des médias ou du stockage n'y figure. Les dépendances natives, leurs
échanges réseau et les connecteurs cloud restent à qualifier pour la bêta ;
ne pas déduire une absence de réseau du seul manifeste source.
La synchronisation chiffrée multi-appareils n'est pas implémentée. Ces points, les
essais hors ligne, l'OCR, les permissions et la conservation des données restent
distincts de la compilation ; iOS nécessite toujours macOS/Xcode.

### iOS

- Aucune cible iOS générée ou configurée n'est présente dans le dépôt. Le plugin Camera fournit un sélecteur utilisable côté iOS, mais l'action reste masquée tant que la cible, les descriptions d'usage requises dans `Info.plist` et la validation sur appareil ne sont pas en place.
- Le plugin Filesystem seul ne constitue pas un sélecteur de photothèque ; ne pas présenter un scan de dossiers iOS comme une fonctionnalité existante.

## Décision de périmètre pour les photos

1. **Web** : conserver la sélection manuelle explicite comme parcours de base, avec validation réelle du type et de la taille. Prévoir le choix de fichiers, pas l'accès permanent à la photothèque ni un scan automatique en arrière-plan.
2. **Android** : utiliser le sélecteur système photo raccordé, limité aux éléments choisis. Ne pas demander de permission générale de lecture des médias pour ce parcours ; valider sur appareils avant annonce de disponibilité.
3. **iOS** : le sélecteur du plugin est disponible à intégrer, mais ne pas annoncer de prise en charge native avant ajout d'une cible, configuration d'`Info.plist` et validation sur appareil.
4. **Formats initiaux retenus à l'évaluation 15.3.b** : JPEG et PNG, cohérents avec l'import manuel actuel et la couverture déclarée du parseur candidat. HEIC/HEIF et WebP restent hors engagement jusqu'à validation ultérieure sur les cibles visées.
5. **Hors ligne** : viser un traitement local des images sélectionnées ; qualifier séparément l'ouverture hors ligne de l'application et l'accès aux médias fournis par des services distants.

Le parseur `exifr` extrait désormais en local les seules balises nécessaires (date, offset, orientation, dimensions, appareil). Il n'ouvre le bloc GPS qu'après consentement distinct enregistré dans le profil, désactivé par défaut. Retirer le consentement efface les coordonnées GPS déjà persistées ; le rétablir ne restaure pas les anciennes coordonnées et ne s'applique qu'aux nouvelles importations. Aucun EXIF ni fichier photo n'est transmis à un service distant par ce parcours.

L'étape 15.3.c a défini le sous-objet versionné `photoMetadata` et ses validateurs/migrations dans `photo-metadata.js`. `state.js` valide ce sous-objet à l'ajout d'un document et migre les enregistrements photo v0 valides lors de leur chargement. L'aperçu d'un document image affiche uniquement son texte extrait, pas l'image binaire ni ses EXIF. Les exports JSON et PDF masquent les coordonnées GPS par défaut ; l'état local reste inchangé. Les fixtures et mesures de 15.3.e sont documentées dans [l'audit de la phase 15](./phase-15-intelligence-audit.md) ; elles couvrent un corpus limité de trois groupes d'appareils, et le profilage mobile reste à réaliser.

## Confirmation locale d'échéance — A4

Recherche et Assistant partagent le parcours de [propositions confirmées](assistant-enrichi.md#a4-local-livré--propositions-et-confirmations-communes).
Il ne demande aucun accès supplémentaire aux fichiers ou aux sources cloud,
ne modifie pas les originaux et ne déclenche pas de notification immédiate.

La préparation réutilise les fiches et segments de l'index commun.
`confirmDocumentDeadline()` dans [state.js](../../state.js) revalide l'identité
complète, la provenance, la preuve et l'admissibilité, puis sérialise la mutation.
`putConfirmedDocumentAlert()` dans [db.js](../../db.js) prépare le stockage avant
une transaction IndexedDB unique couvrant `documents` et `alerts`.
Les comparaisons d'état persistant avant et dans la transaction empêchent
d'écraser une modification concurrente ou de recréer une copie supprimée.
Seul `transaction.oncomplete` autorise la publication en mémoire ; un abandon
annule toutes les écritures. Les confirmations répétées contrôlent aussi les
enregistrements persistés avant de renvoyer le rappel existant sans écrire.

Le parcours reste limité aux propositions déterministes actuellement admissibles.
La correction manuelle historique et la réconciliation automatique des alertes
gardent leurs entrées distinctes ; A4 ne les transforme pas en transaction globale.

## Sources et vérification

Capacités du dépôt vérifiées le 2 novembre 2026 (`index.html`, `app.js`, `local-files.js`, `capacitor.config.json`, `android/app/src/main/AndroidManifest.xml`, `package.json`) :

- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem) — limites de `Directory.Documents` sur Android 11+, accès `content://` et exigences de confidentialité iOS.
- [Capacitor Camera](https://capacitorjs.com/docs/apis/camera) — `chooseFromGallery`, formats et sélection multiple ; intégration Android synchronisée, cible iOS absente.
- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker) — sélection d'images par l'utilisateur sans accès général à la photothèque ; le sélecteur peut utiliser un fournisseur cloud disponible.
- [MDN : attribut `accept`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept) — filtre indicatif, ne remplaçant pas la validation.
- [MDN : `showOpenFilePicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) — activation utilisateur requise et disponibilité à détecter ; API non retenue comme seule voie Web.
