export const momentsLifeMembers = [
  { id: "member-alex", displayName: "Alex", birthDate: "2021-06-15" },
  { id: "member-mina", displayName: "Mina", birthDate: "2018-09-02" },
  { id: "member-sam", displayName: "Sam", birthDate: null }
];

export const momentsLifePhotos = [
  {
    id: "photo-001",
    capturedAt: { localDateTime: "2023-06-15T10:00:00", offsetMinutes: null },
    importedAt: "2026-01-03T09:00:00Z",
    personIds: ["member-alex"],
    eventTags: ["sortie-famille"],
    place: { label: "Plage des Pins", source: "user" }
  },
  {
    id: "photo-002",
    capturedAt: { localDateTime: "2023-08-19T12:15:00", offsetMinutes: 120 },
    importedAt: "2026-01-03T09:01:00Z",
    personIds: ["member-alex"],
    eventTags: ["vacances"],
    place: { label: "Plage des Pins", source: "user" }
  },
  {
    id: "photo-003",
    capturedAt: { localDateTime: "2024-06-14T16:30:00", offsetMinutes: null },
    importedAt: "2026-01-03T09:02:00Z",
    personIds: ["member-alex"],
    eventTags: ["anniversaire"],
    place: { label: "Maison", source: "user" }
  },
  {
    id: "photo-004",
    capturedAt: { localDateTime: "2024-06-15T16:30:00", offsetMinutes: 120 },
    importedAt: "2026-01-03T09:03:00Z",
    personIds: ["member-alex"],
    eventTags: ["anniversaire"],
    place: { label: "Maison", source: "user" }
  },
  {
    id: "photo-005",
    capturedAt: { localDateTime: "2024-09-02T08:30:00", offsetMinutes: 120 },
    importedAt: "2026-01-03T09:04:00Z",
    personIds: ["member-mina"],
    eventTags: ["rentree-scolaire"],
    place: { label: "École des Tilleuls", source: "user" }
  },
  {
    id: "photo-006",
    capturedAt: { localDateTime: "2025-03-10T11:00:00", offsetMinutes: null },
    importedAt: "2026-01-03T09:05:00Z",
    personIds: ["member-mina"],
    eventTags: ["promenade"],
    place: { label: "Parc du Lac", source: "user" }
  },
  {
    id: "photo-007",
    capturedAt: { localDateTime: "2025-07-14T20:00:00", offsetMinutes: 120 },
    importedAt: "2026-01-03T09:06:00Z",
    personIds: ["member-alex", "member-mina"],
    eventTags: ["fete-nationale"],
    place: { label: "Place du Village", source: "user" }
  },
  {
    id: "photo-008",
    capturedAt: null,
    importedAt: "2024-06-15T10:00:00Z",
    personIds: ["member-alex"],
    eventTags: ["anniversaire"],
    place: null
  },
  {
    id: "photo-009",
    capturedAt: { localDateTime: "2024-05-10T14:00:00", offsetMinutes: null },
    importedAt: "2026-01-03T09:07:00Z",
    personIds: [],
    eventTags: ["jardin"],
    place: { label: "Maison", source: "user" }
  },
  {
    id: "photo-010",
    capturedAt: { localDateTime: "2023-06-15T10:05:00", offsetMinutes: null },
    importedAt: "2026-01-03T09:08:00Z",
    personIds: [],
    eventTags: ["sortie-famille"],
    place: null
  },
  {
    id: "photo-011",
    capturedAt: { localDateTime: "2025-08-03T15:00:00", offsetMinutes: null },
    importedAt: "2026-01-03T09:09:00Z",
    personIds: ["member-sam"],
    eventTags: ["pique-nique"],
    place: { label: "Parc du Lac", source: "user" }
  },
  {
    id: "photo-012",
    capturedAt: { localDateTime: "2022-05-04T12:00:00", offsetMinutes: 120 },
    importedAt: "2026-01-03T09:10:00Z",
    personIds: ["member-mina"],
    eventTags: ["promenade"],
    place: { label: "Plage des Pins", source: "user" }
  }
];

export const momentsLifeEvaluationCases = [
  {
    id: "person-all-photos",
    category: "person",
    query: "Montre-moi les photos d'Alex",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-001", "photo-002", "photo-003", "photo-004", "photo-007", "photo-008"],
    expectedFilters: { personId: "member-alex" }
  },
  {
    id: "person-and-period",
    category: "person-period",
    query: "Les photos de Mina prises en 2025",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-006", "photo-007"],
    expectedFilters: { personId: "member-mina", captureYear: 2025 }
  },
  {
    id: "age-two-boundary",
    category: "age",
    query: "Les photos d'Alex quand il avait 2 ans",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-001", "photo-002", "photo-003"],
    expectedFilters: {
      personId: "member-alex",
      ageYears: 2,
      captureDateStart: "2023-06-15",
      captureDateEndExclusive: "2024-06-15"
    }
  },
  {
    id: "place-from-user-label",
    category: "place",
    query: "Les photos à la Plage des Pins",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-001", "photo-002", "photo-012"],
    expectedFilters: { placeLabel: "Plage des Pins", placeSource: "user" }
  },
  {
    id: "event",
    category: "event",
    query: "La première rentrée de Mina",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-005"],
    expectedFilters: { personId: "member-mina", eventTag: "rentree-scolaire" }
  },
  {
    id: "capture-date-not-import-date",
    category: "capture-period",
    query: "Les photos prises en 2024",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-003", "photo-004", "photo-005", "photo-009"],
    expectedFilters: { captureYear: 2024 }
  },
  {
    id: "import-date-not-capture-date",
    category: "import-period",
    query: "Les photos importées en 2024",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-008"],
    expectedFilters: { importYear: 2024 }
  },
  {
    id: "unknown-timezone-keeps-local-day",
    category: "unknown-timezone",
    query: "Les photos d'Alex du 14 juin 2024",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-003"],
    expectedFilters: { personId: "member-alex", captureLocalDate: "2024-06-14" }
  },
  {
    id: "ambiguous-season",
    category: "ambiguity",
    query: "Les photos d'Alex en été",
    expectedStatus: "clarification",
    expectedPhotoIds: [],
    clarificationReason: "year-required"
  },
  {
    id: "age-without-birth-date",
    category: "ambiguity",
    query: "Les photos de Sam quand il avait 2 ans",
    expectedStatus: "clarification",
    expectedPhotoIds: [],
    clarificationReason: "birth-date-required"
  },
  {
    id: "no-result",
    category: "no-result",
    query: "Les photos prises à Tokyo",
    expectedStatus: "not-found",
    expectedPhotoIds: [],
    expectedFilters: { placeLabel: "Tokyo", placeSource: "user" }
  },
  {
    id: "no-inferred-person",
    category: "person",
    query: "Les photos d'Alex le 15 juin 2023",
    expectedStatus: "results",
    expectedPhotoIds: ["photo-001"],
    expectedFilters: { personId: "member-alex", captureLocalDate: "2023-06-15" }
  }
];
