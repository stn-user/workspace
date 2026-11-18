import assert from "node:assert/strict";
import test from "node:test";
import { createContentProvenance, restoreContentSegments } from "../content-index.js";
import { createDocumentIndexRecord } from "../document-index.js";
import { findDocumentDeadlines } from "../index-deadline-search.js";
import { assertDocumentAlertSource, prepareDocumentAlertAction } from "../document-alert-action.js";

const now = new Date("2026-11-18T12:00:00");

async function fixture(content, changes = {}) {
  const document = { id: "action-fixture", name: "Garantie chaudière fictive.txt",
    type: "Texte", isLocal: true, content, ...changes };
  document.contentProvenance = await createContentProvenance(document, [content],
    document.oneDriveSource ? "onedrive-text" : "local-text");
  const record = await createDocumentIndexRecord(document);
  const restored = await restoreContentSegments(document);
  const indexed = { sourceId: record.sourceId, accountRef: record.accountRef,
    itemId: record.itemId, segments: restored.segments };
  const candidate = findDocumentDeadlines([record], [indexed], "2026-11-18", 90).candidates[0];
  return { document, record, indexed, candidate };
}

test("prepares exact and estimated dates with literal proofs using the shared deadline rules", async () => {
  for (const [content, estimated] of [
    ["CERTIFICAT DE GARANTIE\nFin de garantie : 2026-11-23", false],
    ["CERTIFICAT DE GARANTIE\nDate d'achat : 23/11/2025\nDurée de garantie : 1 an", true]
  ]) {
    const { document, record, indexed, candidate } = await fixture(content);
    const proposal = prepareDocumentAlertAction(candidate, document, record, indexed, now);
    assert.equal(proposal.dueDate, "2026-11-23");
    assert.equal(Boolean(proposal.estimated), estimated);
    assert.equal(proposal.documentType, "garantie");
    assert.doesNotThrow(() => assertDocumentAlertSource(document, proposal));
    for (const change of [
      { dueDate: "2026-11-24" }, { estimated: !estimated },
      { proof: { excerpt: "2026-11-23" } }
    ]) {
      assert.throws(() => prepareDocumentAlertAction({ ...candidate, ...change },
        document, record, indexed, now), /preuve vérifiée modifiée/);
    }
  }
});

test("refuses a different account, source or changed source snapshot", async () => {
  const account = "a".repeat(64);
  const { document, record, indexed, candidate } = await fixture(
    "CERTIFICAT DE GARANTIE\nFin de garantie : 2026-11-23",
    { oneDriveSource: true, oneDriveAccountFingerprint: account });
  const proposal = prepareDocumentAlertAction(candidate, document, record, indexed, now);
  for (const change of [
    { oneDriveAccountFingerprint: "b".repeat(64) }, { oneDriveSource: false },
    { content: document.content + "\nCopie changée." }, { name: "Autre copie.txt" },
    { contentProvenance: null }
  ]) {
    assert.throws(() => assertDocumentAlertSource({ ...document, ...change }, proposal), /changé/);
  }
  assert.throws(() => prepareDocumentAlertAction({ ...candidate, accountRef: "b".repeat(64) },
    document, record, indexed, now), /identité unique/);
});

test("retains the existing category window and refuses evidence outside verified segments", async () => {
  const { document, record, indexed, candidate } = await fixture(
    "CERTIFICAT DE GARANTIE\nFin de garantie : 2027-01-18");
  assert.throws(() => prepareDocumentAlertAction(candidate, document, record, indexed, now), /non encore admissible/);
  const near = await fixture("CERTIFICAT DE GARANTIE\nFin de garantie : 2026-11-23");
  assert.throws(() => prepareDocumentAlertAction(near.candidate, near.document, near.record,
    { ...near.indexed, segments: [] }, now), /preuve vérifiée modifiée/);
});
