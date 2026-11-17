import { readFile } from "node:fs/promises";
import { evaluateWeddingMetadata } from "../photo-event-evaluation.js";

if (process.argv.length !== 3) {
  console.error("Usage : node scripts\\evaluate-photo-events.js <corpus.json>");
  process.exitCode = 1;
} else {
  let content;
  try {
    content = await readFile(process.argv[2], "utf8");
  } catch {
    console.error("Impossible de lire le corpus local. Vérifiez le chemin et les permissions.");
    process.exitCode = 1;
  }

  if (content !== undefined) {
    let cases;
    try {
      cases = JSON.parse(content);
    } catch {
      console.error("Le corpus n'est pas un fichier JSON valide.");
      process.exitCode = 1;
    }
    if (cases !== undefined) {
      try {
        console.log(JSON.stringify(evaluateWeddingMetadata(cases), null, 2));
      } catch (error) {
        console.error(`Corpus invalide : ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}
