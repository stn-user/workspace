import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAssistantA2Campaign } from "../scripts/run-assistant-a2-campaign.js";

const model = "qwen3:8b";

function jsonResponse(value) {
  return { ok: true, status: 200, json: async () => value };
}

function makeOllama({ preloaded = false } = {}) {
  let loaded = preloaded ? [{ name: model, size: 5_000_000_000, size_vram: 4_000_000_000 }] : [];
  const chatRequests = [];
  const fetchImpl = async (url, options = {}) => {
    assert.ok(url.startsWith("http://127.0.0.1:11434/"), "requests must stay on the loopback API");
    if (url.endsWith("/api/version")) return jsonResponse({ version: "test-runtime" });
    if (url.endsWith("/api/tags")) {
      return jsonResponse({ models: [{ name: model, digest: "test-digest", size: 5_000_000_000 }] });
    }
    if (url.endsWith("/api/ps")) return jsonResponse({ models: loaded });
    if (url.endsWith("/api/chat")) {
      const request = JSON.parse(options.body);
      chatRequests.push(request);
      const wasLoaded = loaded.length > 0;
      const input = JSON.parse(request.messages[1].content);
      const entry = cases.find(item => item.input.question === input.question);
      assert.ok(entry, "only a prepared synthetic A2 case may be sent");
      loaded = [{ name: model, size: 5_000_000_000, size_vram: 4_000_000_000 }];
      const answer = {
        status: entry.expected.status,
        answer: entry.expected.referenceAnswer,
        claims: entry.expected.requiredCitations.map(citation => ({
          text: entry.expected.referenceAnswer,
          citations: [{ ...citation }]
        }))
      };
      if (request.keep_alive === 0) loaded = [];
      return jsonResponse({
        message: { role: "assistant", content: JSON.stringify(answer) },
        total_duration: 100_000_000,
        load_duration: wasLoaded ? 0 : 20_000_000,
        prompt_eval_duration: 30_000_000,
        eval_duration: 50_000_000,
        prompt_eval_count: 10,
        eval_count: 5
      });
    }
    throw new Error(`Unexpected Ollama endpoint: ${url}`);
  };
  return { fetchImpl, chatRequests, loaded: () => loaded };
}

const cases = JSON.parse(
  await readFile(new URL("../tests/fixtures/assistant-evaluation.json", import.meta.url), "utf8")
).cases.filter(item => item.kind === "generation");

const resources = {
  hostMemory: { source: "test", samples: 2 },
  gpu: { source: "test", samples: 2, estimatedEnergyWh: 0.01 }
};

async function inTemporaryDirectory(callback) {
  const directory = await mkdtemp(join(tmpdir(), "famili-assistant-a2-campaign-"));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("cold campaign unloads the model between all synthetic cases and preserves the measured run", async () => {
  await inTemporaryDirectory(async directory => {
    const ollama = makeOllama();
    const outputPath = join(directory, "cold.json");
    const result = await runAssistantA2Campaign({
      phase: "cold",
      outputPath,
      fetchImpl: ollama.fetchImpl,
      startMonitor: () => ({ stop: async () => resources }),
      onProgress: () => {}
    });

    assert.equal(ollama.chatRequests.length, 18);
    assert.ok(ollama.chatRequests.every(request => request.keep_alive === 0));
    assert.equal(result.run.observations.length, 18);
    assert.equal(result.report.structuralPassed, 18);
    assert.equal(result.profile.complete, true);
    assert.equal(result.profile.loadDurationComplete, true);
    assert.equal(ollama.loaded().length, 0);
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), result.run);
    assert.deepEqual(JSON.parse(await readFile(result.profilePath, "utf8")), result.profile);
  });
});

test("warm campaign uses a synthetic warm-up, keeps the model for measured cases, then unloads it", async () => {
  await inTemporaryDirectory(async directory => {
    const ollama = makeOllama();
    const result = await runAssistantA2Campaign({
      phase: "warm",
      outputPath: join(directory, "warm.json"),
      fetchImpl: ollama.fetchImpl,
      startMonitor: () => ({ stop: async () => resources }),
      onProgress: () => {}
    });

    assert.equal(ollama.chatRequests.length, 19);
    assert.equal(ollama.chatRequests[0].keep_alive, "5m");
    assert.ok(ollama.chatRequests.slice(1, -1).every(request => request.keep_alive === "5m"));
    assert.equal(ollama.chatRequests.at(-1).keep_alive, 0);
    assert.equal(result.run.observations.length, 18);
    assert.equal(result.profile.warmup.caseId, result.run.observations[0].caseId);
    assert.equal(result.profile.complete, true);
    assert.equal(ollama.loaded().length, 0);
  });
});

test("campaign refuses to touch a model already loaded in Ollama", async () => {
  await inTemporaryDirectory(async directory => {
    const ollama = makeOllama({ preloaded: true });
    await assert.rejects(runAssistantA2Campaign({
      phase: "cold",
      outputPath: join(directory, "refused.json"),
      fetchImpl: ollama.fetchImpl,
      startMonitor: () => ({ stop: async () => resources }),
      onProgress: () => {}
    }), /déjà chargés/);
    assert.equal(ollama.chatRequests.length, 0);
    assert.equal(ollama.loaded().length, 1);
  });
});

test("campaign refuses to overwrite an existing result file", async () => {
  await inTemporaryDirectory(async directory => {
    const ollama = makeOllama();
    const outputPath = join(directory, "existing.json");
    await writeFile(outputPath, "keep this result", "utf8");
    await assert.rejects(runAssistantA2Campaign({
      phase: "cold",
      outputPath,
      fetchImpl: ollama.fetchImpl,
      startMonitor: () => ({ stop: async () => resources }),
      onProgress: () => {}
    }), /existe déjà/);
    assert.equal(await readFile(outputPath, "utf8"), "keep this result");
    assert.equal(ollama.chatRequests.length, 0);
  });
});
