import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePhotoThumbnail,
  getPhotoThumbnailDataUrl,
  PHOTO_THUMBNAIL_MAX_BYTES,
  PHOTO_THUMBNAIL_MAX_DIMENSION
} from "../photo-thumbnails.js";

function installCanvasMocks(t, {
  width = 1200,
  height = 800,
  encode = (_canvas, type) => new Blob(["thumbnail"], { type }),
  decodeDelay = 0
} = {}) {
  const previous = new Map();
  for (const key of ["createImageBitmap", "OffscreenCanvas"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  t.after(() => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const canvases = [];
  let activeBitmaps = 0;
  let maximumActiveBitmaps = 0;
  globalThis.createImageBitmap = async (_file, options) => {
    assert.equal(options?.imageOrientation, "from-image");
    activeBitmaps += 1;
    maximumActiveBitmaps = Math.max(maximumActiveBitmaps, activeBitmaps);
    if (decodeDelay) await new Promise(resolve => setTimeout(resolve, decodeDelay));
    return {
      width,
      height,
      close() {
        activeBitmaps -= 1;
      }
    };
  };
  globalThis.OffscreenCanvas = class {
    constructor(canvasWidth, canvasHeight) {
      this.width = canvasWidth;
      this.height = canvasHeight;
      this.drawnImage = null;
      canvases.push(this);
    }

    getContext() {
      return { drawImage: image => { this.drawnImage = image; } };
    }

    convertToBlob(options) {
      return encode(this, options.type, options.quality);
    }
  };
  return {
    canvases,
    get maximumActiveBitmaps() {
      return maximumActiveBitmaps;
    }
  };
}

function makeImageFile() {
  return new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
}

test("generates a correctly bounded, oriented local thumbnail and releases canvas memory", async t => {
  const mocks = installCanvasMocks(t);
  const thumbnail = await generatePhotoThumbnail(makeImageFile());

  assert.equal(thumbnail.width, 320);
  assert.equal(thumbnail.height, 213);
  assert.equal(thumbnail.mimeType, "image/webp");
  assert.ok(thumbnail.byteLength <= PHOTO_THUMBNAIL_MAX_BYTES);
  assert.match(thumbnail.dataUrl, /^data:image\/webp;base64,/);
  assert.equal(getPhotoThumbnailDataUrl(thumbnail), thumbnail.dataUrl);
  assert.ok(mocks.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test("falls back to JPEG when the browser cannot encode WebP", async t => {
  installCanvasMocks(t, {
    encode: (_canvas, type) => new Blob(["jpeg"], { type: type === "image/webp" ? "image/png" : type })
  });
  const thumbnail = await generatePhotoThumbnail(makeImageFile());
  assert.equal(thumbnail.mimeType, "image/jpeg");
});

test("rejects images that cannot be encoded within the per-photo storage budget", async t => {
  const mocks = installCanvasMocks(t, {
    encode: (_canvas, type) => new Blob([new Uint8Array(PHOTO_THUMBNAIL_MAX_BYTES + 1)], { type })
  });

  await assert.rejects(generatePhotoThumbnail(makeImageFile()), /48 Kio/);
  assert.ok(mocks.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test("limits concurrent image decodes to two", async t => {
  const mocks = installCanvasMocks(t, { decodeDelay: 10 });
  await Promise.all([generatePhotoThumbnail(makeImageFile()), generatePhotoThumbnail(makeImageFile()), generatePhotoThumbnail(makeImageFile())]);
  assert.equal(mocks.maximumActiveBitmaps, 2);
});

test("rejects malformed or oversized stored thumbnail data", () => {
  assert.equal(getPhotoThumbnailDataUrl(null), null);
  assert.equal(getPhotoThumbnailDataUrl({
    schemaVersion: 1,
    mimeType: "image/svg+xml",
    width: 10,
    height: 10,
    byteLength: 10,
    dataUrl: "data:image/svg+xml;base64,PHN2Zz4="
  }), null);
  assert.equal(getPhotoThumbnailDataUrl({
    schemaVersion: 1,
    mimeType: "image/jpeg",
    width: PHOTO_THUMBNAIL_MAX_DIMENSION + 1,
    height: 10,
    byteLength: 10,
    dataUrl: "data:image/jpeg;base64,Zm9v"
  }), null);
});
