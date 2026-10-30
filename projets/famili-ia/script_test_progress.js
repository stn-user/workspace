/**
 * script_test_progress.js
 * Script de test pour déclencher le worker de scan proactif avec des fichiers simulés
 */

import { BackgroundSyncWorker } from "./background-sync.js";

// Fonction pour simuler la mise à jour de la progression (c'est ce que app.js fait)
function mockOnProgress(progressInfo) {
  console.log("Mock UI Progress Update:", progressInfo);
  // On appelle la fonction réelle si elle existe dans le scope global (app.js)
  if (typeof window.updateScanProgressUI === 'function') {
    window.updateScanProgressUI(progressInfo);
  }
}

async function runTest() {
  console.log("Démarrage du test de progression...");

  // Création de documents fictifs pour simuler la découverte
  const mockFiles = [
    { name: "test1.txt", path: "Documents", blob: new Blob(["Contenu 1"], { type: "text/plain" }) },
    { name: "test2.txt", path: "Documents", blob: new Blob(["Contenu 2"], { type: "text/plain" }) },
    { name: "test3.txt", path: "Documents", blob: new Blob(["Contenu 3"], { type: "text/plain" }) },
    { name: "test4.txt", path: "Documents", blob: new Blob(["Contenu 4"], { type: "text/plain" }) },
    { name: "test5.txt", path: "Documents", blob: new Blob(["Contenu 5"], { type: "text/plain" }) }
  ];

  // Instanciation du worker avec nos fichiers simulés
  // On doit modifier légèrement le worker pour accepter des fichiers déjà chargés
  // ou on simule simplement l'appel à onProgress

  const worker = new BackgroundSyncWorker(["Documents"], mockOnProgress);

  // Remplacer manuellement le cycle de scan pour injecter nos fichiers
  worker.runScanCycle = async () => {
    console.log("Cycle de scan mocké.");

    // Simuler le partitionnement (batch de 1)
    const batches = worker.partitionFiles(mockFiles, 1);

    let processedCount = 0;
    const totalFiles = mockFiles.length;

    for (let i = 0; i < batches.length; i++) {
        // Simuler traitement
        await new Promise(r => setTimeout(r, 1000));
        processedCount++;

        // Notification progression
        mockOnProgress({
          status: 'indexing',
          progress: Math.round((processedCount / totalFiles) * 100),
          processed: processedCount,
          total: totalFiles
        });
    }
  };

  await worker.start();
  console.log("Test terminé.");
}

runTest();
