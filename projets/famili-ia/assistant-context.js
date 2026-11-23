import { getInventoryAccountRef, getInventorySource } from "./data-inventory.js";
import { describeExperimentalResult } from "./experimental-result.js";
import { isPhotoDocument } from "./photo-annotations.js";
import {
  containsModelDirectedInstruction, detectQuestionIntent, extractExactFact, getExpandedTerms, getProvenance,
  getQuestionSubjectTerms
} from "./search-utils.js";

function documentKey(document) {
  return JSON.stringify([getInventorySource(document), getInventoryAccountRef(document), document.id]);
}

function matchKey(match) {
  return JSON.stringify([match.sourceId, match.accountRef, match.itemId]);
}

function snapshot(document) {
  return JSON.stringify([document.name, document.content ?? null, document.contentProvenance ?? null]);
}

function planQuestion(question) {
  const intent = detectQuestionIntent(question);
  const subject = getQuestionSubjectTerms(question)
    .filter(term => intent !== "date" || !["renouvelle", "renouveler"].includes(term));
  const query = subject.join(" ");
  if (!subject.length) return { intent, query, queries: [] };
  let queries = [""];
  for (const term of subject) {
    const alternatives = getExpandedTerms(term);
    // Refuse rather than silently dropping a subject or synonym combination.
    if (queries.length * alternatives.length > 32) return { intent, query, queries: [] };
    queries = queries.flatMap(prefix => alternatives.map(word => `${prefix} ${word}`.trim()));
  }
  return { intent, query, queries };
}

export function isAssistantMatchCurrent(match, documents, session) {
  const copies = documents.filter(document => documentKey(document) === matchKey(match));
  if (copies.length !== 1 || snapshot(copies[0]) !== match.snapshot) return false;
  const current = session.getAllContentDocs().find(document => matchKey(document) === matchKey(match));
  return Boolean(current && JSON.stringify(current.segments) === JSON.stringify(match.segments));
}

export function prepareAssistantContext({ session, question, documents, sourceStatuses = [], filters = {} }) {
  if (!session || typeof session.search !== "function" || typeof session.syncDocuments !== "function" ||
      typeof session.getRevision !== "function" ||
      typeof session.getAllRecords !== "function" || typeof session.getAllContentDocs !== "function" ||
      typeof question !== "string" || !question.trim() ||
      !Array.isArray(documents) || !Array.isArray(sourceStatuses)) {
    throw new TypeError("Contexte documentaire de l'assistant invalide.");
  }
  session.syncDocuments(documents);
  const plan = planQuestion(question);
  const scope = { corpusRevision: session.getRevision(), filters: { ...filters },
    sourceStatuses: sourceStatuses.map(status => ({ ...status })) };
  const context = { ...plan, scope, status: "ready", matches: [] };
  if (!plan.queries.length) {
    return { ...context, matches: [], status: "clarification",
      clarification: "Précisez le document ou l'équipement concerné avec quelques mots. Chaque question est indépendante." };
  }

  const records = session.getAllRecords();
  const contents = session.getAllContentDocs();
  const found = new Map();
  for (const query of plan.queries) {
    for (const match of session.search(query, filters)) {
      const previous = found.get(matchKey(match));
      if (previous) previous.reasons.push(...match.reasons);
      else found.set(matchKey(match), match);
    }
  }
  for (const [key, match] of found) {
    const copies = documents.filter(document => getInventorySource(document) !== "demo" && documentKey(document) === key);
    if (copies.length !== 1) {
      return { ...context, matches: [], status: "clarification",
        clarification: "Une source correspond à plusieurs copies ou n'est plus disponible. Vérifiez vos fichiers dans Recherche." };
    }
    const document = copies[0];
    const record = records.find(entry => matchKey(entry) === key);
    const content = contents.find(entry => matchKey(entry) === key);
    if (!record || !content || record.name?.value !== document.name) {
      return { ...context, matches: [], status: "stale", clarification: "L'index a changé. Relancez la question pour actualiser les sources." };
    }
    if (isPhotoDocument(document) && !content.segments.length) continue;
    const segments = [...content.segments];
    // Only the session's verified segments are eligible, never document.content.
    const lines = segments.flatMap(segment => segment.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
    const exactFact = extractExactFact(question, lines);
    const excerpt = match.reasons.find(reason => reason.location === "content")?.proof?.excerpt;
    const evidence = exactFact || (excerpt && !containsModelDirectedInstruction(excerpt) &&
      segments.some(segment => segment.includes(excerpt)) ? excerpt : null);
    const access = sourceStatuses.find(status =>
      status.sourceId === match.sourceId && status.accountRef === match.accountRef)?.access;
    const description = describeExperimentalResult(match, record, document, access);
    context.matches.push({
      ...match, document, intent: plan.intent, exactFact, evidence, segments,
      snapshot: snapshot(document),
      revision: document.contentProvenance?.hash ?? null,
      provenance: `${getProvenance(document)} · ${description.coverageLabel} · dernier contrôle de la source : ${record.lastCheck ?? "inconnu"}`,
      answerStatus: plan.intent && !exactFact ? "fact-not-found" : "supported",
      ambiguous: false
    });
  }
  if (!context.matches.length) return { ...context, status: "no-evidence" };
  const facts = context.matches.filter(match => match.exactFact);
  const conflicting = facts.find(match => match.exactFact !== facts[0].exactFact);
  if (conflicting) {
    for (const match of facts) {
      match.ambiguous = true;
      match.answerStatus = "ambiguous";
    }
    // Both sides must remain visible when the UI shows only two sources.
    facts.splice(facts.indexOf(conflicting), 1);
    facts.splice(1, 0, conflicting);
  }
  // Select factual evidence for the answer without introducing a document ranker.
  context.matches = [...facts, ...context.matches.filter(match => !match.exactFact)];
  return context;
}

export function prepareLocalQwenEvidence(response) {
  if (!response || !Array.isArray(response.matches)) {
    throw new TypeError("Réponse locale invalide pour la préparation des faits Qwen.");
  }
  if (!response.context) return [];
  if (!Array.isArray(response.context.matches)) {
    throw new TypeError("Contexte local invalide pour la préparation des faits Qwen.");
  }
  if (response.context.status !== "ready" || response.status !== "supported" ||
      response.context.matches.some(match => match.ambiguous)) return [];
  return response.matches
    .filter(match => match && typeof match.exactFact === "string" && match.exactFact.trim() && !match.ambiguous)
    .slice(0, 2)
    .map((match, index) => ({
      id: `evidence-${index + 1}`,
      text: match.exactFact,
      verified: true,
      match
    }));
}
