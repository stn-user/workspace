import assert from "node:assert/strict";
import test from "node:test";
import {
  isPhotoDocument,
  normalizePhotoAnnotations,
  removePhotoMemberAssociation,
  PHOTO_ANNOTATIONS_SCHEMA_VERSION
} from "../photo-annotations.js";

test("normalizes explicit member and event annotations with user provenance", () => {
  const annotations = normalizePhotoAnnotations({
    personIds: ["member-1", "member-1"],
    eventTags: ["  Fête d'été ", "fete d'ete", "Anniversaire"]
  }, ["member-1"]);

  assert.deepEqual(annotations, {
    schemaVersion: PHOTO_ANNOTATIONS_SCHEMA_VERSION,
    personIds: ["member-1"],
    eventTags: ["Fête d'été", "Anniversaire"],
    captureDateOverride: null,
    placeLabel: null,
    placeSource: null,
    source: "user"
  });
});

test("rejects unknown family members and malformed event annotations", () => {
  assert.throws(() => normalizePhotoAnnotations({ personIds: ["missing-member"] }, ["member-1"]), /membres existants/);
  assert.throws(() => normalizePhotoAnnotations({ personIds: "member-1" }, ["member-1"]), /liste/);
  assert.throws(() => normalizePhotoAnnotations({ eventTags: [7] }, ["member-1"]), /libellé textuel/);
  assert.throws(() => normalizePhotoAnnotations({ schemaVersion: 2 }, ["member-1"]), /non prise en charge/);
  assert.throws(() => normalizePhotoAnnotations({ placeLabel: "Paris" }, ["member-1"]), /saisi explicitement/);
});

test("keeps explicitly entered place labels separate from GPS metadata", () => {
  assert.deepEqual(normalizePhotoAnnotations({
    placeLabel: "  Maison   de famille ",
    placeSource: "user"
  }), {
    schemaVersion: PHOTO_ANNOTATIONS_SCHEMA_VERSION,
    personIds: [],
    eventTags: [],
    captureDateOverride: null,
    placeLabel: "Maison de famille",
    placeSource: "user",
    source: "user"
  });
});

test("validates and normalizes user-corrected local capture dates", () => {
  const annotations = normalizePhotoAnnotations({
    captureDateOverride: "2024-02-29T18:05"
  });
  assert.deepEqual(annotations.captureDateOverride, {
    localDateTime: "2024-02-29T18:05:00",
    offsetMinutes: null,
    source: "user"
  });
  assert.equal(normalizePhotoAnnotations({ captureDateOverride: null }).captureDateOverride, null);
  assert.throws(() => normalizePhotoAnnotations({ captureDateOverride: "2023-02-29T18:05" }), /date de prise de vue valide/);
  assert.throws(() => normalizePhotoAnnotations({ captureDateOverride: "2024-02-29" }), /date de prise de vue valide/);
});

test("recognizes supported photo documents without classifying unrelated files as photos", () => {
  assert.equal(isPhotoDocument({ type: "Image", name: "photo.jpeg" }), true);
  assert.equal(isPhotoDocument({ name: "photo.png" }), true);
  assert.equal(isPhotoDocument({ type: "PDF", name: "photo.pdf" }), false);
});

test("removes a deleted member association while retaining other manual annotations", () => {
  assert.deepEqual(removePhotoMemberAssociation({
    personIds: ["member-1", "member-2"],
    eventTags: ["vacances"]
  }, "member-1", ["member-2"]), {
    schemaVersion: PHOTO_ANNOTATIONS_SCHEMA_VERSION,
    personIds: ["member-2"],
    eventTags: ["vacances"],
    captureDateOverride: null,
    placeLabel: null,
    placeSource: null,
    source: "user"
  });
});
