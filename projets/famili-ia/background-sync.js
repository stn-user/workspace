/**
 * background-sync.js
 * Gestion du cycle de vie du scan proactif (indexation en fond)
 */

import { getAccessibleDirectories, listLocalFiles } from "./local-files.js";
import { getDocuments } from "./state.js";

export class BackgroundSyncWorker {
  constructor(directories, onProgress) {
    this.directories = directories;
    this.onProgress = onProgress; // Callback pour le feedback UI
    this.isRunning = false;
    this.isPaused = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("Démarrage du scan proactif sur :", this.directories);

    try {
      await this.runScanCycle();
    } catch (error) {
      console.error("Erreur critique durant le scan :", error);
    } finally {
      this.isRunning = false;
    }
  }

  async runScanCycle() {
    console.log("Cycle de scan initialisé.");

    // 11.4.c.2 : Récupérer les répertoires autorisés/configurés
    const dirsToScan = this.directories && this.directories.length > 0
      ? this.directories
      : await getAccessibleDirectories();

    if (!dirsToScan || dirsToScan.length === 0) {
      console.log("Aucun répertoire accessible pour le scan proactif.");
      return [];
    }

    let allDiscoveredFiles = [];

    for (const dir of dirsToScan) {
      if (!this.isRunning) break;

      // Gestion de la pause éventuelle
      while (this.isPaused && this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      try {
        if (typeof this.onProgress === 'function') {
          this.onProgress({ status: 'scanning', directory: dir });
        }

        // Utilisation de la logique récursive de local-files.js
        const files = await listLocalFiles(dir);
        allDiscoveredFiles.push(...files);
      } catch (error) {
        console.warn(`Impossible de scanner le dossier ${dir}:`, error);
      }
    }

    console.log(`Scan récursif terminé : ${allDiscoveredFiles.length} fichiers découverts.`);

    // 11.4.c.3.a : Partitionnement
    const batches = this.partitionFiles(allDiscoveredFiles, 5);
    console.log(`Traitement de ${batches.length} lots de fichiers.`);

    // 11.4.c.3.b & 11.4.c.3.c : Traitement par lots avec yield
    let processedCount = 0;
    const totalFiles = allDiscoveredFiles.length;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!this.isRunning) break;

      while (this.isPaused && this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await Promise.all(batch.map(async (fileObj) => {
        try {
          // 11.4.c.4 : Filtrage des fichiers déjà indexés & fichiers système
          if (!fileObj.name || fileObj.name.startsWith('.') || fileObj.name.toLowerCase() === 'thumbs.db') {
            return;
          }

          const documents = getDocuments();
          const existingDoc = documents.find(d => d.name === fileObj.name && d.sourceDir === fileObj.path);
          if (existingDoc) {
            return;
          }

          const { readFileContent } = await import("./local-files.js");
          const { addDocument } = await import("./state.js");

          const parsed = await readFileContent(fileObj.blob, fileObj.name);
          const content = parsed.rawText;
          const type = parsed.context.type ? parsed.context.type.charAt(0).toUpperCase() + parsed.context.type.slice(1) : "Texte";

          const newDoc = {
            id: `proactive-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: fileObj.name,
            type: type,
            date: "Scan proactif",
            keywords: "",
            summary: parsed.context.summary || "",
            content: content,
            isLocal: true,
            sourceDir: fileObj.path || "Background Sync"
          };

          await addDocument(newDoc);
          processedCount++;
        } catch (err) {
          // Gestion des fichiers protégés ou inaccessibles (11.4.d)
          console.warn(`Skipping file (access denied or protected) : ${fileObj.name}`, err);
        }
      }));

      // Mise à jour de la progression après chaque lot (11.4.c.5.a)
      if (typeof this.onProgress === 'function') {
        const percentage = Math.round((processedCount / totalFiles) * 100);
        this.onProgress({
          status: 'indexing',
          progress: percentage,
          processed: processedCount,
          total: totalFiles
        });
      }

      // 11.4.c.3.c : Yield pour préserver la réactivité de l'UI
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Synthèse finale (11.4.e)
    console.log(`Indexation proactive terminée : ${processedCount} documents traités.`);
    if (typeof this.onProgress === 'function') {
      this.onProgress({
        status: 'completed',
        processed: processedCount,
        total: totalFiles
      });
    }
    return allDiscoveredFiles;
  }

  /**
   * Partitionne un tableau en lots de taille définie
   */
  partitionFiles(files, batchSize = 5) {
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }
    return batches;
  }

  pause() {
    this.isPaused = true;
    console.log("Scan mis en pause.");
  }

  resume() {
    this.isPaused = false;
    console.log("Scan repris.");
  }

  stop() {
    this.isRunning = false;
    console.log("Scan arrêté.");
  }
}
