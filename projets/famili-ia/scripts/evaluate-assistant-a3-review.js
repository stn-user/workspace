import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import {
  validateAssistantResponseHoldout
} from "../assistant-response-evaluation.js";
import { assistantResponseHoldout } from "../tests/assistant-response-holdout.js";

const protocolId = "A3-independent-annotation-review";
const protocolVersion = "1.0.0";
const statuses = new Set(["answered", "abstained", "clarification", "conflict"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function prepareReview() {
  validateAssistantResponseHoldout(assistantResponseHoldout);
  const shuffledCases = assistantResponseHoldout.cases
    .map(entry => ({
      entry,
      sortKey: createHash("sha256")
        .update(`Famili-IA:${protocolId}:${protocolVersion}:${entry.id}`)
        .digest("hex")
    }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  const mappings = [];
  const cases = shuffledCases.map(({ entry }, index) => {
    const reviewId = `review-${String(index + 1).padStart(3, "0")}`;
    mappings.push({ reviewId, sourceCaseId: entry.id });
    return {
      id: reviewId,
      input: {
        question: entry.input.question,
        history: Array.isArray(entry.input.history) ? entry.input.history : [],
        evidence: entry.input.evidence.filter(item => item.verified).map((item, evidenceIndex) => ({
          id: `${reviewId}-e${evidenceIndex + 1}`,
          name: item.name,
          text: item.text
        }))
      }
    };
  });
  const packetContent = {
    protocolId,
    protocolVersion,
    corpusVersion: assistantResponseHoldout.version,
    instructions: {
      purpose: "Réexaminer à l'aveugle la décision de réponse justifiée par chaque question et ses preuves.",
      rules: [
        "N'utiliser que la question, l'historique et les preuves présentées.",
        "Ne pas consulter les réponses du modèle, les annotations précédentes ni le dépôt du projet.",
        "Choisir un statut et motiver chaque décision à partir des preuves.",
        "Ne pas modifier les questions ou les preuves."
      ],
      statusDefinitions: {
        answered: "Les preuves pertinentes permettent de répondre directement.",
        abstained: "La preuve nécessaire manque ou aucune preuve pertinente ne permet de répondre.",
        clarification: "La question est trop imprécise pour choisir entre plusieurs interprétations ou éléments.",
        conflict: "La question est suffisamment précise, mais les preuves pertinentes se contredisent."
      }
    },
    cases
  };
  const packetFingerprint = hashJson(packetContent);
  const packet = {
    ...packetContent,
    packetFingerprint,
    review: {
      independentReviewConfirmed: false,
      candidateOutputsNotConsulted: false,
      assessments: cases.map(entry => ({
        caseId: entry.id,
        status: "",
        rationale: ""
      }))
    }
  };
  const key = {
    protocolId,
    protocolVersion,
    corpusVersion: assistantResponseHoldout.version,
    packetFingerprint,
    mappings
  };
  return { packet, key };
}

function readJson(path, label) {
  return readFile(path, "utf8").then(content => {
    try {
      return JSON.parse(content.replace(/^\uFEFF/, ""));
    } catch {
      throw new Error(`${label} JSON invalide.`);
    }
  });
}

function validateReview(document, key) {
  const isFullPacket = isObject(document) && isObject(document.review);
  const submittedReview = isFullPacket ? document.review : document;
  if (!isObject(key) || key.protocolId !== protocolId || key.protocolVersion !== protocolVersion ||
      key.corpusVersion !== assistantResponseHoldout.version || !Array.isArray(key.mappings) ||
      key.mappings.length !== assistantResponseHoldout.cases.length || !isObject(document) ||
      !isObject(submittedReview) ||
      (document.protocolId !== undefined && document.protocolId !== protocolId) ||
      (document.protocolVersion !== undefined && document.protocolVersion !== protocolVersion) ||
      (document.corpusVersion !== undefined && document.corpusVersion !== assistantResponseHoldout.version) ||
      (document.packetFingerprint !== undefined && document.packetFingerprint !== key.packetFingerprint) ||
      submittedReview.independentReviewConfirmed !== true ||
      submittedReview.candidateOutputsNotConsulted !== true ||
      !Array.isArray(submittedReview.assessments)) {
    throw new TypeError("Le paquet ou l'attestation de revue indépendante est invalide.");
  }
  if (isFullPacket) {
    const { packetFingerprint, review: ignoredReview, ...packetContent } = document;
    if (packetFingerprint !== key.packetFingerprint || document.protocolId !== protocolId ||
        document.protocolVersion !== protocolVersion || document.corpusVersion !== key.corpusVersion ||
        hashJson(packetContent) !== packetFingerprint) {
      throw new TypeError("Le contenu du paquet a changé depuis son export.");
    }
  }
  const mappingByReviewId = new Map();
  const sourceIds = new Set();
  for (const mapping of key.mappings) {
    if (!isObject(mapping) || typeof mapping.reviewId !== "string" ||
        typeof mapping.sourceCaseId !== "string" || mappingByReviewId.has(mapping.reviewId) ||
        sourceIds.has(mapping.sourceCaseId)) {
      throw new TypeError("La clé privée de revue est invalide.");
    }
    mappingByReviewId.set(mapping.reviewId, mapping.sourceCaseId);
    sourceIds.add(mapping.sourceCaseId);
  }
  const expectedCaseIds = new Set(assistantResponseHoldout.cases.map(entry => entry.id));
  if (sourceIds.size !== expectedCaseIds.size ||
      [...sourceIds].some(caseId => !expectedCaseIds.has(caseId))) {
    throw new TypeError("La clé privée ne correspond plus au corpus A3.");
  }
  const seenReviewIds = new Set();
  const expectedById = new Map(assistantResponseHoldout.cases.map(entry => [entry.id, entry.expectedStatus]));
  const disagreements = [];
  for (const assessment of submittedReview.assessments) {
    if (!isObject(assessment) || typeof assessment.caseId !== "string" ||
        !mappingByReviewId.has(assessment.caseId) || seenReviewIds.has(assessment.caseId) ||
        !statuses.has(assessment.status) || typeof assessment.rationale !== "string" ||
        !assessment.rationale.trim()) {
      throw new TypeError("Chaque cas doit recevoir un statut autorisé et une motivation non vide.");
    }
    seenReviewIds.add(assessment.caseId);
    const sourceCaseId = mappingByReviewId.get(assessment.caseId);
    const expectedStatus = expectedById.get(sourceCaseId);
    if (assessment.status !== expectedStatus) {
      disagreements.push({
        reviewId: assessment.caseId,
        sourceCaseId,
        expectedStatus,
        reviewedStatus: assessment.status,
        rationale: assessment.rationale.trim()
      });
    }
  }
  if (seenReviewIds.size !== mappingByReviewId.size) {
    throw new TypeError("La revue est incomplète : chaque cas doit être arbitré.");
  }
  return {
    protocolId,
    packetFingerprint: key.packetFingerprint,
    packetContentVerified: isFullPacket,
    packetBinding: isFullPacket
      ? "full-packet-fingerprint-verified"
      : document.packetFingerprint === key.packetFingerprint
        ? "fingerprint-declared-with-form-only"
        : "opaque-case-ids-only",
    reviewedCases: seenReviewIds.size,
    agreementCount: seenReviewIds.size - disagreements.length,
    disagreementCount: disagreements.length,
    disagreements,
    result: disagreements.length === 0 ? "annotations-confirmed-by-reviewer" : "adjudication-required",
    corpusModified: false,
    qwenRuns: 0
  };
}

async function main() {
  const args = process.argv.slice(2);
  validateAssistantResponseHoldout(assistantResponseHoldout);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({
      corpusVersion: assistantResponseHoldout.version,
      cases: assistantResponseHoldout.cases.length,
      modelRuns: 0,
      corpusModified: false
    }, null, 2));
    return;
  }
  if (args.length === 3 && args[0] === "export") {
    const { packet, key } = prepareReview();
    await writeFile(args[2], JSON.stringify(key, null, 2), { encoding: "utf8", flag: "wx" });
    await writeFile(args[1], JSON.stringify(packet, null, 2), { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({
      packetPath: args[1],
      privateKeyPath: args[2],
      packetFingerprint: packet.packetFingerprint,
      exportedCases: packet.cases.length,
      labelsIncluded: false,
      categoryBearingIdsIncluded: false,
      modelRuns: 0
    }, null, 2));
    return;
  }
  if (args.length === 3 && args[0] === "evaluate") {
    const [key, review] = await Promise.all([
      readJson(args[1], "Clé privée"),
      readJson(args[2], "Revue")
    ]);
    console.log(JSON.stringify(validateReview(review, key), null, 2));
    return;
  }
  throw new Error("Usage : node scripts\\evaluate-assistant-a3-review.js check | export <packet.json> <private-key.json> | evaluate <private-key.json> <review.json>");
}

main().catch(error => {
  console.error(`Revue indépendante A3 : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
  process.exitCode = 1;
});
