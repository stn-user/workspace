const VALID_COVERAGE_LEVELS = Object.freeze(["unavailable", "metadata", "partial", "analyzed"]);

const COVERAGE_LABELS = Object.freeze({
  unavailable: "Non accessible",
  metadata: "Métadonnées seules",
  partial: "Contenu partiel",
  analyzed: "Contenu analysé"
});

export function isValidCoverageLevel(value) {
  return VALID_COVERAGE_LEVELS.includes(value);
}

export function getCoverageLabel(level) {
  if (!isValidCoverageLevel(level)) {
    throw new TypeError(`Niveau de couverture invalide. Niveaux valides : ${VALID_COVERAGE_LEVELS.join(", ")}`);
  }
  return COVERAGE_LABELS[level];
}

export function summarizeCoverage(levels) {
  if (!Array.isArray(levels)) {
    throw new TypeError("levels doit être un tableau");
  }

  for (const level of levels) {
    if (!isValidCoverageLevel(level)) {
      throw new TypeError(`Valeur invalide dans le tableau. Niveaux valides : ${VALID_COVERAGE_LEVELS.join(", ")}`);
    }
  }

  const summary = {
    total: 0,
    unavailable: 0,
    metadata: 0,
    partial: 0,
    analyzed: 0
  };

  for (const level of levels) {
    summary[level]++;
    summary.total++;
  }

  return summary;
}