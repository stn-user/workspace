import { test } from "node:test";
import assert from "node:assert/strict";
import { createIndexRecord } from "../index-record.js";
import { describeExperimentalResult } from "../experimental-result.js";
import { IndexSession } from "../index-session.js";

test("résultat Drive : copie distincte, date de modification et accès non garanti", () => {
  const document = { id: "1", name: "Facture.pdf", type: "PDF", date: "9 oct. 2026",
    content: "Garantie vérifiée", isLocal: true, driveSource: true };
  const session = new IndexSession();
  session.trustExtractedContent(document, [document.content]);
  session.syncDocuments([document]);
  const match = session.search("garantie")[0];
  const result = describeExperimentalResult(match, session.getAllRecords()[0], document,
    "Session Google Drive déconnectée.");
  assert.equal(result.name, "Facture.pdf");
  assert.equal(result.canViewCopy, true);
  assert.ok(result.details.includes("Type : PDF"));
  assert.ok(result.details.includes("Source : Google Drive"));
  assert.ok(result.details.includes("Modification selon Google Drive : 9 oct. 2026"));
  assert.ok(result.details.includes("Emplacement enregistré : non disponible"));
  assert.ok(result.details.includes("Session Google Drive déconnectée."));
  assert.ok(result.details.some(text => text.includes("son accès n'a pas été vérifié")));
  assert.ok(result.reasons[0].includes("Garantie vérifiée"));
});

test("métadonnées absentes, copie manquante et identités distinctes", () => {
  const local = { id: "1", name: "Facture locale", isLocal: true, sourceDir: "Dossier/Facture locale" };
  const drive = { id: "1", name: "Facture Drive", driveSource: true, isLocal: true };
  const session = new IndexSession();
  session.syncDocuments([local, drive]);
  const [localMatch, driveMatch] = session.search("facture");
  const [localRecord, driveRecord] = session.getAllRecords();
  const localResult = describeExperimentalResult(localMatch, localRecord, local);
  const driveResult = describeExperimentalResult(driveMatch, driveRecord, undefined);
  assert.equal(localResult.canViewCopy, false);
  assert.ok(localResult.details.includes("Emplacement enregistré : Dossier/Facture locale"));
  assert.ok(localResult.details.includes("Date : non disponible"));
  assert.ok(localResult.details.includes("Type : inconnu"));
  assert.ok(localResult.reasons[0].startsWith("Nom :"));
  assert.equal(driveResult.canViewCopy, false);
  assert.ok(driveResult.details.includes("Accès actuel à l'original inconnu."));
  assert.throws(() => describeExperimentalResult(localMatch, driveRecord, local), TypeError);
});

test("raisons et dates conservent provenance, estimation et preuve", () => {
  const record = createIndexRecord("local", "1", {
    name: { value: "Fichier", source: "provider" }, coverage: "metadata",
    dates: { echeance: { value: "2027-01-01", source: "auto-estimate",
      proof: { excerpt: "vers janvier", location: "page 2" } } },
    fields: [{ name: "catégorie", value: "contrat", source: "user-input", estimated: true,
      proof: { excerpt: "preuve contractuelle", location: "page 1" } }]
  });
  const session = new IndexSession();
  session.syncDocuments([{ id: "1", name: "Fichier", isLocal: true }]);
  session.updateRecord(record);
  const match = session.search("contrat")[0];
  const result = describeExperimentalResult(match, record, { date: "Session locale" });
  assert.ok(result.details.some(text => text.includes("Échéance : 2027-01-01") && text.includes("estimation non confirmée")));
  assert.ok(result.details.some(text => text.includes("vers janvier") && text.includes("page 2")));
  assert.ok(result.reasons[0].includes("Champ catégorie"));
  assert.ok(result.reasons[0].includes("saisie ou correction"));
  assert.ok(result.reasons[0].includes("estimation non confirmée"));
  assert.ok(result.reasons[0].includes("preuve contractuelle"));
  assert.ok(result.reasons[0].includes("page 1"));
});

test("date de photo connue et fuseau inconnu réutilisent la provenance existante", () => {
  const document = { id: "p", name: "photo.jpg", type: "Image", isLocal: true,
    photoMetadata: { captureDate: { localDateTime: "2025-03-01T10:00:00",
      source: { kind: "exif" }, offsetMinutes: null } } };
  const session = new IndexSession();
  session.syncDocuments([document]);
  const result = describeExperimentalResult(session.search("photo")[0], session.getAllRecords()[0], document);
  assert.ok(result.details.some(text => text.includes("Prise de vue") && text.includes("2025-03-01") && text.includes("fuseau inconnu")));
  assert.ok(!result.details.includes("Date : non disponible"));
});
