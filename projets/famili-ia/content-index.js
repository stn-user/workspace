import { hashPhotoBytes } from "./photo-metadata.js";
import { getInventorySource } from "./data-inventory.js";

const methods = new Set(["local-text", "local-word", "local-pdf", "drive-text", "drive-pdf-text"]);

function payload(document, method, ranges) {
  return JSON.stringify([1, getInventorySource(document), document.id, method, document.content, ranges]);
}

async function fingerprint(document, method, ranges) {
  return hashPhotoBytes(new TextEncoder().encode(payload(document, method, ranges)));
}

export async function createContentProvenance(document, segments, method) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new TypeError("Document invalide");
  const source = getInventorySource(document);
  const isDriveMethod = method === "drive-text" || method === "drive-pdf-text";
  if (typeof document.id !== "string" || !document.id.trim() ||
      typeof document.content !== "string" || !Array.isArray(segments) ||
      !methods.has(method) || (isDriveMethod ? source !== "drive" : source !== "local")) {
    throw new TypeError("Provenance du contenu invalide");
  }
  const ranges = [];
  let offset = 0;
  for (const segment of segments) {
    if (typeof segment !== "string") throw new TypeError("Segment extrait invalide");
    if (!segment.trim()) continue;
    const start = document.content.indexOf(segment, offset);
    if (start < 0) throw new TypeError("Segment extrait absent ou hors ordre");
    ranges.push([start, start + segment.length]);
    offset = start + segment.length;
  }
  if (!ranges.length) return null;
  const content = document.content;
  const identity = JSON.stringify([source, document.id]);
  const hash = await fingerprint(document, method, ranges);
  if (document.content !== content || JSON.stringify([getInventorySource(document), document.id]) !== identity) {
    throw new Error("Document modifié pendant la création de sa provenance");
  }
  return { version: 1, method, ranges, hash };
}

export async function restoreContentSegments(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new TypeError("Document invalide");
  const provenance = document?.contentProvenance;
  if (provenance === undefined || provenance === null) return { status: "legacy", segments: [] };
  const source = getInventorySource(document);
  const { version, method, ranges, hash } = provenance;
  const isDriveMethod = method === "drive-text" || method === "drive-pdf-text";
  if (version !== 1 || !methods.has(method) || (isDriveMethod ? source !== "drive" : source !== "local") ||
      typeof document.id !== "string" || !document.id.trim() || typeof document.content !== "string" ||
      !Array.isArray(ranges) || !ranges.length || typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
    return { status: "invalid", segments: [] };
  }
  let end = 0;
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2 ||
        !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1]) ||
        range[0] < end || range[1] <= range[0] || range[1] > document.content.length) {
      return { status: "invalid", segments: [] };
    }
    end = range[1];
  }
  const content = document.content;
  const serialized = JSON.stringify(provenance);
  const actual = await fingerprint(document, method, ranges);
  if (document.content !== content || JSON.stringify(document.contentProvenance) !== serialized || actual !== hash) {
    return { status: "invalid", segments: [] };
  }
  return { status: "verified", segments: ranges.map(([start, finish]) => content.slice(start, finish)) };
}
