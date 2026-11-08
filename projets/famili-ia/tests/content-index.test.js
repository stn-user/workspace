import { test } from "node:test";
import assert from "node:assert/strict";
import { createContentProvenance, restoreContentSegments } from "../content-index.js";
import { IndexSession } from "../index-session.js";

const local = () => ({ id: "1", name: "local.pdf", isLocal: true,
  content: "Page 1\nVrai texte\n\nPage 2\n[Texte extrait impossible sans OCR mobile - PDF scanné]" });
const drive = () => ({ id: "1", name: "drive.txt", isLocal: true, driveSource: true, content: "Texte Drive unique" });

test("provenance persistable sans copie, segments et empreinte liés à l'identité", async () => {
  const doc = local();
  doc.contentProvenance = await createContentProvenance(doc, ["Vrai texte"], "local-pdf");
  assert.deepEqual(doc.contentProvenance.ranges, [[7, 17]]);
  assert.ok(!JSON.stringify(doc.contentProvenance).includes("Vrai texte"));
  const restored = await restoreContentSegments(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(restored, { status: "verified", segments: ["Vrai texte"] });
  assert.deepEqual(await restoreContentSegments({ ...doc, id: "autre" }), { status: "invalid", segments: [] });
  assert.deepEqual(await restoreContentSegments({ ...doc, content: doc.content + " modifié" }), { status: "invalid", segments: [] });
  const altered = structuredClone(doc);
  altered.contentProvenance.ranges = [[0, 6]];
  assert.equal((await restoreContentSegments(altered)).status, "invalid");
});

test("formats, entrées et provenances invalides ne produisent pas de texte recherché", async () => {
  const doc = local();
  assert.equal(await createContentProvenance(doc, [], "local-pdf"), null);
  await assert.rejects(createContentProvenance(doc, ["inventé"], "local-pdf"), TypeError);
  await assert.rejects(createContentProvenance(doc, ["Vrai texte"], "drive-text"), TypeError);
  await assert.rejects(createContentProvenance(null, [], "local-text"), TypeError);
  assert.equal((await restoreContentSegments(doc)).status, "legacy");
  for (const metadata of [{}, { version: 2 }, { version: 1, method: "local-pdf", ranges: [[0, 9999]], hash: `sha256:${"a".repeat(64)}` }]) {
    assert.equal((await restoreContentSegments({ ...doc, contentProvenance: metadata })).status, "invalid");
  }
});

test("redémarrage local et Drive, ancien document, corrections et suppressions", async () => {
  const localDoc = local();
  const driveDoc = drive();
  localDoc.contentProvenance = await createContentProvenance(localDoc, ["Vrai texte"], "local-pdf");
  driveDoc.contentProvenance = await createContentProvenance(driveDoc, [driveDoc.content], "drive-text");
  const docs = JSON.parse(JSON.stringify([localDoc, driveDoc, { id: "old", name: "ancien", isLocal: true, content: "Vrai texte" }]));
  const session = new IndexSession();
  assert.deepEqual(await Promise.all(docs.map(doc => session.restoreDocumentContent(doc))), ["verified", "verified", "legacy"]);
  session.syncDocuments(docs);
  assert.deepEqual(session.search("texte").map(item => [item.sourceId, item.itemId]), [["local", "1"], ["drive", "1"]]);
  assert.equal(session.search("OCR").length, 0);
  const record = session.getRecordsBySource("local")[0];
  record.name = { value: "titre corrigé", source: "user-input", estimated: false, proof: null };
  session.updateRecord(record);
  const cloned = structuredClone(docs);
  session.syncDocuments(cloned);
  assert.equal(session.search("vrai")[0].name, "titre corrigé");
  cloned[0].content += " altération";
  session.syncDocuments(cloned);
  assert.equal(session.search("vrai").length, 0);
  session.syncDocuments([]);
  session.syncDocuments([docs[1]]);
  assert.equal(session.search("unique").length, 0);
  assert.equal(await session.restoreDocumentContent(docs[1]), "verified");
  session.syncDocuments([docs[1]]);
  assert.equal(session.search("unique").length, 1);
});
