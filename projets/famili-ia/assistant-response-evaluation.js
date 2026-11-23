const statuses = ["answered", "abstained", "clarification", "conflict"];
const nonAnswerStatuses = new Set(["abstained", "clarification", "conflict"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStatus(output) {
  if (typeof output === "string") {
    try {
      output = JSON.parse(output);
    } catch {
      return null;
    }
  }
  return isObject(output) && statuses.includes(output.status) ? output.status : null;
}

export function validateAssistantResponseHoldout(corpus) {
  const categories = {
    answerable: "answered",
    "fact-missing": "abstained",
    "no-evidence": "abstained",
    ambiguous: "clarification",
    conflicting: "conflict"
  };
  if (!isObject(corpus) || corpus.version !== "1.0.0" || corpus.synthetic !== true ||
      !Array.isArray(corpus.cases) || corpus.cases.length < 40) {
    throw new TypeError("Le corpus décisionnel doit être synthétique, versionné et contenir au moins 40 cas.");
  }
  const counts = Object.fromEntries(Object.keys(categories).map(category => [category, 0]));
  const caseIds = new Set();
  for (const entry of corpus.cases) {
    if (!isObject(entry) || typeof entry.id !== "string" || !entry.id.trim() || caseIds.has(entry.id) ||
        !Object.hasOwn(categories, entry.category) || entry.expectedStatus !== categories[entry.category] ||
        !isObject(entry.input) || typeof entry.input.question !== "string" || !entry.input.question.trim() ||
        !Array.isArray(entry.input.evidence)) {
      throw new TypeError("Un cas décisionnel est absent, dupliqué ou mal annoté.");
    }
    caseIds.add(entry.id);
    counts[entry.category] += 1;
    const evidenceIds = new Set();
    for (const evidence of entry.input.evidence) {
      if (!isObject(evidence) || typeof evidence.id !== "string" || !evidence.id.trim() ||
          evidenceIds.has(evidence.id) || typeof evidence.verified !== "boolean" ||
          typeof evidence.name !== "string" || !evidence.name.trim() ||
          typeof evidence.text !== "string" || !evidence.text.trim()) {
        throw new TypeError(`Une pièce du cas "${entry.id}" est invalide.`);
      }
      evidenceIds.add(evidence.id);
    }
    const verifiedEvidence = entry.input.evidence.filter(evidence => evidence.verified);
    const minimumEvidence = ["ambiguous", "conflicting"].includes(entry.category) ? 2 : 1;
    if (verifiedEvidence.length < minimumEvidence) {
      throw new TypeError(`Le cas "${entry.id}" ne contient pas assez de pièces vérifiées.`);
    }
  }
  if (Object.values(counts).some(count => count < 8)) {
    throw new TypeError("Le corpus doit contenir au moins huit cas par catégorie décisionnelle.");
  }
  return { cases: corpus.cases.length, categories: counts };
}

export function validateAssistantResponseDevelopmentSet(corpus) {
  const categories = {
    answerable: "answered",
    "fact-missing": "abstained",
    "no-evidence": "abstained",
    ambiguous: "clarification",
    conflicting: "conflict"
  };
  if (!isObject(corpus) || corpus.version !== "1.0.0" || corpus.synthetic !== true ||
      typeof corpus.developmentSetId !== "string" || !corpus.developmentSetId.trim() ||
      !Array.isArray(corpus.cases) || corpus.cases.length < 12) {
    throw new TypeError("Le jeu de développement doit être synthétique, versionné et contenir au moins 12 cas.");
  }
  const counts = Object.fromEntries(Object.keys(categories).map(category => [category, 0]));
  const caseIds = new Set();
  for (const entry of corpus.cases) {
    if (!isObject(entry) || typeof entry.id !== "string" || !entry.id.trim() || caseIds.has(entry.id) ||
        !Object.hasOwn(categories, entry.category) || entry.expectedStatus !== categories[entry.category] ||
        !isObject(entry.input) || typeof entry.input.question !== "string" || !entry.input.question.trim() ||
        !Array.isArray(entry.input.evidence) || entry.input.evidence.length < 1 ||
        entry.input.evidence.length > 2 || typeof entry.reviewRubric !== "string" || !entry.reviewRubric.trim()) {
      throw new TypeError("Un cas du jeu de développement est absent, dupliqué ou mal annoté.");
    }
    caseIds.add(entry.id);
    counts[entry.category] += 1;
    const evidenceIds = new Set();
    for (const evidence of entry.input.evidence) {
      if (!isObject(evidence) || typeof evidence.id !== "string" || !evidence.id.trim() ||
          evidenceIds.has(evidence.id) || evidence.verified !== true ||
          typeof evidence.name !== "string" || !evidence.name.trim() ||
          typeof evidence.text !== "string" || !evidence.text.trim()) {
        throw new TypeError(`Une pièce du cas "${entry.id}" est invalide ou non vérifiée.`);
      }
      evidenceIds.add(evidence.id);
    }
    if (["ambiguous", "conflicting"].includes(entry.category) && evidenceIds.size < 2) {
      throw new TypeError(`Le cas "${entry.id}" exige deux pièces vérifiées.`);
    }
  }
  if (Object.values(counts).some(count => count === 0)) {
    throw new TypeError("Le jeu de développement doit couvrir les cinq catégories décisionnelles.");
  }
  return { developmentSetId: corpus.developmentSetId, cases: corpus.cases.length, categories: counts };
}

export function prepareAssistantResponseInputs(corpus) {
  validateAssistantResponseHoldout(corpus);
  return {
    corpusVersion: corpus.version,
    contract: "Assistant A2 JSON: status, answer, claims",
    cases: corpus.cases.map(entry => ({
      caseId: entry.id,
      input: {
        question: entry.input.question,
        history: entry.input.history,
        evidence: entry.input.evidence.filter(evidence => evidence.verified)
          .map(({ id, name, text }) => ({ id, name, text }))
      }
    }))
  };
}

function prepareLocalQwenInputs(corpus) {
  const cases = corpus.cases.map(entry => {
    const evidence = entry.input.evidence.filter(item => item.verified)
      .map(({ id, text }) => ({ id, text, verified: true }));
    if (evidence.length > 2) {
      throw new TypeError(`Le cas "${entry.id}" dépasse la limite de deux passages du client Qwen.`);
    }
    return {
      caseId: entry.id,
      input: { question: entry.input.question, evidence }
    };
  });
  return {
    datasetId: corpus.controlId ?? corpus.developmentSetId ?? null,
    corpusVersion: corpus.version,
    contract: "Local Qwen: question et un ou deux passages vérifiés, sans historique ni métadonnées",
    cases
  };
}

export function prepareLocalQwenResponseInputs(corpus) {
  validateAssistantResponseHoldout(corpus);
  return { ...prepareLocalQwenInputs(corpus), controlId: corpus.controlId ?? null };
}

export function prepareLocalQwenDevelopmentInputs(corpus) {
  validateAssistantResponseDevelopmentSet(corpus);
  return prepareLocalQwenInputs(corpus);
}

export function evaluateAssistantResponseDecisions(cases, observations) {
  if (!Array.isArray(cases) || !Array.isArray(observations)) {
    throw new TypeError("Les cas et observations de décision doivent être des tableaux.");
  }
  const caseById = new Map();
  for (const entry of cases) {
    if (!isObject(entry) || typeof entry.caseId !== "string" || !entry.caseId.trim() ||
        caseById.has(entry.caseId) || !statuses.includes(entry.expectedStatus)) {
      throw new TypeError("Un cas d'évaluation de décision est invalide ou dupliqué.");
    }
    caseById.set(entry.caseId, entry);
  }
  const outputById = new Map();
  for (const observation of observations) {
    const hasOutput = isObject(observation) && Object.hasOwn(observation, "output");
    const hasError = isObject(observation) && Object.hasOwn(observation, "error");
    if (!isObject(observation) || typeof observation.caseId !== "string" ||
        !caseById.has(observation.caseId) || outputById.has(observation.caseId) ||
        hasOutput === hasError ||
        (Object.hasOwn(observation, "error") && (typeof observation.error !== "string" || !observation.error.trim()))) {
      throw new TypeError("Une observation de décision est inconnue, dupliquée ou invalide.");
    }
    outputById.set(observation.caseId, Object.hasOwn(observation, "error")
      ? null
      : parseStatus(observation.output));
  }

  const matrix = Object.fromEntries(statuses.map(expected => [
    expected,
    Object.fromEntries([...statuses, "unavailable"].map(actual => [actual, 0]))
  ]));
  const categories = {};
  let exactMatches = 0;
  let nonAnswerExpected = 0;
  let exactNonAnswerMatches = 0;
  let safeNonAnswers = 0;
  let unsupportedAnswerCount = 0;
  let answerableNotAnsweredCount = 0;
  let unavailableCount = 0;

  for (const [caseId, entry] of caseById) {
    const actualStatus = outputById.get(caseId) ?? null;
    const expectedStatus = entry.expectedStatus;
    const actualBucket = actualStatus || "unavailable";
    matrix[expectedStatus][actualBucket] += 1;
    const exact = actualStatus === expectedStatus;
    if (exact) exactMatches += 1;
    const category = typeof entry.category === "string" ? entry.category : expectedStatus;
    categories[category] ??= { expected: 0, exactMatches: 0, unsupportedAnswers: 0, unavailable: 0 };
    categories[category].expected += 1;
    if (exact) categories[category].exactMatches += 1;
    if (!actualStatus) {
      unavailableCount += 1;
      categories[category].unavailable += 1;
    }
    if (expectedStatus === "answered" && actualStatus !== "answered") answerableNotAnsweredCount += 1;
    if (expectedStatus !== "answered") {
      nonAnswerExpected += 1;
      if (exact) exactNonAnswerMatches += 1;
      if (actualStatus && nonAnswerStatuses.has(actualStatus)) safeNonAnswers += 1;
      if (actualStatus === "answered") {
        unsupportedAnswerCount += 1;
        categories[category].unsupportedAnswers += 1;
      }
    }
  }

  const missingCount = [...caseById.keys()].filter(caseId => !outputById.has(caseId)).length;
  const exactDecisionAccuracy = caseById.size ? exactMatches / caseById.size : null;
  const exactNonAnswerDecisionRate = nonAnswerExpected ? exactNonAnswerMatches / nonAnswerExpected : null;
  const nonAnswerSafetyRate = nonAnswerExpected ? safeNonAnswers / nonAnswerExpected : null;
  return {
    eligible: caseById.size,
    submitted: outputById.size,
    missing: missingCount,
    unavailable: unavailableCount,
    exactDecisionAccuracy,
    exactNonAnswerDecisionRate,
    nonAnswerSafetyRate,
    unsupportedAnswerCount,
    answerableNotAnsweredCount,
    confusionMatrix: matrix,
    categories: Object.fromEntries(Object.entries(categories).map(([category, metrics]) => [
      category,
      {
        ...metrics,
        exactDecisionRate: metrics.expected ? metrics.exactMatches / metrics.expected : null
      }
    ])),
    decisionGate: {
      passes: caseById.size > 0 && missingCount === 0 && unavailableCount === 0 &&
        exactMatches === caseById.size,
      requirement: "100% exact response-status agreement, including non-answer cases"
    },
    semanticReviewRequired: true,
    citationReviewRequired: true,
    productionReady: false
  };
}
