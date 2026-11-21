# Capacités et permissions de la bêta Android

Statut : décisions du 18/11/2026 intégrées ; cadrage à confirmer avant les essais sur Galaxy Tab A8 et téléphone Android. Il ne vaut ni validation sur appareil, ni périmètre iOS.

## Constats sur l'APK Debug (manifeste fusionné)

| Élément | Constat | Origine |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Présentes, non déclarées par l'application | `com.google.android.datatransport:transport-backend-cct` / `transport-runtime`, tirés par `com.google.mlkit:text-recognition:16.0.1` (plugin `@jcesarmobile/capacitor-ocr`) |
| Services/receivers DataTransport | `JobInfoSchedulerService`, `AlarmManagerSchedulerBroadcastReceiver`, `TransportBackendDiscovery` | Même chaîne ML Kit ; envoi de télémétrie ML Kit vers Google |
| `MlKitInitProvider`, `MlKitComponentDiscoveryService`, `GoogleApiActivity` | Initialisation ML Kit au démarrage de l'app | ML Kit |
| Permission de lecture médias/stockage | **Absente** | — |
| `allowBackup` | `false` | Manifeste de l'app |
| `capacitor.config.json` | Aucun `server.url`, aucune liste `allowNavigation` | Ressources Web embarquées |

Le `INTERNET` du manifeste est aussi nécessaire aux connecteurs Web (WebView) : sa suppression casserait OAuth et les API cloud, qui ne sont de toute façon pas validées nativement.

## Échanges réseau à qualifier

1. **Dépendances natives (ML Kit / DataTransport)** : OCR local, mais télémétrie possible vers les services Google. À qualifier par capture de trafic sur appareil (proxy ou `adb` + journal réseau) : domaines, fréquence, contenu, comportement hors ligne. Contredirait la promesse « données locales » si du contenu document était émis ; à vérifier, non supposé.
2. **Connecteurs cloud** : Google Drive utilise l'autorisation Android Google puis l'API `www.googleapis.com`; le Web conserve `accounts.google.com`, `apis.google.com` et le sélecteur Google. OneDrive contacte `login.microsoftonline.com`, `account.live.com` et `graph.microsoft.com`; Dropbox contacte `www.dropbox.com`, `api.dropboxapi.com` et `content.dropboxapi.com`. Les connecteurs ne sont annoncés qu'après validation sur appareil (connexion, retours, limites d'accès et stockage).
3. **Compilation** : Gradle contacte Google/Maven Central ; sans effet à l'exécution.

## Décisions proposées

- **Capacités incluses (Android)** : import par sélecteur système photo (JPEG/PNG, 5 maximum, **20 Mio**) ; import de fichiers locaux explicite ; recherche et assistant sur l'index local ; OCR local ; **connecteurs Google Drive, OneDrive et Dropbox inclus comme fonctions en test**, à valider sur appareil (connexion dans l'app installée, retour dans l'app, liste des fichiers, reconnexion après fermeture) et signalés comme tels dans l'interface.
- **Hors bêta (inexistant)** : accès général à la photothèque, scan de `Documents`, Google Photos, synchronisation chiffrée multi-appareils, reconnaissance de personnes.
- **Permissions** : minimales ; aucune permission média/stockage. Le parcours `Filesystem.requestPermissions()` / `readdir(Documents)` de `local-files.js` n'est pas un parcours bêta fiable (Android 11+).
- **Réseau (décidé)** : `INTERNET` conservée, car les connecteurs inclus en ont besoin. Reste à qualifier pendant les essais le trafic ML Kit, surtout pendant l'OCR d'un PDF scanné ; si du contenu de document sort, désactiver la télémétrie ML Kit.
- **Release** : réexaminer le manifeste fusionné de la variante signée, pas seulement Debug ; supprimer le commentaire « inherited » une fois la décision prise.
- **Google Drive Android (décision bêta)** : après l'échec du sélecteur Google Web dans la WebView, un navigateur de fichiers intégré à Famili-IA remplace ce sélecteur. Pour le parcourir, l'application demande `drive.readonly`, qui autorise la lecture de tout le Drive ; seuls les fichiers choisis sont importés et aucune écriture/suppression n'est demandée. Utiliser uniquement des comptes testeurs pour la bêta et confirmer les exigences Google de vérification avant toute diffusion plus large. Le Web reste sur `drive.file`.

## Préparation des essais (tablette et téléphone)

1. Installer l'APK Debug (`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`) ; noter modèle, Android, SHA-256.
2. Installation neuve : accueil, démo, absence de demande de permission au démarrage.
3. Sélecteur photo : annulation, 1 puis 5 photos, formats refusés, taille limite ; réouverture après fermeture de l'app.
4. OCR d'un PDF scanné en mode avion, puis en ligne avec capture de trafic.
5. Hors ligne : recherche, assistant, conservation des données.
6. Permissions : vérifier dans Réglages que l'app n'en demande aucune sensible ; refus/révocation sur les parcours qui en demanderaient.
7. Mise à jour par-dessus (`install -r`) sans perte de données ; désinstallation = suppression complète.
8. Accessibilité et cibles tactiles (390 et 768 px physiques), orientation, mode sombre.
9. Consigner résultats et écarts ; mettre à jour [Intégration](./architecture/integration.md) et le plan (lot E).
