import { documentIndexCorpus } from "./document-index-corpus.js";

export const qualityReferenceDate = "2027-01-01";

export const qualityDeadlineGold = [
  { sourceId: "local", itemId: "invoice-local", dueDate: "2027-03-04", excerpt: "À payer avant : 04/03/2027" },
  { sourceId: "local", itemId: "shared-item", dueDate: "2027-01-05", excerpt: "Fin de garantie : 05/01/2027" },
  { sourceId: "drive", itemId: "shared-item", dueDate: "2027-01-08", excerpt: "Fin de garantie : 08/01/2027" },
  { sourceId: "onedrive", itemId: "warranty-onedrive", dueDate: "2027-01-12", excerpt: "Fin de garantie : 12/01/2027" },
  { sourceId: "local", itemId: "estimated", dueDate: "2027-01-20",
    excerpt: "Date d'achat : 20/01/2026\nDurée de garantie : 1 an", estimated: true }
];

export const multiSourceQualityCorpus = [
  ...documentIndexCorpus,
  {
    id: "shared-item", source: "local", name: "annexe-locale.txt", method: "local-text",
    text: "Garantie\nCode fictif : MISTRAL\nFin de garantie : 05/01/2027"
  },
  {
    id: "shared-item", source: "drive", name: "annexe-distante.txt", method: "drive-text",
    text: "Garantie\nCode fictif : CEDRE\nFin de garantie : 08/01/2027"
  },
  {
    id: "warranty-onedrive", source: "onedrive", name: "annexe-cloud.txt", method: "onedrive-text",
    text: "Garantie constructeur\nRéférence fictive : LOTUS\nFin de garantie : 12/01/2027"
  },
  {
    id: "ambiguous", source: "onedrive", name: "garantie-ambigue.txt", method: "onedrive-text",
    text: "Garantie\nFin de garantie : 05/01/2027\nÉchéance : 06/01/2027",
    review: "ambiguë"
  },
  {
    id: "invalid-date", source: "drive", name: "garantie-invalide.txt", method: "drive-text",
    text: "Garantie\nÉchéance : 30/02/2027", review: "invalide"
  },
  {
    id: "estimated", source: "local", name: "certificat-estime.txt", method: "local-text",
    text: "Garantie\nDate d'achat : 20/01/2026\nDurée de garantie : 1 an"
  },
  {
    id: "negated", source: "onedrive", name: "note-sans-echeance.txt", method: "onedrive-text",
    text: "Aucune échéance : 05/01/2027", review: "ambiguë"
  },
  {
    id: "metadata", source: "onedrive", name: "contrat-metadonnees.txt", method: null,
    text: "Mot fictif non indexable : NECTAR", review: "Aucun texte extrait fiable"
  },
  {
    id: "tampered", source: "drive", name: "copie-alteree.txt", method: "drive-text",
    text: "Garantie\nMot fictif : SAFRAN\nÉchéance : 07/01/2027",
    changedText: "Garantie\nMot fictif : SAFRAN\nÉchéance : 09/01/2027", review: "Aucun texte extrait fiable"
  },
  {
    id: "corrected", source: "local", name: "date-corrigee.txt", method: "local-text",
    text: "Assurance\nÉchéance : 14/01/2027",
    document: {
      expiryDate: "2027-01-15", expiryDateSource: "user",
      expiryDateEvidence: "Échéance corrigée manuellement : 15/01/2027"
    },
    review: "déjà enregistrée"
  },
  {
    id: "annotated-photo", source: "onedrive", name: "souvenir.jpg", method: null, text: "",
    document: {
      type: "Image",
      photoAnnotations: {
        schemaVersion: 1, personIds: ["fictional-person"], eventTags: ["Vacances"],
        captureDateOverride: "2026-07-14", placeLabel: "Lyon", placeSource: "user", source: "user"
      }
    },
    review: "Aucun texte extrait fiable"
  }
];

export const qualitySearchCases = [
  { query: "MISTRAL", expected: [["local", "shared-item"]], proof: "MISTRAL" },
  { query: "CEDRE", expected: [["drive", "shared-item"]], proof: "CEDRE" },
  { query: "LOTUS", expected: [["onedrive", "warranty-onedrive"]], proof: "LOTUS" },
  { query: "code fictif", expected: [["local", "shared-item"], ["drive", "shared-item"]], proof: "Code fictif" },
  { query: "code fictif", filters: { sourceId: "drive" }, expected: [["drive", "shared-item"]], proof: "CEDRE" },
  { query: "124,50", expected: [["local", "invoice-local"]], proof: "124,50 EUR" },
  { query: "renouvellement", expected: [["onedrive", "insurance-onedrive"]], proof: "Renouvellement" },
  { query: "chaudière", expected: [["local", "maintenance-word"]], proof: "chaudière" },
  { query: "rendez-vous", expected: [["local", "unknown-date"]], proof: "Rendez-vous" },
  { query: "durée garantie", expected: [["local", "estimated"]], proof: "Durée de garantie" },
  { query: "NECTAR", expected: [] },
  { query: "SAFRAN", expected: [] },
  { query: "contrat-metadonnees", expected: [["onedrive", "metadata"]] },
  { query: "copie-alteree", expected: [["drive", "tampered"]] },
  { query: "", filters: { type: "photo", place: "Lyon", personId: "fictional-person" }, expected: [["onedrive", "annotated-photo"]] },
  { query: "", filters: { type: "photo", place: "Paris" }, expected: [] },
  { query: "", filters: { dateType: "echeance", dateFrom: "2027-01-01", dateTo: "2027-01-31" },
    expected: [["local", "shared-item"], ["drive", "shared-item"], ["onedrive", "warranty-onedrive"], ["local", "corrected"]] },
  { query: "ZXQ-INEXISTANT", expected: [] },
  {
    query: "chaudierre", expected: [["local", "maintenance-word"]],
    proof: "chaudière"
  },
  {
    query: "facture de la piscine", expected: [["local", "invoice-local"]],
    proof: "piscine"
  },
  {
    query: "Pompe de piscines",
    expected: [["local", "invoice-local"], ["drive", "warranty-drive"]],
    proof: "Pompe piscine"
  },
  {
    query: "Factures d'EDF de 124,50 EUR", expected: [["local", "invoice-local"]],
    proof: "124,50 EUR"
  },
  {
    query: "garanti constructeur lotus", expected: [["onedrive", "warranty-onedrive"]],
    proof: "Garantie constructeur"
  },
  {
    query: "renouvellment assurance habitation", expected: [["onedrive", "insurance-onedrive"]],
    proof: "Renouvellement"
  },
  {
    query: "Entretien de la chaudierre", expected: [["local", "maintenance-word"]],
    proof: "Entretien chaudière"
  },
  {
    query: "la de avec", expected: []
  },
  {
    query: "contrat à métadonnées", expected: [["onedrive", "metadata"]]
  },
  {
    query: "pompe piscine", filters: { sourceId: "drive" },
    expected: [["drive", "warranty-drive"]], proof: "Pompe piscine"
  },
  {
    query: "pompe piscine", filters: { sourceId: "onedrive" }, expected: []
  },
  {
    query: "assurance chaudière", expected: []
  },
  {
    query: "pompe piscini",
    expected: [["local", "invoice-local"], ["drive", "warranty-drive"]],
    proof: "Pompe piscine"
  },
  {
    query: "pompe pisicne", expected: []
  },
  {
    query: "pompe piscine", filters: { coverage: "metadata" }, expected: []
  },
  {
    query: "garantie", filters: {
      dateType: "echeance", dateFrom: "2027-01-01", dateTo: "2027-01-07"
    },
    expected: [["local", "shared-item"]]
  },
  {
    query: "124,50", filters: { sourceId: "drive" }, expected: []
  }
];
