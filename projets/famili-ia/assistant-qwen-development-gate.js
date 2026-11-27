import { IndexSession } from "./index-session.js";
import { prepareAssistantContext, prepareLocalQwenEvidence } from "./assistant-context.js";
import { buildSearchResponse } from "./search-utils.js";
import { validateAssistantResponseHoldout } from "./assistant-response-evaluation.js";

const categories = new Set(["answerable", "fact-missing", "no-evidence", "ambiguous", "conflicting"]);
const localStatuses = new Set(["supported", "fact-not-found", "not-found", "ambiguous", "clarification", "stale"]);
const categoryStatuses = {
  answerable: new Set(["supported"]),
  "fact-missing": new Set(["fact-not-found"]),
  "no-evidence": new Set(["not-found", "fact-not-found"]),
  ambiguous: new Set(["ambiguous", "clarification"]),
  conflicting: new Set(["ambiguous", "clarification"])
};
const developmentCategories = ["answerable", "fact-missing", "no-evidence", "ambiguous", "conflicting"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateAssistantResponseQwenDevelopmentSet(corpus, {
  developmentSetId,
  minimumCases,
  categoryMinimum,
  exactCategoryCounts
}) {
  if (!isObject(corpus) || corpus.developmentSetId !== developmentSetId || corpus.version !== "1.0.0" ||
      corpus.synthetic !== true || !Array.isArray(corpus.cases) || corpus.cases.length < minimumCases) {
    throw new TypeError(`Le jeu ${developmentSetId} doit être synthétique, versionné et contenir au moins ${minimumCases} cas.`);
  }
  const caseIds = new Set();
  const categoryCounts = Object.fromEntries(developmentCategories.map(category => [category, 0]));
  for (const entry of corpus.cases) {
    if (!isObject(entry) || typeof entry.id !== "string" ||
        !new RegExp(`^${developmentSetId.toLowerCase()}-\\d{3}$`).test(entry.id) ||
        caseIds.has(entry.id) || !developmentCategories.includes(entry.category) ||
        !localStatuses.has(entry.expectedLocalStatus) || typeof entry.expectedQwenCall !== "boolean" ||
        !Array.isArray(entry.expectedFacts) ||
        !categoryStatuses[entry.category]?.has(entry.expectedLocalStatus) ||
        (entry.expectedQwenCall !== (entry.category === "answerable")) ||
        (entry.expectedQwenCall && !entry.expectedFacts.length) ||
        (!entry.expectedQwenCall && entry.expectedFacts.length !== 0) ||
        typeof entry.reviewRubric !== "string" || !entry.reviewRubric.trim() ||
        !isObject(entry.input) || typeof entry.input.question !== "string" || !entry.input.question.trim() ||
        !Array.isArray(entry.input.evidence) || entry.input.evidence.length < 1 || entry.input.evidence.length > 2) {
      throw new TypeError("Un cas D2 est absent, dupliqué ou mal annoté.");
    }
    caseIds.add(entry.id);
    categoryCounts[entry.category] += 1;
    const evidenceIds = new Set();
    for (const item of entry.input.evidence) {
      if (!isObject(item) || typeof item.id !== "string" || !item.id.trim() ||
          evidenceIds.has(item.id) || item.verified !== true ||
          typeof item.name !== "string" || !item.name.trim() ||
          typeof item.text !== "string" || !item.text.trim()) {
        throw new TypeError(`Une preuve D2 du cas "${entry.id}" est invalide.`);
      }
      evidenceIds.add(item.id);
    }
    if (["ambiguous", "conflicting"].includes(entry.category) && evidenceIds.size < 2) {
      throw new TypeError(`Le cas "${entry.id}" exige deux pièces vérifiées.`);
    }
  }
  if (exactCategoryCounts
      ? developmentCategories.some(category => categoryCounts[category] !== exactCategoryCounts[category])
      : Object.values(categoryCounts).some(count => count < categoryMinimum)) {
    throw new TypeError(`La répartition des catégories du jeu ${developmentSetId} est invalide.`);
  }
  return { developmentSetId: corpus.developmentSetId, cases: corpus.cases.length, categories: categoryCounts };
}

export function validateAssistantResponseQwenD2(corpus) {
  return validateAssistantResponseQwenDevelopmentSet(corpus, {
    developmentSetId: "D2",
    minimumCases: 15,
    categoryMinimum: 3
  });
}

export function validateAssistantResponseQwenD3(corpus) {
  return validateAssistantResponseQwenDevelopmentSet(corpus, {
    developmentSetId: "D3",
    minimumCases: 20,
    exactCategoryCounts: { answerable: 8, "fact-missing": 3, "no-evidence": 3, ambiguous: 3, conflicting: 3 }
  });
}

export function validateAssistantResponseQwenA5(corpus) {
  const summary = validateAssistantResponseHoldout(corpus);
  if (corpus.controlId !== "A5" || summary.cases !== 40 ||
      Object.values(summary.categories).some(count => count !== 8)) {
    throw new TypeError("Le contrôle A5 doit contenir exactement 40 cas, équilibrés en cinq catégories.");
  }
  const caseIds = new Set();
  for (const entry of corpus.cases) {
    if (!isObject(entry) || typeof entry.id !== "string" || !/^a5-\d{3}$/.test(entry.id) ||
        caseIds.has(entry.id) || !categories.has(entry.category) ||
        !localStatuses.has(entry.expectedLocalStatus) || typeof entry.expectedQwenCall !== "boolean" ||
        !Array.isArray(entry.expectedFacts) ||
        !categoryStatuses[entry.category]?.has(entry.expectedLocalStatus) ||
        entry.expectedQwenCall !== (entry.category === "answerable") ||
        (entry.expectedQwenCall && !entry.expectedFacts.length) ||
        (!entry.expectedQwenCall && entry.expectedFacts.length !== 0) ||
        typeof entry.reviewRubric !== "string" || !entry.reviewRubric.trim()) {
      throw new TypeError("Un cas A5 est absent, dupliqué ou mal annoté.");
    }
    caseIds.add(entry.id);
  }
  return { controlId: corpus.controlId, ...summary };
}

export function prepareAssistantQwenDevelopmentCase(entry) {
  if (!isObject(entry) || !isObject(entry.input) ||
      typeof entry.input.question !== "string" || !Array.isArray(entry.input.evidence)) {
    throw new TypeError("Cas invalide pour l'évaluation de la barrière Qwen.");
  }
  const documents = entry.input.evidence.map(item => ({
    id: item.id,
    name: item.name,
    content: `Document fictif\n${item.text}`,
    isLocal: true
  }));
  const session = new IndexSession();
  for (const document of documents) session.trustExtractedContent(document, [document.content]);
  const context = prepareAssistantContext({
    session,
    question: entry.input.question,
    documents
  });
  const response = context.status === "clarification" || context.status === "stale"
    ? { status: context.status, answer: context.clarification, matches: [], context }
    : {
      ...buildSearchResponse(context.matches),
      matches: context.matches.slice(0, 2),
      context
    };
  const qwenEvidence = prepareLocalQwenEvidence(response).map(({ id, text, verified }) => ({
    id,
    text,
    verified
  }));
  return {
    contextStatus: context.status,
    localStatus: response.status,
    localAnswer: response.answer,
    qwenEvidence
  };
}
