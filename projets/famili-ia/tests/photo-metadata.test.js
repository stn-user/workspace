import assert from "node:assert/strict";
import test from "node:test";
import {
  createPhotoMetadata,
  areDuplicatePhotos,
  getPhotoDuplicateKey,
  hashPhotoBytes,
  hashPhotoContent,
  mergePhotoMetadata,
  migratePhotoMetadata,
  normalizePhotoMetadata,
  normalizePhotoDocument,
  PHOTO_METADATA_SCHEMA_VERSION
} from "../photo-metadata.js";

const provenance = { kind: "exif", field: "DateTimeOriginal" };

test("creates versioned photo metadata linked to its document and preserves unknown timezone", () => {
  const metadata = createPhotoMetadata("photo-1", {
    captureDate: {
      raw: "2024:05:06 12:30:45",
      localDateTime: "2024-05-06T12:30:45",
      offsetMinutes: null,
      source: provenance
    }
  });

  assert.equal(metadata.schemaVersion, PHOTO_METADATA_SCHEMA_VERSION);
  assert.equal(metadata.documentId, "photo-1");
  assert.equal(metadata.captureDate.offsetMinutes, null);
  assert.deepEqual(metadata.location, {
    status: "not_requested",
    latitude: null,
    longitude: null,
    altitudeMeters: null,
    source: null
  });
});

test("preserves a known timezone offset without converting the captured wall time", () => {
  const metadata = createPhotoMetadata("photo-with-offset", {
    captureDate: {
      raw: "2024:05:06 12:30:45+02:00",
      localDateTime: "2024-05-06T12:30:45",
      offsetMinutes: 120,
      source: provenance
    }
  });
  assert.equal(metadata.captureDate.localDateTime, "2024-05-06T12:30:45");
  assert.equal(metadata.captureDate.offsetMinutes, 120);
});

test("keeps missing EXIF distinct from corrupt metadata and reports invalid fields", () => {
  const missing = normalizePhotoMetadata({
    schemaVersion: 1,
    documentId: "photo-2"
  });
  assert.deepEqual(missing.issues, []);
  assert.equal(missing.metadata.captureDate, null);

  const corrupt = normalizePhotoMetadata({
    schemaVersion: 1,
    documentId: "photo-3",
    captureDate: {
      raw: "2023:02:29 12:00:00",
      localDateTime: "2023-02-29T12:00:00",
      offsetMinutes: null,
      source: provenance
    },
    orientation: { value: 9, source: { kind: "exif", field: "Orientation" } }
  });
  assert.equal(corrupt.metadata.captureDate, null);
  assert.equal(corrupt.metadata.orientation, null);
  assert.equal(corrupt.issues.length, 2);
});

test("validates coordinates and requires explicit source provenance", () => {
  const invalidLocation = normalizePhotoMetadata({
    schemaVersion: 1,
    documentId: "photo-4",
    location: {
      status: "available",
      latitude: 91,
      longitude: 2,
      altitudeMeters: null,
      source: { kind: "exif", field: "GPS" }
    }
  });
  assert.equal(invalidLocation.metadata.location.status, "omitted");
  assert.equal(invalidLocation.metadata.location.latitude, null);
  assert.equal(invalidLocation.issues.length, 1);

  assert.throws(() => createPhotoMetadata("photo-5", {
    dimensions: { width: 100, height: 100, source: { kind: "unknown", field: "size" } }
  }), /Invalid photo metadata/);
});

test("migrates the documented legacy shape without inventing a timezone", () => {
  const migrated = migratePhotoMetadata({
    dateTaken: "2022-08-09T10:11:12",
    orientation: 6,
    width: 3024,
    height: 4032,
    make: "Camera Co",
    model: "Model X",
    latitude: 45.5,
    longitude: -73.6
  }, "photo-6");

  assert.equal(migrated.metadata.schemaVersion, 1);
  assert.equal(migrated.metadata.captureDate.offsetMinutes, null);
  assert.equal(migrated.metadata.orientation.value, 6);
  assert.equal(migrated.metadata.location.status, "available");
  assert.deepEqual(migrated.issues, []);
});

test("rejects unknown schema versions and malformed legacy dates explicitly", () => {
  assert.throws(() => migratePhotoMetadata({ schemaVersion: 4, documentId: "photo-7" }), /No migration exists/);
  const migrated = migratePhotoMetadata({ dateTaken: "not a date" }, "photo-8");
  assert.equal(migrated.metadata.captureDate, null);
  assert.deepEqual(migrated.issues, ["dateTaken: invalid legacy date discarded"]);
});

test("merges metadata idempotently per document and allows explicit location removal", () => {
  const existing = createPhotoMetadata("photo-9", {
    orientation: { value: 1, source: { kind: "exif", field: "Orientation" } },
    location: {
      status: "available",
      latitude: 45,
      longitude: 3,
      altitudeMeters: null,
      source: { kind: "exif", field: "GPS" }
    }
  });
  const update = createPhotoMetadata("photo-9", {
    location: { status: "cleared", source: { kind: "user", field: "removeLocation" } }
  });

  const merged = mergePhotoMetadata(existing, update);
  assert.equal(merged.orientation.value, 1);
  assert.equal(merged.location.status, "cleared");
  assert.equal(merged.location.latitude, null);
  assert.deepEqual(mergePhotoMetadata(merged, update), merged);
  assert.throws(() => mergePhotoMetadata(existing, createPhotoMetadata("other-photo")), /different documents/);
});

test("uses a cryptographic content hash, never a filename, as the duplicate key", () => {
  const contentHash = `sha256:${"a".repeat(64)}`;
  const photo = createPhotoMetadata("photo-10", { contentHash });
  assert.equal(getPhotoDuplicateKey(photo), contentHash);
  assert.equal(getPhotoDuplicateKey(createPhotoMetadata("photo-11")), null);
  assert.throws(() => createPhotoMetadata("photo-12", { contentHash: "same-name.jpg" }), /Invalid photo metadata/);
});

test("hashes exact photo bytes and detects only byte-identical duplicate files", async () => {
  const hash = await hashPhotoContent(new Blob([]));
  assert.equal(await hashPhotoBytes(new Uint8Array()), hash);
  assert.equal(hash, `sha256:${"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}`);

  const first = createPhotoMetadata("photo-a", { contentHash: hash });
  const duplicate = createPhotoMetadata("photo-b", { contentHash: hash });
  const other = createPhotoMetadata("photo-c", { contentHash: `sha256:${"a".repeat(64)}` });
  assert.equal(areDuplicatePhotos(first, duplicate), true);
  assert.equal(areDuplicatePhotos(first, other), false);
  assert.equal(areDuplicatePhotos(createPhotoMetadata("photo-no-hash"), duplicate), false);
});

test("requires document identity and rejects unsupported schema versions", () => {
  assert.throws(() => createPhotoMetadata(""), /document ID/);
  assert.throws(() => normalizePhotoMetadata({ schemaVersion: 2, documentId: "photo-13" }), /Unsupported/);
});

test("normalizes photo metadata on its parent document and rejects mismatched links", () => {
  const document = {
    id: "photo-14",
    name: "photo.jpg",
    photoMetadata: createPhotoMetadata("photo-14")
  };
  assert.equal(normalizePhotoDocument(document).photoMetadata.documentId, document.id);
  assert.throws(() => normalizePhotoDocument({
    ...document,
    photoMetadata: createPhotoMetadata("another-document")
  }), /does not match/);
});
