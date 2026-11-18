/**
 * state.js - Gestion de l'état global de l'application Famili-IA avec IndexedDB
 */

import { get, getAll, put, initDB, remove, purgeDatabase } from './db.js';
import { generateAlertForDoc, getAlertLevelForDate, normalizeAlertNotificationPreferences, refreshAlerts } from './alert-engine.js';
import { createPhotoMetadata, mergePhotoMetadata, normalizePhotoDocument } from './photo-metadata.js';
import { reconcilePhotoFactSet, removePhotoFactsAndDependents } from './photo-facts.js';
import { normalizeOptionalBirthDate } from './family-members.js';
import { isPhotoDocument, normalizePhotoAnnotations, removePhotoMemberAssociation } from './photo-annotations.js';
import { createDocumentIndexRecord } from './document-index.js';
import { migrateDocumentIndexes } from './document-index-migration.js';
import { restoreContentSegments } from './content-index.js';
import { getInventorySource } from './data-inventory.js';

export function reconcileDocumentAlerts(existingAlerts, generatedAlerts, documents = null) {
  const generatedById = new Map(generatedAlerts.map(alert => [alert.id, alert]));
  const synchronizedAlerts = existingAlerts.map(previous => {
    if (previous.source !== "document" && !generatedById.has(previous.id)
      && !previous.id?.startsWith("alert-")) return previous;
    const copies = documents?.filter(document => document.id === previous.docId);
    const current = generatedById.get(previous.id);
    const candidate = copies?.length === 1
      ? generateAlertForDoc(copies[0], new Date(), { includeUpcoming: true })
      : current;
    let sourceReview = null;
    if (copies && copies.length !== 1) sourceReview = copies.length ? "source-ambiguous" : "source-missing";
    else if (!candidate) sourceReview = "proof-unavailable";
    else if (previous.dueDate !== candidate.dueDate
      || (previous.sourceExcerpt && previous.sourceExcerpt !== candidate.sourceExcerpt)
      || (previous.sourceId && copies && previous.sourceId !== getInventorySource(copies[0]))
      || (previous.sourceContentHash && previous.sourceContentHash !== candidate.sourceContentHash)
      || (previous.sourceAccountFingerprint && previous.sourceAccountFingerprint !== candidate.sourceAccountFingerprint)
      || (previous.documentType && previous.documentType !== candidate.documentType)) sourceReview = "source-changed";
    return {
      ...previous, source: "document", sourceReview,
      sourceContentHash: previous.sourceContentHash || (!sourceReview ? candidate?.sourceContentHash : null),
      sourceAccountFingerprint: previous.sourceAccountFingerprint || (!sourceReview ? candidate?.sourceAccountFingerprint : null)
    };
  });
  const existingIds = new Set(existingAlerts.map(alert => alert.id));
  synchronizedAlerts.push(...generatedAlerts.filter(alert => !existingIds.has(alert.id)));

  return {
    alerts: synchronizedAlerts,
    alertsToRemove: []
  };
}

async function synchronizeDocumentAlerts(documents) {
  const verifiedDocuments = [];
  for (const document of documents) {
    const content = await restoreContentSegments(document);
    const evidence = document.expiryDateEvidence;
    const missingExtractedProof = content.status === "verified" && document.expiryDateSource !== "user"
      && typeof evidence === "string" && !evidence.trim().split(/\r?\n/).every(line =>
        content.segments.join("\n").split(/\r?\n/).some(extracted => extracted.trim() === line.trim()));
    verifiedDocuments.push(content.status === "invalid" || missingExtractedProof
      ? { ...document, expiryDate: null }
      : document);
  }
  const generated = refreshAlerts(verifiedDocuments).map(alert => ({
    ...alert,
    sourceId: getInventorySource(verifiedDocuments.find(document => document.id === alert.docId))
  }));
  const { alerts: synchronizedAlerts } = reconcileDocumentAlerts(
    state.alerts,
    generated,
    verifiedDocuments
  );
  for (const alert of synchronizedAlerts.filter(alert => alert.source === "document")) await put('alerts', alert);
  state.alerts = synchronizedAlerts;
}

const defaultState = {
  currentUser: {
    id: 'u1',
    name: 'Mon espace',
    role: 'Admin',
    avatar: 'M',
    address: '',
    postalCode: '',
    city: '',
    preferences: {
      localAccess: true,
      driveConnection: false,
      enableAutoScan: false,
      scanDirectories: [],
      alertNotifications: normalizeAlertNotificationPreferences()
    },
    privacy: {
      consentVersion: '1.0',
      telemetryEnabled: false,
      dataSharingConsent: false,
      photoLocationConsent: false,
      lastConsentDate: null
    }
  },
  family: [],
  homeEquipment: [],
  alerts: [],
  documents: [],
  isDemoMode: false
};

const LEGACY_DEMO_RECORD_HASHES = {
  users: {
    u1: '33cebd9db14e65f2fbca5153b5d22eea83a9b38a61356e9e8ff60c2c4eef1566'
  },
  family: {
    u1: 'f2da34c8ca721f7d2c70cc6a0586cb519b753e3d8b9380ac1c30edd017aefc8d',
    u2: '21d7a798db2e773dc1dafb88cbd87278c2c85313b59b926ad64c0c0d190cd433',
    u3: 'c2a6f88ab1643dae678155eb4262b1eb61bb3994167d37c528d504e2c0722bf1',
    u4: 'd96485cd62faf01156eb2d77436bcc1b267ae3baed0d3cdf9fc81ccbc2b0a445',
    u5: 'c94dc4cd46b79cf6021117530017b50cf52a8323af5521b321aff229efc0a39f'
  },
  equipment: {
    'eq-piscine-pompe': '3a9ef9f161807ae81ae9a927d5a706c6437061ca24a6b44aff32908479b6da25',
    'eq-piscine-filtre': '1fc85343cc5ceda55da44a5b77913e5dc5ca82dbb01a511ce50a50a2bcbc8c2d',
    'eq-bambu-a1': 'a42a2bd9b9bdca4b5a3dbd35d1f8107845b908d4990e3f72d1007312ec6b0bc3',
    'eq-assurance-hab': 'cfd280e50ba18737dc1dbee1665173344c57d8e8c0267efeac24b9857f3fde56'
  },
  alerts: {
    a1: '7258d62875e89e4fd4667d9315a537d837ab0e812ee006c3755a3128018aee20',
    a2: '5c0a1321d6b3c51993bb899d1ccccb9d5f004d9a829fef3d0ffe69fa6fbde5d8',
    a3: '24781fe677ce6155e6029c4605a57eaa2af2f37fc5527f0b784e1d47ab0e5545',
    a4: 'aaeff19ed3d255fbb5cc054858787b49ff0a2f8afb742c44df8734d886481e8f',
    a5: '633fa3dbef314a37e6e36f761f538fdc12733cebd5467bcf884b3ec8db2f0a11'
  }
};

function sortRecordKeys(value, ancestors = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value)) return { circularReference: true };
  ancestors.add(value);
  const sorted = Array.isArray(value)
    ? value.map(item => sortRecordKeys(item, ancestors))
    : Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, sortRecordKeys(value[key], ancestors)]));
  ancestors.delete(value);
  return sorted;
}

export async function hashLegacyRecord(record) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(sortRecordKeys(record)))
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function removeUnmodifiedLegacyRecords(
  recordsByStore,
  expectedHashes = LEGACY_DEMO_RECORD_HASHES,
  removeRecord = remove
) {
  const hasLegacyCandidates = Object.entries(recordsByStore).some(([storeName, records]) =>
    records.some(record => record && expectedHashes[storeName]?.[record.id])
  );
  if (!hasLegacyCandidates) return recordsByStore;

  if (!globalThis.crypto?.subtle?.digest || typeof TextEncoder !== 'function') {
    console.warn('Nettoyage des anciennes données de démonstration ignoré : SHA-256 indisponible, données préservées.');
    return recordsByStore;
  }

  const retainedByStore = {};
  let removedCount = 0;
  for (const [storeName, records] of Object.entries(recordsByStore)) {
    const retained = [];
    for (const record of records) {
      const expectedHash = record && expectedHashes[storeName]?.[record.id];
      if (expectedHash && await hashLegacyRecord(record) === expectedHash) {
        await removeRecord(storeName, record.id);
        removedCount += 1;
      } else {
        retained.push(record);
      }
    }
    retainedByStore[storeName] = retained;
  }
  if (removedCount > 0) {
    console.info(`${removedCount} ancienne(s) donnée(s) de démonstration inchangée(s) retirée(s).`);
  }
  return retainedByStore;
}

function createDefaultState() {
  return {
    ...defaultState,
    currentUser: {
      ...defaultState.currentUser,
      preferences: {
        ...defaultState.currentUser.preferences,
        scanDirectories: [],
        alertNotifications: normalizeAlertNotificationPreferences()
      },
      privacy: { ...defaultState.currentUser.privacy }
    },
    family: [],
    homeEquipment: [],
    alerts: [],
    documents: []
  };
}

let state = createDefaultState();
let photoMutationQueue = Promise.resolve();

function serializePhotoMutation(operation) {
  const pending = photoMutationQueue.then(operation);
  // Keep the queue usable after a failed operation while returning that failure to its caller.
  photoMutationQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

function clearPhotoLocation(document, field) {
  if (document.photoMetadata?.location?.status !== "available") return document;
  const clearedMetadata = createPhotoMetadata(document.id, {
    location: {
      status: "cleared",
      source: { kind: "user", field }
    }
  });
  return {
    ...document,
    photoMetadata: mergePhotoMetadata(document.photoMetadata, clearedMetadata)
  };
}

/**
 * Initialise l'état depuis IndexedDB ou peuple avec les défauts
 */
export async function initState() {
  let documentIndexMigrationInProgress = false;
  try {
    await initDB();
    const legacyCleanup = await removeUnmodifiedLegacyRecords({
      family: await getAll('family'),
      equipment: await getAll('equipment'),
      alerts: await getAll('alerts'),
      users: await getAll('users')
    });
    const { family, equipment, alerts, users } = legacyCleanup;
    const storedDocuments = await getAll('documents');
    const documents = [];
    for (const storedDocument of storedDocuments) {
      try {
        const document = normalizePhotoDocument(storedDocument);
        if (storedDocument.photoMetadata
          && storedDocument.photoMetadata.schemaVersion !== document.photoMetadata.schemaVersion) {
          await put('documents', document);
        }
        documents.push(document);
      } catch (error) {
        console.error(`Métadonnées photo invalides pour le document ${storedDocument?.id ?? "inconnu"}:`, error);
        documents.push(storedDocument);
      }
    }
    documentIndexMigrationInProgress = true;
    const indexedDocuments = await migrateDocumentIndexes(documents, document => put('documents', document));
    const includePhotoLocation = users[0]?.privacy?.photoLocationConsent === true;
    const photoFactDocuments = [];
    for (const document of indexedDocuments) {
      if (!isPhotoDocument(document)) {
        photoFactDocuments.push(document);
        continue;
      }
      try {
        const photoFacts = reconcilePhotoFactSet(document.photoFacts, document, {
          includeLocation: includePhotoLocation
        });
        const updatedDocument = { ...document, photoFacts };
        updatedDocument.indexRecord = await createDocumentIndexRecord(updatedDocument);
        if (JSON.stringify(document.photoFacts ?? null) !== JSON.stringify(photoFacts)) {
          await put('documents', updatedDocument);
        } else if (JSON.stringify(document.indexRecord ?? null) !== JSON.stringify(updatedDocument.indexRecord)) {
          await put('documents', updatedDocument);
        }
        photoFactDocuments.push(updatedDocument);
      } catch (error) {
        console.error(`Faits photo invalides pour le document ${document.id}:`, error);
        const recoverableDocument = { ...document };
        delete recoverableDocument.photoFacts;
        try {
          const photoFacts = reconcilePhotoFactSet(null, recoverableDocument, {
            includeLocation: includePhotoLocation
          });
          const recoveredDocument = { ...recoverableDocument, photoFacts };
          recoveredDocument.indexRecord = await createDocumentIndexRecord(recoveredDocument);
          await put('documents', recoveredDocument);
          photoFactDocuments.push(recoveredDocument);
        } catch (recoveryError) {
          console.error(`Impossible de reconstruire les faits photo du document ${document.id}:`, recoveryError);
          await put('documents', recoverableDocument);
          photoFactDocuments.push(recoverableDocument);
        }
      }
    }
    documentIndexMigrationInProgress = false;

    state.family = family;
    state.homeEquipment = equipment;
    state.alerts = alerts;

    if (users.length > 0) state.currentUser = users[0];
    else await put('users', defaultState.currentUser);

    state.documents = photoFactDocuments;
    if (state.currentUser.privacy?.photoLocationConsent !== true
      && photoFactDocuments.some(document => document.photoMetadata?.location?.status === "available")) {
      await updatePhotoLocationConsent(false);
    }
    await synchronizeDocumentAlerts(photoFactDocuments);

  } catch (e) {
    console.error('Erreur lors de l\'initialisation IndexedDB:', e);
    if (documentIndexMigrationInProgress) throw e;
  }
  return state;
}

export function getCurrentUser() {
  return state.currentUser;
}

export function getFullState() {
  return state;
}

export function getFamilyMembers() {
  return state.family;
}

export function getEquipmentByCategory(category = 'tout') {
  if (category === 'tout') return state.homeEquipment;
  return state.homeEquipment.filter(eq => eq.category === category);
}

export function getEquipmentDetail(id) {
  return state.homeEquipment.find(eq => eq.id === id);
}

export function getAlerts() {
  return state.alerts;
}

export function getDocuments() {
  return state.documents;
}

export async function addFamilyMember(member) {
  const normalizedMember = {
    ...member,
    birthDate: normalizeOptionalBirthDate(member.birthDate)
  };
  await put('family', normalizedMember);
  state.family.push(normalizedMember);
  return state.family;
}

export async function updateFamilyMember(member) {
  const index = state.family.findIndex(m => m.id === member.id);
  if (index !== -1) {
    const normalizedMember = {
      ...member,
      birthDate: normalizeOptionalBirthDate(member.birthDate)
    };
    await put('family', normalizedMember);
    state.family[index] = normalizedMember;
  }
  return state.family;
}

async function deleteFamilyMemberUnlocked(id) {
  const validMemberIds = state.family.filter(member => member.id !== id).map(member => member.id);
  const updatedDocuments = [];
  for (const document of state.documents) {
    if (!isPhotoDocument(document) || !document.photoAnnotations?.personIds?.includes(id)) continue;
    const photoAnnotations = removePhotoMemberAssociation(document.photoAnnotations, id, validMemberIds);
    const updatedDocument = { ...document, photoAnnotations };
    updatedDocument.photoFacts = reconcilePhotoFactSet(document.photoFacts, updatedDocument, {
      includeLocation: state.currentUser.privacy?.photoLocationConsent === true
    });
    updatedDocument.indexRecord = await createDocumentIndexRecord(updatedDocument);
    await put('documents', updatedDocument);
    updatedDocuments.push(updatedDocument);
  }
  await remove('family', id);
  for (const updatedDocument of updatedDocuments) {
    const index = state.documents.findIndex(document => document.id === updatedDocument.id);
    if (index !== -1) state.documents[index] = updatedDocument;
  }
  state.family = state.family.filter(m => m.id !== id);
  return state.family;
}

export function deleteFamilyMember(id) {
  return serializePhotoMutation(() => deleteFamilyMemberUnlocked(id));
}

async function updatePhotoAnnotationsUnlocked(documentId, annotations) {
  const index = state.documents.findIndex(document => document.id === documentId);
  if (index === -1 || !isPhotoDocument(state.documents[index])) {
    throw new TypeError("Le fichier photo à annoter est introuvable.");
  }

  const photoAnnotations = normalizePhotoAnnotations(
    annotations,
    state.family.map(member => member.id)
  );
  const updatedDocument = { ...state.documents[index], photoAnnotations };
  updatedDocument.photoFacts = reconcilePhotoFactSet(updatedDocument.photoFacts, updatedDocument, {
    includeLocation: state.currentUser.privacy?.photoLocationConsent === true
  });
  updatedDocument.indexRecord = await createDocumentIndexRecord(updatedDocument);
  await put('documents', updatedDocument);
  state.documents[index] = updatedDocument;
  return updatedDocument;
}

export function updatePhotoAnnotations(documentId, annotations) {
  return serializePhotoMutation(() => updatePhotoAnnotationsUnlocked(documentId, annotations));
}

export async function addEquipment(equipment) {
  state.homeEquipment.push(equipment);
  await put('equipment', equipment);
  return state.homeEquipment;
}

export async function updateEquipment(equipment) {
  const index = state.homeEquipment.findIndex(eq => eq.id === equipment.id);
  if (index !== -1) {
    state.homeEquipment[index] = equipment;
    await put('equipment', equipment);
  }
  return state.homeEquipment;
}

export async function deleteEquipment(id) {
  state.homeEquipment = state.homeEquipment.filter(eq => eq.id !== id);
  await remove('equipment', id);
  return state.homeEquipment;
}

async function addDocumentUnlocked(document) {
  document = normalizePhotoDocument(document);
  if (isPhotoDocument(document)) {
    if (state.currentUser.privacy?.photoLocationConsent !== true) {
      document = clearPhotoLocation(document, "photoLocationConsentNotGranted");
    }
    document.photoFacts = reconcilePhotoFactSet(document.photoFacts, document, {
      includeLocation: state.currentUser.privacy?.photoLocationConsent === true
    });
  }
  document.indexRecord = await createDocumentIndexRecord(document);
  if (isPhotoDocument(document)) {
    document.photoFacts = reconcilePhotoFactSet(document.photoFacts, document, {
      includeLocation: state.currentUser.privacy?.photoLocationConsent === true
    });
  }
  const existingIndex = state.documents.findIndex(existing => existing.id === document.id);
  await put('documents', document);
  if (existingIndex === -1) state.documents.push(document);
  else state.documents[existingIndex] = document;

  // Logique de classification automatique
  if (document.type && document.provider) {
    console.log(`Auto-classification : Document ${document.originalName} classé (${document.type} - ${document.provider})`);
  }

  await synchronizeDocumentAlerts(state.documents);

  return state.documents;
}

export function addDocument(document) {
  return serializePhotoMutation(() => addDocumentUnlocked(document));
}

function dropboxCheckpointId(accountFingerprint) {
  if (typeof accountFingerprint !== "string" || !/^[0-9a-f]{64}$/i.test(accountFingerprint)) {
    throw new TypeError("Empreinte de compte Dropbox invalide.");
  }
  return `dropbox-index-${accountFingerprint}`;
}

export async function getDropboxIndexCheckpoint(accountFingerprint) {
  const id = dropboxCheckpointId(accountFingerprint);
  const checkpoint = await get('source_sync', id);
  if (!checkpoint) return null;
  if (checkpoint.sourceId !== "dropbox" || checkpoint.accountFingerprint !== accountFingerprint
    || typeof checkpoint.cursor !== "string" || !checkpoint.cursor
    || typeof checkpoint.updatedAt !== "string") {
    throw new Error("Point de reprise Dropbox local invalide.");
  }
  return checkpoint;
}

export async function saveDropboxIndexCheckpoint({ accountFingerprint, cursor }) {
  const id = dropboxCheckpointId(accountFingerprint);
  if (typeof cursor !== "string" || !cursor) throw new TypeError("Curseur de reprise Dropbox invalide.");
  const checkpoint = {
    id, sourceId: "dropbox", accountFingerprint, cursor, updatedAt: new Date().toISOString()
  };
  await put('source_sync', checkpoint);
  return checkpoint;
}

export async function clearDropboxIndexCheckpoint(accountFingerprint) {
  return remove('source_sync', dropboxCheckpointId(accountFingerprint));
}

export async function clearDropboxIndexCheckpoints() {
  const checkpoints = (await getAll('source_sync')).filter(entry =>
    typeof entry?.id === "string" && entry.id.startsWith("dropbox-index-"));
  await Promise.all(checkpoints.map(checkpoint => remove('source_sync', checkpoint.id)));
}

async function deleteDocumentUnlocked(id, { invalidateDropboxCheckpoint = true } = {}) {
  const document = state.documents.find(existing => existing.id === id);
  if (invalidateDropboxCheckpoint && document?.dropboxSource && document.dropboxAccountFingerprint) {
    await clearDropboxIndexCheckpoint(document.dropboxAccountFingerprint);
  }
  await remove('documents', id);
  state.documents = state.documents.filter(doc => doc.id !== id);
  const linkedAlert = state.alerts.find(alert => alert.docId === id && (
    alert.source === "document" || alert.id === `alert-${id}`
  ));
  if (linkedAlert) {
    await remove('alerts', linkedAlert.id);
    state.alerts = state.alerts.filter(alert => alert.id !== linkedAlert.id);
  }
  return state.documents;
}

export function deleteDocument(id, options) {
  return serializePhotoMutation(() => deleteDocumentUnlocked(id, options));
}

export async function confirmDocumentAlert(documentId) {
  const copies = state.documents.filter(document => document.id === documentId);
  if (copies.length !== 1) throw new Error("La copie source est absente ou ambiguë.");
  const document = copies[0];
  const content = await restoreContentSegments(document);
  if (content.status === "invalid") throw new Error("La preuve de la copie n'est plus vérifiable.");
  if (state.documents.find(entry => entry.id === documentId) !== document) {
    throw new Error("La copie a changé pendant la confirmation ; vérifiez-la à nouveau.");
  }
  const generated = generateAlertForDoc(document, new Date(), { includeUpcoming: true });
  const previous = state.alerts.find(alert => alert.id === generated?.id);
  if (!generated || !previous) throw new Error("L'alerte ne peut pas être confirmée avec cette copie.");
  const changedDate = previous.dueDate !== generated.dueDate;
  const confirmed = {
    ...previous, ...generated,
    sourceId: getInventorySource(document),
    sourceReview: null,
    status: previous.status || "active",
    snoozedUntil: previous.snoozedUntil,
    notificationSentFor: changedDate ? undefined : previous.notificationSentFor,
    notificationSentAt: changedDate ? undefined : previous.notificationSentAt
  };
  await updateAlert(confirmed);
  return confirmed;
}

export async function updateAlert(alert) {
  const index = state.alerts.findIndex(a => a.id === alert.id);
  if (index !== -1) {
    await put('alerts', alert);
    state.alerts[index] = alert;
  }
  return state.alerts;
}

export async function updateAlertNotificationPreferences(preferences) {
  const alertNotifications = normalizeAlertNotificationPreferences(preferences);
  state.currentUser.preferences = {
    ...state.currentUser.preferences,
    alertNotifications
  };
  await put('users', state.currentUser);
  return alertNotifications;
}

export function calculateAlertType(dueDate, currentType, documentType) {
  if (!dueDate) return currentType;
  const level = getAlertLevelForDate(dueDate, documentType || "assurance");
  if (level) return level;

  return "muted";
}

export async function updatePrivacyConsent(newPrivacySettings) {
  const user = {
    ...state.currentUser,
    privacy: {
      ...state.currentUser.privacy,
      ...newPrivacySettings,
      lastConsentDate: new Date().toISOString()
    }
  };
  await put('users', user);
  state.currentUser = user;
  return user.privacy;
}

export function updateUserProfile({ name, avatar, address, postalCode, city, photoLocationConsent }) {
  return serializePhotoMutation(async () => {
    if (!photoLocationConsent || state.currentUser.privacy?.photoLocationConsent !== true) {
      await updatePhotoLocationConsentUnlocked(photoLocationConsent);
    }
    const user = { ...state.currentUser, name, avatar, address, postalCode, city };
    await put('users', user);
    state.currentUser = user;
    return user;
  });
}

async function updatePhotoLocationConsentUnlocked(enabled) {
  const photoLocationConsent = enabled === true;
  if (photoLocationConsent) {
    await updatePrivacyConsent({ photoLocationConsent: true });
    return true;
  }

  const documentsWithLocation = state.documents.filter(
    document => document.photoMetadata?.location?.status === "available"
      || document.photoFacts?.facts?.some(fact => fact.kind === "location")
  );
  if (!state.currentUser.privacy?.photoLocationConsent && documentsWithLocation.length === 0) return false;

  for (const document of documentsWithLocation) {
    let updatedDocument = clearPhotoLocation(document, "photoLocationConsentRevoked");
    if (Array.isArray(document.photoFacts?.facts)) {
      const locationIds = document.photoFacts.facts
        .filter(fact => fact.kind === "location")
        .map(fact => fact.id);
      if (locationIds.length) {
        updatedDocument = {
          ...updatedDocument,
          photoFacts: removePhotoFactsAndDependents(document.photoFacts, locationIds)
        };
      }
    }
    updatedDocument.indexRecord = await createDocumentIndexRecord(updatedDocument);
    await put('documents', updatedDocument);
    state.documents[state.documents.indexOf(document)] = updatedDocument;
  }
  await updatePrivacyConsent({ photoLocationConsent: false });
  return false;
}

export function updatePhotoLocationConsent(enabled) {
  return serializePhotoMutation(() => updatePhotoLocationConsentUnlocked(enabled));
}

export async function addLog(action, details) {
  const logEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    action,
    details
  };
  await put('logs', logEntry);
  return logEntry;
}

async function resetStateUnlocked() {
  await purgeDatabase();
  state = createDefaultState();
  return state;
}

export function resetState() {
  return serializePhotoMutation(resetStateUnlocked);
}

/**
 * Définit l'état de mode démo (true/false).
 * Permet d'activer/désactiver l'affichage des éléments "Mode Démo" (badge, message).
 * @param {boolean} mode - true pour activer le mode démo, false pour le désactiver
 */
export function setDemoMode(mode) {
  state.isDemoMode = mode;
  return state.isDemoMode;
}

/**
 * Initialise un foyer de démonstration complet dans l'état local.
 * Utilisé par le bouton "Explorer la démo" (Phase 13.2.a)
 */
export default state;
