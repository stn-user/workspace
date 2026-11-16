import assert from "node:assert/strict";
import test from "node:test";
import { createPhotoMetadata } from "../photo-metadata.js";
import {
  createPhotoFactSet,
  findExactPhotoFactDuplicates,
  findPhotoFactConflicts,
  getDependentPhotoFactIds,
  mergePhotoFactSets,
  normalizePhotoFactSet,
  photoFactSetFromDocument,
  PHOTO_FACTS_SCHEMA_VERSION,
  redactPhotoFactLocationsForExport,
  reconcilePhotoFactSet,
  removePhotoFactsAndDependents,
  resolvePhotoFact
} from "../photo-facts.js";

const userProvenance = { kind: "user", field: "manualCorrection" };
const exifProvenance = { kind: "exif", field: "DateTimeOriginal" };

function fact(id, kind, value, provenance, status = "extracted", extra = {}) {
  return {
    id, kind, value, status, provenance, evidence: null, analyzedAt: null, review: null,
    dependsOnFactIds: [], ...extra
  };
}

test("converts existing photo metadata without changing it or inventing a timezone", () => {
  const document = {
    id: "dropbox-copy-1",
    type: "Image",
    name: "photo.jpg",
    dropboxSource: true,
    dropboxAccountFingerprint: "a".repeat(64),
    sourceDir: "/Photos/Vacances",
    importedAt: "2026-11-15T10:20:30.000Z",
    modificationDate: "2026-11-14T09:00:00.000Z",
    indexRecord: {
      sourceId: "dropbox",
      itemId: "dropbox-copy-1",
      location: { value: "/Photos/Vacances" },
      lastCheck: "2026-11-15T10:19:00.000Z"
    },
    photoMetadata: createPhotoMetadata("dropbox-copy-1", {
      contentHash: `sha256:${"c".repeat(64)}`,
      captureDate: {
        raw: "2024:05:06 12:30:45",
        localDateTime: "2024-05-06T12:30:45",
        offsetMinutes: null,
        source: exifProvenance
      }
    })
  };
  const original = structuredClone(document);
  const factSet = photoFactSetFromDocument(document);

  assert.equal(factSet.schemaVersion, PHOTO_FACTS_SCHEMA_VERSION);
  assert.equal(factSet.contentHash, `sha256:${"c".repeat(64)}`);
  assert.equal(factSet.facts[0].value.offsetMinutes, null);
  assert.equal(factSet.facts[0].status, "extracted");
  assert.equal(factSet.dates.fileModifiedAt, document.modificationDate);
  assert.equal(factSet.dates.importedAt, document.importedAt);
  assert.equal(factSet.dates.lastSourceCheckAt, document.indexRecord.lastCheck);
  assert.deepEqual(factSet.sourceCopies, [{
    providerId: "dropbox",
    accountRef: "a".repeat(64),
    itemId: "dropbox-copy-1",
    path: "/Photos/Vacances",
    lastCheckedAt: "2026-11-15T10:19:00.000Z"
  }]);
  assert.deepEqual(photoFactSetFromDocument(document), factSet);
  assert.deepEqual(document, original);
});

test("converts XMP/IPTC captions and keywords into sourced descriptive facts", () => {
  const document = {
    id: "photo-description-facts",
    type: "Image",
    name: "photo.jpg",
    photoMetadata: createPhotoMetadata("photo-description-facts", {
      captions: [{
        text: "Fête familiale",
        source: { kind: "xmp", field: "dc:description[x-default]" }
      }],
      keywords: [{
        text: "anniversaire",
        source: { kind: "iptc", field: "Keywords" }
      }]
    })
  };
  const factSet = photoFactSetFromDocument(document);

  assert.deepEqual(factSet.facts.map(item => ({
    kind: item.kind,
    text: item.value.text,
    source: item.provenance.kind
  })), [
    { kind: "caption", text: "Fête familiale", source: "xmp" },
    { kind: "keyword", text: "anniversaire", source: "iptc" }
  ]);
  const legacyFacts = createPhotoFactSet("photo-old-facts");
  assert.equal(normalizePhotoFactSet({ ...legacyFacts, schemaVersion: 1 }).schemaVersion, PHOTO_FACTS_SCHEMA_VERSION);
});

test("GPS conversion is opt-in and retains precision when explicitly supplied", () => {
  const document = {
    id: "photo-gps",
    type: "Image",
    name: "photo.jpg",
    photoMetadata: createPhotoMetadata("photo-gps", {
      location: {
        status: "available",
        latitude: 48.8566,
        longitude: 2.3522,
        altitudeMeters: 35,
        source: { kind: "exif", field: "GPS" }
      }
    })
  };
  assert.equal(photoFactSetFromDocument(document).facts.length, 0);
  const included = photoFactSetFromDocument(document, { includeLocation: true });
  assert.deepEqual(included.facts[0].value, {
    latitude: 48.8566,
    longitude: 2.3522,
    altitudeMeters: 35,
    accuracyMeters: null
  });
});

test("preserves manual photo annotations as confirmed facts alongside extracted values", () => {
  const document = {
    id: "photo-annotated",
    type: "Image",
    name: "photo.jpg",
    photoMetadata: createPhotoMetadata("photo-annotated", {
      captureDate: {
        raw: "2024:05:06 12:30:45",
        localDateTime: "2024-05-06T12:30:45",
        offsetMinutes: null,
        source: exifProvenance
      }
    }),
    photoAnnotations: {
      captureDateOverride: "2024-05-07T13:00",
      placeLabel: "Maison de famille",
      placeSource: "user",
      personIds: ["member-1"],
      eventTags: ["Anniversaire"]
    }
  };
  const factSet = photoFactSetFromDocument(document);
  const userFacts = factSet.facts.filter(item => item.provenance.kind === "user");

  assert.equal(userFacts.length, 4);
  assert.ok(userFacts.every(item => item.status === "confirmed" && item.review.by === "user"));
  assert.equal(findPhotoFactConflicts(factSet).length, 1);
  assert.equal(findPhotoFactConflicts(factSet)[0].kind, "captureDate");
  assert.equal(factSet.facts.find(item =>
    item.kind === "captureDate" && item.provenance.kind === "exif").status, "extracted");
});

test("requires explicit model evidence and never accepts a textual model excerpt", () => {
  const suggested = fact(
    "model:event:1",
    "event",
    { eventId: null, label: "mariage" },
    { kind: "model", field: "eventClassifier" },
    "suggested",
    {
      evidence: {
        kind: "model-output",
        method: "local-event-classifier",
        modelVersion: "1.2.0",
        calibratedScore: 0.87
      },
      analyzedAt: "2026-11-15T10:00:00Z"
    }
  );
  assert.equal(createPhotoFactSet("photo-model", { facts: [suggested] }).facts[0].evidence.calibratedScore, 0.87);
  assert.throws(() => createPhotoFactSet("photo-model", {
    facts: [{
      ...suggested,
      evidence: { ...suggested.evidence, excerpt: "Mariage détecté" }
    }]
  }), /unsupported field/);
  assert.throws(() => createPhotoFactSet("photo-model", {
    facts: [{ ...suggested, analyzedAt: null }]
  }), /Model facts/);
});

test("provider facts require a stable provider item identity", () => {
  const providerDate = fact("provider-date", "captureDate", {
    raw: null,
    localDateTime: "2025-03-04T10:00:00",
    offsetMinutes: null
  }, {
    kind: "provider", field: "takenDateTime", providerId: "onedrive", itemId: "stable-item-id"
  });
  assert.equal(createPhotoFactSet("provider-photo", { facts: [providerDate] }).facts.length, 1);
  assert.throws(() => createPhotoFactSet("provider-photo", {
    facts: [{
      ...providerDate,
      provenance: { kind: "provider", field: "takenDateTime" }
    }]
  }), /requires a provider and stable item ID/);
  assert.throws(() => createPhotoFactSet("provider-photo", {
    sourceCopies: [{
      providerId: "onedrive", accountRef: null, itemId: "https://temporary.example/item",
      path: null, lastCheckedAt: null
    }]
  }), /URL or credential/);
});

test("merges without overwriting existing facts and surfaces user corrections as conflicts", () => {
  const extracted = fact("capture:exif", "captureDate", {
    raw: "2024:05:06 12:30:45",
    localDateTime: "2024-05-06T12:30:45",
    offsetMinutes: null
  }, exifProvenance);
  const existing = createPhotoFactSet("photo-merge", { facts: [extracted] });
  const correction = fact("capture:user:1", "captureDate", {
    raw: null,
    localDateTime: "2024-05-07T13:00:00",
    offsetMinutes: null
  }, userProvenance, "confirmed", { review: { by: "user", at: null } });

  const merged = mergePhotoFactSets(existing, createPhotoFactSet("photo-merge", { facts: [correction] }));
  assert.deepEqual(merged.facts.map(item => item.id), ["capture:exif", "capture:user:1"]);
  assert.deepEqual(findPhotoFactConflicts(merged), [{
    kind: "captureDate",
    factIds: ["capture:exif", "capture:user:1"]
  }]);
  const resolution = resolvePhotoFact(merged, "captureDate");
  assert.equal(resolution.selected.id, "capture:user:1");
  assert.deepEqual(resolution.conflictingFactIds, ["capture:exif", "capture:user:1"]);
  const ambiguous = mergePhotoFactSets(merged, createPhotoFactSet("photo-merge", {
    facts: [fact("capture:user:2", "captureDate", {
      raw: null,
      localDateTime: "2024-05-08T13:00:00",
      offsetMinutes: null
    }, userProvenance, "confirmed", { review: { by: "user", at: null } })]
  }));
  assert.equal(resolvePhotoFact(ambiguous, "captureDate").selected, null);
  assert.throws(() => mergePhotoFactSets(existing, createPhotoFactSet("another-photo")), /different documents/);
  assert.throws(() => mergePhotoFactSets(existing, createPhotoFactSet("photo-merge", {
    facts: [{ ...extracted, value: { ...extracted.value, localDateTime: "2024-05-08T13:00:00" } }]
  })), /new fact ID/);
});

test("exact duplicate candidates require identical SHA-256 fingerprints and never merge records", () => {
  const hash = `sha256:${"b".repeat(64)}`;
  const exact = findExactPhotoFactDuplicates([
    createPhotoFactSet("copy-a", { contentHash: hash }),
    createPhotoFactSet("copy-b", { contentHash: hash }),
    createPhotoFactSet("unfingerprinted")
  ]);
  assert.deepEqual(exact, [{
    firstDocumentId: "copy-a",
    secondDocumentId: "copy-b",
    contentHash: hash
  }]);
  assert.deepEqual(findExactPhotoFactDuplicates([
    createPhotoFactSet("copy-c"),
    createPhotoFactSet("copy-d")
  ]), []);
});

test("validates source identities, dates, and non-destructive derived-fact dependencies", () => {
  const facts = [
    fact("gps", "location", {
      latitude: 45.5, longitude: -73.6, altitudeMeters: null, accuracyMeters: 12
    }, { kind: "exif", field: "GPS" }),
    fact("place", "place", { label: "Lieu suggéré" }, { kind: "derived", field: "reverseGeocode" },
      "suggested", { dependsOnFactIds: ["gps"] }),
    fact("group", "event", { eventId: null, label: "Groupe temporel" },
      { kind: "derived", field: "timePlaceGrouping" }, "suggested", {
        dependsOnFactIds: ["gps", "place"]
      })
  ];
  const factSet = createPhotoFactSet("photo-derived", { facts });

  assert.deepEqual(getDependentPhotoFactIds(factSet, "gps"), ["group", "place"]);
  const sameProviderItemAcrossAccounts = createPhotoFactSet("shared-copy", {
    sourceCopies: ["a", "b"].map(accountRef => ({
      providerId: "dropbox", accountRef: accountRef.repeat(64), itemId: "same-item",
      path: null, lastCheckedAt: null
    }))
  });
  assert.equal(sameProviderItemAcrossAccounts.sourceCopies.length, 2);
  assert.throws(() => createPhotoFactSet("duplicate-copy", {
    sourceCopies: [
      { providerId: "dropbox", accountRef: "a".repeat(64), itemId: "same-item", path: null, lastCheckedAt: null },
      { providerId: "dropbox", accountRef: "a".repeat(64), itemId: "same-item", path: null, lastCheckedAt: null }
    ]
  }), /identity must be unique/);
  assert.throws(() => createPhotoFactSet("photo-derived", {
    sourceCopies: [{
      providerId: "dropbox", accountRef: "a".repeat(64), itemId: "item",
      path: "https://temporary.example/download?token=secret", lastCheckedAt: null
    }]
  }), /temporary URL|URL or credential/);
  assert.throws(() => createPhotoFactSet("photo-derived", {
    sourceCopies: [{
      providerId: "dropbox", accountRef: "person@example.test", itemId: "item",
      path: null, lastCheckedAt: null
    }]
  }), /opaque SHA-256 fingerprint/);
  assert.throws(() => normalizePhotoFactSet({ schemaVersion: 3, documentId: "photo-derived" }), /Unsupported/);
  assert.throws(() => createPhotoFactSet("photo-derived", {
    facts: [fact("missing-child", "place", { label: "Lieu" }, { kind: "derived", field: "reverseGeocode" },
      "suggested", { dependsOnFactIds: ["missing"] })]
  }), /does not exist/);
  assert.throws(() => createPhotoFactSet("photo-derived", {
    facts: [
      fact("cycle-a", "place", { label: "A" }, { kind: "derived", field: "a" }, "suggested", {
        dependsOnFactIds: ["cycle-b"]
      }),
      fact("cycle-b", "place", { label: "B" }, { kind: "derived", field: "b" }, "suggested", {
        dependsOnFactIds: ["cycle-a"]
      })
    ]
  }), /cycles/);
});

test("reconciliation replaces stale annotation facts and removes location-derived facts without consent", () => {
  const document = {
    id: "photo-reconciled",
    type: "Image",
    name: "photo.jpg",
    photoMetadata: createPhotoMetadata("photo-reconciled", {
      location: {
        status: "available",
        latitude: 48.8566,
        longitude: 2.3522,
        source: { kind: "exif", field: "GPS" }
      },
      captureDate: {
        raw: "2024:05:06 12:30:45",
        localDateTime: "2024-05-06T12:30:45",
        offsetMinutes: null,
        source: exifProvenance
      }
    }),
    photoAnnotations: {
      placeLabel: "Nouveau lieu",
      placeSource: "user"
    }
  };
  const withConsent = reconcilePhotoFactSet(null, document, { includeLocation: true });
  const gps = withConsent.facts.find(item => item.kind === "location");
  assert.ok(gps);
  const withDerived = createPhotoFactSet(document.id, {
    contentHash: withConsent.contentHash,
    sourceCopies: withConsent.sourceCopies,
    dates: withConsent.dates,
    facts: [...withConsent.facts, fact("derived-place", "place", { label: "Lieu dérivé" },
      { kind: "derived", field: "reverseGeocode" }, "suggested", {
        dependsOnFactIds: [gps.id]
      })]
  });
  const updatedDocument = {
    ...document,
    photoAnnotations: { placeLabel: "Lieu corrigé", placeSource: "user" }
  };
  const reconciled = reconcilePhotoFactSet(withDerived, updatedDocument, { includeLocation: false });

  assert.equal(reconciled.facts.some(item => item.kind === "location" || item.id === "derived-place"), false);
  assert.equal(reconciled.facts.some(item => item.kind === "place" && item.value.label === "Nouveau lieu"), false);
  assert.equal(reconciled.facts.some(item => item.kind === "place" && item.value.label === "Lieu corrigé"), true);
  assert.equal(reconciled.facts.some(item => item.kind === "captureDate"), true);
});

test("location removal and export redaction remove transitive dependents without mutating source data", () => {
  const gps = fact("gps", "location", {
    latitude: 45.5, longitude: -73.6, altitudeMeters: null, accuracyMeters: null
  }, { kind: "exif", field: "GPS" });
  const place = fact("derived-place", "place", { label: "Lieu dérivé" },
    { kind: "derived", field: "reverseGeocode" }, "suggested", { dependsOnFactIds: ["gps"] });
  const event = fact("derived-event", "event", { eventId: null, label: "Événement dérivé" },
    { kind: "derived", field: "timePlaceGrouping" }, "suggested", {
      dependsOnFactIds: ["derived-place"]
    });
  const manualPlace = fact("manual-place", "place", { label: "Lieu saisi" },
    userProvenance, "confirmed", { review: { by: "user", at: null } });
  const source = {
    documents: [{
      id: "photo-export",
      photoFacts: createPhotoFactSet("photo-export", { facts: [gps, place, event, manualPlace] }),
      indexRecord: {
        fields: [
          { name: "coordinates", value: "45.5, -73.6" },
          { name: "place", value: "Lieu saisi" }
        ]
      }
    }]
  };
  const removed = removePhotoFactsAndDependents(source.documents[0].photoFacts, ["gps"]);
  const redacted = redactPhotoFactLocationsForExport(source);

  assert.deepEqual(removed.facts.map(item => item.id), ["manual-place"]);
  assert.deepEqual(redacted.documents[0].photoFacts.facts.map(item => item.id), ["manual-place"]);
  assert.deepEqual(redacted.documents[0].indexRecord.fields, [{ name: "place", value: "Lieu saisi" }]);
  assert.deepEqual(source.documents[0].photoFacts.facts.map(item => item.id),
    ["gps", "derived-place", "derived-event", "manual-place"]);
  assert.deepEqual(source.documents[0].indexRecord.fields.map(field => field.name), ["coordinates", "place"]);
});
