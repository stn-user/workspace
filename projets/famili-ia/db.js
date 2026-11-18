/**
 * db.js - Abstraction pour IndexedDB avec Chiffrement optionnel (Phase 8.1)
 */

import { encryptData, decryptData } from './crypto.js';

const DB_NAME = 'FamiliIADatabase';
const DB_VERSION = 4;

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('family')) db.createObjectStore('family', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('equipment')) db.createObjectStore('equipment', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('alerts')) db.createObjectStore('alerts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('source_sync')) db.createObjectStore('source_sync', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('access_logs')) db.createObjectStore('access_logs', { keyPath: 'id', autoIncrement: true });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getStore = async (storeName, mode = 'readonly') => {
  const db = await initDB();
  return db.transaction(storeName, mode).objectStore(storeName);
};

export const get = async (storeName, id) => {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = async () => {
      const result = request.result;
      if (result && result.iv && result.data) {
        try {
          resolve(await decryptData(result));
        } catch (error) {
          reject(error);
        }
      } else {
        resolve(result);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAll = async (storeName) => {
  const store = await getStore(storeName);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = async () => {
      const results = request.result;
      try {
        const decryptedResults = await Promise.all(results.map(async (item) => {
          if (item && item.iv && item.data) {
            return await decryptData(item);
          }
          return item;
        }));
        resolve(decryptedResults);
      } catch (e) {
        console.warn("Erreur de déchiffrement, retour des données brutes:", e);
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const put = async (storeName, data) => {
  let dataToStore = data;
  try {
    const encrypted = await encryptData(data);
    dataToStore = { ...encrypted, id: data.id };
  } catch (e) {
    console.warn("Erreur de chiffrement, stockage en clair:", e);
  }
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(dataToStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const remove = async (storeName, id) => {
  const store = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export async function putConfirmedDocumentAlert(document, alert, expectedDocument, expectedAlert) {
  const db = await initDB();
  try {
    const read = db.transaction(['documents', 'alerts'], 'readonly');
    const before = await Promise.all([['documents', document.id], ['alerts', alert.id]].map(([store, id]) =>
      new Promise((resolve, reject) => {
        const request = read.objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })));
    const decoded = await Promise.all(before.map(record =>
      record?.iv && record?.data ? decryptData(record) : record));
    if (JSON.stringify(decoded[0]) !== JSON.stringify(expectedDocument) ||
        JSON.stringify(decoded[1]) !== JSON.stringify(expectedAlert)) {
      throw new Error("La copie ou l'alerte enregistrée a changé ; actualisez avant de confirmer.");
    }
    const encoded = await Promise.all([document, alert].map(async record => ({
      ...await encryptData(record), id: record.id
    })));
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['documents', 'alerts'], 'readwrite');
      let failure;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure || transaction.error || new Error("Confirmation annulée ; aucune écriture conservée."));
      let checked = 0;
      ['documents', 'alerts'].forEach((store, index) => {
        const request = transaction.objectStore(store).get(encoded[index].id);
        request.onsuccess = () => {
          if (transaction.error || failure) return;
          if (JSON.stringify(request.result) !== JSON.stringify(before[index])) {
            failure = new Error("La copie ou l'alerte a changé pendant la confirmation ; aucune écriture conservée.");
            transaction.abort();
            return;
          }
          checked += 1;
          if (checked !== 2) return;
          try {
            transaction.objectStore('documents').put(encoded[0]);
            transaction.objectStore('alerts').put(encoded[1]);
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      });
    });
  } finally {
    db.close();
  }
}

// Fonction de purge sécurisée unique et propre
export const purgeDatabase = async () => {
  const db = await initDB();
  const stores = ['users', 'family', 'equipment', 'documents', 'alerts', 'source_sync', 'logs', 'access_logs'];
  return Promise.all(stores.map(storeName => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }));
};

export const addLog = async (action, details) => {
  const logEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    action,
    details
  };
  const store = await getStore('logs', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(logEntry);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getLogs = async () => {
  const store = await getStore('logs', 'readonly');
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const logAccess = async (userId, action, resourceId, details = {}) => {
  const logEntry = {
    userId,
    action,
    resourceId,
    details,
    timestamp: new Date().toISOString()
  };
  const store = await getStore('access_logs', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.add(logEntry);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
