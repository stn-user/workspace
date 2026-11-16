import assert from "node:assert/strict";
import test from "node:test";
import { createPhotoMetadata } from "../photo-metadata.js";
import { photoFactSetFromDocument } from "../photo-facts.js";
import { findMetadataEventCandidates } from "../photo-event-metadata.js";

test("metadata event baseline distinguishes an explicit keyword from lexical cues and preserves provenance", () => {
  const document = {
    id: "photo-wedding-baseline",
    type: "Image",
    name: "mariage-2024.jpg",
    sourceDir: "Famille/Mariage 2024/mariage-2024.jpg",
    photoMetadata: createPhotoMetadata("photo-wedding-baseline", {
      captions: [{
        text: "Souvenirs de notre mariage civil",
        source: { kind: "xmp", field: "dc:description[x-default]" }
      }],
      keywords: [{
        text: "Mariage",
        source: { kind: "iptc", field: "Keywords" }
      }]
    })
  };
  document.photoFacts = photoFactSetFromDocument(document);

  const candidates = findMetadataEventCandidates(document);

  assert.deepEqual(candidates.map(candidate => ({
    source: candidate.source,
    matchType: candidate.matchType,
    field: candidate.provenance.field,
    provenance: candidate.provenance.kind,
    alias: candidate.matchedAlias
  })), [
    {
      source: "caption",
      matchType: "lexical-match",
      field: "dc:description[x-default]",
      provenance: "xmp",
      alias: "mariage"
    },
    {
      source: "keyword",
      matchType: "explicit-label",
      field: "Keywords",
      provenance: "iptc",
      alias: "mariage"
    },
    {
      source: "file-name",
      matchType: "lexical-match",
      field: "name",
      provenance: "filename",
      alias: "mariage"
    },
    {
      source: "folder-name",
      matchType: "lexical-match",
      field: "sourceDir",
      provenance: "filename",
      alias: "mariage"
    }
  ]);
});

test("metadata event baseline does not read photo bytes or infer an event from unrelated text", () => {
  const document = {
    id: "photo-no-event",
    type: "Image",
    name: "photo-mariee.jpg",
    photoMetadata: createPhotoMetadata("photo-no-event", {
      captions: [{
        text: "Portrait de la mariée",
        source: { kind: "xmp", field: "dc:description[x-default]" }
      }]
    }),
    get content() {
      throw new Error("Photo bytes must not be read.");
    }
  };
  document.photoFacts = photoFactSetFromDocument(document);

  assert.deepEqual(findMetadataEventCandidates(document), []);
});

test("metadata event baseline uses provider path provenance and ignores rejected text facts", () => {
  const document = {
    id: "cloud-photo-wedding",
    type: "Image",
    name: "photo.jpg",
    indexRecord: { sourceId: "dropbox", itemId: "cloud-photo-wedding" },
    dropboxAccountFingerprint: "a".repeat(64),
    photoFacts: {
      sourceCopies: [{
        providerId: "dropbox",
        accountRef: "a".repeat(64),
        itemId: "cloud-photo-wedding",
        path: "/Photos/Mariage/photo.jpg"
      }],
      facts: [{
        id: "rejected-keyword",
        kind: "keyword",
        value: { text: "mariage" },
        status: "rejected",
        provenance: { kind: "iptc", field: "Keywords" }
      }]
    }
  };

  const candidates = findMetadataEventCandidates(document);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source, "folder-name");
  assert.equal(candidates[0].provenance.providerId, "dropbox");
  assert.equal(candidates[0].provenance.itemId, "cloud-photo-wedding");
  assert.equal(candidates[0].provenance.accountRef, "a".repeat(64));
});
