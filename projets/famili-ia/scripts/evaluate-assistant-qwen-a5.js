import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import {
  LOCAL_QWEN_MODEL,
  LOCAL_QWEN_OPTIONS,
  LOCAL_QWEN_PROMPT_VERSION,
  requestLocalQwenRawOutput,
  validateLocalQwenOutput
} from "../assistant-local-qwen.js";
import {
  prepareAssistantQwenDevelopmentCase,
  validateAssistantResponseQwenA5
} from "../assistant-qwen-development-gate.js";
import { assistantResponseHoldoutA5 } from "../tests/assistant-response-holdout-a5.js";

const endpoint = "http://127.0.0.1:11434";
const campaignClosed = true;
const reviewProtocolId = "A5-independent-semantic-review";
const reviewProtocolVersion = "1.0.0";
const reviewVerdicts = new Set(["pass", "fail"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readJson(path, label = "Fichier") {
  const content = await readFile(path, "utf8");
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${label} JSON invalide ; aucun contenu n'a été affiché.`);
  }
}

async function getOllamaJson(path) {
  let response;
  try {
    response = await fetch(`${endpoint}${path}`, { signal: AbortSignal.timeout(5_000) });
  } catch (error) {
    if (error instanceof TypeError || error?.name === "TimeoutError") {
      throw new Error("Ollama local est inaccessible ou ne répond pas à temps.");
    }
    throw error;
  }
  if (!response.ok) throw new Error(`Ollama local a répondu HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error("Ollama local a renvoyé un JSON invalide.");
  }
}

function expectedCases() {
  return assistantResponseHoldoutA5.cases.map(entry => ({
    ...entry,
    prepared: prepareAssistantQwenDevelopmentCase(entry)
  }));
}

function validateA5Run(run) {
  if (!isObject(run) || run.controlId !== assistantResponseHoldoutA5.controlId ||
      run.corpusVersion !== assistantResponseHoldoutA5.version ||
      run.promptVersion !== LOCAL_QWEN_PROMPT_VERSION ||
      !isObject(run.candidate) || run.candidate.model !== LOCAL_QWEN_MODEL ||
      typeof run.candidate.digest !== "string" || !run.candidate.digest ||
      !Array.isArray(run.observations)) {
    throw new Error("Campagne incompatible avec le contrôle A5 ou le prompt figé.");
  }
}

export function buildA5Report(run) {
  validateA5Run(run);
  const cases = expectedCases();
  const casesById = new Map(cases.map(entry => [entry.id, entry]));
  const observationsById = new Map();
  for (const observation of run.observations) {
    if (!isObject(observation) || typeof observation.caseId !== "string" ||
        !casesById.has(observation.caseId) || observationsById.has(observation.caseId)) {
      throw new TypeError("Une observation A5 est inconnue ou dupliquée.");
    }
    observationsById.set(observation.caseId, observation);
  }

  const gateMismatches = new Set();
  const localStatusMismatches = [];
  const validationErrors = [];
  const unavailable = [];
  let expectedCalls = 0;
  let actualCalls = 0;
  let validModelOutputs = 0;
  let exactModelStatuses = 0;
  let modelStatusFailures = 0;
  let suppressedUnexpectedCalls = 0;

  for (const entry of cases) {
    if (entry.expectedQwenCall) expectedCalls += 1;
    const observation = observationsById.get(entry.id);
    if (!observation) continue;
    const gate = entry.prepared.qwenEvidence.length > 0 ? "call" : "blocked";
    if (observation.gate !== gate ||
        JSON.stringify(observation.gateEvidence) !== JSON.stringify(entry.prepared.qwenEvidence) ||
        (gate === "call") !== entry.expectedQwenCall) {
      gateMismatches.add(entry.id);
    }
    if (observation.localStatus !== entry.expectedLocalStatus) localStatusMismatches.push(entry.id);
    if (observation.modelInvoked) {
      actualCalls += 1;
      if (!entry.expectedQwenCall || gate !== "call" ||
          JSON.stringify(observation.sentEvidence) !== JSON.stringify(entry.prepared.qwenEvidence)) {
        validationErrors.push({ caseId: entry.id, error: "L'entrée envoyée dépasse la barrière A5 attendue." });
        continue;
      }
      if (typeof observation.error === "string") {
        unavailable.push(entry.id);
        continue;
      }
      if (!Object.hasOwn(observation, "output")) {
        validationErrors.push({ caseId: entry.id, error: "Sortie brute absente après appel déclaré." });
        continue;
      }
      try {
        const output = validateLocalQwenOutput(observation.output, observation.sentEvidence);
        validModelOutputs += 1;
        if (output.status === entry.expectedStatus) exactModelStatuses += 1;
        else modelStatusFailures += 1;
      } catch (error) {
        validationErrors.push({
          caseId: entry.id,
          error: error instanceof Error ? error.message : "Réponse Qwen invalide."
        });
      }
    } else if (entry.expectedQwenCall && gate === "call") {
      unavailable.push(entry.id);
    } else if (gate === "call" && !entry.expectedQwenCall) {
      if (observation.modelCallSuppressed === true) suppressedUnexpectedCalls += 1;
      else validationErrors.push({
        caseId: entry.id,
        error: "Un appel non prévu n'a pas été neutralisé par le runner A5."
      });
    }
  }

  const missing = cases.filter(entry => !observationsById.has(entry.id)).map(entry => entry.id);
  const compared = cases.length - missing.length;
  const exactGateAgreement = compared
    ? 1 - gateMismatches.size / compared
    : null;
  const exactLocalStatusAgreement = compared
    ? 1 - localStatusMismatches.length / compared
    : null;
  const exactModelStatusRate = validModelOutputs
    ? exactModelStatuses / validModelOutputs
    : null;
  const passes = compared === cases.length && missing.length === 0 &&
    gateMismatches.size === 0 && localStatusMismatches.length === 0 &&
    unavailable.length === 0 && validationErrors.length === 0 &&
    validModelOutputs === expectedCalls && modelStatusFailures === 0;

  return {
    controlId: assistantResponseHoldoutA5.controlId,
    corpusVersion: assistantResponseHoldoutA5.version,
    promptVersion: run.promptVersion,
    candidate: run.candidate,
    eligible: cases.length,
    submitted: observationsById.size,
    missing,
    expectedCalls,
    actualCalls,
    suppressedUnexpectedCalls,
    exactGateAgreement,
    exactLocalStatusAgreement,
    modelOutputs: validModelOutputs,
    exactModelStatusRate,
    modelStatusFailures,
    gateMismatches: [...gateMismatches],
    localStatusMismatches,
    unavailable,
    responseValidationFailures: validationErrors.length,
    validationErrors,
    strictGate: {
      passes,
      requirement: "Accord exact sur les 40 décisions locales et la barrière ; seules les 8 réponses admissibles sont validées.",
      semanticReviewRequired: true,
      productionReady: false
    }
  };
}

function parseCandidateOutput(observation) {
  if (!observation.modelInvoked) {
    if (typeof observation.localAnswer !== "string" || !observation.localAnswer.trim()) {
      throw new TypeError(`Réponse locale absente pour ${observation.caseId}.`);
    }
    return { answer: observation.localAnswer, claims: [] };
  }
  if (typeof observation.output !== "string") {
    throw new TypeError(`Sortie Qwen absente pour ${observation.caseId}.`);
  }
  let output;
  try {
    output = JSON.parse(observation.output);
  } catch {
    return { rawText: observation.output };
  }
  if (!isObject(output)) return { rawText: observation.output };
  return {
    answer: typeof output.answer === "string" ? output.answer : "",
    claims: Array.isArray(output.claims) ? output.claims : []
  };
}

export function prepareA5Review(run) {
  validateA5Run(run);
  const report = buildA5Report(run);
  if (report.missing.length) {
    throw new Error("La revue A5 exige une observation pour chacun des 40 cas.");
  }
  const observationsById = new Map(run.observations.map(item => [item.caseId, item]));
  const cases = expectedCases();
  const mappings = [];
  const shuffledCases = cases.map(entry => ({
    entry,
    sortKey: createHash("sha256")
      .update(`Famili-IA:${reviewProtocolId}:${reviewProtocolVersion}:${entry.id}`)
      .digest("hex")
  })).sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  const reviewCases = shuffledCases.map(({ entry }, index) => {
    const reviewId = `blind-${String(index + 1).padStart(3, "0")}`;
    mappings.push({ reviewId, sourceCaseId: entry.id });
    return {
      id: reviewId,
      input: {
        question: entry.input.question,
        evidence: entry.input.evidence.filter(item => item.verified).map((item, evidenceIndex) => ({
          id: `evidence-${evidenceIndex + 1}`,
          name: item.name,
          text: item.text
        }))
      },
      candidateOutput: parseCandidateOutput(observationsById.get(entry.id))
    };
  });
  const packetContent = {
    protocolId: reviewProtocolId,
    protocolVersion: reviewProtocolVersion,
    controlId: assistantResponseHoldoutA5.controlId,
    instructions: {
      purpose: "Évaluer à l'aveugle l'exactitude sémantique et l'appui sur les preuves de la réponse présentée.",
      rules: [
        "N'utiliser que la question, les preuves et la réponse candidate de chaque cas.",
        "Ne pas consulter le dépôt, les annotations, les rubriques attendues ni d'autres sorties de campagne.",
        "Marquer pass uniquement si la réponse répond correctement à la question, reste dans les preuves et traite correctement l'absence, l'ambiguïté ou la contradiction.",
        "Marquer fail si un fait est inventé, une citation n'est pas littérale et pertinente, ou si la réponse ne convient pas à la question.",
        "Motiver chaque décision sans modifier les questions, preuves ou réponses."
      ]
    },
    cases: reviewCases
  };
  const packetFingerprint = hashJson(packetContent);
  return {
    packet: {
      ...packetContent,
      packetFingerprint,
      review: {
        independentReviewConfirmed: false,
        runOutputsNotConsultedBeforeReview: false,
        assessments: reviewCases.map(entry => ({
          caseId: entry.id,
          verdict: "",
          rationale: ""
        }))
      }
    },
    key: {
      protocolId: reviewProtocolId,
      protocolVersion: reviewProtocolVersion,
      controlId: assistantResponseHoldoutA5.controlId,
      packetFingerprint,
      mappings
    }
  };
}

export function evaluateA5Review(document, key) {
  const isFullPacket = isObject(document) && isObject(document.review);
  const submittedReview = isFullPacket ? document.review : document;
  if (!isObject(key) || key.protocolId !== reviewProtocolId ||
      key.protocolVersion !== reviewProtocolVersion || key.controlId !== assistantResponseHoldoutA5.controlId ||
      key.packetFingerprint !== document?.packetFingerprint || !Array.isArray(key.mappings) ||
      key.mappings.length !== assistantResponseHoldoutA5.cases.length ||
      !isObject(submittedReview) || submittedReview.independentReviewConfirmed !== true ||
      submittedReview.runOutputsNotConsultedBeforeReview !== true ||
      !Array.isArray(submittedReview.assessments)) {
    throw new TypeError("La revue ou son attestation indépendante A5 est invalide.");
  }
  if (isFullPacket) {
    const { packetFingerprint, review: ignoredReview, ...packetContent } = document;
    if (document.protocolId !== reviewProtocolId || document.protocolVersion !== reviewProtocolVersion ||
        document.controlId !== assistantResponseHoldoutA5.controlId ||
        hashJson(packetContent) !== packetFingerprint) {
      throw new TypeError("Le contenu du paquet A5 a changé depuis son export.");
    }
  }

  const mappingByReviewId = new Map();
  const sourceIds = new Set();
  for (const mapping of key.mappings) {
    if (!isObject(mapping) || typeof mapping.reviewId !== "string" ||
        typeof mapping.sourceCaseId !== "string" || mappingByReviewId.has(mapping.reviewId) ||
        sourceIds.has(mapping.sourceCaseId)) {
      throw new TypeError("La clé privée de revue A5 est invalide.");
    }
    mappingByReviewId.set(mapping.reviewId, mapping.sourceCaseId);
    sourceIds.add(mapping.sourceCaseId);
  }
  const expectedSourceIds = new Set(assistantResponseHoldoutA5.cases.map(entry => entry.id));
  if (sourceIds.size !== expectedSourceIds.size ||
      [...sourceIds].some(caseId => !expectedSourceIds.has(caseId))) {
    throw new TypeError("La clé privée ne correspond plus au corpus A5.");
  }

  const seen = new Set();
  const failures = [];
  let passedCases = 0;
  for (const assessment of submittedReview.assessments) {
    if (!isObject(assessment) || typeof assessment.caseId !== "string" ||
        !mappingByReviewId.has(assessment.caseId) || seen.has(assessment.caseId) ||
        !reviewVerdicts.has(assessment.verdict) || typeof assessment.rationale !== "string" ||
        !assessment.rationale.trim()) {
      throw new TypeError("Chaque cas A5 doit recevoir un verdict autorisé et une motivation non vide.");
    }
    seen.add(assessment.caseId);
    if (assessment.verdict === "pass") passedCases += 1;
    else failures.push({
      reviewId: assessment.caseId,
      sourceCaseId: mappingByReviewId.get(assessment.caseId),
      rationale: assessment.rationale.trim()
    });
  }
  if (seen.size !== mappingByReviewId.size) {
    throw new TypeError("La revue A5 est incomplète : chaque cas doit être évalué.");
  }
  return {
    protocolId: reviewProtocolId,
    packetFingerprint: key.packetFingerprint,
    packetContentVerified: isFullPacket,
    reviewedCases: seen.size,
    passedCases,
    failedCases: failures.length,
    failures,
    result: failures.length === 0 ? "semantic-review-passed" : "follow-up-required",
    modelRuns: 0,
    corpusModified: false,
    productionReady: false
  };
}

async function runLocalCampaign(outputPath) {
  if (campaignClosed) throw new Error("La campagne A5 est fermée après son exécution unique.");
  const [runtime, tags] = await Promise.all([
    getOllamaJson("/api/version"),
    getOllamaJson("/api/tags")
  ]);
  const installedModel = tags.models?.find(item => item.name === LOCAL_QWEN_MODEL);
  if (!installedModel?.digest) {
    throw new Error(`Le modèle local "${LOCAL_QWEN_MODEL}" n'est pas installé avec un digest vérifiable.`);
  }
  const observations = [];
  for (const [index, entry] of assistantResponseHoldoutA5.cases.entries()) {
    const startedAt = performance.now();
    const prepared = prepareAssistantQwenDevelopmentCase(entry);
    const gate = prepared.qwenEvidence.length ? "call" : "blocked";
    const observation = {
      caseId: entry.id,
      contextStatus: prepared.contextStatus,
      localStatus: prepared.localStatus,
      localAnswer: prepared.localAnswer,
      gate,
      gateEvidence: prepared.qwenEvidence,
      modelInvoked: false,
      modelCallSuppressed: gate === "call" && !entry.expectedQwenCall
    };
    if (entry.expectedQwenCall && gate === "call") {
      observation.modelInvoked = true;
      observation.sentEvidence = prepared.qwenEvidence;
      try {
        observation.output = await requestLocalQwenRawOutput({
          question: entry.input.question,
          evidence: prepared.qwenEvidence
        });
      } catch (error) {
        observation.error = error instanceof Error ? error.message : "Erreur locale non détaillée";
      }
    }
    observation.elapsedMs = Number((performance.now() - startedAt).toFixed(1));
    observations.push(observation);
    console.log(`[${index + 1}/${assistantResponseHoldoutA5.cases.length}] ${entry.id} : ${gate === "call" && observation.modelInvoked ? "sortie brute conservée" : gate}`);
  }
  const run = {
    controlId: assistantResponseHoldoutA5.controlId,
    corpusVersion: assistantResponseHoldoutA5.version,
    promptVersion: LOCAL_QWEN_PROMPT_VERSION,
    candidate: { model: LOCAL_QWEN_MODEL, digest: installedModel.digest, runtime: runtime.version },
    environment: { platform: os.platform(), architecture: os.arch() },
    settings: { ...LOCAL_QWEN_OPTIONS, think: false },
    observations
  };
  await writeFile(outputPath, JSON.stringify(run, null, 2), { encoding: "utf8", flag: "wx" });
  return { outputPath, ...buildA5Report(run) };
}

async function main() {
  const args = process.argv.slice(2);
  const summary = validateAssistantResponseQwenA5(assistantResponseHoldoutA5);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({ ...summary, modelRuns: 0, campaignClosed }, null, 2));
    return;
  }
  if (args.length === 2 && args[0] === "run-local") {
    const report = await runLocalCampaign(args[1]);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.strictGate.passes
      ? 0
      : report.unavailable.length || report.missing.length ? 2 : 1;
    return;
  }
  if (args.length === 2 && args[0] === "evaluate") {
    const report = buildA5Report(await readJson(args[1]));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.strictGate.passes
      ? 0
      : report.unavailable.length || report.missing.length ? 2 : 1;
    return;
  }
  if (args.length === 4 && args[0] === "export-review") {
    const { packet, key } = prepareA5Review(await readJson(args[1], "Campagne A5"));
    await writeFile(args[3], JSON.stringify(key, null, 2), { encoding: "utf8", flag: "wx" });
    await writeFile(args[2], JSON.stringify(packet, null, 2), { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({
      packetPath: args[2],
      privateKeyPath: args[3],
      packetFingerprint: packet.packetFingerprint,
      exportedCases: packet.cases.length,
      expectedLabelsIncluded: false,
      expectedRubricsIncluded: false,
      modelRuns: 0
    }, null, 2));
    return;
  }
  if (args.length === 3 && args[0] === "evaluate-review") {
    const [key, review] = await Promise.all([
      readJson(args[1], "Clé privée A5"),
      readJson(args[2], "Revue A5")
    ]);
    console.log(JSON.stringify(evaluateA5Review(review, key), null, 2));
    return;
  }
  throw new Error("Usage : node scripts\\evaluate-assistant-qwen-a5.js check | run-local <run.json> | evaluate <run.json> | export-review <run.json> <packet.json> <private-key.json> | evaluate-review <private-key.json> <review.json>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Évaluation du contrôle Qwen A5 : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
    process.exitCode = 1;
  });
}
