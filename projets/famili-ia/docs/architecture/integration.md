# Intégration et accès aux fichiers locaux

Cette page distingue les capacités réellement présentes des choix à mettre en œuvre. Famili-IA ne doit demander accès qu'aux fichiers explicitement sélectionnés par l'utilisateur ; la sélection d'un fichier ne vaut pas autorisation de parcourir toute sa photothèque.

## Capacités actuelles

### Web

- Les contrôles HTML `input type="file"` permettent une sélection explicite d'un ou plusieurs fichiers. `accept` est une indication pour le sélecteur, pas une validation ; l'application doit toujours contrôler type et taille après sélection.
- Le flux d'import manuel accepte actuellement JPG/JPEG et PNG pour les images, jusqu'à 10 Mio par fichier, et jusqu'à cinq fichiers par sélection/session. Les documents texte sont limités à 1 Mio et les PDF à 10 Mio. HEIC/HEIF et WebP apparaissent dans le scanner de dossiers, mais ne font pas partie des formats de l'import manuel ni d'un engagement de prise en charge photo.
- Un contrôle `capture="environment"` propose une capture caméra au navigateur compatible ; il ne garantit ni l'ouverture d'une caméra ni un sélecteur de photothèque uniforme.
- Le scanner de dossiers Web dépend de `showDirectoryPicker` ou d'une sélection `webkitdirectory`, dont la disponibilité et le comportement dépendent du navigateur. Il ne constitue pas le parcours photo de référence.
- Le traitement du contenu importé est exécuté côté client. Aucun service worker n'a été trouvé : l'accès hors ligne complet de la version Web n'est donc pas garanti. Après chargement de l'application, une sélection locale peut être lue sans envoyer le fichier à un service Famili-IA, mais cela ne garantit pas que l'application puisse être ouverte hors ligne.

### Android / Capacitor

- Le projet comprend une cible Android et les plugins `@capacitor/filesystem` et `@capacitor/camera`. Le sélecteur photo système est raccordé au parcours d'import : jusqu'à cinq photos JPEG/PNG choisies explicitement sont lues localement puis soumises aux contrôles de taille et au traitement existants. Le bouton n'est visible que sur Android ; aucune permission générale de photothèque n'est demandée par ce parcours.
- Le code utilise `Filesystem.Directory.Documents` pour explorer des chemins supposés publics. La documentation Capacitor précise que sur Android 11 et ultérieur, ce répertoire ne donne accès qu'aux fichiers créés par l'application. Le manifeste Android actuel ne déclare pas de permission de lecture des médias ou du stockage. Le parcours de scan actuel ne constitue donc pas un accès fiable aux photos de l'utilisateur.
- Le lecteur importe les plugins Capacitor Filesystem et OCR natifs ; l'OCR de PDF scannés et d'images peut fournir des segments locaux indexables. Ce raccordement n'a pas encore été validé sur appareil et ne change ni les limites d'accès aux fichiers ni la sélection explicite.
- La sélection photo est couverte par des tests unitaires pour l'annulation, la limite, les formats et les erreurs de lecture. La synchronisation Capacitor réussit, mais aucune compilation Gradle ni validation sur appareil n'a été effectuée : Java, Android SDK et `adb` ne sont pas configurés dans l'environnement courant.
- Les fichiers locaux de l'application peuvent être traités sans serveur, mais l'absence de test hors ligne sur appareil et le cas de fournisseurs médias cloud empêchent de promettre une disponibilité hors ligne universelle.

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

## Sources et vérification

Capacités du dépôt vérifiées le 2 novembre 2026 (`index.html`, `app.js`, `local-files.js`, `capacitor.config.json`, `android/app/src/main/AndroidManifest.xml`, `package.json`) :

- [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem) — limites de `Directory.Documents` sur Android 11+, accès `content://` et exigences de confidentialité iOS.
- [Capacitor Camera](https://capacitorjs.com/docs/apis/camera) — `chooseFromGallery`, formats et sélection multiple ; intégration Android synchronisée, cible iOS absente.
- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker) — sélection d'images par l'utilisateur sans accès général à la photothèque ; le sélecteur peut utiliser un fournisseur cloud disponible.
- [MDN : attribut `accept`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept) — filtre indicatif, ne remplaçant pas la validation.
- [MDN : `showOpenFilePicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker) — activation utilisateur requise et disponibilité à détecter ; API non retenue comme seule voie Web.
