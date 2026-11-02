export const PHOTO_METADATA_SCHEMA_VERSION = 1;

const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const SOURCES = new Set(["exif", "user", "filename", "legacy"]);
const LOCATION_STATUSES = new Set(["not_requested", "not_found", "omitted", "available", "cleared"]);

function isValidDateTime(value) {
  if (typeof value !== "string") return false;
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) return false;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1
    && day <= daysInMonth[month - 1];
}

function normalizeProvenance(value, field, issues) {
  if (!value || typeof value !== "object" || !SOURCES.has(value.kind)) {
    issues.push(`${field}: provenance missing or invalid`);
    return null;
  }
  if (typeof value.field !== "string" || value.field.trim() === "") {
    issues.push(`${field}: provenance field missing or invalid`);
    return null;
  }
  return { kind: value.kind, field: value.field.trim() };
}

function normalizeCaptureDate(value, issues) {
  if (value == null) return null;
  if (!value || typeof value !== "object") {
    issues.push("captureDate: expected an object");
    return null;
  }

  const raw = typeof value.raw === "string" && value.raw.trim() !== "" ? value.raw : null;
  const localDateTime = typeof value.localDateTime === "string" ? value.localDateTime : null;
  const offsetMinutes = value.offsetMinutes;
  const source = normalizeProvenance(value.source, "captureDate", issues);

  if (raw === null) issues.push("captureDate.raw: missing or invalid");
  if (localDateTime === null || !isValidDateTime(localDateTime)) {
    issues.push("captureDate.localDateTime: missing or invalid");
  }
  if (offsetMinutes !== null && (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60)) {
    issues.push("captureDate.offsetMinutes: invalid timezone offset");
  }
  if (offsetMinutes === undefined) issues.push("captureDate.offsetMinutes: must be null when timezone is unknown");
  if (!source || raw === null || !localDateTime || !isValidDateTime(localDateTime)
    || (offsetMinutes !== null && (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60))
    || offsetMinutes === undefined) {
    return null;
  }

  return { raw, localDateTime, offsetMinutes, source };
}

function normalizeOrientation(value, issues) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || !Number.isInteger(value.value) || value.value < 1 || value.value > 8) {
    issues.push("orientation: expected an EXIF orientation from 1 to 8");
    return null;
  }
  const source = normalizeProvenance(value.source, "orientation", issues);
  return source ? { value: value.value, source } : null;
}

function normalizeDimensions(value, issues) {
  if (value == null) return null;
  if (!value || typeof value !== "object"
    || !Number.isSafeInteger(value.width) || value.width <= 0
    || !Number.isSafeInteger(value.height) || value.height <= 0) {
    issues.push("dimensions: width and height must be positive safe integers");
    return null;
  }
  const source = normalizeProvenance(value.source, "dimensions", issues);
  return source ? { width: value.width, height: value.height, source } : null;
}

function normalizeDevice(value, issues) {
  if (value == null) return null;
  if (!value || typeof value !== "object") {
    issues.push("device: expected an object");
    return null;
  }
  const make = typeof value.make === "string" ? value.make.trim() : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (!make && !model) {
    issues.push("device: make or model must be present");
    return null;
  }
  const source = normalizeProvenance(value.source, "device", issues);
  return source ? { make: make || null, model: model || null, source } : null;
}

function normalizeLocation(value, issues) {
  if (value == null) return { status: "not_requested", latitude: null, longitude: null, altitudeMeters: null, source: null };
  if (!value || typeof value !== "object" || !LOCATION_STATUSES.has(value.status)) {
    issues.push("location: status missing or invalid");
    return { status: "not_requested", latitude: null, longitude: null, altitudeMeters: null, source: null };
  }

  const { status } = value;
  if (status === "not_requested" || status === "not_found") {
    if (value.latitude != null || value.longitude != null || value.altitudeMeters != null) {
      issues.push(`location: coordinates must not be stored when status is ${status}`);
    }
    const source = status === "not_found" ? normalizeProvenance(value.source, "location", issues) : null;
    return { status, latitude: null, longitude: null, altitudeMeters: null, source };
  }
  if (status === "omitted" || status === "cleared") {
    if (value.latitude != null || value.longitude != null || value.altitudeMeters != null) {
      issues.push(`location: coordinates must not be stored when status is ${status}`);
    }
    const source = normalizeProvenance(value.source, "location", issues);
    return { status, latitude: null, longitude: null, altitudeMeters: null, source };
  }

  const { latitude, longitude, altitudeMeters = null } = value;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    issues.push("location: latitude or longitude is invalid");
    return { status: "omitted", latitude: null, longitude: null, altitudeMeters: null, source: null };
  }
  if (altitudeMeters !== null && (typeof altitudeMeters !== "number" || !Number.isFinite(altitudeMeters))) {
    issues.push("location.altitudeMeters: invalid value");
    return { status: "omitted", latitude: null, longitude: null, altitudeMeters: null, source: null };
  }
  const source = normalizeProvenance(value.source, "location", issues);
  return source
    ? { status, latitude, longitude, altitudeMeters, source }
    : { status: "omitted", latitude: null, longitude: null, altitudeMeters: null, source: null };
}

function normalizeContentHash(value, issues) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(value)) {
    issues.push("contentHash: expected sha256 followed by 64 hexadecimal characters");
    return null;
  }
  return value.toLowerCase();
}

export function createPhotoMetadata(documentId, values = {}) {
  if (typeof documentId !== "string" || documentId.trim() === "") {
    throw new TypeError("Photo metadata must be linked to a non-empty document ID.");
  }

  const candidate = {
    schemaVersion: PHOTO_METADATA_SCHEMA_VERSION,
    documentId: documentId.trim(),
    captureDate: values.captureDate ?? null,
    orientation: values.orientation ?? null,
    dimensions: values.dimensions ?? null,
    device: values.device ?? null,
    location: values.location ?? null,
    contentHash: values.contentHash ?? null
  };
  const result = normalizePhotoMetadata(candidate);
  if (result.issues.length > 0) {
    throw new TypeError(`Invalid photo metadata: ${result.issues.join("; ")}`);
  }
  return result.metadata;
}

export function normalizePhotoMetadata(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Photo metadata must be an object.");
  }
  if (value.schemaVersion !== PHOTO_METADATA_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported photo metadata schema version: ${value.schemaVersion ?? "missing"}.`);
  }
  if (typeof value.documentId !== "string" || value.documentId.trim() === "") {
    throw new TypeError("Photo metadata must contain a non-empty documentId.");
  }

  const metadata = {
    schemaVersion: PHOTO_METADATA_SCHEMA_VERSION,
    documentId: value.documentId.trim(),
    captureDate: normalizeCaptureDate(value.captureDate, issues),
    orientation: normalizeOrientation(value.orientation, issues),
    dimensions: normalizeDimensions(value.dimensions, issues),
    device: normalizeDevice(value.device, issues),
    location: normalizeLocation(value.location, issues),
    contentHash: normalizeContentHash(value.contentHash, issues)
  };
  return { metadata, issues };
}

export function migratePhotoMetadata(value, documentId = value?.documentId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Legacy photo metadata must be an object.");
  }
  if (value.schemaVersion === PHOTO_METADATA_SCHEMA_VERSION) {
    if (documentId && documentId !== value.documentId) {
      throw new TypeError("Photo metadata documentId does not match its parent document.");
    }
    return normalizePhotoMetadata(value);
  }
  if (value.schemaVersion != null && value.schemaVersion !== 0) {
    throw new TypeError(`No migration exists for photo metadata schema version ${value.schemaVersion}.`);
  }
  if (typeof documentId !== "string" || documentId.trim() === "") {
    throw new TypeError("Legacy photo metadata migration requires a document ID.");
  }

  const source = (field) => ({ kind: "legacy", field });
  const legacyDate = typeof value.dateTaken === "string" && value.dateTaken.trim() !== ""
    ? value.dateTaken.trim()
    : null;
  const migrationIssues = [];
  if (legacyDate && !isValidDateTime(legacyDate)) {
    migrationIssues.push("dateTaken: invalid legacy date discarded");
  }
  const captureDate = legacyDate && isValidDateTime(legacyDate)
    ? {
      raw: legacyDate,
      localDateTime: legacyDate,
      offsetMinutes: null,
      source: source("dateTaken")
    }
    : null;
  const legacyCoordinatesPresent = value.latitude !== undefined || value.longitude !== undefined;
  const location = legacyCoordinatesPresent
    ? {
      status: "available",
      latitude: value.latitude,
      longitude: value.longitude,
      altitudeMeters: value.altitudeMeters ?? null,
      source: source("coordinates")
    }
    : { status: "not_requested" };
  const legacy = {
    schemaVersion: PHOTO_METADATA_SCHEMA_VERSION,
    documentId: documentId.trim(),
    captureDate,
    orientation: value.orientation == null
      ? null
      : { value: value.orientation, source: source("orientation") },
    dimensions: value.width == null && value.height == null
      ? null
      : { width: value.width, height: value.height, source: source("imageDimensions") },
    device: value.make || value.model
      ? { make: value.make ?? null, model: value.model ?? null, source: source("device") }
      : null,
    location,
    contentHash: value.contentHash ?? null
  };
  const result = normalizePhotoMetadata(legacy);
  return { ...result, issues: [...migrationIssues, ...result.issues] };
}

export function mergePhotoMetadata(existingValue, incomingValue) {
  const existingResult = normalizePhotoMetadata(existingValue);
  const incomingResult = normalizePhotoMetadata(incomingValue);
  if (existingResult.issues.length || incomingResult.issues.length) {
    throw new TypeError(`Cannot merge invalid photo metadata: ${[...existingResult.issues, ...incomingResult.issues].join("; ")}`);
  }
  const existing = existingResult.metadata;
  const incoming = incomingResult.metadata;
  if (existing.documentId !== incoming.documentId) {
    throw new TypeError("Cannot merge photo metadata linked to different documents.");
  }

  const merged = {
    ...existing,
    captureDate: incoming.captureDate ?? existing.captureDate,
    orientation: incoming.orientation ?? existing.orientation,
    dimensions: incoming.dimensions ?? existing.dimensions,
    device: incoming.device ?? existing.device,
    location: incoming.location.status === "not_requested" ? existing.location : incoming.location,
    contentHash: incoming.contentHash ?? existing.contentHash
  };
  return normalizePhotoMetadata(merged).metadata;
}

export function getPhotoDuplicateKey(value) {
  const { metadata, issues } = normalizePhotoMetadata(value);
  if (issues.length > 0) throw new TypeError(`Invalid photo metadata: ${issues.join("; ")}`);
  return metadata.contentHash;
}

export function areDuplicatePhotos(firstValue, secondValue) {
  const firstHash = getPhotoDuplicateKey(firstValue);
  const secondHash = getPhotoDuplicateKey(secondValue);
  return firstHash !== null && firstHash === secondHash;
}

export function redactPhotoLocationsForExport(value) {
  const exported = JSON.parse(JSON.stringify(value));
  if (!Array.isArray(exported?.documents)) return exported;

  exported.documents = exported.documents.map((document) => {
    if (!document.photoMetadata?.location || document.photoMetadata.location.status !== "available") return document;
    return {
      ...document,
      photoMetadata: {
        ...document.photoMetadata,
        location: {
          status: "omitted",
          latitude: null,
          longitude: null,
          altitudeMeters: null,
          source: { kind: "user", field: "exportLocationRedaction" }
        }
      }
    };
  });
  return exported;
}

export function normalizePhotoDocument(document) {
  if (!document || typeof document !== "object" || typeof document.id !== "string" || document.id.trim() === "") {
    throw new TypeError("A photo metadata parent must have a non-empty document ID.");
  }
  if (document.photoMetadata == null) return document;

  const result = migratePhotoMetadata(document.photoMetadata, document.id);
  if (result.issues.length > 0) {
    throw new TypeError(`Invalid photo metadata for document ${document.id}: ${result.issues.join("; ")}`);
  }
  return { ...document, photoMetadata: result.metadata };
}

export async function hashPhotoContent(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") {
    throw new TypeError("Photo content must provide an arrayBuffer() method.");
  }
  return hashPhotoBytes(await blob.arrayBuffer());
}

export async function hashPhotoBytes(bytes) {
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
    throw new TypeError("Photo bytes must be an ArrayBuffer or typed array.");
  }
  if (!globalThis.crypto?.subtle?.digest) {
    throw new Error("SHA-256 is unavailable in this environment; photo content cannot be fingerprinted.");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
