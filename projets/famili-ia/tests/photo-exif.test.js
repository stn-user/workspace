import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { extractPhotoMetadata, mapExifToPhotoMetadata, MAX_PHOTO_FILE_SIZE } from "../photo-exif.js";
import { redactPhotoLocationsForExport } from "../photo-metadata.js";
import { createJpegExifFixture } from "./photo-exif-fixtures.js";

const demoJpeg = fs.readFileSync(path.resolve("assets/piscine/piscine-photo.jpg"));

test("maps capture date, offset, orientation, dimensions, and optional device locally", () => {
  const { metadata, issues } = mapExifToPhotoMetadata("photo-1", {
    DateTimeOriginal: "2024:05:06 12:30:45",
    OffsetTimeOriginal: "+02:00",
    Orientation: 6,
    ImageWidth: 3024,
    ImageLength: 4032,
    Make: "Camera Co",
    Model: "Model X"
  });

  assert.equal(metadata.captureDate.localDateTime, "2024-05-06T12:30:45");
  assert.equal(metadata.captureDate.offsetMinutes, 120);
  assert.equal(metadata.orientation.value, 6);
  assert.deepEqual(metadata.dimensions, {
    width: 3024,
    height: 4032,
    source: { kind: "exif", field: "ImageWidth/ImageLength" }
  });
  assert.equal(metadata.device.model, "Model X");
  assert.equal(metadata.location.status, "not_requested");
  assert.deepEqual(issues, []);
});

test("does not keep supplied GPS coordinates unless explicit location consent is enabled", () => {
  const tags = {};
  const gps = { latitude: 48.8566, longitude: 2.3522, altitude: 35 };
  const denied = mapExifToPhotoMetadata("photo-no-consent", tags, { gps });
  const allowed = mapExifToPhotoMetadata("photo-consent", tags, { includeLocation: true, gps });

  assert.equal(denied.metadata.location.status, "not_requested");
  assert.equal(denied.metadata.location.latitude, null);
  assert.equal(allowed.metadata.location.status, "available");
  assert.equal(allowed.metadata.location.latitude, 48.8566);
  assert.equal(allowed.metadata.location.altitudeMeters, 35);
});

test("discards malformed dates, orientations, and out-of-range GPS with diagnostics", () => {
  const { metadata, issues } = mapExifToPhotoMetadata("photo-invalid", {
    DateTimeOriginal: "2023:02:29 12:00:00",
    Orientation: 12
  }, {
    includeLocation: true,
    gps: { latitude: 91, longitude: 0 }
  });

  assert.equal(metadata.captureDate, null);
  assert.equal(metadata.orientation, null);
  assert.equal(metadata.location.status, "not_found");
  assert.equal(issues.length, 3);
});

test("extracts an EXIF capture date without inventing a timezone", async () => {
  const image = createJpegExifFixture(demoJpeg, {
    dateTimeOriginal: "2024:05:06 12:30:45",
    orientation: 6
  });
  const { metadata, issues } = await extractPhotoMetadata(new Blob([image], { type: "image/jpeg" }), "fixture-photo");

  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.documentId, "fixture-photo");
  assert.equal(metadata.captureDate.localDateTime, "2024-05-06T12:30:45");
  assert.equal(metadata.captureDate.offsetMinutes, null);
  assert.equal(metadata.orientation.value, 6);
  assert.deepEqual(metadata.dimensions, {
    width: 3024,
    height: 4032,
    source: { kind: "exif", field: "ImageWidth/ImageLength" }
  });
  assert.equal(metadata.location.status, "not_requested");
  assert.match(metadata.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(issues, []);
});

test("extracts an explicit EXIF timezone and image orientation", async () => {
  const image = createJpegExifFixture(demoJpeg, {
    dateTimeOriginal: "2025:11:02 08:15:00",
    offsetTimeOriginal: "+02:30",
    orientation: 8
  });
  const { metadata, issues } = await extractPhotoMetadata(new Blob([image]), "fixture-offset");

  assert.equal(metadata.captureDate.offsetMinutes, 150);
  assert.equal(metadata.orientation.value, 8);
  assert.deepEqual(issues, []);
});

test("extracts GPS only after consent using real EXIF GPS tags", async () => {
  const image = createJpegExifFixture(demoJpeg, {
    latitude: 48.8566,
    longitude: 2.3522,
    altitude: 35
  });
  const file = new Blob([image], { type: "image/jpeg" });
  const denied = await extractPhotoMetadata(file, "fixture-gps-denied");
  const allowed = await extractPhotoMetadata(file, "fixture-gps-allowed", { includeLocation: true });

  assert.equal(denied.metadata.location.status, "not_requested");
  assert.equal(denied.metadata.location.latitude, null);
  assert.equal(allowed.metadata.location.status, "available");
  assert.ok(Math.abs(allowed.metadata.location.latitude - 48.8566) < 0.00001);
  assert.ok(Math.abs(allowed.metadata.location.longitude - 2.3522) < 0.00001);
  assert.equal(allowed.metadata.location.altitudeMeters, 35);
});

test("handles a valid PNG and an image with no EXIF metadata", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZsAAAAASUVORK5CYII=",
    "base64"
  );
  const pngResult = await extractPhotoMetadata(new Blob([png], { type: "image/png" }), "fixture-png");
  const noExif = await extractPhotoMetadata(new Blob([demoJpeg]), "fixture-no-exif");

  assert.equal(pngResult.metadata.documentId, "fixture-png");
  assert.equal(pngResult.metadata.captureDate, null);
  assert.deepEqual(pngResult.issues, []);
  assert.equal(noExif.metadata.captureDate, null);
  assert.equal(noExif.metadata.orientation, null);
  assert.deepEqual(noExif.issues, []);
});

test("reports invalid EXIF values and rejects invalid image files", async () => {
  const malformedExif = createJpegExifFixture(demoJpeg, {
    dateTimeOriginal: "2024:02:29 12:00:00",
    offsetTimeOriginal: "+15:00",
    orientation: 9
  });
  const parsed = await extractPhotoMetadata(new Blob([malformedExif]), "fixture-invalid-exif");
  const invalidFile = await extractPhotoMetadata(new Blob(["not a JPEG"]), "fixture-invalid-file");

  assert.equal(parsed.metadata.captureDate.localDateTime, "2024-02-29T12:00:00");
  assert.equal(parsed.metadata.captureDate.offsetMinutes, null);
  assert.equal(parsed.metadata.orientation, null);
  assert.equal(parsed.issues.length, 2);
  assert.match(invalidFile.issues[0], /signature JPEG\/PNG invalide/);
  assert.match(invalidFile.metadata.contentHash, /^sha256:[a-f0-9]{64}$/);
});

test("accepts a photo at the 10 MiB boundary and rejects larger files", async () => {
  const fixture = createJpegExifFixture(demoJpeg, { dateTimeOriginal: "2024:05:06 12:30:45" });
  const exactLimit = Buffer.concat([fixture, Buffer.alloc(MAX_PHOTO_FILE_SIZE - fixture.length)]);
  const atLimit = await extractPhotoMetadata(new Blob([exactLimit]), "fixture-at-limit");
  const overLimit = new Blob([Buffer.concat([exactLimit, Buffer.from([0])])]);

  assert.equal(MAX_PHOTO_FILE_SIZE, 10 * 1024 * 1024);
  assert.equal(overLimit.size, MAX_PHOTO_FILE_SIZE + 1);
  assert.equal(atLimit.metadata.captureDate.localDateTime, "2024-05-06T12:30:45");
  await assert.rejects(
    extractPhotoMetadata(overLimit, "fixture-over-limit"),
    { name: "RangeError", message: /10 MiB/ }
  );
});

test("redacts GPS from exports without mutating local photo metadata", () => {
  const state = {
    documents: [{
      id: "photo-export",
      photoMetadata: {
        schemaVersion: 1,
        documentId: "photo-export",
        location: {
          status: "available",
          latitude: 48.8566,
          longitude: 2.3522,
          altitudeMeters: null,
          source: { kind: "exif", field: "GPS" }
        }
      }
    }]
  };
  const exported = redactPhotoLocationsForExport(state);

  assert.equal(state.documents[0].photoMetadata.location.latitude, 48.8566);
  assert.deepEqual(exported.documents[0].photoMetadata.location, {
    status: "omitted",
    latitude: null,
    longitude: null,
    altitudeMeters: null,
    source: { kind: "user", field: "exportLocationRedaction" }
  });
});
