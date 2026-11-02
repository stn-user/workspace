/**
 * background-sync.js
 * Gestion du cycle de vie du scan proactif (indexation en fond)
 */

import { getAccessibleDirectories, listLocalFiles, readFileContent, scanDirectoryWeb } from "./local-files.js";
import { addDocument, getCurrentUser, getDocuments } from "./state.js";

export class BackgroundSyncWorker {
  constructor(directories, onProgress, { files = null, onDocument = null } = {}) {
    this.directories = directories;
    this.files = files;
    this.onProgress = onProgress;
    this.onDocument = onDocument;
    this.isRunning = false;
    this.isPaused = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("Démarrage du scan proactif sur :", this.directories);

    try {
      if (this.files) return await this.indexSelectedFiles(this.files);
      await this.runScanCycle();
    } catch (error) {
      console.error("Erreur critique durant le scan :", error);
      this.onProgress?.({
        status: 'error',
        message: error instanceof Error ? error.message : "Erreur inattendue pendant l'indexation."
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async indexSelectedFiles(files) {
    const batches = this.partitionFiles(files, 5);
    const totalFiles = files.length;
    let processed = 0;
    let imported = 0;
    let failed = 0;
    let metadataWarnings = 0;

    this.onProgress?.({
      status: 'indexing',
      progress: 0,
      processed,
      imported,
      failed,
      total: totalFiles
    });

    for (const batch of batches) {
      if (!this.isRunning) break;

      while (this.isPaused && this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await Promise.all(batch.map(async (file) => {
        if (!this.isRunning) return;

        try {
          const parsed = await readFileContent(file, file.name);
          const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          let photoMetadata;
          if (/\.(jpg|jpeg|png)$/i.test(file.name)) {
            const { extractPhotoMetadata } = await import("./photo-exif.js");
            const extraction = await extractPhotoMetadata(file, id, {
              includeLocation: getCurrentUser().privacy?.photoLocationConsent === true
            });
            photoMetadata = extraction.metadata;
            metadataWarnings += extraction.issues.length;
            if (extraction.issues.length > 0) {
              console.warn(`Métadonnées photo incomplètes pour ${file.name}:`, extraction.issues);
            }
          }

          const extension = file.name.split('.').pop().toLowerCase();
          const type = extension === "pdf" ? "PDF"
            : extension === "md" ? "Markdown"
            : ["jpg", "jpeg", "png"].includes(extension) ? "Image"
            : "Texte";
          const document = {
            id,
            name: file.name,
            type,
            date: "Session locale",
            keywords: "",
            summary: "",
            content: parsed.rawText,
            alertType: parsed.context.type,
            expiryDate: parsed.context.expiryDate,
            expiryDateEvidence: parsed.context.expiryDateEvidence,
            provider: parsed.context.provider,
            isLocal: true,
            ...(file.webkitRelativePath ? { sourceDir: file.webkitRelativePath } : {}),
            ...(photoMetadata ? { photoMetadata, importedAt: new Date().toISOString() } : {})
          };

          await addDocument(document);
          this.onDocument?.(document);
          imported += 1;
        } catch (error) {
          failed += 1;
          console.error(`Erreur lors de l'indexation de ${file.name}:`, error);
        } finally {
          processed += 1;
        }
      }));

      const progress = totalFiles > 0 ? Math.round((processed / totalFiles) * 100) : 100;
      this.onProgress?.({
        status: 'indexing',
        progress,
        processed,
        imported,
        failed,
        metadataWarnings,
        total: totalFiles
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const status = processed === totalFiles ? 'completed' : 'stopped';
    const result = { status, processed, imported, failed, metadataWarnings, total: totalFiles };
    this.onProgress?.({ ...result, progress: totalFiles > 0 ? Math.round((processed / totalFiles) * 100) : 100 });
    return result;
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
          this.onProgress({ status: 'scanning', directory: typeof dir === 'object' ? dir.name : dir });
        }

        // Si dir est un FileSystemDirectoryHandle (sélectionné par l'utilisateur sur le web)
        let files = [];
        if (typeof dir === 'object' && dir.kind === 'directory') {
          files = await scanDirectoryWeb(dir);
        } else {
          // Utilisation de la logique récursive de local-files.js
          files = await listLocalFiles(dir);
        }
        allDiscoveredFiles.push(...files);
      } catch (error) {
        console.warn(`Impossible de scanner le dossier:`, error);
      }
    }

    console.log(`Scan récursif terminé : ${allDiscoveredFiles.length} fichiers découverts.`);

    // 11.4.c.3.a : Partitionnement
    const batches = this.partitionFiles(allDiscoveredFiles, 5);
    console.log(`Traitement de ${batches.length} lots de fichiers.`);

    // 11.4.c.3.b & 11.4.c.3.c : Traitement par lots avec yield
    let processedCount = 0;
    let importedCount = 0;
    let failedCount = 0;
    const totalFiles = allDiscoveredFiles.length;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!this.isRunning) break;

      while (this.isPaused && this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await Promise.all(batch.map(async (fileObj) => {
        try {
          console.log(`Debug: Tentative de traitement du fichier -> ${fileObj.name}`);
          // 11.4.c.4 : Filtrage des fichiers déjà indexés & fichiers système
          if (!fileObj.name || fileObj.name.startsWith('.') || fileObj.name.toLowerCase() === 'thumbs.db') {
            console.log(`Debug: Fichier système ignoré -> ${fileObj.name}`);
            return;
          }

          const existingDoc = getDocuments().find(d => d.name === fileObj.name && d.sourceDir === fileObj.path);
          if (existingDoc) {
            console.log(`Debug: Fichier déjà indexé ignoré -> ${fileObj.name}`);
            return;
          }

          console.log(`Debug: Lecture du contenu de -> ${fileObj.name}`);
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
            alertType: parsed.context.type,
            expiryDate: parsed.context.expiryDate,
            expiryDateEvidence: parsed.context.expiryDateEvidence,
            provider: parsed.context.provider,
            isLocal: true,
            sourceDir: fileObj.path || "Background Sync"
          };

          console.log(`Debug: Ajout effectif du document dans le state -> ${fileObj.name}`);
          await addDocument(newDoc);
          importedCount++;
        } catch (err) {
          failedCount++;
          console.error(`Erreur critique sur le fichier ${fileObj.name}:`, err);
        } finally {
          processedCount++;
        }
      }));

      // Mise à jour de la progression après chaque lot (11.4.c.5.a)
      if (typeof this.onProgress === 'function') {
        const percentage = totalFiles > 0 ? Math.round((processedCount / totalFiles) * 100) : 100;
        this.onProgress({
          status: 'indexing',
          progress: percentage,
          processed: processedCount,
          imported: importedCount,
          failed: failedCount,
          total: totalFiles
        });
      }

      // 11.4.c.3.c : Yield pour préserver la réactivité de l'UI
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Synthèse finale (11.4.e)
    const status = processedCount === totalFiles ? 'completed' : 'stopped';
    console.log(`Indexation proactive terminée : ${importedCount} documents indexés sur ${totalFiles}.`);
    if (typeof this.onProgress === 'function') {
      this.onProgress({
        status,
        processed: processedCount,
        imported: importedCount,
        failed: failedCount,
        total: totalFiles,
        progress: totalFiles > 0 ? Math.round((processedCount / totalFiles) * 100) : 100
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
