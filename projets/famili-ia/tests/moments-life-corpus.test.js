import assert from "node:assert/strict";
import test from "node:test";
import {
  momentsLifeEvaluationCases,
  momentsLifeMembers,
  momentsLifePhotos
} from "./moments-life-corpus.js";

test("provides a deterministic, fully referenced synthetic moments corpus", () => {
  const memberIds = new Set(momentsLifeMembers.map(member => member.id));
  const photoIds = new Set(momentsLifePhotos.map(photo => photo.id));
  const caseIds = new Set();

  assert.equal(momentsLifeMembers.length, 3);
  assert.equal(memberIds.size, momentsLifeMembers.length);
  assert.equal(momentsLifePhotos.length, 12);
  assert.equal(momentsLifeEvaluationCases.length, 12);

  for (const member of momentsLifeMembers) {
    if (member.birthDate !== null) {
      assert.match(member.birthDate, /^\d{4}-\d{2}-\d{2}$/);
    }
  }

  for (const photo of momentsLifePhotos) {
    assert.ok(photo.id.startsWith("photo-"));
    assert.ok(Array.isArray(photo.personIds));
    assert.ok(photo.personIds.every(id => memberIds.has(id)), photo.id);
    assert.ok(Array.isArray(photo.eventTags));
    assert.ok(photo.place === null || photo.place.source === "user");
    assert.ok(!("latitude" in photo) && !("longitude" in photo), "corpus must not contain coordinates");
    if (photo.capturedAt !== null) {
      assert.match(photo.capturedAt.localDateTime, /^\d{4}-\d{2}-\d{2}T/);
      assert.ok(photo.capturedAt.offsetMinutes === null || Number.isInteger(photo.capturedAt.offsetMinutes));
    }
  }

  for (const evaluationCase of momentsLifeEvaluationCases) {
    assert.ok(!caseIds.has(evaluationCase.id), `duplicate case ID ${evaluationCase.id}`);
    caseIds.add(evaluationCase.id);
    assert.ok(evaluationCase.query.trim().length > 0);
    assert.ok(evaluationCase.expectedPhotoIds.every(id => photoIds.has(id)), evaluationCase.id);
    assert.ok(["results", "clarification", "not-found"].includes(evaluationCase.expectedStatus));
    if (evaluationCase.expectedStatus === "clarification") {
      assert.ok(evaluationCase.clarificationReason);
      assert.deepEqual(evaluationCase.expectedPhotoIds, []);
    }
    if (evaluationCase.expectedStatus === "not-found") {
      assert.deepEqual(evaluationCase.expectedPhotoIds, []);
    }
  }
});

test("covers all required moments-query dimensions and uncertainty boundaries", () => {
  const categories = new Set(momentsLifeEvaluationCases.map(item => item.category));
  for (const category of [
    "person",
    "person-period",
    "age",
    "place",
    "event",
    "capture-period",
    "import-period",
    "unknown-timezone",
    "ambiguity",
    "no-result"
  ]) {
    assert.ok(categories.has(category), `missing evaluation category ${category}`);
  }

  const ageCase = momentsLifeEvaluationCases.find(item => item.id === "age-two-boundary");
  assert.deepEqual(ageCase.expectedPhotoIds, ["photo-001", "photo-002", "photo-003"]);
  assert.ok(!ageCase.expectedPhotoIds.includes("photo-004"), "the third birthday is exclusive");

  const importPeriodCase = momentsLifeEvaluationCases.find(item => item.id === "import-date-not-capture-date");
  assert.deepEqual(importPeriodCase.expectedPhotoIds, ["photo-008"]);
  assert.equal(momentsLifePhotos.find(photo => photo.id === "photo-008").capturedAt, null);

  const noInferredPersonCase = momentsLifeEvaluationCases.find(item => item.id === "no-inferred-person");
  assert.deepEqual(noInferredPersonCase.expectedPhotoIds, ["photo-001"]);
  assert.equal(momentsLifePhotos.find(photo => photo.id === "photo-010").personIds.length, 0);
});
