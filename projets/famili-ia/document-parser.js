/**
 * Moteur d'analyse de documents (Document Parser)
 * Utilise une approche par détecteurs modulaires pour extraire des contextes structurés.
 */

// Schéma cible : DocumentContext
// @typedef {Object} DocumentContext ... (défini dans la documentation)

const extractDate = (text) => {
    // Regex générique pour formats DD/MM/YYYY ou YYYY-MM-DD
    const dateRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{4})|(\d{4}[\-\/]\d{2}[\-\/]\d{2})/g;
    const match = text.match(dateRegex);
    return match ? match[0] : null;
};

const extractAmount = (text) => {
    // Regex générique pour montants (ex: 123.45 ou 123,45)
    const amountRegex = /(\d+[\.,]\d{2})?\s?(€|EUR)/i;
    const match = text.match(amountRegex);
    return match ? parseFloat(match[1].replace(',', '.')) : null;
};

const extractProvider = (text, providers) => {
    return providers.find(p => text.toLowerCase().includes(p.toLowerCase())) || null;
};

const detectors = [
    {
        type: 'facture',
        keywords: ['facture', 'ttc', 'total', 'paiement', 'tva'],
        matchScore: 0,
        extract: (text) => ({
            amount: extractAmount(text),
            provider: extractProvider(text, ['EDF', 'Engie', 'Orange', 'SFR', 'Bouygues', 'Free']),
            category: 'maison'
        })
    },
    {
        type: 'garantie',
        keywords: ['garantie', 'constructeur', 'panne', 'ans', 'contrat'],
        matchScore: 0,
        extract: (text) => ({
            expiryDate: extractDate(text),
            category: 'maison'
        })
    }
];

export function parseDocument(text, filename) {
    let bestDetector = null;
    let highestScore = 0;

    // 1. Calcul du score pour chaque détecteur
    detectors.forEach(detector => {
        let score = 0;
        detector.keywords.forEach(word => {
            if (text.toLowerCase().includes(word.toLowerCase())) score++;
        });
        detector.matchScore = score;
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
