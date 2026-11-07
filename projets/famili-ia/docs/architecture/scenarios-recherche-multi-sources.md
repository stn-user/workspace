# Scénarios de Recherche Multi-Sources
## 15.5bis.0.a - Scénarios prioritaires

Ces scénarios, fichiers, données et résultats sont entièrement fictifs. Ils décrivent une cible de recherche et non des capacités déjà vérifiées. Dans les exemples Drive, seuls les fichiers explicitement autorisés sont accessibles avec `drive.file` : leur présence dans un dossier ne donne pas accès à tout son contenu.

---

## Scénario 1 : Retrouver une facture dont l'emplacement est inconnu

**Intention/Requête** : L'utilisateur cherche "facture électricité 2024"

**Sources/Périmètre/Couverture** :
- Google Drive (`drive.file`) : Fichiers "Documents/Factures" - Contenu analysé
- Fichiers locaux : "Factures" - Contenu analysé

**Données disponibles** :
- Drive : "Facture n°2024-05-18 - Électricité - 22/05/2024 - 85,00 €"
- Local : "Date de la facture : 22/05/2024 - Montant : 85,00 € TTC"

**Résultats/Preuves** :
1. Drive ☁️ `Facture_Electricite_Mai2024.pdf` : "Facture n°2024-05-18 - Électricité - 22/05/2024 - 85,00 €"
2. Local 💾 `facture_elec_2024_Mai.pdf` : "Date de la facture : 22/05/2024 - Montant : 85,00 € TTC"

**Cas limite** : Si le texte des fichiers autorisés sur Drive et des fichiers locaux sélectionnés n'est pas exploitable → "Impossible de rechercher dans le contenu de certains fichiers autorisés sur Drive et de certains fichiers locaux sélectionnés. Leur indexation est incomplète ; ouvrez-les ou réessayez l'analyse."

---

## Scénario 2 : Trouver la date d'expiration d'une garantie

**Intention/Requête** : "garantie aspirateur bosch"

**Sources/Périmètre/Couverture** :
- Google Drive : "Documents/Achats" - Métadonnées seules
- Fichiers locaux : "Achats/Aspirateur" - Contenu analysé

**Données disponibles** :
- Local : "Aspirateur Bosch - Date d'achat : 15/03/2022 - Garantie constructeur : 24 mois - Fin de garantie : 15/03/2024"

**Résultats/Preuves** :
1. Local 💾 `Aspirateur_Bosch_Facture_2022.pdf` : "Aspirateur Bosch - Date d'achat : 15/03/2022 - Garantie constructeur : 24 mois - Fin de garantie : 15/03/2024"

**Cas limite** : Si le fichier local est illisible et que Drive ne fournit que des métadonnées → "La garantie n'a pas pu être lue dans le fichier local sélectionné ; seuls les noms et métadonnées des fichiers Drive autorisés ont été examinés. Ouvrez les documents accessibles pour vérifier."

---

## Scénario 3 : Trouver un fait précis dans un contrat

**Intention/Requête** : "durée du bail"

**Sources/Périmètre/Couverture** :
- Google Drive (`drive.file`) : "Contrats" - Contenu analysé
- Fichiers locaux : "Documents" - Métadonnées seules

**Données disponibles** :
- Drive : "La présente location dure neuf (9) ans à compter du 01/09/2023."

**Résultats/Preuves** :
1. Drive ☁️ `Contrat_de_location_Appartement.pdf` : "La présente location dure neuf (9) ans à compter du 01/09/2023."

**Cas limite** : Si aucune durée n'apparaît dans le contenu analysé des fichiers Drive autorisés et que seules les métadonnées des copies locales sont accessibles → "Aucune durée trouvée dans le contenu Drive analysé ; le contenu des copies locales sélectionnées n'a pas été analysé."

---

## Scénario 4 : Retrouver une photo par événement, personnes et date

**Intention/Requête** : "mariage lucas marie 2024"

**Sources/Périmètre/Couverture** :
- Photos locales : Appareil - Métadonnées seules
- Associations événement/personnes : tags saisis volontairement par l'utilisateur, sans reconnaissance faciale.

**Données disponibles** :
- 20240714_001_Mariage.jpg - EXIF 14/07/2024 - Tags `#mariage #lucas #marie`
- 20240715_001_Ceremonie.jpg - EXIF 15/07/2024 - Tags `#mariage #lucas #marie`

**Résultats/Preuves** :
1. Photos 📸 `20240714_001_Mariage.jpg` - EXIF 14/07/2024, tags `#mariage #lucas #marie`
2. Photos 📸 `20240715_001_Ceremonie.jpg` - EXIF 15/07/2024, tags `#mariage #lucas #marie`

**Cas limite** : Si aucune photo locale sélectionnée ne porte les associations demandées → "Aucune photo locale sélectionnée n'est associée à cet événement et à ces personnes. Voir les photos sélectionnées datées de juillet 2024 ?" Cette proposition élargit les critères et ne prétend pas identifier les personnes ou l'événement.

---

## Scénario 5 : Obtenir deux résultats de deux sources différentes

**Intention/Requête** : "assurance habitation date fin"

**Sources/Périmètre/Couverture** :
- Google Drive (`drive.file`) : "Assurances" - Contenu analysé
- Fichiers locaux : copies - Métadonnées seules
- E-mails : non autorisés et non consultés

**Données disponibles** :
- Drive : "Contrat d'assurance habitation - Date d'échéance : 15/12/2024"
- Local : fichier `copie_assurance_2023.pdf` - nom, date modif 15/12/2023 - contenu inconnu

**Résultats/Preuves** :
1. Drive ☁️ `Assurance_Habitation_2023-2024.pdf` : "Contrat d'assurance habitation - Date d'échéance : 15/12/2024"
2. Local 💾 `copie_assurance_2023.pdf` - nom/date modif uniquement, contenu inconnu

**Cas limite** : Si aucune échéance ne figure dans le contenu analysé des fichiers Drive autorisés → "Aucune échéance trouvée dans les fichiers Drive autorisés et analysés. Seules les métadonnées des copies locales sélectionnées ont été examinées ; les e-mails ne sont pas accessibles."