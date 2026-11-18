import { readFile, writeFile } from "node:fs/promises";
import { evaluateAssistantRun, prepareAssistantBenchmark, validateAssistantCorpus } from "../assistant-evaluation.js";

async function readJson(path) {
  const content = await readFile(path, "utf8");
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Fichier JSON invalide ; aucun contenu n'a été affiché.");
  }
}

async function main() {
  const corpus = await readJson(new URL("../tests/fixtures/assistant-evaluation.json", import.meta.url));
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "check") {
    console.log(JSON.stringify({ ...validateAssistantCorpus(corpus), modelRuns: 0 }, null, 2));
  } else if (args.length === 2 && args[0] === "export") {
    const bundle = await prepareAssistantBenchmark(corpus);
    await writeFile(args[1], JSON.stringify(bundle, null, 2), { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({ exported: bundle.cases.length, integrationNotRun: bundle.integrationNotRun, modelRuns: 0 }));
  } else if ((args.length === 2 || args.length === 3) && args[0] === "evaluate") {
    const run = await readJson(args[1]);
    const review = args.length === 3 ? await readJson(args[2]) : null;
    const report = await evaluateAssistantRun(corpus, run, review);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.decision === "generation-corpus-approved" ? 0
      : ["rejected", "latency-rejected"].includes(report.decision) ? 1 : 2;
  } else {
    throw new Error("Usage : node scripts\\evaluate-assistant.js check | export <requêtes.json> | evaluate <campagne.json> [relecture.json]");
  }
}

main().catch(error => {
  console.error(`Évaluation Assistant : ${error instanceof Error ? error.message : "erreur non détaillée"}`);
  process.exitCode = 1;
});
