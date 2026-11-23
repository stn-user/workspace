const answerable = [
  ["Quel montant indique la facture du portail ?", [["Facture portail fictive.txt", "Montant total : 1 200 euros TTC."]]],
  ["Quand se termine la garantie du chauffe-eau ?", [["Garantie chauffe-eau fictive.txt", "Fin de garantie : 4 mai 2102."]]],
  ["Quelle référence figure sur la fiche chaudière ?", [["Fiche chaudière fictive.txt", "Référence chaudière : CH-FICTIVE-427."]]],
  ["La garantie couvre-t-elle la pompe ?", [["Garantie pompe fictive.txt", "La garantie ne couvre pas la pompe."]]],
  ["Quelle destination est prévue pour le séjour ?", [["Réservation fictive.txt", "Destination prévue : Japon."]]],
  ["Quelle puissance est inscrite au contrat solaire ?", [["Contrat solaire fictif.txt", "Puissance installée : 4,2 kWc."]]],
  ["Quel est le total de la facture du vélo ?", [["Facture vélo fictive.txt", "Montant total : 640 euros TTC."]]],
  ["Les deux copies indiquent-elles la même date ?", [["Garantie bassin A.txt", "Fin de garantie : 12 juin 2101."], ["Garantie bassin B.txt", "Fin de garantie : 12 juin 2101."]]]
];

const factMissing = [
  ["Combien a coûté l'installation de la pergola ?", [["Facture pergola fictive.txt", "Prestation réglée. Le montant n'est pas indiqué dans cette copie."]]],
  ["Quelle température maximale recommande cette notice ?", [["Notice spa fictive.txt", "Rincer le filtre tous les dix jours. Aucune température maximale n'est indiquée."]]],
  ["Quel est le numéro de série du chauffe-eau ?", [["Fiche chauffe-eau fictive.txt", "Modèle fictif : HX-4. Le numéro de série n'est pas fourni."]]],
  ["Quand expire le contrat de jardinage ?", [["Contrat jardinage fictif.txt", "Le contrat prévoit une visite mensuelle, sans date de fin indiquée."]]],
  ["Quelle est la référence de la pompe ?", [["Facture pompe fictive.txt", "Remplacement du joint effectué. Aucune référence de pompe n'est mentionnée."]]],
  ["Quel est le poids du vélo électrique ?", [["Notice vélo fictive.txt", "Autonomie annoncée : 45 km. Le poids n'est pas indiqué."]]],
  ["À quelle adresse se trouve le cabanon ?", [["Garantie cabanon fictive.txt", "Durée de garantie : cinq ans. Aucune adresse n'est inscrite."]]],
  ["Quel jour est prévu le départ en camping ?", [["Réservation camping fictive.txt", "Destination : Espagne. Les dates du séjour ne figurent pas dans cette copie."]]]
];

const noEvidence = [
  ["Où est la facture de mon voilier ?", [["Facture toiture fictive.txt", "Réparation d'une toiture pour 2 760 euros TTC."]]],
  ["Existe-t-il une facture pour la guitare ?", [["Facture lave-linge fictive.txt", "Montant total : 640 euros TTC."]]],
  ["Quelle est la référence du drone familial ?", [["Notice imprimante fictive.txt", "Remplacement de la cartouche d'encre."]]],
  ["Quand finit la garantie du réfrigérateur ?", [["Garantie abri fictive.txt", "Fin de garantie de l'abri : 30 avril 2102."]]],
  ["Quel est le montant de la réparation de la moto ?", [["Facture vélo fictive.txt", "Montant total : 640 euros TTC."]]],
  ["Quelle est la date de réservation du restaurant ?", [["Réservation camping fictive.txt", "Séjour prévu en Espagne."]]],
  ["Où se trouve le certificat de la montre ?", [["Certificat batterie fictif.txt", "Fin de couverture de la batterie : 12 février 2105."]]],
  ["Combien coûte la réparation de la cheminée ?", [["Facture portail fictive.txt", "Montant total : 1 200 euros TTC."]]]
];

const ambiguous = [
  ["Quel montant retenir ? Je n'ai pas choisi entre les deux copies.", [["Facture compte A fictive.txt", "Montant total : 100 euros."], ["Facture compte B fictive.txt", "Montant total : 200 euros."]]],
  ["Quelle est sa date de fin ?", [["Garantie portail fictive.txt", "Fin de garantie portail : 1 janvier 2101."], ["Garantie pompe fictive.txt", "Fin de garantie pompe : 1 janvier 2102."]]],
  ["Et l'autre, quel est son montant ?", [["Facture chaudière fictive.txt", "Montant total : 180 euros."], ["Facture vélo fictive.txt", "Montant total : 640 euros."]]],
  ["Quel document dois-je retenir pour le bassin ?", [["Copie locale bassin fictive.txt", "Volume : 20 m3."], ["Copie cloud bassin fictive.txt", "Volume : 24 m3."]]],
  ["Quelle garantie est concernée ?", [["Garantie portail fictive.txt", "Fin de garantie : 1 janvier 2101."], ["Garantie abri fictive.txt", "Fin de garantie : 30 avril 2102."]]],
  ["De quel équipement s'agit-il dans cette facture ?", [["Facture chaudière fictive.txt", "Entretien annuel effectué."], ["Facture pompe fictive.txt", "Remplacement du joint effectué."]]],
  ["Quel montant dois-je prendre ?", [["Devis toiture fictif.txt", "Montant estimé : 1 500 euros."], ["Devis terrasse fictif.txt", "Montant estimé : 2 100 euros."]]],
  ["À quelle date cela se termine ?", [["Contrat jardin fictif.txt", "Échéance : 1 juin 2101."], ["Garantie vélo fictive.txt", "Fin de garantie : 1 juin 2103."]]]
];

const conflicting = [
  ["Quelle date de fin de garantie du portail est indiquée ?", [["Garantie portail A.txt", "Fin de garantie : 3 mars 2104."], ["Garantie portail B.txt", "Fin de garantie : 3 mars 2105."]]],
  ["Quel total retenir pour les travaux du toit ?", [["Facture toiture A.txt", "Montant total : 2 760 euros TTC."], ["Facture toiture B.txt", "Montant total : 2 960 euros TTC."]]],
  ["Quelle date de séjour est confirmée ?", [["Réservation Espagne A.txt", "Séjour : 12 au 19 août 2101."], ["Réservation Espagne B.txt", "Séjour : 14 au 21 août 2101."]]],
  ["Quelle puissance est installée ?", [["Contrat solaire A.txt", "Puissance installée : 4,2 kWc."], ["Contrat solaire B.txt", "Puissance installée : 5,1 kWc."]]],
  ["Quel prix figure sur les copies du lave-linge ?", [["Facture lave-linge A.txt", "Montant total : 640 euros TTC."], ["Facture lave-linge B.txt", "Montant total : 690 euros TTC."]]],
  ["Quand finit la garantie de l'abri ?", [["Garantie abri A.txt", "Fin de garantie : 30 avril 2102."], ["Garantie abri B.txt", "Fin de garantie : 30 avril 2103."]]],
  ["Quelle référence de chaudière est correcte ?", [["Fiche chaudière A.txt", "Référence : CH-FICTIVE-427."], ["Fiche chaudière B.txt", "Référence : CH-FICTIVE-472."]]],
  ["Quel montant est indiqué pour l'installation de la pompe ?", [["Facture pompe A.txt", "Montant total : 1 800 euros TTC."], ["Facture pompe B.txt", "Montant total : 2 050 euros TTC."]]]
];

const expectedStatuses = {
  answerable: "answered",
  "fact-missing": "abstained",
  "no-evidence": "abstained",
  ambiguous: "clarification",
  conflicting: "conflict"
};

function makeCases(category, rows) {
  return rows.map(([question, passages], index) => {
    const id = `${category}-${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      category,
      expectedStatus: expectedStatuses[category],
      input: {
        question,
        history: [],
        evidence: passages.map(([name, text], passageIndex) => ({
          id: `${id}-p${passageIndex + 1}`,
          sourceId: "local",
          accountRef: null,
          itemId: `${id}-item-${passageIndex + 1}`,
          name,
          verified: true,
          text
        }))
      }
    };
  });
}

export const assistantResponseHoldout = {
  version: "1.0.0",
  synthetic: true,
  cases: [
    ...makeCases("answerable", answerable),
    ...makeCases("fact-missing", factMissing),
    ...makeCases("no-evidence", noEvidence),
    ...makeCases("ambiguous", ambiguous),
    ...makeCases("conflicting", conflicting)
  ]
};
