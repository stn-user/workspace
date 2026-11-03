import assert from "node:assert/strict";
import test from "node:test";
import {
  getPhotoTimelineDateInfo,
  getTimelineDateLabel,
  groupPhotosForTimeline
} from "../photo-timeline.js";

function result(id, photo = {}) {
  return { rank: 1, photo: { id, ...photo } };
}

test("groups photos by their local capture day without applying timezone offsets", () => {
  const photos = [
    result("late-local", {
      photoMetadata: {
        captureDate: {
          localDateTime: "2024-06-01T23:45:00",
          offsetMinutes: 840,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    }),
    result("next-day", {
      photoMetadata: {
        captureDate: {
          localDateTime: "2024-06-02T00:15:00",
          offsetMinutes: -720,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    })
  ];

  const groups = groupPhotosForTimeline(photos, "day");

  assert.deepEqual(groups.map(group => group.key), ["2024-06-02", "2024-06-01"]);
  assert.deepEqual(groups[1].entries.map(entry => entry.result.photo.id), ["late-local"]);
});

test("groups by month and places photos without valid capture dates last", () => {
  const groups = groupPhotosForTimeline([
    result("invalid", {
      photoMetadata: {
        captureDate: {
          localDateTime: "2023-02-29T12:00:00",
          offsetMinutes: 0,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    }),
    result("february", {
      photoAnnotations: {
        captureDateOverride: { localDateTime: "2024-02-29T18:05:00", source: "user", offsetMinutes: null }
      }
    }),
    result("march", {
      photoMetadata: {
        captureDate: {
          localDateTime: "2024-03-01T00:00:00",
          offsetMinutes: null,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    })
  ], "month");

  assert.deepEqual(groups.map(group => group.key), ["2024-03", "2024-02", "undated"]);
  assert.equal(groups[2].label, "Date de prise de vue indisponible");
});

test("labels legacy dates as estimated and EXIF dates with unknown timezone explicitly", () => {
  const estimated = getPhotoTimelineDateInfo({
    id: "legacy",
    capturedAt: { localDateTime: "2020-05-04T10:00:00" }
  });
  const unknownTimezone = getPhotoTimelineDateInfo({
    id: "exif-no-offset",
    photoMetadata: {
      captureDate: {
        localDateTime: "2025-11-02T08:15:00",
        offsetMinutes: null,
        source: { kind: "exif", field: "DateTimeOriginal" }
      }
    }
  });
  const manual = getPhotoTimelineDateInfo({
    id: "manual",
    photoAnnotations: {
      captureDateOverride: { localDateTime: "2024-02-29T18:05:00", source: "user", offsetMinutes: null }
    }
  });

  assert.equal(estimated.estimated, true);
  assert.match(getTimelineDateLabel(estimated), /^Date estimée/);
  assert.equal(unknownTimezone.timezoneUnknown, true);
  assert.match(getTimelineDateLabel(unknownTimezone), /fuseau inconnu/);
  assert.equal(manual.timezoneUnknown, false);
  assert.equal(manual.estimated, false);
  assert.match(getTimelineDateLabel(manual), /saisie manuellement/);
});

test("groups each photo under one explicit event and keeps other event labels on its result", () => {
  const groups = groupPhotosForTimeline([
    result("multiple-events", {
      photoAnnotations: { eventTags: ["Vacances", "Anniversaire"] },
      photoMetadata: {
        captureDate: {
          localDateTime: "2024-07-14T12:00:00",
          offsetMinutes: 120,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    }),
    result("no-event", {
      photoMetadata: {
        captureDate: {
          localDateTime: "2024-07-15T12:00:00",
          offsetMinutes: 120,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }
    })
  ], "event");

  assert.deepEqual(groups.map(group => group.label), ["Sans événement associé", "Anniversaire"]);
  assert.deepEqual(groups.map(group => group.entries.length), [1, 1]);
  assert.deepEqual(groups[1].entries[0].result.photo.photoAnnotations.eventTags, ["Vacances", "Anniversaire"]);
});

test("rejects unknown grouping modes and malformed result input", () => {
  assert.throws(() => groupPhotosForTimeline({}, "day"), /liste/);
  assert.throws(() => groupPhotosForTimeline([], "week"), /day, month ou event/);
});
