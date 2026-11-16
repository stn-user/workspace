import { test, expect } from "@playwright/test";
import { createDocxBuffer } from "./fixtures/docx-buffer.js";

test("DOCX local : le lecteur navigateur extrait un fait sourcé", async ({ page }) => {
  await page.goto("http://localhost:5179/styles.css");
  const docxBase64 = createDocxBuffer([
    "Facture EDF",
    "Total TTC : 61,00 EUR",
    "À payer avant : 01/01/2027"
  ]).toString("base64");

  const result = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const { readFileContent } = await import("/local-files.js");
    const { createContentProvenance } = await import("/content-index.js");
    const { createDocumentIndexRecord } = await import("/document-index.js");
    const extracted = await readFileContent(new Blob([bytes]), "facture.docx");
    const document = {
      id: "browser-docx",
      name: "facture.docx",
      isLocal: true,
      content: extracted.rawText
    };
    document.contentProvenance = await createContentProvenance(
      document, extracted.extractedSegments, "local-word"
    );
    const record = await createDocumentIndexRecord(document);
    return {
      text: extracted.rawText,
      segments: extracted.extractedSegments,
      provider: record.fields.find(field => field.name === "provider")?.value,
      amount: record.fields.find(field => field.name === "amount")?.value,
      dueDate: record.dates.echeance?.value
    };
  }, docxBase64);

  expect(result.text).toContain("Facture EDF");
  expect(result.segments).toEqual([result.text]);
  expect(result.provider).toBe("EDF");
  expect(result.amount).toBe("61.00 EUR");
  expect(result.dueDate).toBe("2027-01-01");
});

test("photo locale : XMP est limité aux descriptions et sujets sans extraire les coordonnées", async ({ page }) => {
  await page.goto("http://127.0.0.1:5179/styles.css");
  const result = await page.evaluate(async () => {
    const base = new Uint8Array(await (await fetch("/assets/piscine/piscine-photo.jpg")).arrayBuffer());
    const xml = '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:exif="http://ns.adobe.com/exif/1.0/">' +
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">Fête &amp; amis</rdf:li></rdf:Alt></dc:description>' +
      '<dc:subject><rdf:Bag><rdf:li>anniversaire</rdf:li></rdf:Bag></dc:subject>' +
      '<exif:GPSLatitude>48, 51.396</exif:GPSLatitude>' +
      '<exif:GPSLongitude>2, 21.132</exif:GPSLongitude>' +
      '</rdf:Description></rdf:RDF></x:xmpmeta>';
    const xmpHeader = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0");
    const xmlBytes = new TextEncoder().encode(xml);
    const payload = new Uint8Array(xmpHeader.length + xmlBytes.length);
    payload.set(xmpHeader);
    payload.set(xmlBytes, xmpHeader.length);
    const segment = new Uint8Array(payload.length + 4);
    segment[0] = 0xff;
    segment[1] = 0xe1;
    segment[2] = (payload.length + 2) >> 8;
    segment[3] = (payload.length + 2) & 0xff;
    segment.set(payload, 4);
    const bytes = new Uint8Array(base.length + segment.length);
    bytes.set(base.subarray(0, 2));
    bytes.set(segment, 2);
    bytes.set(base.subarray(2), segment.length + 2);

    const { extractPhotoMetadata } = await import("/photo-exif.js");
    const { metadata, issues } = await extractPhotoMetadata(new Blob([bytes]), "browser-xmp");
    return { captions: metadata.captions, keywords: metadata.keywords, location: metadata.location, issues };
  });

  expect(result.captions).toEqual([{
    text: "Fête & amis",
    source: { kind: "xmp", field: "dc:description[x-default]" }
  }]);
  expect(result.keywords).toEqual([{
    text: "anniversaire",
    source: { kind: "xmp", field: "dc:subject" }
  }]);
  expect(result.location.status).toBe("not_requested");
  expect(result.issues).toEqual([]);
});

test("photo locale : les faits EXIF persistent et restent recherchables après rechargement", async ({ page }) => {
  const ready = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.goto("http://127.0.0.1:5179/#/recherche");
  await ready;
  await page.evaluate(async () => {
    const { addDocument, updatePhotoLocationConsent } = await import("/state.js");
    const { createPhotoMetadata } = await import("/photo-metadata.js");
    const { createPhotoFactSet, photoFactSetFromDocument } = await import("/photo-facts.js");
    const id = "browser-photo-facts";
    await updatePhotoLocationConsent(false);
    await addDocument({
      id: "browser-photo-no-consent",
      type: "Image",
      name: "photo-sans-consentement.jpg",
      isLocal: true,
      photoMetadata: createPhotoMetadata("browser-photo-no-consent", {
        location: {
          status: "available",
          latitude: 48.8566,
          longitude: 2.3522,
          source: { kind: "exif", field: "GPS" }
        }
      })
    });
    await updatePhotoLocationConsent(true);
    const document = {
      id,
      type: "Image",
      name: "photo-fictive.jpg",
      isLocal: true,
      importedAt: "2026-11-15T10:00:00.000Z",
      photoMetadata: createPhotoMetadata(id, {
        captions: [{
          text: "Fête familiale",
          source: { kind: "xmp", field: "dc:description[x-default]" }
        }],
        keywords: [{
          text: "anniversaire",
          source: { kind: "iptc", field: "Keywords" }
        }],
        location: {
          status: "available",
          latitude: 48.8566,
          longitude: 2.3522,
          source: { kind: "exif", field: "GPS" }
        },
        captureDate: {
          raw: "2023:06:15 12:00:00+02:00",
          localDateTime: "2023-06-15T12:00:00",
          offsetMinutes: 120,
          source: { kind: "exif", field: "DateTimeOriginal" }
        }
      }),
      photoAnnotations: {
        schemaVersion: 1,
        personIds: ["member-alex"],
        eventTags: [],
        captureDateOverride: null,
        placeLabel: null,
        placeSource: null,
        source: "user"
      }
    };
    const initialFacts = photoFactSetFromDocument(document, { includeLocation: true });
    const gps = initialFacts.facts.find(fact => fact.kind === "location");
    document.photoFacts = createPhotoFactSet(id, {
      contentHash: initialFacts.contentHash,
      sourceCopies: initialFacts.sourceCopies,
      dates: initialFacts.dates,
      facts: [...initialFacts.facts, {
        id: "browser-derived-place",
        kind: "place",
        value: { label: "Lieu dérivé fictif" },
        status: "suggested",
        provenance: { kind: "derived", field: "testReverseGeocode" },
        evidence: null,
        analyzedAt: null,
        review: null,
        dependsOnFactIds: [gps.id]
      }]
    });
    await addDocument(document);
  });

  const reloaded = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.reload();
  await reloaded;
  await page.locator("#experimental-index-query").fill("Photos prises à 48.8566, 2.3522");
  await page.locator("#experimental-index-form .submit-button").click();
  await expect(page.locator("#moments-life-search-status")).toContainText("1 photo trouvée");
  await expect(page.locator("#moments-life-search-results")).toContainText("photo-fictive.jpg");
  await page.locator("#experimental-index-query").fill("Photos anniversaire");
  await page.locator("#experimental-index-form .submit-button").click();
  await expect(page.locator("#moments-life-search-status")).toContainText("1 photo trouvée");
  const result = await page.evaluate(async () => {
    const { getAll } = await import("/db.js");
    const { searchMomentsLife } = await import("/moments-life-search.js");
    const { createUnifiedIndexQuery } = await import("/unified-index-query.js");
    const { searchIndex } = await import("/index-search.js");
    const { redactPhotoLocationsForExport } = await import("/photo-metadata.js");
    const { redactPhotoFactLocationsForExport } = await import("/photo-facts.js");
    const documents = await getAll("documents");
    const photo = documents.find(document => document.id === "browser-photo-facts");
    const photoWithoutConsent = documents.find(document => document.id === "browser-photo-no-consent");
    const search = searchMomentsLife("Les photos d'Alex du 15 juin 2023", {
      photos: [photo],
      members: [{ id: "member-alex", name: "Alex" }]
    });
    const coordinateRequest = createUnifiedIndexQuery("Photos prises à 48.8566, 2.3522");
    const coordinateMatches = searchIndex([photo.indexRecord], coordinateRequest.query, coordinateRequest.filters);
    const exported = redactPhotoFactLocationsForExport(redactPhotoLocationsForExport({
      documents: [photo]
    })).documents[0];
    return {
      factDate: photo.photoFacts.facts.find(fact => fact.kind === "captureDate")?.value.localDateTime,
      indexDate: photo.indexRecord.dates.priseDeVue?.value,
      indexedCoordinates: photo.indexRecord.fields.find(field => field.name === "coordinates")?.value,
      locationStoredWithConsent: photo.photoFacts.facts.some(fact => fact.kind === "location"),
      captionFactStored: photo.photoFacts.facts.some(fact =>
        fact.kind === "caption" && fact.value.text === "Fête familiale"),
      keywordIndexed: photo.indexRecord.fields.some(field =>
        field.name === "keyword" && field.value === "anniversaire"),
      derivedLocationStored: photo.photoFacts.facts.some(fact => fact.id === "browser-derived-place"),
      locationNotStoredWithoutConsent: photoWithoutConsent.photoMetadata.location.status === "cleared"
        && !photoWithoutConsent.photoFacts.facts.some(fact => fact.kind === "location")
        && !photoWithoutConsent.indexRecord.fields.some(field => field.name === "coordinates"),
      coordinateSearchMatches: coordinateMatches.map(match => match.itemId),
      exportRedactsCoordinates: !exported.photoFacts.facts.some(fact => fact.kind === "location")
        && !exported.indexRecord.fields.some(field => field.name === "coordinates"),
      searchStatus: search.status,
      matchedIds: search.results.map(result => result.photo.id)
    };
  });

  expect(result).toEqual({
    factDate: "2023-06-15T12:00:00",
    indexDate: "2023-06-15",
    indexedCoordinates: "48.8566, 2.3522",
    locationStoredWithConsent: true,
    captionFactStored: true,
    keywordIndexed: true,
    derivedLocationStored: true,
    locationNotStoredWithoutConsent: true,
    coordinateSearchMatches: ["browser-photo-facts"],
    exportRedactsCoordinates: true,
    searchStatus: "results",
    matchedIds: ["browser-photo-facts"]
  });
  const revoked = await page.evaluate(async () => {
    const { updatePhotoLocationConsent } = await import("/state.js");
    const { getAll } = await import("/db.js");
    await updatePhotoLocationConsent(false);
    const photo = (await getAll("documents")).find(document => document.id === "browser-photo-facts");
    return {
      locationStatus: photo.photoMetadata.location.status,
      locationFactCount: photo.photoFacts.facts.filter(fact => fact.kind === "location").length,
      indexedCoordinateCount: photo.indexRecord.fields.filter(field => field.name === "coordinates").length,
      derivedPlacePresent: photo.photoFacts.facts.some(fact => fact.id === "browser-derived-place"),
      captureDatePresent: photo.photoFacts.facts.some(fact => fact.kind === "captureDate")
    };
  });
  expect(revoked).toEqual({
    locationStatus: "cleared",
    locationFactCount: 0,
    indexedCoordinateCount: 0,
    derivedPlacePresent: false,
    captureDatePresent: true
  });
  const afterRevocation = page.waitForEvent("console", message => message.text().includes("Async init - COMPLETE"));
  await page.reload();
  await afterRevocation;
  await page.locator("#experimental-index-query").fill("Photos prises à 48.8566, 2.3522");
  await page.locator("#experimental-index-form .submit-button").click();
  await expect(page.locator("#moments-life-search-status"))
    .toContainText("avec le consentement actif");
});
