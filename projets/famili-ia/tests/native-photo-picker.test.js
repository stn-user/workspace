import assert from "node:assert/strict";
import test from "node:test";
import { MediaTypeSelection } from "@capacitor/camera";
import { selectNativePhotoFiles } from "../native-photo-picker.js";

test("native photo picker requests a bounded selection without reading photo metadata", async () => {
  let options;
  const files = await selectNativePhotoFiles({
    camera: {
      async chooseFromGallery(value) {
        options = value;
        return { results: [
          { webPath: "capacitor://localhost/photo-1" },
          { webPath: "capacitor://localhost/photo-2" }
        ] };
      }
    },
    fetchImpl: async url => new Response(new Blob([url], {
      type: url.endsWith("1") ? "image/jpeg" : "image/png"
    }), { status: 200 }),
    now: () => 123
  });

  assert.deepEqual(options, {
    mediaType: MediaTypeSelection.Photo,
    allowMultipleSelection: true,
    limit: 5,
    includeMetadata: false
  });
  assert.deepEqual(files.map(file => file.name), ["photo-mobile-123-1.jpg", "photo-mobile-123-2.png"]);
  assert.deepEqual(await Promise.all(files.map(file => file.text())), [
    "capacitor://localhost/photo-1",
    "capacitor://localhost/photo-2"
  ]);
});

test("native photo picker cancellation returns no files and performs no reads", async () => {
  let reads = 0;
  const files = await selectNativePhotoFiles({
    camera: { async chooseFromGallery() { return { results: [] }; } },
    fetchImpl: async () => { reads += 1; }
  });

  assert.deepEqual(files, []);
  assert.equal(reads, 0);
});

test("native photo picker refuses selections over the configured limit", async () => {
  const files = Array.from({ length: 6 }, (_, index) => ({
    webPath: `capacitor://localhost/photo-${index}`
  }));
  await assert.rejects(selectNativePhotoFiles({
    camera: { async chooseFromGallery() { return { results: files }; } },
    fetchImpl: async () => {
      throw new Error("Photos above the limit must not be read.");
    }
  }), /plus de 5 photos/);
});

test("native photo picker reports retrieval errors and rejects unsupported formats", async () => {
  const camera = { async chooseFromGallery() {
    return { results: [{ webPath: "capacitor://localhost/photo" }] };
  } };
  await assert.rejects(selectNativePhotoFiles({
    camera,
    fetchImpl: async () => new Response("", { status: 503 })
  }), /HTTP 503/);
  await assert.rejects(selectNativePhotoFiles({
    camera,
    fetchImpl: async () => new Response("photo", { status: 200, headers: { "Content-Type": "image/heic" } })
  }), /JPEG et PNG/);
});
