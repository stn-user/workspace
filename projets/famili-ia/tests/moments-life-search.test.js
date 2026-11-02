import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMomentsLifeSearch,
  searchMomentsLife
} from "../moments-life-search.js";
import {
  momentsLifeEvaluationCases,
  momentsLifeMembers,
  momentsLifePhotos
} from "./moments-life-corpus.js";

const photos = momentsLifePhotos.map(photo => ({
  ...photo,
  photoAnnotations: {
    personIds: photo.personIds,
    eventTags: photo.eventTags,
    source: "user",
    ...(photo.place ? { placeLabel: photo.place.label, placeSource: photo.place.source } : {})
  },
  ...(photo.capturedAt
    ? {
      photoMetadata: {
        captureDate: {
          localDateTime: photo.capturedAt.localDateTime,
          offsetMinutes: photo.capturedAt.offsetMinutes,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    }
    : {})
}));
const members = momentsLifeMembers.map(member => ({ ...member, name: member.displayName }));
const events = [
  ...new Map(momentsLifePhotos.flatMap(photo => photo.eventTags.map(tag => [tag, {
    tag,
    label: tag.replace(/-/g, " "),
    aliases: tag === "rentree-scolaire" ? ["première rentrée"] : []
  }]))).values()
];
const places = [...new Map(momentsLifePhotos
  .filter(photo => photo.place)
  .map(photo => [photo.place.label, photo.place])).values()];

test("searches only exact, explicit person, date, place, event, and age metadata filters", () => {
  for (const evaluationCase of momentsLifeEvaluationCases) {
    const result = searchMomentsLife(evaluationCase.query, { photos, members, events, places });
    assert.equal(result.status, evaluationCase.expectedStatus, evaluationCase.id);
    if (evaluationCase.expectedFilters) {
      assert.deepEqual(result.filters, evaluationCase.expectedFilters, evaluationCase.id);
    }
    assert.deepEqual(result.results.map(item => item.photo.id).sort(), [...evaluationCase.expectedPhotoIds].sort(), evaluationCase.id);
  }
});

test("keeps capture dates separate from imports and never searches EXIF coordinates", () => {
  const importedOnly = searchMomentsLife("Les photos importées en 2024", { photos, members });
  assert.deepEqual(importedOnly.results.map(item => item.photo.id), ["photo-008"]);

  const gpsOnly = searchMomentsLife("Les photos prises à 48.8566", {
    photos: [{
      id: "gps-photo",
      photoMetadata: { location: { status: "available", latitude: 48.8566, longitude: 2.3522 } }
    }]
  });
  assert.equal(gpsOnly.status, "not-found");
});

test("ranks matching photos deterministically by capture date, import date, and stable ID", () => {
  const result = searchMomentsLife("Photos d'Alex", {
    photos: [
      { id: "photo-b", photoAnnotations: { personIds: ["member-alex"] }, importedAt: "2025-01-01T10:00:00Z" },
      { id: "photo-a", photoAnnotations: { personIds: ["member-alex"] }, importedAt: "2025-01-01T10:00:00Z" },
      {
        id: "photo-c",
        photoAnnotations: { personIds: ["member-alex"] },
        photoMetadata: { captureDate: { localDateTime: "2024-01-01T12:00:00" } }
      }
    ],
    members: [{ id: "member-alex", name: "Alex" }]
  });
  assert.deepEqual(result.results.map(item => item.photo.id), ["photo-c", "photo-a", "photo-b"]);
  assert.equal(result.results[0].rank, 1);
  assert.ok(result.results[0].reasons.some(reason => reason.reason === "explicit-member-name"));
});

test("reports confidence from explicit sources and flags uncertain capture-date provenance", () => {
  const result = searchMomentsLife("Les photos d'Alex du 15 juin 2023", {
    photos: [{
      id: "photo-known-source",
      photoAnnotations: { source: "user", personIds: ["member-alex"] },
      photoMetadata: {
        captureDate: {
          localDateTime: "2023-06-15T10:00:00",
          offsetMinutes: 120,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    }],
    members: [{ id: "member-alex", name: "Alex" }]
  });
  assert.equal(result.results[0].confidence.level, "high");

  const uncertain = searchMomentsLife("Les photos d'Alex du 15 juin 2023", {
    photos: [{
      id: "photo-unknown-source",
      photoAnnotations: { personIds: ["member-alex"] },
      photoMetadata: {
        captureDate: {
          localDateTime: "2023-06-15T10:00:00",
          offsetMinutes: null,
          source: { kind: "legacy", field: "dateTaken" }
        }
      }
    }],
    members: [{ id: "member-alex", name: "Alex" }]
  });
  assert.equal(uncertain.results[0].confidence.level, "low");
  assert.ok(uncertain.results[0].confidence.reasons.some(reason => reason.includes("provenance des associations")));
  assert.ok(uncertain.results[0].confidence.reasons.some(reason => reason.includes("données anciennes")));
});

test("re-runs locally against user-corrected annotations and capture date without network access", () => {
  const photo = {
    id: "photo-to-correct",
    name: "photo.jpg",
    photoAnnotations: { source: "user", personIds: [], eventTags: [], placeLabel: null, placeSource: null },
    photoMetadata: {
      captureDate: {
        localDateTime: "2022-01-01T10:00:00",
        offsetMinutes: 60,
        source: { kind: "exif", field: "DateTimeOriginal" }
      }
    }
  };
  const query = "Les photos d'Alex du 15 juin 2023";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Moments de vie ne doit pas effectuer d'appel réseau."); };

  try {
    assert.equal(searchMomentsLife(query, {
      photos: [photo],
      members: [{ id: "member-alex", name: "Alex" }]
    }).status, "not-found");

    photo.photoAnnotations = {
      ...photo.photoAnnotations,
      personIds: ["member-alex"],
      captureDateOverride: {
        localDateTime: "2023-06-15T10:00:00",
        offsetMinutes: null,
        source: "user"
      }
    };
    const corrected = searchMomentsLife(query, {
      photos: [photo],
      members: [{ id: "member-alex", name: "Alex" }]
    });
    assert.equal(corrected.status, "results");
    assert.equal(corrected.results[0].confidence.level, "high");
    assert.equal(photo.photoMetadata.captureDate.localDateTime, "2022-01-01T10:00:00");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("meets the 15.4.a deterministic search thresholds on the synthetic corpus", () => {
  const metrics = evaluateMomentsLifeSearch(momentsLifeEvaluationCases, {
    photos,
    members,
    events,
    places,
    limit: 5
  });
  assert.equal(metrics.precisionAtLimit, 1);
  assert.equal(metrics.recallAtLimit, 53 / 54);
  assert.equal(metrics.meanReciprocalRank, 1);
  assert.ok(metrics.precisionAtLimit >= 0.9, `precision@5 ${metrics.precisionAtLimit}`);
  assert.ok(metrics.recallAtLimit >= 0.9, `recall@5 ${metrics.recallAtLimit}`);
  assert.ok(metrics.meanReciprocalRank >= 0.85, `MRR ${metrics.meanReciprocalRank}`);
  assert.equal(metrics.clarificationAccuracy, 1);
  assert.equal(metrics.notFoundAccuracy, 1);
});

test("rejects an invalid evaluation limit", () => {
  assert.throws(() => evaluateMomentsLifeSearch([], { limit: 0 }), /entier positif/);
});
