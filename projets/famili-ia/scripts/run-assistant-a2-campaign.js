import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { evaluateAssistantRun, prepareAssistantBenchmark, validateAssistantCorpus } from "../assistant-evaluation.js";

const endpoint = "http://127.0.0.1:11434";
const model = "qwen3:8b";
const runnerVersion = "A2.2-local-1.0.0";
const warmKeepAlive = "5m";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readCorpus() {
  const content = await readFile(new URL("../tests/fixtures/assistant-evaluation.json", import.meta.url), "utf8");
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Corpus A2 JSON invalide.");
  }
}

async function requestJson(path, body, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(`${endpoint}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(body ? 120_000 : 5_000)
    });
  } catch (error) {
    if (error instanceof TypeError || error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error("Ollama local est inaccessible ou ne répond pas dans le délai prévu.");
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(`Ollama local a répondu HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Ollama local a renvoyé un JSON invalide.");
  }
}

async function getModels(fetchImpl) {
  const state = await requestJson("/api/ps", undefined, fetchImpl);
  if (!state || !Array.isArray(state.models)) {
    throw new TypeError("Ollama n'a pas renvoyé l'état des modèles chargés.");
  }
  return state.models;
}

function summarizeLoadedModels(models) {
  return models.map(item => ({
    name: item.name,
    sizeBytes: Number.isSafeInteger(item.size) ? item.size : null,
    sizeVramBytes: Number.isSafeInteger(item.size_vram) ? item.size_vram : null
  }));
}

async function requireNoLoadedModels(fetchImpl, phase) {
  const models = await getModels(fetchImpl);
  if (models.length) {
    const names = models.map(item => item.name).filter(Boolean).join(", ") || "nom inconnu";
    throw new Error(`Campagne ${phase} refusée : des modèles sont déjà chargés (${names}). Aucune session Ollama n'a été arrêtée.`);
  }
  return summarizeLoadedModels(models);
}

async function waitForNoLoadedModels(fetchImpl, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let models = await getModels(fetchImpl);
  while (models.length && Date.now() < deadline) {
    await sleep(250);
    models = await getModels(fetchImpl);
  }
  if (models.length) {
    throw new Error("Ollama n'a pas confirmé le déchargement du modèle après keep_alive:0.");
  }
  return summarizeLoadedModels(models);
}

function startResourceMonitor() {
  const hostSamples = [];
  const gpuSamples = [];
  const totalMemoryBytes = os.totalmem();
  const sampleHost = () => hostSamples.push({ at: Date.now(), freeBytes: os.freemem() });
  sampleHost();
  const hostInterval = setInterval(sampleHost, 500);
  let gpuError = null;
  let child;
  let closePromise = Promise.resolve();
  let childClosed = true;
  let stoppingChild = false;
  let buffer = "";
  const stopChildAtProcessExit = () => {
    if (child && !child.killed) child.kill();
  };

  try {
    child = spawn("nvidia-smi", [
      "--query-gpu=memory.used,memory.total,power.draw",
      "--format=csv,noheader,nounits",
      "--loop-ms=500"
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    process.once("exit", stopChildAtProcessExit);
    childClosed = false;
    closePromise = new Promise(resolve => child.once("close", resolve));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const [usedText, totalText, powerText] = line.split(",").map(value => value.trim());
        const memoryUsedMiB = Number(usedText);
        const memoryTotalMiB = Number(totalText);
        const powerW = Number(powerText);
        if (Number.isFinite(memoryUsedMiB) && Number.isFinite(memoryTotalMiB)) {
          gpuSamples.push({
            at: Date.now(),
            memoryUsedMiB,
            memoryTotalMiB,
            powerW: Number.isFinite(powerW) ? powerW : null
          });
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => {
      gpuError = (gpuError ?? "") + chunk;
    });
    child.on("error", error => {
      gpuError = error.message;
    });
    child.on("close", code => {
      childClosed = true;
      if (!stoppingChild && !gpuError) gpuError = `nvidia-smi s'est terminé prématurément avec le code ${code}.`;
    });
  } catch (error) {
    gpuError = error instanceof Error ? error.message : "nvidia-smi indisponible.";
  }

  return {
    async stop() {
      clearInterval(hostInterval);
      sampleHost();
      if (child && child.exitCode === null && !child.killed) {
        stoppingChild = true;
        child.kill();
        await Promise.race([closePromise, sleep(2_000)]);
        if (!childClosed) gpuError = "Le processus nvidia-smi n'a pas confirmé son arrêt dans le délai prévu.";
      }
      process.removeListener("exit", stopChildAtProcessExit);
      if (buffer.trim()) {
        const [usedText, totalText, powerText] = buffer.split(",").map(value => value.trim());
        const memoryUsedMiB = Number(usedText);
        const memoryTotalMiB = Number(totalText);
        const powerW = Number(powerText);
        if (Number.isFinite(memoryUsedMiB) && Number.isFinite(memoryTotalMiB)) {
          gpuSamples.push({
            at: Date.now(),
            memoryUsedMiB,
            memoryTotalMiB,
            powerW: Number.isFinite(powerW) ? powerW : null
          });
        }
      }
      const hostUsed = hostSamples.map(sample => totalMemoryBytes - sample.freeBytes);
      const powerSamples = gpuSamples.filter(sample => sample.powerW !== null);
      let energyWh = null;
      if (powerSamples.length > 1) {
        energyWh = 0;
        for (let index = 1; index < powerSamples.length; index += 1) {
          const previous = powerSamples[index - 1];
          const current = powerSamples[index];
          energyWh += ((previous.powerW + current.powerW) / 2) *
            (current.at - previous.at) / 3_600_000;
        }
      }
      return {
        hostMemory: {
          source: "node:os",
          scope: "Mémoire globale de l'hôte ; les autres processus ne sont pas isolés.",
          totalBytes: totalMemoryBytes,
          baselineFreeBytes: hostSamples[0]?.freeBytes ?? null,
          minimumFreeBytes: hostSamples.length
            ? Math.min(...hostSamples.map(sample => sample.freeBytes))
            : null,
          peakHostUsedBytes: hostUsed.length ? Math.max(...hostUsed) : null,
          peakIncreaseFromBaselineBytes: hostUsed.length
            ? Math.max(0, Math.max(...hostUsed) - hostUsed[0])
            : null,
          samples: hostSamples.length
        },
        gpu: {
          source: "nvidia-smi",
          scope: "Mesures globales du GPU ; elles ne sont pas attribuées au seul processus Ollama.",
          sampleIntervalMs: 500,
          samples: gpuSamples.length,
          error: gpuError?.trim() || null,
          totalMemoryMiB: gpuSamples.at(-1)?.memoryTotalMiB ?? null,
          peakMemoryUsedMiB: gpuSamples.length
            ? Math.max(...gpuSamples.map(sample => sample.memoryUsedMiB))
            : null,
          peakPowerW: powerSamples.length
            ? Math.max(...powerSamples.map(sample => sample.powerW))
            : null,
          estimatedEnergyWh: energyWh
        }
      };
    }
  };
}

function makeChatBody(item, protocol, keepAlive) {
  const settings = protocol.generationSettings;
  return {
    model,
    messages: item.messages,
    format: protocol.responseContract,
    stream: false,
    think: false,
    options: {
      temperature: settings.temperature,
      top_p: settings.topP,
      num_predict: settings.maxOutputTokens
    },
    keep_alive: keepAlive
  };
}

function responseMetrics(payload, wallMs, keepAlive) {
  const totalDurationNs = Number.isSafeInteger(payload?.total_duration) && payload.total_duration >= 0
    ? payload.total_duration
    : null;
  const loadDurationNs = Number.isSafeInteger(payload?.load_duration) && payload.load_duration >= 0
    ? payload.load_duration
    : null;
  const loadDurationMs = loadDurationNs === null ? null : loadDurationNs / 1_000_000;
  return {
    wallMs: Number(wallMs.toFixed(1)),
    latencyExcludingModelLoadMs: loadDurationMs === null
      ? null
      : Number(Math.max(0, wallMs - loadDurationMs).toFixed(1)),
    latencySubmittedToEvaluatorMs: Number(Math.max(0, wallMs - (loadDurationMs ?? 0)).toFixed(1)),
    totalDurationNs,
    loadDurationNs,
    promptEvalDurationNs: Number.isSafeInteger(payload?.prompt_eval_duration) ? payload.prompt_eval_duration : null,
    evalDurationNs: Number.isSafeInteger(payload?.eval_duration) ? payload.eval_duration : null,
    promptEvalCount: Number.isSafeInteger(payload?.prompt_eval_count) ? payload.prompt_eval_count : null,
    evalCount: Number.isSafeInteger(payload?.eval_count) ? payload.eval_count : null,
    keepAlive
  };
}

function addObservation(observations, profiles, item, payload, startedAt, keepAlive, error = null) {
  const wallMs = performance.now() - startedAt;
  const metrics = responseMetrics(payload, wallMs, keepAlive);
  const observation = {
    caseId: item.caseId,
    elapsedMs: metrics.latencySubmittedToEvaluatorMs
  };
  if (error) {
    observation.error = error;
  } else if (payload?.message?.role === "assistant" && typeof payload.message.content === "string") {
    observation.output = payload.message.content;
    if (Number.isSafeInteger(payload.prompt_eval_count) && payload.prompt_eval_count >= 0 &&
        Number.isSafeInteger(payload.eval_count) && payload.eval_count >= 0) {
      observation.usage = {
        inputTokens: payload.prompt_eval_count,
        outputTokens: payload.eval_count
      };
    }
  } else {
    observation.error = "Ollama n'a pas renvoyé de message assistant exploitable.";
  }
  observations.push(observation);
  profiles.push({ caseId: item.caseId, ...metrics, error: observation.error ?? null });
  return observation;
}

async function ensureOutputPathsAvailable(runPath, profilePath) {
  for (const path of [runPath, profilePath]) {
    try {
      await access(path);
      throw new Error(`Le fichier existe déjà et ne sera pas écrasé : ${path}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export async function runAssistantA2Campaign({
  phase,
  outputPath,
  fetchImpl = globalThis.fetch,
  startMonitor = startResourceMonitor,
  onProgress = message => console.log(message)
}) {
  if (!["cold", "warm"].includes(phase)) {
    throw new TypeError("La phase doit être cold ou warm.");
  }
  if (typeof outputPath !== "string" || !outputPath.trim()) {
    throw new TypeError("Un chemin de sortie de campagne est requis.");
  }
  const profilePath = `${outputPath}.profile.json`;
  await ensureOutputPathsAvailable(outputPath, profilePath);

  const corpus = await readCorpus();
  const corpusSummary = validateAssistantCorpus(corpus);
  const protocol = await prepareAssistantBenchmark(corpus);
  const [runtime, tags, initialModels] = await Promise.all([
    requestJson("/api/version", undefined, fetchImpl),
    requestJson("/api/tags", undefined, fetchImpl),
    getModels(fetchImpl)
  ]);
  const installedModel = tags.models?.find(item => item.name === model);
  if (!installedModel?.digest || typeof installedModel.digest !== "string" ||
      typeof runtime?.version !== "string" || !runtime.version) {
    throw new Error(`Le modèle local "${model}" n'est pas installé avec un digest vérifiable ; aucun téléchargement ne sera tenté.`);
  }
  if (initialModels.length) {
    const names = initialModels.map(item => item.name).filter(Boolean).join(", ") || "nom inconnu";
    throw new Error(`Campagne ${phase} refusée : des modèles sont déjà chargés (${names}). Aucune session Ollama n'a été arrêtée.`);
  }

  const monitor = startMonitor();
  const observations = [];
  const profileObservations = [];
  let warmup = null;
  let abortReason = null;

  try {
    if (phase === "warm") {
      const warmupItem = protocol.cases[0];
      const startedAt = performance.now();
      let payload;
      try {
        payload = await requestJson("/api/chat", makeChatBody(warmupItem, protocol, warmKeepAlive), fetchImpl);
        if (payload.message?.role !== "assistant" || typeof payload.message.content !== "string") {
          throw new Error("Ollama n'a pas renvoyé de réponse assistant pendant le préchauffage.");
        }
        warmup = {
          caseId: warmupItem.caseId,
          ...responseMetrics(payload, performance.now() - startedAt, warmKeepAlive)
        };
      } catch (error) {
        warmup = {
          caseId: warmupItem.caseId,
          wallMs: Number((performance.now() - startedAt).toFixed(1)),
          error: error instanceof Error ? error.message : "Erreur locale de préchauffage non détaillée."
        };
        abortReason = "Le préchauffage a échoué ; aucune observation notée n'a été exécutée.";
      }
      if (!abortReason) {
        const models = await getModels(fetchImpl);
        if (models.length !== 1 || models[0].name !== model) {
          abortReason = "Ollama n'a pas confirmé que seul Qwen3:8b était chargé après le préchauffage.";
        }
      }
    }

    for (const [index, item] of protocol.cases.entries()) {
      if (abortReason) break;
      if (phase === "cold") {
        try {
          await requireNoLoadedModels(fetchImpl, "cold");
        } catch (error) {
          abortReason = error instanceof Error ? error.message : "État Ollama invalide avant un cas froid.";
          break;
        }
      } else {
        const models = await getModels(fetchImpl);
        if (models.length !== 1 || models[0].name !== model) {
          abortReason = "Le modèle n'est plus chargé ; arrêt pour ne pas mélanger des observations froides et chaudes.";
          break;
        }
      }

      const startedAt = performance.now();
      const finalWarmCase = phase === "warm" && index === protocol.cases.length - 1;
      const keepAlive = phase === "cold" || finalWarmCase ? 0 : warmKeepAlive;
      let payload = null;
      let error = null;
      try {
        payload = await requestJson("/api/chat", makeChatBody(item, protocol, keepAlive), fetchImpl);
      } catch (requestError) {
        error = requestError instanceof Error ? requestError.message : "Erreur locale de génération non détaillée.";
      }
      const observation = addObservation(
        observations, profileObservations, item, payload, startedAt, keepAlive, error
      );
      onProgress(`[${observations.length}/${protocol.cases.length}] ${item.caseId} : ${error ? "erreur enregistrée" : "sortie brute conservée"}`);

      try {
        if (phase === "cold" || finalWarmCase) {
          await waitForNoLoadedModels(fetchImpl);
        } else if (!error) {
          const models = await getModels(fetchImpl);
          if (models.length !== 1 || models[0].name !== model) {
            abortReason = "Ollama n'a pas conservé Qwen3:8b en mémoire pour la campagne chaude.";
          }
        }
      } catch (stateError) {
        abortReason = stateError instanceof Error ? stateError.message : "État du modèle invalide après génération.";
      }
      if (error && phase === "cold") {
        abortReason = "Une requête froide a échoué ; arrêt pour ne pas invalider la série.";
      }
      if (abortReason) break;
      if (error && phase === "warm") continue;
    }
  } catch (error) {
    abortReason = error instanceof Error
      ? error.message
      : "Erreur inattendue pendant l'exécution locale A2.2.";
  }
  const resources = await monitor.stop();
  const run = {
    protocolVersion: protocol.protocolVersion,
    corpusFingerprint: protocol.corpusFingerprint,
    candidate: {
      model,
      revision: installedModel.digest,
      runtime: runtime.version,
      environment: `${os.platform()} ${os.arch()}`
    },
    runId: `a2-${phase}-${new Date().toISOString()}-${randomUUID()}`,
    phase,
    settings: { ...protocol.generationSettings },
    observations
  };
  const report = await evaluateAssistantRun(corpus, run);
  const profile = {
    runnerVersion,
    protocolVersion: protocol.protocolVersion,
    runId: run.runId,
    runFingerprint: report.runFingerprint,
    phase,
    model,
    modelDigest: installedModel.digest,
    modelSizeBytes: Number.isSafeInteger(installedModel.size) ? installedModel.size : null,
    runtime: runtime.version,
    protocolCases: corpusSummary.generationCases,
    submittedCases: observations.length,
    complete: observations.length === corpusSummary.generationCases && !abortReason,
    abortReason,
    warmup,
    runtimeControls: {
      cold: "Chaque requête a keep_alive:0 ; le modèle est vérifié déchargé avant et après chaque cas.",
      warm: `Un premier cas synthétique non noté préchauffe le modèle ; les observations sont prises avec keep_alive:${warmKeepAlive}, puis le dernier cas le décharge.`,
      preflightLoadedModels: summarizeLoadedModels(initialModels),
      downloadsRequested: 0
    },
    loadDurationComplete: profileObservations.length === corpusSummary.generationCases &&
      profileObservations.every(observation => observation.loadDurationNs !== null),
    unavailableMeasurements: {
      modelCacheStorageBytes: "Non mesuré.",
      batteryConsumption: "Non mesuré ; l'énergie GPU estimée n'est pas une mesure de batterie.",
      networkDownloadBytes: "Non instrumenté ; le runner n'envoie aucune requête de téléchargement et refuse un modèle absent."
    },
    apiObservations: profileObservations,
    resources
  };
  await writeFile(outputPath, JSON.stringify(run, null, 2), { encoding: "utf8", flag: "wx" });
  await writeFile(profilePath, JSON.stringify(profile, null, 2), { encoding: "utf8", flag: "wx" });
  return { outputPath, profilePath, run, profile, report };
}

async function main() {
  const args = process.argv.slice(2);
  const corpus = await readCorpus();
  const summary = validateAssistantCorpus(corpus);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({
      ...summary,
      protocolVersion: (await prepareAssistantBenchmark(corpus)).protocolVersion,
      candidate: model,
      modelRuns: 0
    }, null, 2));
    return;
  }
  if (args.length === 3 && args[0] === "run-local") {
    const result = await runAssistantA2Campaign({ phase: args[1], outputPath: args[2] });
    console.log(JSON.stringify({
      outputPath: result.outputPath,
      profilePath: result.profilePath,
      runId: result.run.runId,
      runFingerprint: result.report.runFingerprint,
      phase: result.run.phase,
      submitted: result.report.submitted,
      missing: result.report.missing,
      structuralPassed: result.report.structuralPassed,
      structuralFailed: result.report.structuralFailed,
      p95ReportedByRunMs: result.report.timings.p95Ms,
      under15Seconds: result.report.timings.under15Seconds,
      usage: result.report.usage,
      semanticReviewRequired: result.report.semanticPending,
      productionReady: result.report.productionReady,
      resourceProfile: result.profile.resources,
      complete: result.profile.complete,
      abortReason: result.profile.abortReason
    }, null, 2));
    process.exitCode = result.report.structuralFailed || result.report.timings.under15Seconds === false ? 1
      : result.report.missing.length || result.report.semanticPending ? 2 : 0;
    return;
  }
  throw new Error("Usage : node scripts\\run-assistant-a2-campaign.js check | run-local <warm|cold> <run.json>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Campagne locale A2.2 : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
    process.exitCode = 1;
  });
}
