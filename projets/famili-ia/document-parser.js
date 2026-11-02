/**
 * Moteur d'analyse de documents (Document Parser)
 * Utilise une approche par détecteurs modulaires pour extraire des contextes structurés.
 */

// Schéma cible : DocumentContext
// @typedef {Object} DocumentContext ... (défini dans la documentation)

import { normalizeAlertDate } from "./alert-engine.js";

const extractDate = (text) => {
    // Regex générique pour formats DD/MM/YYYY ou YYYY-MM-DD
    const dateRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{4})|(\d{4}[\-\/]\d{2}[\-\/]\d{2})/g;
    const match = text.match(dateRegex);
    return match ? match[0] : null;
};

const extractExpiryDate = (text) => {
    const expiryLabels = /\b(fin de garantie|date d['’]?expiration|expiration|date d['’]?echeance|echeance|renouvellement|expire le|a regler avant|a payer avant|prochain entretien|entretien avant|controle avant|a effectuer avant)\b/;
    const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[a-zA-ZÀ-ÿ]+\s+\d{4})\b/i;

    for (const line of text.split(/\r?\n/)) {
        const normalizedLine = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
        if (!expiryLabels.test(normalizedLine)) continue;
        const match = line.match(datePattern);
        const expiryDate = match ? normalizeAlertDate(match[0]) : null;
        if (expiryDate) return { expiryDate, expiryDateEvidence: line.trim() };
    }

    return { expiryDate: null, expiryDateEvidence: null };
};

const extractAmount = (text) => {
    // Regex générique pour montants (ex: 123.45 ou 123,45)
    const amountRegex = /(\d+[\.,]\d{2})?\s?(€|EUR)/i;
    const match = text.match(amountRegex);
    return match && match[1] ? parseFloat(match[1].replace(',', '.')) : null;
};

const extractProvider = (text, providers) => {
    return providers.find(p => text.toLowerCase().includes(p.toLowerCase())) || null;
};

const normalizeForClassification = (text) => text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

const detectors = [
    {
        type: 'facture',
        keywords: ['facture', 'ttc', 'total', 'paiement', 'tva'],
        extract: (text) => ({
            amount: extractAmount(text),
            provider: extractProvider(text, ['EDF', 'Engie', 'Orange', 'SFR', 'Bouygues', 'Free']),
            ...extractExpiryDate(text),
            category: 'maison'
        })
    },
    {
        type: 'garantie',
        keywords: ['garantie', 'constructeur', 'panne', 'ans'],
        extract: (text) => ({
            ...extractExpiryDate(text),
            category: 'maison'
        })
    },
    {
        type: 'assurance',
        keywords: ['assurance', 'assureur', 'prime', 'renouvellement', 'habitation'],
        extract: (text) => ({
            ...extractExpiryDate(text),
            category: 'maison'
        })
    },
    {
        type: 'entretien',
        keywords: ['entretien', 'maintenance', 'controle', 'revision'],
        extract: (text) => ({
            ...extractExpiryDate(text),
            category: 'maison'
        })
    }
];

export function parseDocument(text, filename) {
    let bestDetector = null;
    let highestScore = 0;
    const normalizedText = normalizeForClassification(text);

    // 1. Calcul du score pour chaque détecteur
    detectors.forEach(detector => {
        let score = 0;
        detector.keywords.forEach(word => {
            if (normalizedText.includes(normalizeForClassification(word))) score++;
        });
        if (score > highestScore) {
            highestScore = score;
            bestDetector = detector;
        }
    });

    // 2. Extraction
    const context = {
        id: crypto.randomUUID(),
        originalName: filename,
        type: bestDetector ? bestDetector.type : 'autre',
        date: extractDate(text),
        expiryDate: null,
        amount: null,
        provider: null,
        category: 'autre',
        tags: [],
        isProactive: false
    };

    if (bestDetector) {
        Object.assign(context, bestDetector.extract(text));
    }

    return context;
}
