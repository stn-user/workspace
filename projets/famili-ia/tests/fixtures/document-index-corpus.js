export const documentIndexCorpus = Object.freeze([
  {
    id: "invoice-local",
    source: "local",
    name: "facture-piscine.txt",
    method: "local-text",
    text: [
      "Facture EDF",
      "Équipement : Pompe piscine",
      "Date d'achat : 03/01/2025",
      "Total TTC : 124,50 EUR",
      "À payer avant : 04/03/2027"
    ].join("\n"),
    expected: {
      fields: { classification: "facture", category: "maison", provider: "EDF", amount: "124.50 EUR", equipment: "Pompe piscine" },
      dates: { achat: "2025-01-03", echeance: "2027-03-04" }
    }
  },
  {
    id: "warranty-drive",
    source: "drive",
    name: "garantie-pompe.pdf",
    method: "drive-pdf-text",
    text: "Garantie constructeur\nÉquipement : Pompe piscine\nFin de garantie : 05/06/2028",
    expected: {
      fields: { classification: "garantie", category: "maison", equipment: "Pompe piscine" },
      dates: { echeance: "2028-06-05" }
    }
  },
  {
    id: "insurance-onedrive",
    source: "onedrive",
    name: "assurance.txt",
    method: "onedrive-text",
    text: "Assurance habitation\nRenouvellement : 10/04/2027",
    expected: {
      fields: { classification: "assurance", category: "maison" },
      dates: { echeance: "2027-04-10" }
    }
  },
  {
    id: "maintenance-word",
    source: "local",
    name: "entretien.docx",
    method: "local-word",
    text: "Entretien chaudière\nProchain entretien avant : 12/11/2027",
    expected: {
      fields: { classification: "entretien", category: "maison" },
      dates: { echeance: "2027-11-12" }
    }
  },
  {
    id: "unknown-date",
    source: "local",
    name: "note.txt",
    method: "local-text",
    text: "Note familiale\nRendez-vous le 10/04/2027",
    expected: { fields: {}, dates: {} }
  },
  {
    id: "unverified-text",
    source: "local",
    name: "ancienne-facture.txt",
    method: null,
    text: "Facture EDF\nTotal TTC : 124,50 EUR\nÉchéance : 04/03/2027",
    expected: { fields: {}, dates: {}, coverage: "metadata" }
  },
  {
    id: "scanned-pdf-web",
    source: "local",
    name: "scan.pdf",
    method: null,
    text: "[Texte extrait impossible sans OCR mobile - PDF scanné]",
    expected: { fields: {}, dates: {}, coverage: "metadata" }
  }
]);
