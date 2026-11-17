import test from "node:test";
import assert from "node:assert/strict";
import {
  canRefreshOneDriveCopy, compareOneDriveCopy, describeOneDriveChanges,
  mergeOneDriveDocumentUpdate, oneDriveDocumentId, readOneDriveDocument, resolveOneDriveOriginalUrl
} from "../onedrive-document.js";
import { formatOneDriveAccountFingerprint, getOneDriveAccountFingerprint } from "../onedrive-account.js";
import { IndexSession } from "../index-session.js";
import { getInventorySource, filterSearchResultsByChips } from "../data-inventory.js";
import { photoFactSetFromDocument } from "../photo-facts.js";

const item = { id: "file!1", name: "test.txt", size: 12, lastModifiedDateTime: "2025-01-02T00:00:00Z" };
const options = { item, accountId: "account-a", getToken: async () => "synthetic-token" };

test("texte OneDrive recherché et provenance restaurée, isolé par compte", async () => {
  const calls = [];
  const result = await readOneDriveDocument({ ...options, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://a.files.1drv.com/synthetic" });
    return new Response("facture rare");
  } });
  assert.equal(calls[0].init.headers.Authorization, "Bearer synthetic-token");
  assert.equal(calls[1].init.headers, undefined);
  assert.equal(result.coverage, "partial");
  assert.equal(result.document.contentProvenance.method, "onedrive-text");
  assert.equal(result.document.oneDriveAccountFingerprint, await getOneDriveAccountFingerprint("account-a"));
  assert.equal(result.document.oneDriveItemId, item.id);
  assert.equal("webUrl" in result.document, false);
  assert.equal(JSON.stringify(result.document).includes("account-a"), false);
  assert.notEqual(
    result.document.oneDriveAccountFingerprint,
    await getOneDriveAccountFingerprint("account-b")
  );
  assert.match(formatOneDriveAccountFingerprint(result.document.oneDriveAccountFingerprint), /^…[0-9a-f]{16}$/);
  assert.equal(formatOneDriveAccountFingerprint(undefined), "compte d’origine non identifié");
  assert.equal(getInventorySource(result.document), "onedrive");
  assert.notEqual(await oneDriveDocumentId("account-b", item.id), result.document.id);
  assert.equal(filterSearchResultsByChips([{ document: result.document }], { source: "onedrive" }).length, 1);
  const session = new IndexSession();
  assert.equal(await session.restoreDocumentContent(structuredClone(result.document)), "verified");
  const restored = structuredClone(result.document);
  await session.restoreDocumentContent(restored);
  session.syncDocuments([restored]);
  assert.equal(session.search("rare")[0].sourceId, "onedrive");
  restored.content += " altéré";
  assert.equal(await session.restoreDocumentContent(restored), "invalid");
});

test("vérifie l'identifiant fournisseur et le compte avant de résoudre l'URL courante", async () => {
  const accountFingerprint = "a".repeat(64);
  const calls = [];
  const originalUrl = "https://onedrive.live.com/?cid=synthetic&id=file";
  const resolved = await resolveOneDriveOriginalUrl({
    itemId: item.id,
    accountFingerprint,
    activeAccountFingerprint: accountFingerprint,
    getToken: async () => "synthetic-token",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ id: item.id, webUrl: originalUrl });
    }
  });
  assert.equal(resolved, originalUrl);
  assert.equal(new URL(calls[0].url).origin, "https://graph.microsoft.com");
  assert.ok(new URL(calls[0].url).pathname.endsWith(encodeURIComponent(item.id)));
  assert.equal(new URL(calls[0].url).searchParams.get("$select"), "id,webUrl");
  assert.equal(calls[0].init.headers.Authorization, "Bearer synthetic-token");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "error");
  await assert.rejects(resolveOneDriveOriginalUrl({
    itemId: item.id,
    accountFingerprint,
    activeAccountFingerprint: "b".repeat(64),
    getToken: async () => assert.fail("Un jeton ne doit pas être demandé pour un autre compte"),
    fetchImpl: async () => assert.fail("Graph ne doit pas être appelé pour un autre compte")
  }), /ne correspond pas/);
});

test("refuse un identifiant incohérent et les URL web non autorisées ou sans élément", async () => {
  const input = {
    itemId: item.id,
    accountFingerprint: "a".repeat(64),
    activeAccountFingerprint: "a".repeat(64),
    getToken: async () => "synthetic-token"
  };
  await assert.rejects(resolveOneDriveOriginalUrl({
    ...input, fetchImpl: async () => Response.json({ id: "another-item", webUrl: "https://onedrive.live.com/file" })
  }), /identité/);
  await assert.rejects(resolveOneDriveOriginalUrl({
    ...input, fetchImpl: async () => Response.json({ id: item.id, webUrl: "https://evil.invalid/file" })
  }), /non autorisé/);
  await assert.rejects(resolveOneDriveOriginalUrl({
    ...input, fetchImpl: async () => Response.json({ id: item.id, webUrl: "http://onedrive.live.com/file" })
  }), /non autorisé/);
  await assert.rejects(resolveOneDriveOriginalUrl({
    ...input, fetchImpl: async () => Response.json({ id: item.id, webUrl: "https://onedrive.live.com/" })
  }), /non autorisé/);
  await assert.rejects(resolveOneDriveOriginalUrl({
    ...input, fetchImpl: async () => Response.json({ id: item.id, webUrl: "https://onedrive.live.com/file#fragment" })
  }), /non autorisé/);
  await assert.rejects(resolveOneDriveOriginalUrl({
    ...input, fetchImpl: async () => new Response("", { status: 403 })
  }), /HTTP 403/);
});

test("métadonnées seules pour format non pris en charge, taille et PDF non lisible", async () => {
  const never = async () => { throw new Error("appel inattendu"); };
  assert.equal((await readOneDriveDocument({ ...options, item: { ...item, name: "photo.jpg" }, fetchImpl: never })).coverage, "metadata");
  assert.equal((await readOneDriveDocument({ ...options, item: { ...item, size: 1048577 }, fetchImpl: never })).reason, "taille dépassée");
  let calls = 0;
  const invalidPdf = await readOneDriveDocument({ ...options, item: { ...item, name: "f.pdf" }, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://files.1drv.com/synthetic" }) : new Response("pas un PDF");
  } });
  assert.equal(invalidPdf.coverage, "metadata");
  assert.match(invalidPdf.reason, /PDF/);
});

test("photo OneDrive : date et appareil du facet Graph, sans téléchargement ni GPS", async () => {
  const photoItem = {
    ...item,
    name: "photo.jpg",
    file: { mimeType: "image/jpeg" },
    photo: {
      takenDateTime: "2024-05-06T12:30:45.123-05:00",
      cameraMake: "Fictif",
      cameraModel: "Appareil de test",
      location: { latitude: 48.8566, longitude: 2.3522 }
    }
  };
  const never = async () => { throw new Error("aucun octet photo ne doit être lu"); };
  const result = await readOneDriveDocument({
    ...options, item: photoItem, fetchImpl: never,
    getToken: async () => { throw new Error("aucun jeton ne doit être demandé"); }
  });

  assert.equal(result.coverage, "metadata");
  assert.equal(result.document.type, "Image");
  assert.match(result.reason, /sans lecture des pixels/);
  assert.deepEqual(result.document.photoMetadata.captureDate, {
    raw: "2024-05-06T12:30:45.123-05:00",
    localDateTime: "2024-05-06T12:30:45.123",
    offsetMinutes: -300,
    source: { kind: "provider", field: "photo.takenDateTime" }
  });
  assert.deepEqual(result.document.photoMetadata.device, {
    make: "Fictif",
    model: "Appareil de test",
    source: { kind: "provider", field: "photo.cameraMake/photo.cameraModel" }
  });
  assert.deepEqual(result.document.photoMetadata.location, {
    status: "not_requested", latitude: null, longitude: null, altitudeMeters: null, source: null
  });

  const factSet = photoFactSetFromDocument(result.document);
  assert.equal(factSet.facts[0].provenance.kind, "provider");
  assert.equal(factSet.facts[0].provenance.providerId, "onedrive");
  assert.equal(factSet.facts[0].provenance.itemId, result.document.id);
  assert.equal(factSet.facts[0].provenance.accountRef, result.document.oneDriveAccountFingerprint);
  assert.equal(JSON.stringify(result.document).includes("48.8566"), false);
});

test("date de prise de vue fournisseur invalide ignorée sans empêcher l'indexation de l'image", async () => {
  const result = await readOneDriveDocument({
    ...options,
    item: { ...item, name: "photo.jpg", photo: { takenDateTime: "2025-02-30T12:00:00Z" } },
    fetchImpl: async () => { throw new Error("aucun téléchargement attendu"); }
  });
  assert.equal(result.document.type, "Image");
  assert.equal(result.document.photoMetadata, undefined);
  assert.equal(result.coverage, "metadata");
});

test("GPS OneDrive demandé à part seulement avec consentement actif", async () => {
    const photo = { ...item, name: "photo.jpg", file: { mimeType: "image/jpeg" } };
    let allowed = false;
    const calls = [];
    let revokeBeforeResponse = false;
    const read = () => readOneDriveDocument({
      ...options, item: photo, getPhotoLocationConsent: () => allowed,
      fetchImpl: async (url, request) => {
        calls.push({ url: new URL(url), request });
        if (revokeBeforeResponse) allowed = false;
        return Response.json({ id: photo.id, location: { latitude: 12.345, longitude: -45.678 } });
      }
    });
    const denied = await read();
    assert.equal(calls.length, 0);
    assert.equal(denied.document.photoMetadata, undefined);
    allowed = true;
    const granted = await read();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.searchParams.get("$select"), "id,location");
    assert.equal(calls[0].request.redirect, "error");
    assert.deepEqual(granted.document.photoMetadata.location, {
      status: "available", latitude: 12.345, longitude: -45.678, altitudeMeters: null,
      source: { kind: "provider", field: "location" }
    });
    assert.equal(photoFactSetFromDocument(granted.document, { includeLocation: true })
      .facts.find(fact => fact.kind === "location").provenance.providerId, "onedrive");
    allowed = true;
    revokeBeforeResponse = true;
    const revoked = await read();
    assert.equal(revoked.document.photoMetadata, undefined);
  });

test("GPS OneDrive : coordonnées invalides ignorées et erreurs de lecture signalées", async () => {
    const photo = { ...item, name: "photo.jpg", file: { mimeType: "image/jpeg" } };
    const base = { ...options, item: photo, getPhotoLocationConsent: () => true };
    const invalid = await readOneDriveDocument({
      ...base, fetchImpl: async () => Response.json({ id: photo.id, location: { latitude: 0, longitude: 181 } })
    });
    assert.equal(invalid.document.photoMetadata, undefined);
    await assert.rejects(readOneDriveDocument({
      ...base, fetchImpl: async () => new Response("", { status: 403 })
    }), /localisation OneDrive impossible \(HTTP 403\)/);
    await assert.rejects(readOneDriveDocument({
      ...base, fetchImpl: async () => Response.json({ id: "autre" })
    }), /identité.*incohérente/i);
  });
test("refuse lien malveillant et erreur Graph sans divulguer l'URL de téléchargement", async () => {
  await assert.rejects(readOneDriveDocument({ ...options, fetchImpl: async () =>
    Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://evil.invalid/secret" })
  }), /non autorisé/);
  await assert.rejects(readOneDriveDocument({ ...options, fetchImpl: async () => new Response("", { status: 429 }) }), /HTTP 429/);
  let calls = 0;
  await assert.rejects(readOneDriveDocument({ ...options, fetchImpl: async () => {
    calls += 1;
    if (calls === 1) return Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://files.1drv.com/secret" });
    throw new Error("secret");
  } }), error => !error.message.includes("secret"));
});

test("contrôle la taille réelle même si les métadonnées sont fausses", async () => {
  let calls = 0;
  const result = await readOneDriveDocument({ ...options, fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? Response.json({ id: item.id, "@microsoft.graph.downloadUrl": "https://files.1drv.com/synthetic" })
      : new Response(new Uint8Array(1048577));
  } });
  assert.equal(result.coverage, "metadata");
  assert.equal(result.reason, "taille dépassée");
});

test("compare les copies par nom et version fournisseur sans présumer les anciennes versions", async () => {
  const current = { name: "test.txt", eTag: '"v1"' };
  const copy = { name: "test.txt", oneDriveETag: '"v1"', content: "correction locale" };
  assert.equal(compareOneDriveCopy(copy, current), "unchanged");
  assert.equal(compareOneDriveCopy(copy, { ...current, eTag: '"v2"' }), "changed");
  assert.equal(compareOneDriveCopy(copy, { ...current, name: "renommé.txt" }), "changed");
  assert.equal(compareOneDriveCopy({ name: "test.txt" }, current), "unknown");
  assert.equal(compareOneDriveCopy(copy, { name: "test.txt" }), "unknown");
  assert.equal(copy.content, "correction locale");
  assert.throws(() => compareOneDriveCopy(null, current), /invalide/);
});

test("propose les différences sans actualiser une copie attribuée à un autre compte", () => {
  const fingerprint = "a".repeat(64);
  const copy = {
    id: "onedrive-item", oneDriveSource: true, oneDriveAccountFingerprint: fingerprint,
    name: "ancien.txt", oneDriveETag: '"v1"',
    contentProvenance: { schemaVersion: 1 }, photoMetadata: { schemaVersion: 1 },
    photoAnnotations: { source: "user", eventTags: ["Vacances"] }
  };
  const refreshed = {
    id: copy.id, oneDriveSource: true, oneDriveAccountFingerprint: fingerprint,
    name: "nouveau.txt", oneDriveETag: '"v2"', content: "nouveau texte"
  };
  assert.deepEqual(describeOneDriveChanges(copy, { name: "nouveau.txt", eTag: '"v2"' }), [
    "nom : ancien.txt → nouveau.txt", "version fournisseur différente"
  ]);
  assert.equal(canRefreshOneDriveCopy(copy, fingerprint), true);
  assert.equal(canRefreshOneDriveCopy({ ...copy, oneDriveAccountFingerprint: undefined }, fingerprint), false);
  assert.equal(canRefreshOneDriveCopy(copy, "b".repeat(64)), false);
  assert.deepEqual(mergeOneDriveDocumentUpdate(copy, refreshed), {
    ...refreshed, photoAnnotations: copy.photoAnnotations
  });
  assert.throws(() => mergeOneDriveDocumentUpdate(copy, {
    ...refreshed, oneDriveAccountFingerprint: "b".repeat(64)
  }), /compte d'origine non vérifié/);
});

test("conserve la version fournisseur pour les nouvelles copies seulement si disponible", async () => {
  const never = async () => { throw new Error("appel inattendu"); };
  const withVersion = await readOneDriveDocument({
    ...options, item: { ...item, name: "photo.jpg", eTag: '"v1"' }, fetchImpl: never
  });
  const withoutVersion = await readOneDriveDocument({
    ...options, item: { ...item, name: "photo.jpg" }, fetchImpl: never
  });
  assert.equal(withVersion.document.oneDriveETag, '"v1"');
  assert.equal(withoutVersion.document.oneDriveETag, undefined);
});
