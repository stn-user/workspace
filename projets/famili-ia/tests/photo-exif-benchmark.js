import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { extractPhotoMetadata, MAX_PHOTO_FILE_SIZE } from "../photo-exif.js";
import { createJpegExifFixture } from "./photo-exif-fixtures.js";

const demoJpeg = fs.readFileSync(path.resolve("assets/piscine/piscine-photo.jpg"));
const photoDirectories = fs.readdirSync("assets")
  .map(directory => path.join("assets", directory, `${directory}-photo.jpg`))
  .filter(file => fs.existsSync(file));
const deviceCorpusDirectory = path.resolve("tests/fixtures/photo-exif/device-corpus");
const deviceCorpusFiles = fs.existsSync(deviceCorpusDirectory)
  ? fs.readdirSync(deviceCorpusDirectory)
    .filter(file => /\.(jpe?g|png)$/i.test(file))
    .map(file => path.join(deviceCorpusDirectory, file))
  : [];

const syntheticCases = [
  {
    name: "date-sans-fuseau",
    bytes: createJpegExifFixture(demoJpeg, { dateTimeOriginal: "2024:05:06 12:30:45" }),
    expected: ["captureDate"]
  },
  {
    name: "date-avec-fuseau-et-rotation",
    bytes: createJpegExifFixture(demoJpeg, {
      dateTimeOriginal: "2025:11:02 08:15:00",
      offsetTimeOriginal: "+02:30",
      orientation: 8
    }),
    expected: ["captureDate", "offsetMinutes", "orientation"]
  },
  {
    name: "gps-avec-consentement",
    bytes: createJpegExifFixture(demoJpeg, { latitude: 48.8566, longitude: 2.3522, altitude: 35 }),
    expected: ["location"],
    includeLocation: true
  },
  {
    name: "sans-exif",
    bytes: demoJpeg,
    expected: []
  },
  {
    name: "fichier-invalide",
    bytes: Buffer.from("not a JPEG"),
    expected: [],
    expectsDiagnostic: true
  },
  {
    name: "limite-10-mio",
    bytes: null,
    expected: ["captureDate"]
  }
];
const limitFixture = createJpegExifFixture(demoJpeg, { dateTimeOriginal: "2024:05:06 12:30:45" });
syntheticCases.find(item => item.name === "limite-10-mio").bytes = Buffer.concat([
  limitFixture,
  Buffer.alloc(MAX_PHOTO_FILE_SIZE - limitFixture.length)
]);

function getExtractedFields(metadata) {
  const fields = [];
  if (metadata.captureDate) fields.push("captureDate");
  if (metadata.captureDate?.offsetMinutes !== null && metadata.captureDate) fields.push("offsetMinutes");
  if (metadata.orientation) fields.push("orientation");
  if (metadata.dimensions) fields.push("dimensions");
  if (metadata.device) fields.push("device");
  if (metadata.location.status === "available") fields.push("location");
  return fields;
}

function summarize(values) {
  const sorted = [...values].sort((first, second) => first - second);
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)),
    meanMs: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
  };
}

async function benchmarkGroup(name, cases, repeats) {
  await extractPhotoMetadata(new Blob([cases[0].bytes]), `benchmark-${name}-warmup`, {
    includeLocation: cases[0].includeLocation === true
  });
  if (globalThis.gc) globalThis.gc();
  const baseline = process.memoryUsage();
  let peakRssBytes = baseline.rss;
  let peakHeapUsedBytes = baseline.heapUsed;
  const timings = [];
  let expectedFields = 0;
  let extractedExpectedFields = 0;
  let expectedBehaviors = 0;
  let issueCount = 0;
  const observedFields = {
    captureDate: 0,
    offsetMinutes: 0,
    orientation: 0,
    dimensions: 0,
    device: 0,
    location: 0
  };

  for (const sample of cases) {
    const blob = new Blob([sample.bytes], { type: "image/jpeg" });
    const metadata = await extractPhotoMetadata(blob, `benchmark-${name}-${sample.name}`, {
      includeLocation: sample.includeLocation === true
    });
    const extracted = getExtractedFields(metadata.metadata);
    expectedFields += sample.expected.length;
    extractedExpectedFields += sample.expected.filter(field => extracted.includes(field)).length;
    for (const field of extracted) observedFields[field] += 1;
    issueCount += metadata.issues.length;
    if (sample.expectsDiagnostic ? metadata.issues.length > 0 : metadata.issues.length === 0) {
      expectedBehaviors += 1;
    }

    for (let iteration = 0; iteration < repeats; iteration += 1) {
      if (globalThis.gc) globalThis.gc();
      const start = performance.now();
      await extractPhotoMetadata(blob, `benchmark-${name}-${sample.name}-${iteration}`, {
        includeLocation: sample.includeLocation === true
      });
      timings.push(performance.now() - start);
      const memory = process.memoryUsage();
      peakRssBytes = Math.max(peakRssBytes, memory.rss);
      peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
      if (globalThis.gc) globalThis.gc();
    }
  }

  return {
    name,
    photos: cases.length,
    repeatRuns: timings.length,
    expectedBehaviorRate: `${expectedBehaviors}/${cases.length}`,
    expectedFieldCoverage: expectedFields === 0
      ? "n/a"
      : `${extractedExpectedFields}/${expectedFields} (${Math.round(extractedExpectedFields / expectedFields * 100)}%)`,
    observedFields,
    diagnostics: issueCount,
    timing: summarize(timings),
    memory: {
      baselineRssBytes: baseline.rss,
      peakRssBytes,
      peakRssDeltaBytes: Math.max(0, peakRssBytes - baseline.rss),
      baselineHeapUsedBytes: baseline.heapUsed,
      peakHeapUsedBytes,
      peakHeapDeltaBytes: Math.max(0, peakHeapUsedBytes - baseline.heapUsed)
    }
  };
}

const realPhotoCases = photoDirectories.map(file => ({
  name: path.relative("assets", file),
  bytes: fs.readFileSync(file),
  expected: []
}));
const deviceCorpusCases = deviceCorpusFiles.map(file => ({
  name: path.basename(file),
  group: path.basename(file).startsWith("IMG_")
    ? "IMG"
    : path.basename(file).startsWith("DSC")
      ? "DSC"
      : "WP",
  bytes: fs.readFileSync(file),
  expected: []
}));
const synthetic = await benchmarkGroup("synthetic-fixtures", syntheticCases, 3);
const localDemo = await benchmarkGroup("local-demo-assets", realPhotoCases, 3);
const deviceCorpus = deviceCorpusCases.length > 0
  ? await benchmarkGroup("local-device-corpus", deviceCorpusCases, 3)
  : null;

console.log(JSON.stringify({
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  caveat: "Mesures Node locales indicatives ; le corpus d'appareils est local et git-ignoré. Aucun GPS n'est extrait.",
  synthetic,
  localDemo: {
    ...localDemo,
    photoBytes: realPhotoCases.reduce((sum, photo) => sum + photo.bytes.length, 0),
    dateCoverage: `${localDemo.observedFields.captureDate}/${localDemo.photos}`,
    orientationCoverage: `${localDemo.observedFields.orientation}/${localDemo.photos}`
  },
  deviceCorpus: deviceCorpus ? {
    ...deviceCorpus,
    totalBytes: deviceCorpusCases.reduce((sum, photo) => sum + photo.bytes.length, 0),
    underLimit: `${deviceCorpusCases.filter(photo => photo.bytes.length <= MAX_PHOTO_FILE_SIZE).length}/${deviceCorpusCases.length}`,
    overLimit: `${deviceCorpusCases.filter(photo => photo.bytes.length > MAX_PHOTO_FILE_SIZE).length}/${deviceCorpusCases.length}`,
    sizeBytes: {
      min: Math.min(...deviceCorpusCases.map(photo => photo.bytes.length)),
      median: [...deviceCorpusCases.map(photo => photo.bytes.length)].sort((a, b) => a - b)[Math.floor(deviceCorpusCases.length / 2)],
      max: Math.max(...deviceCorpusCases.map(photo => photo.bytes.length))
    },
    groups: deviceCorpusCases.reduce((counts, photo) => {
      counts[photo.group] = (counts[photo.group] ?? 0) + 1;
      return counts;
    }, {}),
    coverage: {
      dates: `${deviceCorpus.observedFields.captureDate}/${deviceCorpus.photos}`,
      explicitOffsets: `${deviceCorpus.observedFields.offsetMinutes}/${deviceCorpus.photos}`,
      orientations: `${deviceCorpus.observedFields.orientation}/${deviceCorpus.photos}`,
      dimensions: `${deviceCorpus.observedFields.dimensions}/${deviceCorpus.photos}`,
      deviceMakeOrModel: `${deviceCorpus.observedFields.device}/${deviceCorpus.photos}`,
      gpsRead: false
    }
  } : { photos: 0, message: "No local device corpus found; that folder is optional and git-ignored." }
}, null, 2));
