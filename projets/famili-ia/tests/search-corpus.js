import { readFile } from "node:fs/promises";

const loadSample = name => readFile(new URL(`../samples/${name}`, import.meta.url), "utf8");

export async function loadSearchCorpus() {
  const [poolInvoice, pumpWarranty, filterNotice] = await Promise.all([
    loadSample("facture-piscine.txt"),
    loadSample("garantie-pompe.txt"),
    loadSample("notice-filtre.txt")
  ]);

  return [
    {
      id: "pool-installation-invoice",
      name: "Facture installation piscine.txt",
      type: "Facture",
      date: "Date fictive : 1 janvier 2099",
      keywords: "piscine installation achat",
      content: poolInvoice,
      isLocal: true
    },
    {
      id: "pump-warranty",
      name: "Garantie pompe piscine.txt",
      type: "Garantie",
      date: "Date fictive : 1 janvier 2099",
      keywords: "garantie pompe couverture",
      content: pumpWarranty,
      isLocal: true
    },
    {
      id: "filter-maintenance",
      name: "Notice entretien filtre.txt",
      type: "Notice",
      date: "Date fictive : 1 janvier 2099",
      keywords: "filtre piscine entretien maintenance rincage",
      content: filterNotice,
      isLocal: true
    },
    {
      id: "home-insurance",
      name: "Contrat assurance habitation.txt",
      type: "Contrat",
      date: "Date fictive : 1 janvier 2099",
      keywords: "assurance habitation renouvellement reconduction",
      content: "EXEMPLE FICTIF — CONTRAT HABITATION\nÉchéance annuelle : 31 décembre 2099\nReconduction : donnée fictive.",
      isLocal: true
    },
    {
      id: "pool-terrace-invoice",
      name: "Facture terrasse piscine.txt",
      type: "Facture",
      date: "Date fictive : 1 janvier 2099",
      keywords: "piscine terrasse achat",
      content: "EXEMPLE FICTIF — AMÉNAGEMENT DE BASSIN\nMontant total : 1 200 euros TTC\nToutes les données de ce scénario sont inventées.",
      isLocal: true
    },
    {
      id: "pool-unknown-amount-invoice",
      name: "Facture piscine sans montant.txt",
      type: "Facture",
      keywords: "piscine travaux",
      content: "FACTURE FICTIVE — TRAVAUX PISCINE\nStatut : réglée.\nLe montant n'est pas indiqué dans ce document.",
      isLocal: true
    },
    {
      id: "electric-car-invoice",
      name: "Facture vélo électrique.txt",
      type: "Facture",
      keywords: "vélo électrique mobilité achat",
      content: "FACTURE FICTIVE — VELO ELECTRIQUE\nMontant total : 2 000 euros TTC.",
      isLocal: true
    },
    {
      id: "boiler-service-invoice",
      name: "Facture entretien chaudière.txt",
      type: "Facture",
      keywords: "chaudière chauffage entretien dépannage maintenance",
      content: "EXEMPLE FICTIF — FACTURE ENTRETIEN CHAUDIÈRE\nPrestation : entretien annuel et dépannage du brûleur.\nMontant total : 180 euros TTC.\nDate de visite : 10 octobre 2100.",
      isLocal: true
    },
    {
      id: "boiler-installation-invoice",
      name: "Facture installation chaudière.txt",
      type: "Facture",
      keywords: "chaudière chauffage installation équipement",
      content: "EXEMPLE FICTIF — INSTALLATION CHAUDIÈRE\nPrestation : fourniture et pose d'une chaudière.\nMontant total : 4 800 euros TTC.\nDate : 15 juin 2100.",
      isLocal: true
    },
    {
      id: "heat-pump-manual",
      name: "Notice pompe à chaleur.txt",
      type: "Notice",
      keywords: "pompe chaleur filtre entretien climatisation",
      content: "EXEMPLE FICTIF — NOTICE POMPE À CHALEUR\nNettoyage du filtre : tous les trois mois.\nCouper l'alimentation avant entretien.",
      isLocal: true
    },
    {
      id: "water-heater-warranty",
      name: "Garantie chauffe-eau.txt",
      type: "Garantie",
      keywords: "chauffe-eau ballon eau chaude garantie",
      content: "EXEMPLE FICTIF — GARANTIE CHAUFFE-EAU\nFin de garantie : 15 juillet 2103.\nLa cuve seule est couverte.",
      isLocal: true
    },
    {
      id: "roof-repair-invoice",
      name: "Facture réparation toiture.txt",
      type: "Facture",
      keywords: "toiture toit réparation infiltration",
      content: "EXEMPLE FICTIF — RÉPARATION TOITURE\nIntervention : réparation d'une infiltration sur le toit.\nMontant total : 3 450 euros TTC.",
      isLocal: true
    },
    {
      id: "garden-shed-warranty",
      name: "Garantie abri de jardin.txt",
      type: "Garantie",
      keywords: "abri jardin cabanon remise garantie",
      content: "EXEMPLE FICTIF — GARANTIE ABRI DE JARDIN\nFin de garantie : 30 avril 2102.\nDurée de garantie : 5 ans.",
      isLocal: true
    },
    {
      id: "solar-installation-contract",
      name: "Contrat panneaux solaires.txt",
      type: "Contrat",
      keywords: "panneaux solaires photovoltaïque énergie installation",
      content: "EXEMPLE FICTIF — PANNEAUX SOLAIRES\nPuissance installée : 6 kWc.\nDate de mise en service : 8 mars 2100.",
      isLocal: true
    },
    {
      id: "camping-reservation",
      name: "Réservation camping Espagne.txt",
      type: "Réservation",
      date: "Date fictive : 1 janvier 2099",
      keywords: "camping vacances voyage Espagne séjour",
      content: "EXEMPLE FICTIF — RÉSERVATION CAMPING\nSéjour : 12 au 19 août 2101.\nDestination : Espagne.",
      isLocal: true
    },
    {
      id: "electric-bike-warranty",
      name: "Garantie vélo électrique.txt",
      type: "Garantie",
      keywords: "vélo électrique batterie moteur garantie",
      content: "EXEMPLE FICTIF — GARANTIE VÉLO ÉLECTRIQUE\nFin de garantie : 15 septembre 2104.\nLa batterie est couverte pendant deux ans.",
      isLocal: true
    },
    {
      id: "plumbing-invoice",
      name: "Facture plombier évier.txt",
      type: "Facture",
      keywords: "plomberie évier fuite robinet dépannage",
      content: "EXEMPLE FICTIF — INTERVENTION PLOMBERIE\nRéparation d'une fuite sous évier.\nMontant total : 320 euros TTC.",
      isLocal: true
    }
  ];
}

export const searchEvaluationCases = [
  {
    query: "Combien ai-je payé pour l'installation de la piscine ?",
    expectedIds: ["pool-installation-invoice"],
    expectedFact: "Montant total : 8 900 euros TTC"
  },
  {
    query: "Jusqu'à quand la pompe piscine est-elle garantie ?",
    expectedIds: ["pump-warranty"],
    expectedFact: "Fin de garantie : 1 janvier 2104"
  },
  {
    query: "garentie de la pompe du bassin",
    expectedIds: ["pump-warranty"]
  },
  {
    query: "Quand renouvelle mon assurance habitation ?",
    expectedIds: ["home-insurance"],
    expectedFact: "Échéance annuelle : 31 décembre 2099"
  },
  {
    query: "À quelle fréquence rincer le filtre de la piscine ?",
    expectedIds: ["filter-maintenance"],
    expectedFact: "Frequence de rincage recommandee : toutes les deux semaines en periode d'utilisation."
  },
  {
    query: "Quel montant ai-je payé pour la piscine ?",
    expectedIds: ["pool-installation-invoice", "pool-terrace-invoice"],
    expectedFact: null,
    expectedStatus: "ambiguous"
  },
  {
    query: "Quel est le montant total ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Combien ai-je payé pour mon vélo électrique ?",
    expectedIds: ["electric-car-invoice"],
    expectedFact: "Montant total : 2 000 euros TTC."
  },
  {
    query: "Où est la facture de mon bateau ?",
    expectedIds: [],
    expectedFact: null
  }
];

export const expandedSearchEvaluationCases = [
  ...searchEvaluationCases,
  {
    query: "Quel montant a coûté l'entretien annuel de la chaudière ?",
    expectedIds: ["boiler-service-invoice"]
  },
  {
    query: "Combien coûte l'installation d'une chaudière ?",
    expectedIds: ["boiler-installation-invoice"]
  },
  {
    query: "À quelle fréquence nettoyer le filtre de la pompe à chaleur ?",
    expectedIds: ["heat-pump-manual"]
  },
  {
    query: "Jusqu'à quand la garantie du ballon d'eau chaude est-elle valable ?",
    expectedIds: ["water-heater-warranty"]
  },
  {
    query: "Quel montant pour la réparation de la toiture ?",
    expectedIds: ["roof-repair-invoice"]
  },
  {
    query: "Quelle est la date de garantie de l'abri de jardin ?",
    expectedIds: ["garden-shed-warranty"]
  },
  {
    query: "Quelle puissance ont les panneaux photovoltaïques installés ?",
    expectedIds: ["solar-installation-contract"]
  },
  {
    query: "Quelles sont les dates du séjour de camping en Espagne ?",
    expectedIds: ["camping-reservation"]
  },
  {
    query: "La batterie du vélo électrique est-elle couverte par la garantie ?",
    expectedIds: ["electric-bike-warranty"]
  },
  {
    query: "Combien a coûté la réparation de la fuite sous l'évier ?",
    expectedIds: ["plumbing-invoice"]
  },
  {
    query: "Tarif de l'entretien de la chaudière",
    expectedIds: ["boiler-service-invoice"]
  },
  {
    query: "Montant total des travaux de toiture",
    expectedIds: ["roof-repair-invoice"]
  },
  {
    query: "Quand expire la couverture du chauffe eau ?",
    expectedIds: ["water-heater-warranty"]
  },
  {
    query: "Destination de la réservation de vacances en Espagne",
    expectedIds: ["camping-reservation"]
  },
  {
    query: "Quel est le montant de la facture chaudière ?",
    expectedIds: ["boiler-service-invoice", "boiler-installation-invoice"],
    expectedFact: null,
    expectedStatus: "ambiguous"
  },
  {
    query: "Quel est le prix du bateau ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Où trouver la facture de la tondeuse à gazon ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Quand part-on en croisière au Japon ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Quelle est la référence du drone familial ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Existe-t-il une facture pour la pompe à chaleur ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Quel est le montant de la facture du bateau ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Quand finit la garantie du réfrigérateur ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Combien coûte la tondeuse à gazon ?",
    expectedIds: [],
    expectedFact: null
  },
  {
    query: "Combien a coûté le chauffe-eau ?",
    expectedIds: ["water-heater-warranty"],
    expectedFact: null
  },
  {
    query: "Quel montant a coûté l'installation des panneaux solaires ?",
    expectedIds: ["solar-installation-contract"],
    expectedFact: null
  }
];
