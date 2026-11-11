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

test("keeps ordinary terms in the multi-source search and narrows generic photo terms", () => {
  assert.deepEqual(createUnifiedIndexQuery("facture pergola").kind, "keywords");
  assert.deepEqual(createUnifiedIndexQuery("photos avec un chien").query, "chien");
  assert.deepEqual(createUnifiedIndexQuery("photos avec un chien").filters, { type: "photo" });
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
