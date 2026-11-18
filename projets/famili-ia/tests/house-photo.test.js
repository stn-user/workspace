import assert from "node:assert/strict";
import test from "node:test";
import { prepareCoverPhoto, validateCoverPhoto } from "../cover-photo.js";

test("refuse les copies persistées avec format, taille, cadrage ou contenu incohérents", () => {
  const photo = {
    schemaVersion: 1, mimeType: "image/jpeg", width: 2, height: 2, byteLength: 4,
    dataUrl: "data:image/jpeg;base64,/9j/2Q==", positionX: 50, positionY: 50
  };
  for (const fields of [
    { schemaVersion: 2 }, { mimeType: "image/svg+xml" },
    { width: 1281 }, { height: 0 }, { width: 1.5 },
    { byteLength: 256 * 1024 + 1 }, { byteLength: 5 },
    { positionX: -1 }, { positionY: 101 }, { positionX: NaN },
    { dataUrl: "https://example.invalid/photo.jpg" },
    { dataUrl: "data:image/jpeg;base64,YWJjZA==" },
    { dataUrl: "data:image/jpeg;base64,A" }
  ]) assert.throws(() => validateCoverPhoto({ ...photo, ...fields }));
});

test("refuse les formats non pris en charge, fichiers vides et trop grands avant décodage", async () => {
  await assert.rejects(prepareCoverPhoto({ type: "image/svg+xml", size: 20 }), /JPEG, PNG ou WebP/);
  await assert.rejects(prepareCoverPhoto({ type: "image/jpeg", size: 0 }), /non vide/);
  await assert.rejects(prepareCoverPhoto({ type: "image/png", size: 10 * 1024 * 1024 + 1 }), /10 Mio/);
});

test("ne conserve ni nom de fichier ni métadonnées supplémentaires dans une couverture", () => {
  const photo = {
    schemaVersion: 1, mimeType: "image/jpeg", width: 2, height: 2, byteLength: 4,
    dataUrl: "data:image/jpeg;base64,/9j/2Q==", positionX: 50, positionY: 50
  };
  assert.deepEqual(validateCoverPhoto({ ...photo, fileName: "fictif.jpg", exif: { date: "2001" } }), photo);
});

test("refuse plus de 40 mégapixels et libère le bitmap sans allouer de rendu", async t => {
  const previous = new Map(["document", "createImageBitmap"].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let released = false;
  globalThis.createImageBitmap = async () => ({
    width: 8001, height: 5000, close() { released = true; }
  });
  globalThis.document = { createElement: () => ({}) };
  await assert.rejects(prepareCoverPhoto({ type: "image/jpeg", size: 100 }), /40 mégapixels/);
  assert.equal(released, true);
});
