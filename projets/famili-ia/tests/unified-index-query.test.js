import assert from "node:assert/strict";
import test from "node:test";
import {
  createUnifiedIndexQuery,
  isWithinDateRange,
  mergeUnifiedIndexFilters
} from "../unified-index-query.js";

const members = [{ id: "member-alex", name: "Alex", birthDate: "2021-06-15" }];
const photos = [{
  id: "photo-1",
  name: "vacances.jpg",
  type: "Image",
  photoAnnotations: {
    personIds: ["member-alex"],
    eventTags: ["Vacances"],
    captureDateOverride: null,
    placeLabel: "Québec",
    placeSource: "user"
  }
}];

test("turns an age-and-person photo query into exact multi-source index filters", () => {
  const request = createUnifiedIndexQuery("Les photos d'Alex quand il avait 2 ans", {
    members,
    photos
  });

  assert.equal(request.kind, "photo");
  assert.equal(request.query, "");
  assert.deepEqual(request.filters, {
    type: "photo",
    personId: "member-alex",
    dateType: "priseDeVue",
    dateFrom: "2023-06-15",
    dateTo: "2024-06-14"
  });
  assert.equal(request.profileMismatch, false);
});

test("maps event, place, capture year, and Famili-IA import-date queries", () => {
  const lifeQuery = createUnifiedIndexQuery("Photos des vacances à Québec en 2024", {
    members,
    photos
  });
  assert.deepEqual(lifeQuery.filters, {
    type: "photo",
    place: "Québec",
    eventTag: "Vacances",
    dateType: "priseDeVue",
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31"
  });

  const importedQuery = createUnifiedIndexQuery("Photos importées en 2024", { photos });
  assert.deepEqual(importedQuery.filters, { type: "photo" });
  assert.deepEqual(importedQuery.importDateRange, { from: "2024-01-01", to: "2024-12-31" });
});

test("recherche des coordonnées GPS par paire exacte et rejette les coordonnées invalides", () => {
  const request = createUnifiedIndexQuery("Photos prises à 48.8566, 2.3522");
  assert.equal(request.kind, "photo");
  assert.equal(request.query, "");
  assert.equal(request.filters.coordinates, "48.8566, 2.3522");
  assert.ok(request.explanations.some(explanation =>
    explanation.reason === "explicit-gps-coordinates"));
  assert.equal(createUnifiedIndexQuery("Photos à 91, 2").clarificationReason, "invalid-coordinates");
});

test("keeps ordinary terms in the multi-source search and narrows generic photo terms", () => {
  assert.deepEqual(createUnifiedIndexQuery("facture pergola").kind, "keywords");
  assert.deepEqual(createUnifiedIndexQuery("photos avec un chien").query, "chien");
  assert.deepEqual(createUnifiedIndexQuery("photos avec un chien").filters, { type: "photo" });
});

test("ignores photo quantifiers without dropping content terms or negations", () => {
  const catalog = [{ ...photos[0], photoAnnotations: { eventTags: ["Mariage"] } }];
  for (const query of [
    "montre moi toutes les photos de mon mariage",
    "retrouve tous les souvenirs de mon mariage",
    "montre moi toute photo de mon mariage"
  ]) {
    const request = createUnifiedIndexQuery(query, { photos: catalog });
    assert.equal(request.query, "");
    assert.deepEqual(request.filters, { type: "photo", eventTag: "Mariage" });
  }
  assert.equal(createUnifiedIndexQuery("toutes les photos avec un chien").query, "chien");
  assert.equal(createUnifiedIndexQuery("toutes les photos pas mariage", { photos: catalog }).query, "pas");
});

test("reconnaît la question de source sans perdre les critères photo", () => {
  const catalog = [{ ...photos[0], photoAnnotations: { eventTags: ["Mariage"] } }];
  for (const text of [
    "Où sont mes photos de mon mariage ?",
    "Sur quelles sources se trouvent mes photos de mariage ?"
  ]) {
    const request = createUnifiedIndexQuery(text, { photos: catalog });
    assert.equal(request.sourceIntent, true);
    assert.equal(request.query, "");
    assert.deepEqual(request.filters, { type: "photo", eventTag: "Mariage" });
  }
  const withCoordinates = createUnifiedIndexQuery("Où sont les photos à 12.345, -45.678 ?");
  assert.equal(withCoordinates.sourceIntent, true);
  assert.equal(withCoordinates.query, "");
  assert.equal(withCoordinates.filters.coordinates, "12.345, -45.678");
  assert.equal(createUnifiedIndexQuery("photos de la source chaude").query, "source chaude");
  assert.equal(createUnifiedIndexQuery("photos de mariage").sourceIntent, false);
});

test("uses the complete numeric or written photo date instead of only its year", () => {
  for (const date of ["17/09/2024", "17-09-2024", "17.09.2024", "2024-09-17", "17 septembre 2024"]) {
    const request = createUnifiedIndexQuery(`montre moi toutes les photos du ${date}`);
    assert.equal(request.query, "", date);
    assert.deepEqual(request.filters, {
      type: "photo", dateType: "priseDeVue", dateFrom: "2024-09-17", dateTo: "2024-09-17"
    }, date);
    assert.ok(request.explanations.some(explanation =>
      explanation.reason === "explicit-capture-date" && explanation.phrase === date));
  }
  const imported = createUnifiedIndexQuery("toutes les photos importées le 17/09/2024");
  assert.equal(imported.query, "");
  assert.deepEqual(imported.filters, { type: "photo" });
  assert.deepEqual(imported.importDateRange, { from: "2024-09-17", to: "2024-09-17" });
  assert.equal(createUnifiedIndexQuery("photos du 31/02/2024").clarificationReason, "invalid-date");
});

test("asks for clarification on ambiguous photo intent and checks saved birth data", () => {
  const ambiguous = createUnifiedIndexQuery("Photos d'Alex", {
    members: [
      { id: "alex-1", name: "Alex", birthDate: "2021-06-15" },
      { id: "alex-2", name: "Alex", birthDate: "2018-06-15" }
    ],
    photos
  });
  assert.equal(ambiguous.kind, "clarification");
  assert.equal(ambiguous.clarificationReason, "person-ambiguous");

  const mismatch = createUnifiedIndexQuery("Photos d'Alex né en 2020", { members, photos });
  assert.equal(mismatch.profileMismatch, true);
});

test("combines parsed photo criteria with manual filters without overriding conflicts", () => {
  assert.deepEqual(
    mergeUnifiedIndexFilters(
      { type: "photo", dateType: "priseDeVue", dateFrom: "2023-06-15", dateTo: "2024-06-14" },
      { type: "photo", dateType: "priseDeVue", dateFrom: "2024-01-01", dateTo: "2024-12-31", sourceId: "local" }
    ),
    { type: "photo", dateType: "priseDeVue", dateFrom: "2024-01-01", dateTo: "2024-06-14", sourceId: "local" }
  );
  assert.equal(
    mergeUnifiedIndexFilters({ type: "photo", personId: "member-alex" }, { type: "document" }),
    null
  );
});

test("filters imported photos only when a valid recorded date is in range", () => {
  const range = { from: "2024-01-01", to: "2024-12-31" };
  assert.equal(isWithinDateRange("2024-06-15T10:00:00.000Z", range), true);
  assert.equal(isWithinDateRange("2025-01-01T10:00:00.000Z", range), false);
  assert.equal(isWithinDateRange("unknown", range), false);
});
