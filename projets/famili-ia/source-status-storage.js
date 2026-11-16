import { get, getAll, put } from "./db.js";
import { createSourceRunStatus } from "./source-status.js";

const SOURCE_RUN_PREFIX = "source-run:v1:";

function normalizeStoredSourceRunStatus(record) {
  if (!record || record.kind !== "source-run-status" || record.schemaVersion !== 1) {
    throw new Error("Un état de parcours de source enregistré est invalide ou non pris en charge.");
  }
  const normalized = createSourceRunStatus(record);
  if (record.id !== normalized.id) throw new Error("L'identité de l'état de parcours enregistré ne correspond pas à son contenu.");
  return normalized;
}

export async function loadSourceRunStatuses() {
  const records = await getAll("source_sync");
  const sourceRunRecords = records.filter(record =>
    record?.kind === "source-run-status" || record?.id?.startsWith(SOURCE_RUN_PREFIX)
  );
  return sourceRunRecords.map(normalizeStoredSourceRunStatus);
}

export async function saveSourceRunStatus(record) {
  const normalized = createSourceRunStatus(record);
  await put("source_sync", normalized);
  const persisted = await get("source_sync", normalized.id);
  const verified = normalizeStoredSourceRunStatus(persisted);
  if (JSON.stringify(verified) !== JSON.stringify(normalized)) {
    throw new Error("L'état de parcours de source n'a pas été conservé correctement.");
  }
  return verified;
}
