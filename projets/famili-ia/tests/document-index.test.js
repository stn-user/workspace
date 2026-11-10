import assert from "node:assert/strict";
import test from "node:test";
import { createContentProvenance } from "../content-index.js";
import { createDocumentIndexRecord } from "../document-index.js";
import { migrateDocumentIndexes, rollbackDocumentIndexes } from "../document-index-migration.js";
import { findDocumentDuplicateCandidates } from "../document-deduplication.js";

test("fiche locale durable : identité, couverture vérifiée et échéance sourcée", async () => {
  const document = {
    id: "local-1",
    name: "facture.pdf",
    type: "facture",
    isLocal: true,
    content: "Échéance : 2027-03-04",
    expiryDate: "2027-03-04",
    expiryDateEvidence: "Échéance : 2027-03-04"
  };
  document.contentProvenance = await createContentProvenance(
    document,
    [document.content],
    "local-pdf"
  );

  const record = await createDocumentIndexRecord(document);
  assert.equal(record.schema, "1.1.0");
  assert.equal(record.sourceId, "local");
  assert.equal(record.itemId, "local-1");
  assert.equal(record.type, "document");
  assert.equal(record.coverage, "partial");
  assert.deepEqual(record.dates.echeance, {
    value: "2027-03-04",
    source: "extracted",
    estimated: false,
    proof: { excerpt: "Échéance : 2027-03-04", location: "ligne 1" }
  });
});

test("fiche conserve emplacement local et date fournisseur sans les confondre avec une extraction", async () => {
  const record = await createDocumentIndexRecord({
    id: "drive-metadata",
    name: "contrat.txt",
    isLocal: true,
    driveSource: true,
    sourceDir: "Dossier/Contrats",
    modificationDate: "2026-10-09T12:00:00.000Z",
    content: ""
  });
  assert.deepEqual(record.location, {
    value: "Dossier/Contrats",
    source: "provider",
    estimated: false,
    proof: null
  });
  assert.deepEqual(record.dates.modification, {
    value: "2026-10-09T12:00:00.000Z",
    source: "provider",
    estimated: false,
    proof: null
  });
  assert.equal(record.coverage, "metadata");
});

test("faits du parseur : classification estimée, émetteur, montant et échéance prouvés", async () => {
  const document = {
    id: "invoice-1",
    name: "facture.txt",
    isLocal: true,
    content: "Facture EDF\nTotal TTC : 123,45 EUR\nÀ payer avant : 04/03/2027"
  };
  document.contentProvenance = await createContentProvenance(
    document,
    [document.content],
    "local-text"
  );

  const record = await createDocumentIndexRecord(document);
  const fields = Object.fromEntries(record.fields.map(field => [field.name, field]));
  assert.equal(record.coverage, "partial");
  assert.equal(fields.classification.value, "facture");
  assert.equal(fields.classification.source, "auto-estimate");
  assert.equal(fields.classification.estimated, true);
  assert.equal(fields.provider.value, "EDF");
  assert.equal(fields.provider.source, "extracted");
  assert.equal(fields.amount.value, "123.45 EUR");
  assert.equal(fields.amount.source, "extracted");
  for (const field of Object.values(fields)) {
    assert.ok(document.content.includes(field.proof.excerpt));
    assert.match(field.proof.location, /^ligne \d+$/);
  }
  assert.equal(record.dates.echeance.value, "2027-03-04");
  assert.equal(record.dates.echeance.proof.excerpt, "À payer avant : 04/03/2027");
});

test("contenu sans provenance vérifiée ne produit aucun fait d'extraction", async () => {
  const document = {
    id: "unverified",
    name: "facture.txt",
    isLocal: true,
    content: "Facture EDF\nTotal TTC : 123,45 EUR\nÉchéance : 04/03/2027",
    expiryDate: "2027-03-04",
    expiryDateEvidence: "Échéance : 04/03/2027"
  };
  const record = await createDocumentIndexRecord(document);
  assert.equal(record.coverage, "metadata");
  assert.deepEqual(record.fields, []);
  assert.deepEqual(record.dates, {});
});

test("fiche photo : conserve les annotations volontaires et la date locale", async () => {
  const document = {
    id: "photo-1",
    name: "photo.jpg",
    type: "image",
    isLocal: true,
    photoMetadata: {
      captureDate: {
        raw: "2024:07:14 10:30:00",
        localDateTime: "2024-07-14T10:30:00",
        source: { kind: "exif", field: "DateTimeOriginal" }
      }
    },
    photoAnnotations: {
      captureDateOverride: { localDateTime: "2024-07-15T11:00:00", offsetMinutes: null, source: "user" },
      personIds: ["member-1"],
      eventTags: ["Vacances"],
      placeLabel: "Paris"
    }
  };

  const record = await createDocumentIndexRecord(document);
  assert.equal(record.type, "photo");
  assert.equal(record.dates.priseDeVue.value, "2024-07-15");
  assert.equal(record.dates.priseDeVue.source, "user-input");
  assert.deepEqual(record.fields.map(({ name, value, source }) => ({ name, value, source })), [
    { name: "personIds", value: "member-1", source: "user-input" },
    { name: "eventTag", value: "Vacances", source: "user-input" },
    { name: "place", value: "Paris", source: "user-input" }
  ]);
});

test("migration idempotente et reprenable après échec sans remplacer le contenu", async () => {
  const documents = [
    { id: "a", name: "a.txt", isLocal: true, content: "contenu A" },
    { id: "b", name: "b.txt", isLocal: true, content: "contenu B" }
  ];
  const stored = new Map();
  await assert.rejects(migrateDocumentIndexes(documents, async document => {
    if (document.id === "b") throw new Error("écriture interrompue");
    stored.set(document.id, structuredClone(document));
  }), /écriture interrompue/);

  const resumedInput = documents.map(document => stored.get(document.id) ?? document);
  const migrated = await migrateDocumentIndexes(resumedInput, async document => {
    stored.set(document.id, structuredClone(document));
  });
  assert.equal(migrated.length, 2);
  assert.equal(stored.get("a").content, "contenu A");
  assert.equal(stored.get("b").content, "contenu B");
  assert.deepEqual(
    await migrateDocumentIndexes(migrated, async () => assert.fail("La migration répétée ne doit rien écrire")),
    migrated
  );
});

test("migration refuse de réécrire une enveloppe chiffrée non déchiffrée", async () => {
  const ciphertext = {
    id: "encrypted",
    iv: new Uint8Array([1, 2]),
    data: new Uint8Array([3, 4])
  };
  await assert.rejects(
    migrateDocumentIndexes([ciphertext], async () => assert.fail("Aucune réécriture attendue")),
    /données chiffrées illisibles/
  );
});

test("mise à niveau de fiche 1.0 vers 1.1 et retour arrière non destructif", async () => {
  const legacyDocument = {
    id: "legacy-index",
    name: "ancien.pdf",
    isLocal: true,
    content: "Contenu original",
    customData: { kept: true },
    indexRecord: {
      schema: "1.0.0",
      sourceId: "local",
      itemId: "legacy-index",
      type: "document",
      name: { value: "ancien.pdf", source: "provider", estimated: false, proof: null },
      dates: {},
      coverage: "metadata",
      lastCheck: null,
      fields: []
    }
  };
  const writes = [];
  const upgraded = await migrateDocumentIndexes([legacyDocument], async document => writes.push(document));
  assert.equal(upgraded[0].indexRecord.schema, "1.1.0");
  assert.equal(upgraded[0].indexRecord.location, null);
  assert.equal(writes.length, 1);

  const rolledBack = await rollbackDocumentIndexes(upgraded, async document => writes.push(document));
  assert.equal(Object.hasOwn(rolledBack[0], "indexRecord"), false);
  assert.equal(rolledBack[0].content, "Contenu original");
  assert.deepEqual(rolledBack[0].customData, { kept: true });
  assert.equal(writes.length, 2);
  assert.equal((await rollbackDocumentIndexes(rolledBack, async () => assert.fail("Aucune réécriture attendue")))[0], rolledBack[0]);
});

test("réindexation préserve les corrections utilisateur et rejette une identité incohérente", async () => {
  const document = { id: "one", name: "source.txt", isLocal: true, content: "" };
  const previous = await createDocumentIndexRecord(document);
  previous.name = { value: "Nom corrigé", source: "user-input", estimated: false, proof: null };
  previous.fields.push({
    name: "classification",
    value: "contrat",
    source: "user-input",
    estimated: false,
    proof: null
  });

  const refreshed = await createDocumentIndexRecord({ ...document, name: "nouveau.txt" }, { previous });
  assert.equal(refreshed.name.value, "Nom corrigé");
  assert.equal(refreshed.fields[0].value, "contrat");
  await assert.rejects(
    createDocumentIndexRecord(document, { previous: { ...previous, itemId: "other" } }),
    /identité/
  );
});

test("détecte les empreintes exactes et propose les noms incertains sans fusion", () => {
  const documents = [
    { sourceId: "local", id: "a", name: "Facture-énergie.pdf", sourceContentHash: `sha256:${"a".repeat(64)}` },
    { sourceId: "drive", id: "b", name: "facture energie.txt", sourceContentHash: `sha256:${"a".repeat(64)}` },
    { sourceId: "onedrive", id: "c", name: "FACTURE énergie.docx" },
    { sourceId: "onedrive", id: "d", name: "facture different.pdf", sourceContentHash: `sha256:${"b".repeat(64)}` }
  ];
  const result = findDocumentDuplicateCandidates(documents);
  assert.deepEqual(result.exactDuplicates.map(({ first, second, match }) => [
    first.sourceId, first.itemId, second.sourceId, second.itemId, match
  ]), [["drive", "b", "local", "a", "content-hash"]]);
  assert.deepEqual(result.possibleDuplicates.map(({ first, second, match }) => [
    first.sourceId, first.itemId, second.sourceId, second.itemId, match
  ]), [
    ["drive", "b", "onedrive", "c", "same-normalized-name"],
    ["local", "a", "onedrive", "c", "same-normalized-name"]
  ]);
  assert.equal(documents.length, 4);
});

test("refuse les identités invalides et ne confond pas une empreinte connue différente", () => {
  assert.throws(() => findDocumentDuplicateCandidates([{ sourceId: "local", id: "" }]), TypeError);
  assert.throws(() => findDocumentDuplicateCandidates([
    { sourceId: "local", id: "x", name: "a.txt" },
    { sourceId: "local", id: "x", name: "b.txt" }
  ]), /Identités dupliquées/);
  const result = findDocumentDuplicateCandidates([
    { sourceId: "local", id: "a", name: "contrat.pdf", sourceContentHash: `sha256:${"a".repeat(64)}` },
    { sourceId: "drive", id: "b", name: "contrat.docx", sourceContentHash: `sha256:${"b".repeat(64)}` }
  ]);
  assert.deepEqual(result, { exactDuplicates: [], possibleDuplicates: [] });
});
