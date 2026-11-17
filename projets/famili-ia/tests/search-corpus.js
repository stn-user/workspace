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
