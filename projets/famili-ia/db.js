/**
 * db.js - Abstraction pour IndexedDB avec Chiffrement optionnel (Phase 8.1)
 */

import { encryptData, decryptData } from './crypto.js';

const DB_NAME = 'FamiliIADatabase';
const DB_VERSION = 2;

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

export const getAll = async (storeName) => {
  const store = await getStore(storeName);
  return new Promise((resolve) => {
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
  });
};

export const put = async (storeName, data) => {
  const store = await getStore(storeName, 'readwrite');
  let dataToStore = data;
  try {
    const encrypted = await encryptData(data);
    dataToStore = { ...encrypted, id: data.id };
  } catch (e) {
    console.warn("Erreur de chiffrement, stockage en clair:", e);
  }
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

// Fonction de purge sécurisée unique et propre
export const purgeDatabase = async () => {
  const db = await initDB();
  const stores = ['users', 'family', 'equipment', 'documents', 'alerts', 'logs', 'access_logs'];
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
