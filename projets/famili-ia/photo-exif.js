import { createPhotoMetadata, hashPhotoBytes } from "./photo-metadata.js";

export const MAX_PHOTO_FILE_SIZE = 10 * 1024 * 1024;

const EXIF_TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "OffsetTimeOriginal",
  "OffsetTimeDigitized",
  "OffsetTime",
  "Orientation",
  "ImageWidth",
  "ImageHeight",
  "ImageLength",
  "ExifImageWidth",
  "ExifImageHeight",
  "Make",
  "Model"
];

function parseOffsetMinutes(value) {
  if (typeof value !== "string") return null;
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  const offset = hours * 60 + minutes;
  return match[1] === "-" ? -offset : offset;
}

function isValidExifCalendarDate(year, month, day, hour, minute, second) {
  const numeric = [year, month, day, hour, minute, second].map(Number);
  const [yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] = numeric;
  if (yearNumber < 1 || monthNumber < 1 || monthNumber > 12
    || hourNumber > 23 || minuteNumber > 59 || secondNumber > 59) return false;
  const leapYear = yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dayNumber >= 1 && dayNumber <= daysInMonth[monthNumber - 1];
}

function parseExifDate(raw, offsetRaw, field, issues) {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    issues.push("captureDate: EXIF date is missing or malformed");
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  if (!isValidExifCalendarDate(year, month, day, hour, minute, second)) {
    issues.push("captureDate: invalid EXIF calendar date discarded");
    return null;
  }
  const localDateTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const offsetMinutes = offsetRaw == null ? null : parseOffsetMinutes(offsetRaw);
  if (offsetRaw != null && offsetMinutes === null) {
    issues.push("captureDate: EXIF timezone offset is malformed; timezone kept unknown");
  }
  return {
    raw: raw.trim(),
    localDateTime,
    offsetMinutes,
    source: { kind: "exif", field }
  };
}

function positiveDimension(...values) {
  return values.find((value) => Number.isSafeInteger(value) && value > 0) ?? null;
}

export function mapExifToPhotoMetadata(documentId, tags = {}, {
  includeLocation = false,
  gps = null,
  contentHash = null
} = {}) {
  const issues = [];
  const dateField = tags.DateTimeOriginal != null ? "DateTimeOriginal" : "CreateDate";
  const rawCaptureDate = tags.DateTimeOriginal ?? tags.CreateDate ?? null;
  const offsetRaw = tags.OffsetTimeOriginal ?? tags.OffsetTimeDigitized ?? tags.OffsetTime ?? null;
  const captureDate = parseExifDate(rawCaptureDate, offsetRaw, dateField, issues);
  const orientation = Number.isInteger(tags.Orientation) && tags.Orientation >= 1 && tags.Orientation <= 8
    ? { value: tags.Orientation, source: { kind: "exif", field: "Orientation" } }
    : null;
  if (tags.Orientation != null && orientation === null) issues.push("orientation: invalid EXIF value discarded");

  const width = positiveDimension(tags.ExifImageWidth, tags.ImageWidth);
  const height = positiveDimension(tags.ExifImageHeight, tags.ImageLength, tags.ImageHeight);
  const dimensions = width && height
    ? { width, height, source: { kind: "exif", field: "ImageWidth/ImageLength" } }
    : null;

  const make = typeof tags.Make === "string" ? tags.Make.trim() : "";
  const model = typeof tags.Model === "string" ? tags.Model.trim() : "";
  const device = make || model
    ? { make: make || null, model: model || null, source: { kind: "exif", field: "Make/Model" } }
    : null;

  let location = { status: "not_requested" };
  if (includeLocation) {
    const latitude = gps?.latitude;
    const longitude = gps?.longitude;
    const validCoordinates = typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    location = validCoordinates
      ? {
        status: "available",
        latitude,
        longitude,
        altitudeMeters: typeof gps.altitude === "number" && Number.isFinite(gps.altitude) ? gps.altitude : null,
        source: { kind: "exif", field: "GPS" }
      }
      : { status: "not_found", source: { kind: "exif", field: "GPS" } };
    if (gps && !validCoordinates) issues.push("location: invalid EXIF coordinates discarded");
  }

  return {
    metadata: createPhotoMetadata(documentId, { captureDate, orientation, dimensions, device, location, contentHash }),
    issues
  };
}

export async function extractPhotoMetadata(file, documentId, { includeLocation = false } = {}) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new TypeError("Photo metadata extraction requires a local File or Blob.");
  }
  if (file.size > MAX_PHOTO_FILE_SIZE) {
    throw new RangeError("Photo exceeds the 10 MiB metadata extraction limit.");
  }

  const exifrModule = await import("exifr");
  const exifr = exifrModule.default ?? exifrModule;
  const issues = [];
  let tags = {};
  let gps = null;
  let contentHash = null;
  const imageBytes = new Uint8Array(await file.arrayBuffer());
  const header = imageBytes.subarray(0, 8);
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = header.length === 8
    && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
    && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a;

  if (!isJpeg && !isPng) {
    issues.push("Image: signature JPEG/PNG invalide");
  } else {
    try {
      tags = await exifr.parse(imageBytes, {
        tiff: { pick: EXIF_TAGS, translateValues: false, reviveValues: false },
        exif: { pick: EXIF_TAGS, translateValues: false, reviveValues: false },
        gps: false,
        xmp: false,
        iptc: false,
        icc: false,
        jfif: false,
        ihdr: true
      }) || {};
    } catch (error) {
      issues.push(`EXIF: ${error instanceof Error ? error.message : "lecture impossible"}`);
    }
    if (includeLocation) {
      try {
        gps = await exifr.parse(imageBytes, {
          tiff: {
            pick: ["GPSAltitude", "GPSAltitudeRef", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"],
            translateValues: false,
            reviveValues: false
          },
          exif: {
            pick: ["GPSAltitude", "GPSAltitudeRef", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"],
            translateValues: false,
            reviveValues: false
          },
          gps: true,
          xmp: false,
          iptc: false,
          icc: false,
          jfif: false,
          ihdr: false
        });
        if (gps && typeof gps.GPSAltitude === "number") {
          const altitudeReference = ArrayBuffer.isView(gps.GPSAltitudeRef)
            ? gps.GPSAltitudeRef[0]
            : gps.GPSAltitudeRef;
          gps.altitude = gps.GPSAltitude * (altitudeReference === 1 ? -1 : 1);
        }
      } catch (error) {
        issues.push(`GPS EXIF: ${error instanceof Error ? error.message : "lecture impossible"}`);
      }
    }
  }
  try {
    contentHash = await hashPhotoBytes(imageBytes);
  } catch (error) {
    issues.push(`Empreinte photo: ${error instanceof Error ? error.message : "calcul impossible"}`);
  }

  const mapped = mapExifToPhotoMetadata(documentId, tags, { includeLocation, gps, contentHash });
  return { ...mapped, issues: [...mapped.issues, ...issues] };
}
