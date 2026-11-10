import { test } from "node:test";
import assert from "node:assert/strict";
import { IndexSession } from "../index-session.js";
import { findIndexDeadlines } from "../index-deadline-search.js";
import { createIndexRecord } from "../index-record.js";
import { createContentProvenance } from "../content-index.js";
import { GoogleDriveClient, prepareDriveDocumentForIndex } from "../google-drive.js";

const reference = "2027-01-01";
const local = (id, name, content) => ({ id, name, type: "Texte", isLocal: true, content });

async function trustedLocal(session, document, segments = [document.content]) {
  document.contentProvenance = await createContentProvenance(document, segments, "local-text");
  session.trustExtractedContent(document, segments);
}

test("local et Drive réellement lus : preuve, identité et restauration sans nouvelle requête", async () => {
  const session = new IndexSession();
  const localDoc = local("drive-1", "Garantie locale", "Fin de garantie : 05/01/2027");
  await trustedLocal(session, localDoc);
  const client = new GoogleDriveClient({ apiKey: "fictif", appId: "fictif", clientId: "fictif" });
  let requests = 0;
  client.driveRequest = async url => {
    requests++;
    return url.searchParams.get("alt") === "media"
      ? new Response("Date d'échéance : 10/01/2027")
      : Response.json({ id: "1", name: "Contrat Drive.txt", mimeType: "text/plain", size: "30" });
  };
  const driveDoc = await client.readSelectedFile({ id: "1", name: "Contrat Drive.txt" });
  await prepareDriveDocumentForIndex(driveDoc, session);
  session.syncDocuments([localDoc, driveDoc]);
  const found = findIndexDeadlines(session, reference, 90);
  assert.deepEqual(found.candidates.map(c => [c.sourceId, c.itemId, c.dueDate, c.daysUntil, c.proof.excerpt]), [
    ["local", "drive-1", "2027-01-05", 4, "Fin de garantie : 05/01/2027"],
    ["drive", "drive-1", "2027-01-10", 9, "Date d'échéance : 10/01/2027"]
  ]);
  assert.equal(found.needReview.length, 0);
  const saved = JSON.parse(JSON.stringify([localDoc, driveDoc]));
  const restarted = new IndexSession();
  assert.deepEqual(await Promise.all(saved.map(doc => restarted.restoreDocumentContent(doc))), ["verified", "verified"]);
  restarted.syncDocuments(saved);
  assert.deepEqual(findIndexDeadlines(restarted, reference, 90), found);
  assert.equal(requests, 2);
});

test("ambiguïtés entre segments et contenus non fiables n'inventent pas de preuve", async () => {
  const session = new IndexSession();
  const mixed = local("mixte", "Mixte", "Fin de garantie : 05/01/2027\nÉchéance : 06/01/2027");
  await trustedLocal(session, mixed, ["Fin de garantie : 05/01/2027", "Échéance : 06/01/2027"]);
  const legacy = local("ancien", "Ancien", "Échéance : 05/01/2027");
  const placeholder = local("scan", "Scan", "[Texte extrait impossible sans OCR mobile - PDF scanné]");
  const invalidDate = local("invalide", "Invalide", "Échéance : 31/02/2027");
  await trustedLocal(session, invalidDate);
  session.syncDocuments([mixed, legacy, placeholder, invalidDate]);
  const result = findIndexDeadlines(session, reference, 90);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.needReview.map(entry => entry.itemId), ["mixte", "ancien", "scan", "invalide"]);
  assert.match(result.needReview[0].reason, /ambiguë/);
  assert.match(result.needReview[3].reason, /invalide/);
});

test("limites calendaires et échéances hors période sont explicites", async () => {
  const session = new IndexSession();
  const docs = [
    local("today", "Aujourd'hui", "Échéance : 01/01/2027"),
    local("limit", "Limite", "Échéance : 01/04/2027"),
    local("after", "Après", "Échéance : 02/04/2027"),
    local("before", "Avant", "Échéance : 31/12/2026")
  ];
  for (const doc of docs) await trustedLocal(session, doc);
  session.syncDocuments(docs);
  const result = findIndexDeadlines(session, reference, 90);
  assert.deepEqual(result.candidates.map(c => c.daysUntil), [0, 90]);
  assert.equal(result.outsidePeriod, 2);
  assert.throws(() => findIndexDeadlines(session, "2027-02-29", 90), TypeError);
  assert.throws(() => findIndexDeadlines(session, reference, -1), TypeError);
  assert.throws(() => findIndexDeadlines(session, reference, Number.MAX_SAFE_INTEGER + 1), TypeError);
});

test("segments exposés indépendants, correction conservée et suppression sans résidu", async () => {
  const session = new IndexSession();
  const doc = local("id", "Contrat", "Échéance : 05/01/2027");
  await trustedLocal(session, doc);
  session.syncDocuments([doc]);
  const snapshot = session.getAllContentDocs();
  snapshot[0].segments[0] = "Échéance : 06/01/2027";
  assert.equal(findIndexDeadlines(session, reference, 90).candidates[0].dueDate, "2027-01-05");
  const record = session.getAllRecords()[0];
  record.dates.echeance = { value: "2027-01-08", source: "user-input", estimated: false, proof: null };
  session.updateRecord(record);
  assert.equal(findIndexDeadlines(session, reference, 90).candidates.length, 0);
  assert.match(findIndexDeadlines(session, reference, 90).needReview[0].reason, /déjà enregistrée/);
  assert.equal(session.getAllRecords()[0].dates.echeance.value, "2027-01-08");
  doc.content = "Échéance : 06/01/2027";
  session.syncDocuments([doc]);
  assert.deepEqual(session.getAllContentDocs()[0].segments, []);
  session.syncDocuments([]);
  assert.deepEqual(session.getAllContentDocs(), []);
  assert.deepEqual(findIndexDeadlines(session, reference, 90), {
    candidates: [], needReview: [], ineligible: [], outsidePeriod: 0
  });
});

test("provenance invalide ou contenu modifié après restauration : aucune proposition", async () => {
  const initial = new IndexSession();
  const doc = local("id", "Contrat", "Échéance : 05/01/2027");
  await trustedLocal(initial, doc);
  const changed = structuredClone(doc);
  changed.content = "Échéance : 06/01/2027";
  const session = new IndexSession();
  assert.equal(await session.restoreDocumentContent(changed), "invalid");
  session.syncDocuments([changed]);
  assert.equal(findIndexDeadlines(session, reference, 90).candidates.length, 0);
  assert.equal(findIndexDeadlines(session, reference, 90).needReview.length, 1);
});

test("une échéance estimée ou sans preuve préexistante ne devient pas une proposition", async () => {
  const session = new IndexSession();
  const doc = local("id", "Contrat", "Échéance : 05/01/2027");
  await trustedLocal(session, doc);
  session.syncDocuments([doc]);
  const record = session.getAllRecords()[0];
  for (const deadline of [
    { value: "2027-01-05", source: "auto-estimate", estimated: true, proof: null },
    { value: "2027-01-05", source: "extracted", estimated: false, proof: null }
  ]) {
    record.dates.echeance = deadline;
    session.updateRecord(record);
    const result = findIndexDeadlines(session, reference, 90);
    assert.equal(result.candidates.length, 0);
    assert.match(result.needReview[0].reason, /déjà enregistrée/);
  }
});

test("une échéance déjà extraite et prouvée reste une proposition à confirmer", async () => {
  const session = new IndexSession();
  const doc = local("extracted", "Garantie", "Fin de garantie : 05/01/2027");
  await trustedLocal(session, doc);
  doc.indexRecord = createIndexRecord("local", doc.id, {
    name: { value: doc.name, source: "provider" },
    coverage: "partial",
    dates: {
      echeance: {
        value: "2027-01-05",
        source: "extracted",
        estimated: false,
        proof: { excerpt: "Fin de garantie : 05/01/2027", location: "ligne 1" }
      }
    }
  });
  session.syncDocuments([doc]);
  const result = findIndexDeadlines(session, reference, 90);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].dueDate, "2027-01-05");
  assert.equal(result.candidates[0].proof.excerpt, "Fin de garantie : 05/01/2027");
  assert.equal(result.needReview.length, 0);
});

test("reconnaît une fin de garantie explicite après une date d'achat dans la même phrase", async () => {
  const session = new IndexSession();
  const content = "Date d'achat pergola au 15/11/2025 et date de fin de garantie au 15/11/2026";
  const doc = local("pergola", "Pergola.txt", content);
  await trustedLocal(session, doc);
  session.syncDocuments([doc]);

  const result = findIndexDeadlines(session, "2026-11-10", 90);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0], {
    sourceId: "local", itemId: "pergola", name: "Pergola.txt",
    dueDate: "2026-11-15", source: "extracted",
    proof: { excerpt: content, location: null }, daysUntil: 5
  });
});

test("propose une estimation à confirmer depuis la date d'achat et la durée de garantie", async () => {
  const session = new IndexSession();
  const content = "Date d'achat : 15/11/2025\nDurée de garantie : 1 an";
  const doc = local("pergola-estimee", "Pergola estimée.txt", content);
  await trustedLocal(session, doc);
  session.syncDocuments([doc]);

  const result = findIndexDeadlines(session, "2026-11-10", 90);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.candidates[0], {
    sourceId: "local", itemId: "pergola-estimee", name: "Pergola estimée.txt",
    dueDate: "2026-11-15", source: "auto-estimate",
    proof: { excerpt: content, location: null }, daysUntil: 5, estimated: true
  });
});

test("les segments réellement extraits dans la session sont utilisables sans provenance persistée", () => {
  const session = new IndexSession();
  const doc = local("id", "Contrat", "Échéance : 05/01/2027");
  session.trustExtractedContent(doc, [doc.content]);
  session.syncDocuments([doc]);
  assert.equal(findIndexDeadlines(session, reference, 90).candidates.length, 1);
  const restarted = new IndexSession();
  restarted.syncDocuments([structuredClone(doc)]);
  assert.equal(findIndexDeadlines(restarted, reference, 90).candidates.length, 0);
});
