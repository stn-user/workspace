import assert from "node:assert/strict";
import test from "node:test";
import { interpretMomentsLifeQuery } from "../moments-life-query.js";
import {
  momentsLifeEvaluationCases,
  momentsLifeMembers,
  momentsLifePhotos
} from "./moments-life-corpus.js";

const places = [...new Map(
  momentsLifePhotos
    .filter(photo => photo.place?.source === "user")
    .map(photo => [photo.place.label, photo.place])
).values()];

const events = [
  { tag: "rentree-scolaire", label: "Rentrée scolaire", aliases: ["première rentrée"] },
  { tag: "anniversaire", label: "Anniversaire" },
  { tag: "sortie-famille", label: "Sortie famille" },
  { tag: "vacances", label: "Vacances" },
  { tag: "promenade", label: "Promenade" },
  { tag: "fete-nationale", label: "Fête nationale" },
  { tag: "jardin", label: "Jardin" },
  { tag: "pique-nique", label: "Pique-nique" }
];

function interpret(query, extra = {}) {
  return interpretMomentsLifeQuery(query, {
    members: momentsLifeMembers,
    places,
    events,
    ...extra
  });
}

test("interprets every synthetic evaluation query into its annotated filters", () => {
  for (const evaluationCase of momentsLifeEvaluationCases) {
    const result = interpret(evaluationCase.query);
    assert.equal(
      result.status,
      evaluationCase.expectedStatus === "clarification" ? "clarification" : "ready",
      evaluationCase.id
    );
    if (evaluationCase.expectedFilters) {
      assert.deepEqual(result.filters, evaluationCase.expectedFilters, evaluationCase.id);
    }
    if (evaluationCase.expectedStatus === "clarification") {
      assert.equal(result.clarificationReason, evaluationCase.clarificationReason, evaluationCase.id);
    }
  }
});

test("uses member birth years and anniversaries without treating them as capture dates", () => {
  const birthYearResult = interpret("Les photos de Alex né en 2021");
  assert.deepEqual(birthYearResult.filters, { personId: "member-alex", memberBirthYear: 2021 });

  const birthDateResult = interpret("La date de naissance d'Alex est le 15 juin 2021");
  assert.deepEqual(birthDateResult.filters, {
    personId: "member-alex",
    memberBirthDate: "2021-06-15"
  });

  const mixedDateResult = interpret("Date de naissance de Alex le 15 juin 2021, photos prises en 2024");
  assert.deepEqual(mixedDateResult.filters, {
    personId: "member-alex",
    memberBirthDate: "2021-06-15",
    captureYear: 2024
  });

  const separateYearsResult = interpret("Photos de Alex né en 2021 prises en 2024");
  assert.deepEqual(separateYearsResult.filters, {
    personId: "member-alex",
    memberBirthYear: 2021,
    captureYear: 2024
  });

  const leapDayResult = interpretMomentsLifeQuery("Photos de Lou quand elle avait 1 an", {
    members: [{ id: "member-lou", displayName: "Lou", birthDate: "2020-02-29" }]
  });
  assert.deepEqual(leapDayResult.filters, {
    personId: "member-lou",
    ageYears: 1,
    captureDateStart: "2021-02-28",
    captureDateEndExclusive: "2022-02-28"
  });
});

test("clarifies ambiguous names, invalid dates, and unsupported queries", () => {
  assert.equal(interpretMomentsLifeQuery("Photos de Alex", {
    members: [
      { id: "member-alex-1", displayName: "Alex" },
      { id: "member-alex-2", displayName: "Alex" }
    ]
  }).clarificationReason, "person-ambiguous");

  assert.equal(interpret("Photos prises le 31 février 2024").clarificationReason, "invalid-date");
  assert.equal(interpret("Raconte-moi un souvenir").clarificationReason, "unsupported-query");
});

test("does not interpret captured local dates by converting an unknown timezone", () => {
  const result = interpret("Les photos d'Alex du 14 juin 2024");
  assert.equal(result.filters.captureLocalDate, "2024-06-14");
  assert.ok(result.explanations.some(item => item.reason === "explicit-capture-date"));
});
