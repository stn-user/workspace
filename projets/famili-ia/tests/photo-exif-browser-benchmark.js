import { extractPhotoMetadata, MAX_PHOTO_FILE_SIZE } from "../photo-exif.js";

const demoPhotoNames = [
  "chaudiere",
  "climatiseur",
  "maison",
  "ordinateur",
  "pergola",
  "piscine",
  "pompe",
  "store",
  "voiture"
];
const deviceCorpusFiles = [
  "WP_20160515_20_46_51_Pro.jpg",
  "WP_20160516_08_46_45_Pro.jpg",
  "WP_20160520_18_33_51_Pro.jpg",
  "WP_20160529_13_16_14_Pro.jpg",
  "WP_20160529_13_44_14_Pro.jpg",
  "IMG_5054.JPG",
  "IMG_5064.JPG",
  "IMG_5078.JPG",
  "IMG_5102.JPG",
  "IMG_5108.JPG",
  "DSC09019.JPG",
  "DSC09069.JPG",
  "DSC09159.JPG",
  "DSC09187.JPG",
  "DSC09231.JPG"
];
const resultsElement = document.querySelector("#results");

function summarize(values) {
  const sorted = [...values].sort((first, second) => first - second);
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)),
    meanMs: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
  };
}

async function runBenchmark() {
  const demoSamples = demoPhotoNames.map(name => ({
    path: `../assets/${name}/${name}-photo.jpg`,
    group: "demo"
  }));
  const corpusSamples = deviceCorpusFiles.map(file => ({
    path: `./fixtures/photo-exif/device-corpus/${file}`,
    group: file.startsWith("IMG_") ? "IMG" : file.startsWith("DSC") ? "DSC" : "WP"
  }));
  const samples = [...demoSamples, ...corpusSamples];
  const baselineHeapBytes = performance.memory?.usedJSHeapSize ?? null;
  const timings = [];
  const coverage = {};
  const timingsByGroup = {};
  const totals = { photos: 0, bytes: 0, underLimit: 0, captureDate: 0, offset: 0, orientation: 0, dimensions: 0, device: 0, diagnostics: 0 };
  for (const sample of samples) {
    const response = await fetch(sample.path);
    if (sample.group !== "demo"
      && (!response.ok || !response.headers.get("content-type")?.startsWith("image/"))) {
      continue;
    }
    if (!response.ok) throw new Error(`Impossible de charger un fichier benchmark : HTTP ${response.status}`);
    const blob = await response.blob();
    const result = await extractPhotoMetadata(blob, `browser-benchmark-${sample.group}-${totals.photos}`);
    totals.photos += 1;
    totals.bytes += blob.size;
    totals.underLimit += blob.size <= MAX_PHOTO_FILE_SIZE ? 1 : 0;
    totals.captureDate += result.metadata.captureDate ? 1 : 0;
    totals.offset += result.metadata.captureDate?.offsetMinutes !== null && result.metadata.captureDate ? 1 : 0;
    totals.orientation += result.metadata.orientation ? 1 : 0;
    totals.dimensions += result.metadata.dimensions ? 1 : 0;
    totals.device += result.metadata.device ? 1 : 0;
    totals.diagnostics += result.issues.length;
    coverage[sample.group] ??= { photos: 0, bytes: 0, captureDate: 0, orientation: 0, dimensions: 0, device: 0, diagnostics: 0 };
    const group = coverage[sample.group];
    timingsByGroup[sample.group] ??= [];
    group.photos += 1;
    group.bytes += blob.size;
    group.captureDate += result.metadata.captureDate ? 1 : 0;
    group.orientation += result.metadata.orientation ? 1 : 0;
    group.dimensions += result.metadata.dimensions ? 1 : 0;
    group.device += result.metadata.device ? 1 : 0;
    group.diagnostics += result.issues.length;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const start = performance.now();
      const extraction = await extractPhotoMetadata(blob, `browser-benchmark-${sample.group}-${totals.photos}-${iteration}`);
      const elapsedMs = performance.now() - start;
      timings.push(elapsedMs);
      timingsByGroup[sample.group].push(elapsedMs);
      if (extraction.issues.length > 0) totals.diagnostics += extraction.issues.length;
    }
  }

  const invalidImage = await extractPhotoMetadata(new Blob(["not an image"]), "browser-invalid-image");
  const deviceCorpusTimings = Object.entries(timingsByGroup)
    .filter(([group]) => group !== "demo")
    .flatMap(([, values]) => values);
  const deviceCorpusGroups = Object.entries(coverage)
    .filter(([group]) => group !== "demo")
    .map(([, group]) => group);
  return {
    userAgent: navigator.userAgent,
    photos: totals.photos,
    totalBytes: totals.bytes,
    repeatedExtractions: timings.length,
    timing: summarize(timings),
    deviceCorpusTiming: deviceCorpusTimings.length > 0 ? summarize(deviceCorpusTimings) : null,
    within10MiB: `${totals.underLimit}/${totals.photos}`,
    coverage: {
      captureDate: `${totals.captureDate}/${totals.photos}`,
      explicitOffset: `${totals.offset}/${totals.photos}`,
      orientation: `${totals.orientation}/${totals.photos}`,
      dimensions: `${totals.dimensions}/${totals.photos}`,
      deviceMakeOrModel: `${totals.device}/${totals.photos}`,
      diagnostics: totals.diagnostics,
      gpsRead: false,
      deviceCorpusPhotos: deviceCorpusGroups.reduce((total, group) => total + group.photos, 0),
      deviceCorpusBytes: deviceCorpusGroups.reduce((total, group) => total + group.bytes, 0),
      byGroup: Object.fromEntries(Object.entries(coverage).map(([name, group]) => [
        name,
        { ...group, timing: summarize(timingsByGroup[name]) }
      ]))
    },
    heap: {
      baselineBytes: baselineHeapBytes,
      finalBytes: performance.memory?.usedJSHeapSize ?? null,
      deltaBytes: baselineHeapBytes === null || !performance.memory
        ? null
        : performance.memory.usedJSHeapSize - baselineHeapBytes
    },
    invalidImageDiagnostic: invalidImage.issues[0],
    caveat: "Le heap est un instantané approximatif du moteur. Les noms et valeurs EXIF ne sont pas inclus dans le rapport ; aucun GPS n'est extrait."
  };
}

try {
  resultsElement.textContent = JSON.stringify(await runBenchmark(), null, 2);
} catch (error) {
  resultsElement.textContent = `Échec du benchmark : ${error instanceof Error ? error.message : "erreur inconnue"}`;
  throw error;
}
