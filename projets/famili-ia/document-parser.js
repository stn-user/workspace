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
    const expiryLabels = /\b(?:fin de (?:la )?garantie|date d['’]?expiration|expiration|date d['’]?echeance|echeance|renouvellement|expire le|a regler avant|a payer avant|prochain entretien|entretien avant|controle avant|a effectuer avant)\b/g;
    const expiryDatePattern = /\b(?:fin de (?:la )?garantie|date d['’]?expiration|expiration|date d['’]?echeance|echeance|renouvellement|expire le|a regler avant|a payer avant|prochain entretien|entretien avant|controle avant|a effectuer avant)\b\s*(?::|au|le)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[a-zA-Z]+\s+\d{4})\s*[.!]?\s*$/i;
    const negatedExpiryLabel = /\b(?:pas d['’]?(?:echeance|expiration)|pas de fin de (?:la )?garantie|aucun[e]?\s+(?:echeance|expiration|fin de (?:la )?garantie))\b/;
    let candidate = null;

    for (const line of text.split(/\r?\n/)) {
        const normalizedLine = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
        const labels = [...normalizedLine.matchAll(expiryLabels)];
        if (!labels.length) continue;
        if (labels.length !== 1 || negatedExpiryLabel.test(normalizedLine)) {
            return { expiryDate: null, expiryDateEvidence: null };
        }
        const match = normalizedLine.match(expiryDatePattern);
        const expiryDate = match ? normalizeAlertDate(match[1]) : null;
        if (!expiryDate || candidate) return { expiryDate: null, expiryDateEvidence: null };
        candidate = { expiryDate, expiryDateEvidence: line.trim() };
    }

    return candidate || { expiryDate: null, expiryDateEvidence: null };
};

const extractAmount = (text) => {
    // Regex générique pour montants (ex: 123.45 ou 123,45)
    const amountRegex = /(\d+[\.,]\d{2})?\s?(€|EUR)/i;
    const match = text.match(amountRegex);
    return match && match[1] ? parseFloat(match[1].replace(',', '.')) : null;
};

const findEvidenceLine = (text, predicate) => {
    const lines = text.split(/\r?\n/);
    const index = lines.findIndex(predicate);
    return index < 0 ? null : { excerpt: lines[index].trim(), location: `ligne ${index + 1}` };
};

const extractLabeledDates = (text) => {
    const labels = {
        creation: /\b(date de creation|date facture|emise le|emis le)\b/,
        modification: /\b(date de modification|modifie le|mise a jour le|mis a jour le)\b/,
        achat: /\b(date d'achat|date achat|achete le|achetee le|acquis le)\b/
    };
    const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{1,2}\s+[a-zA-ZÀ-ÿ]+\s+\d{4})\b/i;
    const facts = {};

    for (const [type, pattern] of Object.entries(labels)) {
        for (const [index, line] of text.split(/\r?\n/).entries()) {
            const normalizedLine = normalizeForClassification(line);
            if (!pattern.test(normalizedLine)) continue;
            const match = line.match(datePattern);
            const value = match && normalizeAlertDate(match[0]);
            if (!value) continue;
            facts[type] = { value, proof: { excerpt: line.trim(), location: `ligne ${index + 1}` } };
            break;
        }
    }
    return facts;
};

const extractLabeledEquipment = (text) => {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
        const match = line.match(/^\s*(?:équipement|appareil|matériel)\s*[:\-]\s*(.+?)\s*$/i);
        const value = match?.[1]?.trim();
        if (value && value.length <= 180) {
            return { value, proof: { excerpt: line.trim(), location: `ligne ${index + 1}` } };
        }
    }
    return null;
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
        typeEvidence: bestDetector ? findEvidenceLine(text, line =>
            bestDetector.keywords.some(word => normalizeForClassification(line).includes(normalizeForClassification(word)))
        ) : null,
        date: extractDate(text),
        dateFacts: extractLabeledDates(text),
        equipment: extractLabeledEquipment(text),
        expiryDate: null,
        amount: null,
        amountEvidence: null,
        provider: null,
        providerEvidence: null,
        category: 'autre',
        tags: [],
        isProactive: false
    };

    if (bestDetector) {
        Object.assign(context, bestDetector.extract(text));
        if (context.amount !== null) {
            context.amountEvidence = findEvidenceLine(text, line => /(?:\d+[\.,]\d{2})?\s?(?:€|EUR)/i.test(line));
        }
        if (context.provider) {
            const provider = normalizeForClassification(context.provider);
            context.providerEvidence = findEvidenceLine(text, line => normalizeForClassification(line).includes(provider));
        }
    }

    return context;
}
